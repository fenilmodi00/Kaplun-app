package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"regexp"
	"strings"
	"time"

	"kaplun/api-go/internal/platform/meta"
	"kaplun/api-go/internal/services/keywords"
	"kaplun/api-go/internal/services/ratelimit"
	"kaplun/api-go/internal/services/tracking"
)

// ErrDuplicateKey mirrors Appwrite TablesDB unique-index conflicts (HTTP 409).
var ErrDuplicateKey = errors.New("duplicate key")

// IsDuplicateKey reports whether err represents a unique-constraint conflict.
func IsDuplicateKey(err error) bool {
	return errors.Is(err, ErrDuplicateKey)
}

var usernameTokenRE = regexp.MustCompile(`(?i)\{username\}`)

// CommentStore is the persistence surface required by the automation job runner.
type CommentStore interface {
	ListActiveForIG(ctx context.Context, igUserID string) ([]map[string]any, error)
	FindLog(ctx context.Context, automationID, commentID string) (map[string]any, error)
	CreateLog(ctx context.Context, data map[string]any) (map[string]any, error)
	UpdateLog(ctx context.Context, logID string, data map[string]any) error
	UpdateAutomation(ctx context.Context, automationID string, data map[string]any) error
	GetCreatorByClerkID(ctx context.Context, clerkUserID string) (map[string]any, error)
	GetTrackedLinkForAutomation(ctx context.Context, automationID string) (map[string]any, error)
	GetAutomation(ctx context.Context, automationID string) (map[string]any, error)
	GetJob(ctx context.Context, jobID string) (map[string]any, error)
	UpdateJob(ctx context.Context, jobID string, data map[string]any) error
	CountRecentDMActions(igUserID, since string) int
}

// GraphSender sends Instagram Graph messaging / reply calls.
type GraphSender interface {
	SendCommentReply(ctx context.Context, commentID, message, accessToken string) error
	SendPrivateReply(ctx context.Context, igAccountID, commentID, text, accessToken string) error
	SendPrivateReplyWithButton(ctx context.Context, igAccountID, commentID, text, buttonTitle, payload, accessToken string) error
	SendDirectMessage(ctx context.Context, igAccountID, userID, text, accessToken string) error
}

// TokenDecryptor decrypts stored access tokens (or returns plaintext legacy values).
type TokenDecryptor interface {
	DecryptOrPlaintext(stored string) string
}

// CommentRunner implements JobRunner for process_comment / send_reveal jobs.
type CommentRunner struct {
	Store         CommentStore
	Graph         GraphSender
	Crypto        TokenDecryptor
	PublicBaseURL string
	Log           *slog.Logger
	Now           func() time.Time
}

// NewCommentRunner constructs a CommentRunner with UTC clock defaults.
func NewCommentRunner(store CommentStore, graph GraphSender, crypto TokenDecryptor) *CommentRunner {
	base := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL"))
	if base == "" {
		base = "https://api.example.com"
	}
	return &CommentRunner{
		Store:         store,
		Graph:         graph,
		Crypto:        crypto,
		PublicBaseURL: strings.TrimRight(base, "/"),
		Now:           func() time.Time { return time.Now().UTC() },
	}
}

// Personalize replaces {username} with the commenter name (or "there").
func Personalize(text, commenterName string) string {
	name := commenterName
	if name == "" {
		name = "there"
	}
	return usernameTokenRE.ReplaceAllString(text, name)
}

// buildInlineLinkFallback builds a plain-text fallback message when a button
// template DM is rejected. It personalizes {username}, replaces {link} with
// the tracked URL, and appends the URL if no {link} token is present.
func buildInlineLinkFallback(dmMessage, commenterName, trackedURL string) string {
	msg := Personalize(dmMessage, commenterName)
	linkToken := "{link}"
	if strings.Contains(msg, linkToken) {
		msg = strings.ReplaceAll(msg, linkToken, trackedURL)
	} else if trackedURL != "" && !strings.Contains(msg, trackedURL) {
		msg += "\n\n" + trackedURL
	}
	return msg
}

// ProcessCommentEvent processes one comment across all matching automations.
// Returns "done" or "requeue". Meta API errors (other than token-expired /
// rate-limit handled inline) are returned for job-level retry.
func (r *CommentRunner) ProcessCommentEvent(ctx context.Context, event map[string]any, requeueAttempt int) (string, error) {
	if r.Store == nil {
		return "done", fmt.Errorf("comment store not configured")
	}

	igID := mapString(event, "instagram_account_id")
	mediaID := mapString(event, "media_id")
	commentID := mapString(event, "comment_id")
	commentText := mapString(event, "comment_text")
	commenterName := mapString(event, "commenter_name")

	allActive, err := r.Store.ListActiveForIG(ctx, igID)
	if err != nil {
		return "done", err
	}

	for _, auto := range filterAutomationsForMedia(allActive, mediaID) {
		matchedKeyword := ""
		if !mapBool(auto, "match_any_word") {
			mode := mapString(auto, "match_mode")
			wholeWord := mode == "" || mode == "whole_word"

			m := keywords.MatchKeywords(commentText, mapStringSlice(auto, "keywords"), wholeWord)
			if !m.Matched {
				if err := r.failLog(ctx, nil, auto, event, "skipped_no_match"); err != nil {
					return "done", err
				}
				continue
			}
			matchedKeyword = m.MatchedKeyword
		}

		existing, err := r.Store.FindLog(ctx, mapString(auto, "$id"), commentID)
		if err != nil {
			return "done", err
		}
		if existing != nil {
			action := mapString(existing, "action")
			if action == "dm_sent" || action == "button_dm_sent" || action == "skipped" {
				continue
			}
		}

		creator, err := r.Store.GetCreatorByClerkID(ctx, mapString(auto, "clerk_user_id"))
		if err != nil {
			return "done", err
		}
		if creator == nil || mapString(creator, "access_token") == "" {
			if err := r.failLog(ctx, existing, auto, event, "no_access_token"); err != nil {
				return "done", err
			}
			continue
		}

		token, derr := r.decryptToken(mapString(creator, "access_token"))
		if derr != nil {
			if err := r.failLog(ctx, existing, auto, event, "token_decrypt_failed"); err != nil {
				return "done", err
			}
			continue
		}

		rate := ratelimit.CheckDMRate(r.Store, igID, requeueAttempt)
		if !rate.Allowed {
			if rate.ShouldSkip {
				if err := r.failLog(ctx, existing, auto, event, "skipped_rate_limit"); err != nil {
					return "done", err
				}
				continue
			}
			return "requeue", nil
		}

		logRow := existing
		if logRow == nil {
			commentTrim := commentText
			if len(commentTrim) > 1000 {
				commentTrim = commentTrim[:1000]
			}
			created, cerr := r.Store.CreateLog(ctx, map[string]any{
				"automation_id":      mapString(auto, "$id"),
				"clerk_user_id":      mapString(auto, "clerk_user_id"),
				"ig_user_id":         igID,
				"media_id":           mediaID,
				"comment_id":         commentID,
				"commenter_username": nilIfEmpty(commenterName),
				"comment_text":       commentTrim,
				"matched_keyword":    nilIfEmpty(matchedKeyword),
				"action":             "pending",
				"created_at":         r.nowISO(),
			})
			if cerr != nil {
				if IsDuplicateKey(cerr) {
					continue
				}
				return "done", cerr
			}
			logRow = created
		}

		if err := r.sendAutomationMessages(ctx, auto, event, logRow, token, commenterName); err != nil {
			if meta.IsTokenExpired(err) {
				_ = r.Store.UpdateAutomation(ctx, mapString(auto, "$id"), map[string]any{
					"status":     "error",
					"updated_at": r.nowISO(),
				})
				_ = r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
					"action": "failed",
					"reason": "token_expired",
				})
				continue
			}
			if meta.IsGraphRateLimit(err) {
				return "requeue", nil
			}
			return "done", err
		}
	}

	return "done", nil
}

func (r *CommentRunner) sendAutomationMessages(
	ctx context.Context,
	auto, event, logRow map[string]any,
	token, commenterName string,
) error {
	if r.Graph == nil {
		return fmt.Errorf("graph sender not configured")
	}

	commentID := mapString(event, "comment_id")
	igID := mapString(event, "instagram_account_id")

	// STEP 7: public reply FIRST — MetaApiError never blocks the DM.
	if mapBool(auto, "public_reply_enabled") {
		msg := ""
		if msgs := mapStringSlice(auto, "public_reply_messages"); len(msgs) > 0 {
			msg = msgs[rand.Intn(len(msgs))]
		} else {
			msg = mapString(auto, "public_reply_message")
		}
		if msg != "" {
			if err := r.Graph.SendCommentReply(ctx, commentID, Personalize(msg, commenterName), token); err != nil {
				if meta.IsMetaAPIError(err) {
					if r.Log != nil {
						r.Log.WarnContext(ctx, "public reply failed",
							"automation_id", mapString(auto, "$id"),
							"error", err,
						)
					}
				} else {
					return err
				}
			}
		}
	}

	dmText := mapString(auto, "dm_message")
	revealText := mapString(auto, "reveal_message")

	var trackedURL string
	if mapBool(auto, "track_links") {
		link, err := r.Store.GetTrackedLinkForAutomation(ctx, mapString(auto, "$id"))
		if err != nil {
			return err
		}
		if link != nil {
			trackedURL = r.PublicBaseURL + "/r/" + mapString(link, "$id")
			targetURL := mapString(link, "target_url")
			dmText = tracking.RenderMessageWithTracking(dmText, commenterName, trackedURL, targetURL)
			if revealText != "" {
				revealText = tracking.RenderMessageWithTracking(revealText, commenterName, trackedURL, targetURL)
			}
		}
	}

	if mapString(auto, "opening_dm_mode") == "button" && mapString(auto, "button_text") != "" && revealText != "" {
		if err := r.Graph.SendPrivateReplyWithButton(
			ctx,
			igID,
			commentID,
			Personalize(dmText, commenterName),
			mapString(auto, "button_text"),
			"reveal:"+mapString(auto, "$id"),
			token,
		); err != nil {
			if meta.IsTemplateRejection(err) {
				commenterID := mapString(event, "commenter_id")
				if commenterID == "" {
					return err
				}
				fallbackMsg := buildInlineLinkFallback(dmText, commenterName, trackedURL)
				if fbErr := r.Graph.SendDirectMessage(ctx, igID, commenterID, fallbackMsg, token); fbErr != nil {
					return err
				}
				return r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
					"action": "dm_sent",
					"reason": nil,
				})
			}
			return err
		}
		return r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
			"action": "button_dm_sent",
			"reason": nil,
		})
	}

	if err := r.Graph.SendPrivateReply(ctx, igID, commentID, Personalize(dmText, commenterName), token); err != nil {
		return err
	}
	return r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
		"action": "dm_sent",
		"reason": nil,
	})
}

// RunSendReveal executes a send_reveal job payload.
func (r *CommentRunner) RunSendReveal(ctx context.Context, payload map[string]any) error {
	if r.Store == nil || r.Graph == nil {
		return fmt.Errorf("comment runner not configured")
	}

	automationID := mapString(payload, "automation_id")
	userID := mapString(payload, "user_id")
	igID := mapString(payload, "instagram_account_id")
	if automationID == "" || userID == "" || igID == "" {
		return fmt.Errorf("send_reveal job missing required fields")
	}

	auto, err := r.Store.GetAutomation(ctx, automationID)
	if err != nil {
		return err
	}
	if auto == nil {
		return fmt.Errorf("automation %s not found", automationID)
	}
	if mapString(auto, "ig_user_id") != igID {
		return fmt.Errorf("automation %s ig_user_id mismatch", automationID)
	}

	creator, err := r.Store.GetCreatorByClerkID(ctx, mapString(auto, "clerk_user_id"))
	if err != nil {
		return err
	}
	if creator == nil || mapString(creator, "access_token") == "" {
		return fmt.Errorf("no access_token for automation %s", automationID)
	}

	token, err := r.decryptToken(mapString(creator, "access_token"))
	if err != nil {
		return err
	}

	revealMessage := mapString(auto, "reveal_message")
	if revealMessage == "" {
		revealMessage = "Here's the link you requested!"
	}

	if mapBool(auto, "track_links") {
		link, lerr := r.Store.GetTrackedLinkForAutomation(ctx, automationID)
		if lerr != nil {
			return lerr
		}
		if link != nil {
			trackedURL := r.PublicBaseURL + "/r/" + mapString(link, "$id")
			targetURL := mapString(link, "target_url")
			revealMessage = tracking.RenderMessageWithTracking(revealMessage, "", trackedURL, targetURL)
		}
	}

	if err := r.Graph.SendDirectMessage(ctx, igID, userID, Personalize(revealMessage, ""), token); err != nil {
		return err
	}

	_, err = r.Store.CreateLog(ctx, map[string]any{
		"automation_id":      automationID,
		"clerk_user_id":      mapString(auto, "clerk_user_id"),
		"ig_user_id":         igID,
		"media_id":           "",
		"comment_id":         "postback:" + userID,
		"commenter_username": nil,
		"comment_text":       nil,
		"matched_keyword":    nil,
		"action":             "reveal_sent",
		"created_at":         r.nowISO(),
	})
	return err
}

// RunJob implements JobRunner.
func (r *CommentRunner) RunJob(ctx context.Context, jobID string) error {
	if r.Store == nil {
		return fmt.Errorf("comment store not configured")
	}

	job, err := r.Store.GetJob(ctx, jobID)
	if err != nil {
		return err
	}
	if job == nil || mapString(job, "status") == "done" {
		return nil
	}

	nowISO := r.nowISO()
	if err := r.Store.UpdateJob(ctx, jobID, map[string]any{
		"status":     "processing",
		"updated_at": nowISO,
	}); err != nil {
		return err
	}

	payloadRaw := mapString(job, "payload")
	var payload map[string]any
	if err := json.Unmarshal([]byte(payloadRaw), &payload); err != nil {
		attempts := mapInt(job, "attempts") + 1
		_ = r.Store.UpdateJob(ctx, jobID, map[string]any{
			"status":     "failed",
			"attempts":   attempts,
			"updated_at": r.nowISO(),
		})
		return fmt.Errorf("invalid job payload: %w", err)
	}

	defer func() {
		if recovered := recover(); recovered != nil {
			attempts := mapInt(job, "attempts") + 1
			_ = r.Store.UpdateJob(ctx, jobID, map[string]any{
				"status":     "failed",
				"attempts":   attempts,
				"updated_at": r.nowISO(),
			})
			if r.Log != nil {
				r.Log.ErrorContext(ctx, "job panicked", "job_id", jobID, "panic", recovered)
			}
		}
	}()

	if mapString(job, "type") == JobTypeSendReveal {
		if err := r.RunSendReveal(ctx, payload); err != nil {
			if meta.IsMetaAPIError(err) {
				return r.retryMetaAPIError(ctx, jobID, job, err)
			}
			return r.failJobUnexpected(ctx, jobID, job, err)
		}
		return r.Store.UpdateJob(ctx, jobID, map[string]any{
			"status":     "done",
			"updated_at": r.nowISO(),
		})
	}

	requeueAttempt := mapInt(payload, "requeue_attempt")
	result, err := r.ProcessCommentEvent(ctx, payload, requeueAttempt)
	if err != nil {
		if meta.IsMetaAPIError(err) {
			return r.retryMetaAPIError(ctx, jobID, job, err)
		}
		return r.failJobUnexpected(ctx, jobID, job, err)
	}

	nowISO = r.nowISO()
	if result == "requeue" {
		payload["requeue_attempt"] = requeueAttempt + 1
		encoded, _ := json.Marshal(payload)
		runAt := r.Now().UTC().Add(time.Duration(RequeueDelayMinutes) * time.Minute).Format(time.RFC3339Nano)
		return r.Store.UpdateJob(ctx, jobID, map[string]any{
			"status":     "pending",
			"payload":    string(encoded),
			"run_at":     runAt,
			"updated_at": nowISO,
		})
	}

	return r.Store.UpdateJob(ctx, jobID, map[string]any{
		"status":     "done",
		"updated_at": nowISO,
	})
}

func (r *CommentRunner) retryMetaAPIError(ctx context.Context, jobID string, job map[string]any, err error) error {
	nowISO := r.nowISO()
	attempts := mapInt(job, "attempts") + 1
	if attempts >= MaxAttempts {
		if r.Log != nil {
			r.Log.ErrorContext(ctx, "job dead-lettered", "job_id", jobID, "attempts", attempts, "error", err)
		}
		return r.Store.UpdateJob(ctx, jobID, map[string]any{
			"status":     "failed",
			"attempts":   attempts,
			"updated_at": nowISO,
		})
	}
	runAt := r.Now().UTC().Add(BackoffDuration(attempts)).Format(time.RFC3339Nano)
	return r.Store.UpdateJob(ctx, jobID, map[string]any{
		"status":     "pending",
		"attempts":   attempts,
		"run_at":     runAt,
		"updated_at": nowISO,
	})
}

func (r *CommentRunner) failJobUnexpected(ctx context.Context, jobID string, job map[string]any, err error) error {
	nowISO := r.nowISO()
	attempts := mapInt(job, "attempts") + 1
	if r.Log != nil {
		r.Log.ErrorContext(ctx, "job failed unexpectedly", "job_id", jobID, "error", err)
	}
	_ = r.Store.UpdateJob(ctx, jobID, map[string]any{
		"status":     "failed",
		"attempts":   attempts,
		"updated_at": nowISO,
	})
	return err
}

func (r *CommentRunner) failLog(ctx context.Context, existing, auto, event map[string]any, reason string) error {
	action := "failed"
	if reason == "skipped_no_match" || reason == "skipped_dedup" {
		action = reason
	} else if strings.HasPrefix(reason, "skipped") {
		action = "skipped"
	}
	if existing != nil {
		return r.Store.UpdateLog(ctx, mapString(existing, "$id"), map[string]any{
			"action": action,
			"reason": reason,
		})
	}
	_, err := r.Store.CreateLog(ctx, map[string]any{
		"automation_id": mapString(auto, "$id"),
		"clerk_user_id": mapString(auto, "clerk_user_id"),
		"ig_user_id":    mapString(event, "instagram_account_id"),
		"media_id":      mapString(event, "media_id"),
		"comment_id":    mapString(event, "comment_id"),
		"action":        action,
		"reason":        reason,
		"created_at":    r.nowISO(),
	})
	if IsDuplicateKey(err) {
		return nil
	}
	return err
}

func (r *CommentRunner) decryptToken(stored string) (string, error) {
	if r.Crypto == nil {
		return stored, nil
	}
	// Match Python: decrypt_or_plaintext never raises on bad ciphertext, but
	// crypto construction failures are surfaced by injectable wrappers.
	type fallible interface {
		DecryptOrPlaintextErr(stored string) (string, error)
	}
	if f, ok := r.Crypto.(fallible); ok {
		return f.DecryptOrPlaintextErr(stored)
	}
	return r.Crypto.DecryptOrPlaintext(stored), nil
}

func (r *CommentRunner) nowISO() string {
	now := time.Now().UTC()
	if r.Now != nil {
		now = r.Now().UTC()
	}
	return now.Format(time.RFC3339Nano)
}

func filterAutomationsForMedia(all []map[string]any, mediaID string) []map[string]any {
	out := make([]map[string]any, 0, len(all))
	for _, a := range all {
		if mapString(a, "target_type") == "all_posts" {
			out = append(out, a)
			continue
		}
		if containsString(mapStringSlice(a, "media_ids"), mediaID) ||
			containsString(mapStringSlice(a, "bound_media_ids"), mediaID) {
			out = append(out, a)
		}
	}
	return out
}

func mapString(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	default:
		return fmt.Sprint(t)
	}
}

func mapInt(m map[string]any, key string) int {
	if m == nil {
		return 0
	}
	switch v := m[key].(type) {
	case int:
		return v
	case int32:
		return int(v)
	case int64:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		i, _ := v.Int64()
		return int(i)
	default:
		return 0
	}
}

func mapBool(m map[string]any, key string) bool {
	if m == nil {
		return false
	}
	switch v := m[key].(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(v, "true") || v == "1"
	default:
		return false
	}
}

func mapStringSlice(m map[string]any, key string) []string {
	if m == nil {
		return nil
	}
	switch v := m[key].(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

