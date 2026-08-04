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
	FindLogByCommentID(ctx context.Context, commentID string) ([]map[string]any, error)
	FindButtonDMForUser(ctx context.Context, automationID, userID string) (map[string]any, error)
	CreateLog(ctx context.Context, data map[string]any) (map[string]any, error)
	UpdateLog(ctx context.Context, logID string, data map[string]any) error
	UpdateAutomation(ctx context.Context, automationID string, data map[string]any) error
	GetCreatorByClerkID(ctx context.Context, clerkUserID string) (map[string]any, error)
	GetTrackedLinkForAutomation(ctx context.Context, automationID string) (map[string]any, error)
	GetAutomation(ctx context.Context, automationID string) (map[string]any, error)
	GetJob(ctx context.Context, jobID string) (map[string]any, error)
	UpdateJob(ctx context.Context, jobID string, data map[string]any) error
	CountRecentDMActions(igUserID, since string) int
	CreateJob(ctx context.Context, jobType string, payload map[string]any, runAt string) (string, error)
	HasPendingFollowUp(ctx context.Context, automationID, userID string) (bool, error)
}

// GraphSender sends Instagram Graph messaging / reply calls.
type GraphSender interface {
	SendCommentReply(ctx context.Context, commentID, message, accessToken string) error
	SendPrivateReply(ctx context.Context, igAccountID, commentID, text, accessToken string) error
	SendPrivateReplyWithButton(ctx context.Context, igAccountID, commentID, text, buttonTitle, payload, accessToken string) error
	SendPrivateReplyWithLinkButton(ctx context.Context, igAccountID, commentID, text, buttonTitle, url, accessToken string) error
	SendDirectMessage(ctx context.Context, igAccountID, userID, text, accessToken string) error
	SendDirectMessageWithButton(ctx context.Context, igAccountID, userID, text, buttonTitle, payload, accessToken string) error
	SendDirectMessageWithLinkButton(ctx context.Context, igAccountID, userID, text, buttonTitle, url, accessToken string) error
	GetUserFollowStatus(ctx context.Context, accessToken, recipientID string) (*bool, error)
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

var bareDomainRE = regexp.MustCompile(`(?i)^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(/[\w\-./?%&=+#]*)?$`)

// resolveRevealLinkURL returns a https URL for a web_url button when the reveal
// is link-like. trackedURL wins when link tracking is enabled.
func resolveRevealLinkURL(revealText, trackedURL string) string {
	if u := strings.TrimSpace(trackedURL); u != "" {
		return u
	}
	revealText = strings.TrimSpace(revealText)
	if revealText == "" {
		return ""
	}
	if u := tracking.ExtractFirstURL(revealText); u != "" {
		return u
	}
	// Bare domains like "Kaplun.tech" — common in reveal fields.
	if bareDomainRE.MatchString(revealText) {
		return "https://" + revealText
	}
	return ""
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
			"commenter_id":       nilIfEmpty(mapString(event, "commenter_id")),
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

	// Cross-campaign dedup: Meta allows exactly one private reply per comment.
	// If another campaign already sent a DM for this comment, skip the DM leg
	// but keep the public reply (which is per-campaign and not subject to the limit).
	autoID := mapString(auto, "$id")
	existingLogs, err := r.Store.FindLogByCommentID(ctx, commentID)
	if err != nil {
		return err
	}
	for _, other := range existingLogs {
		if mapString(other, "automation_id") != autoID {
			if r.Log != nil {
				r.Log.InfoContext(ctx, "cross-campaign dedup",
					"comment_id", commentID,
					"automation_id", autoID,
					"other_automation_id", mapString(other, "automation_id"),
				)
			}
			// Appwrite enum only allows: pending|dm_sent|button_dm_sent|reveal_sent|reply_sent|skipped|failed.
			// Put the specific skip cause in reason, not action.
			return r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
				"action": "skipped",
				"reason": "skipped_dedup",
			})
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

	// Follow gate: if requireFollow is true and mode is NOT button, check follow status
	// before sending the DM. If not following, send a follow prompt button instead.
	if mapBool(auto, "require_follow") && mapString(auto, "opening_dm_mode") != "button" {
		commenterID := mapString(event, "commenter_id")
		if commenterID != "" {
			following, fErr := r.Graph.GetUserFollowStatus(ctx, token, commenterID)
			if fErr != nil {
				// Log but fail-open — if we can't verify, send the DM anyway
				if r.Log != nil {
					r.Log.WarnContext(ctx, "follow status check failed, sending DM anyway",
						"automation_id", mapString(auto, "$id"),
						"error", fErr,
					)
				}
			} else if following != nil && !*following {
				// Not following — send follow prompt button
				promptMsg := mapString(auto, "follow_prompt_message")
				if promptMsg == "" {
					promptMsg = "Follow me to unlock the link!"
				}
				btnLabel := mapString(auto, "follow_prompt_button_label")
				if btnLabel == "" {
					btnLabel = "Follow"
				}
				if err := r.Graph.SendPrivateReplyWithButton(
					ctx,
					igID,
					commentID,
					Personalize(promptMsg, commenterName),
					btnLabel,
					"followcheck:"+mapString(auto, "$id"),
					token,
				); err != nil {
					return err
				}
				return r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
					"action": "dm_sent",
					"reason": "follow_prompt_sent",
				})
			}
		}
	}

	if mapString(auto, "opening_dm_mode") == "button" && mapString(auto, "button_text") != "" && revealText != "" {
		// OpenReply / ManyChat style: opening DM is always a postback button.
		// Tap fires messaging_postbacks → follow-gate (optional) → reveal DM with the link.
		// Do NOT use web_url here — that would open the site immediately and skip the gate.
		postbackPayload := "reveal:" + mapString(auto, "$id")
		if mapBool(auto, "require_follow") {
			postbackPayload = "followcheck:" + mapString(auto, "$id")
		}
		if err := r.Graph.SendPrivateReplyWithButton(
			ctx,
			igID,
			commentID,
			Personalize(dmText, commenterName),
			mapString(auto, "button_text"),
			postbackPayload,
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
				if err := r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
					"action": "dm_sent",
					"reason": nil,
				}); err != nil {
					return err
				}
				r.scheduleFollowUp(ctx, auto, commenterID, commenterName)
				return nil
			}
			return err
		}
		if err := r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
			"action": "button_dm_sent",
			"reason": nil,
		}); err != nil {
			return err
		}
		r.scheduleFollowUp(ctx, auto, mapString(event, "commenter_id"), commenterName)
		return nil
	}

	if err := r.Graph.SendPrivateReply(ctx, igID, commentID, Personalize(dmText, commenterName), token); err != nil {
		return err
	}
	if err := r.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
		"action": "dm_sent",
		"reason": nil,
	}); err != nil {
		return err
	}
	r.scheduleFollowUp(ctx, auto, mapString(event, "commenter_id"), commenterName)
	return nil
}

// RunSendReveal executes a send_reveal job payload.
func (r *CommentRunner) RunSendReveal(ctx context.Context, payload map[string]any) error {
	if r.Store == nil || r.Graph == nil {
		return fmt.Errorf("comment runner not configured")
	}

	automationID := mapString(payload, "automation_id")
	userID := mapString(payload, "user_id")
	igID := mapString(payload, "instagram_account_id")
	fallback := mapBool(payload, "fallback")

	// Read fallback jobs don't carry automation_id — they need to be resolved.
	if fallback && automationID == "" {
		// Only target button-mode automations that actually sent THIS user a
		// button DM; a read receipt must not trigger reveals from every
		// button-mode automation on the account.
		allActive, err := r.Store.ListActiveForIG(ctx, igID)
		if err != nil {
			return err
		}
		for _, auto := range allActive {
			if mapString(auto, "opening_dm_mode") != "button" {
				continue
			}
			buttonLog, berr := r.Store.FindButtonDMForUser(ctx, mapString(auto, "$id"), userID)
			if berr != nil {
				return berr
			}
			if buttonLog == nil {
				continue
			}
			if err := r.sendRevealWithFallback(ctx, auto, igID, userID); err != nil {
				if r.Log != nil {
					r.Log.WarnContext(ctx, "read fallback send_reveal failed",
						"automation_id", mapString(auto, "$id"),
						"error", err,
					)
				}
			}
		}
		return nil
	}

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
	if !igAccountMatches(auto, igID) {
		return fmt.Errorf("automation %s ig_user_id mismatch", automationID)
	}

	if fallback {
		return r.sendRevealWithFallback(ctx, auto, igID, userID)
	}

	return r.sendRevealStandard(ctx, auto, preferredAccountID(auto, igID), userID)
}

// sendRevealWithFallback handles the read-fallback path: skips if reveal already
// sent, skips follow-gate silently, and uses a distinct comment_id.
func (r *CommentRunner) sendRevealWithFallback(ctx context.Context, auto map[string]any, igID, userID string) error {
	automationID := mapString(auto, "$id")

	// Check if reveal was already sent via postback.
	existing, err := r.Store.FindLog(ctx, automationID, "postback:"+userID)
	if err != nil {
		return err
	}
	if existing != nil && mapString(existing, "action") == "reveal_sent" {
		return nil
	}

	// Check if reveal was already sent via read fallback.
	existing, err = r.Store.FindLog(ctx, automationID, "read_fallback:"+userID)
	if err != nil {
		return err
	}
	if existing != nil {
		return nil
	}

	// Follow gate: if requireFollow and fallback, skip silently.
	if mapBool(auto, "require_follow") {
		return nil
	}

	creator, cerr := r.Store.GetCreatorByClerkID(ctx, mapString(auto, "clerk_user_id"))
	if cerr != nil {
		return cerr
	}
	if creator == nil || mapString(creator, "access_token") == "" {
		return fmt.Errorf("no access_token for automation %s", automationID)
	}

	token, derr := r.decryptToken(mapString(creator, "access_token"))
	if derr != nil {
		return derr
	}

	return r.sendRevealMessage(ctx, auto, igID, userID, "read_fallback:"+userID, token, "")
}

// sendRevealStandard handles the standard postback path.
func (r *CommentRunner) sendRevealStandard(ctx context.Context, auto map[string]any, igID, userID string) error {
	automationID := mapString(auto, "$id")

	// Idempotency: one reveal per opening-DM cycle. A newer button_dm_sent
	// means the commenter got a fresh Boom button and may tap again.
	existing, err := r.Store.FindLog(ctx, automationID, "postback:"+userID)
	if err != nil {
		return err
	}
	if existing != nil && mapString(existing, "action") == "reveal_sent" {
		buttonLog, berr := r.Store.FindButtonDMForUser(ctx, automationID, userID)
		if berr != nil {
			return berr
		}
		if buttonLog == nil || !logTime(buttonLog).After(logTime(existing)) {
			return nil
		}
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

	// Follow gate check: if requireFollow is true, verify follow status before revealing.
	// Fail-open: if unverifiable (null), send the reveal anyway.
	if mapBool(auto, "require_follow") {
		following, fErr := r.Graph.GetUserFollowStatus(ctx, token, userID)
		if fErr != nil {
			if r.Log != nil {
				r.Log.WarnContext(ctx, "follow status check failed in reveal, sending anyway",
					"automation_id", automationID,
					"error", fErr,
				)
			}
		} else if following != nil && !*following {
			// Not following — re-send follow prompt as a direct message button
			promptMsg := mapString(auto, "follow_prompt_message")
			if promptMsg == "" {
				promptMsg = "Follow me to unlock the link!"
			}
			btnLabel := mapString(auto, "follow_prompt_button_label")
			if btnLabel == "" {
				btnLabel = "Follow"
			}
			if err := r.Graph.SendDirectMessageWithButton(
				ctx,
				igID,
				userID,
				Personalize(promptMsg, ""),
				btnLabel,
				"followcheck:"+automationID,
				token,
			); err != nil {
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
				"action":             "dm_sent",
				"reason":             "follow_prompt_resent",
				"created_at":         r.nowISO(),
			})
			return err
		}
	}

	return r.sendRevealMessage(ctx, auto, igID, userID, "postback:"+userID, token, "")
}

// sendRevealMessage sends the reveal DM and records reveal_sent. When logID is
// non-empty it updates that pending row instead of creating a new one; a
// unique-index conflict on create means the reveal was already recorded, so it
// is reconciled via update and treated as success.
func (r *CommentRunner) sendRevealMessage(ctx context.Context, auto map[string]any, igID, userID, commentID, token, logID string) error {
	automationID := mapString(auto, "$id")

	revealMessage := mapString(auto, "reveal_message")
	if revealMessage == "" {
		revealMessage = "Here's the link you requested!"
	}

	var trackedURL string
	if mapBool(auto, "track_links") {
		link, lerr := r.Store.GetTrackedLinkForAutomation(ctx, automationID)
		if lerr != nil {
			return lerr
		}
		if link != nil {
			trackedURL = r.PublicBaseURL + "/r/" + mapString(link, "$id")
			targetURL := mapString(link, "target_url")
			revealMessage = tracking.RenderMessageWithTracking(revealMessage, "", trackedURL, targetURL)
		}
	}

	personalized := Personalize(revealMessage, "")
	linkURL := resolveRevealLinkURL(revealMessage, trackedURL)
	btnTitle := mapString(auto, "button_text")
	if btnTitle == "" {
		btnTitle = "Open link"
	}

	// OpenReply style: reveal DM carries a web_url button with the link.
	// Opening DM used a postback; this second message is where the site opens.
	if linkURL != "" {
		if err := r.Graph.SendDirectMessageWithLinkButton(ctx, igID, userID, personalized, btnTitle, linkURL, token); err != nil {
			if !meta.IsTemplateRejection(err) {
				return err
			}
			// Fall back to plain text containing the URL.
			if err := r.Graph.SendDirectMessage(ctx, igID, userID, personalized, token); err != nil {
				return err
			}
		}
	} else if err := r.Graph.SendDirectMessage(ctx, igID, userID, personalized, token); err != nil {
		return err
	}

	if logID != "" {
		if err := r.Store.UpdateLog(ctx, logID, map[string]any{
			"action": "reveal_sent",
			"reason": nil,
		}); err != nil {
			return err
		}
		r.scheduleFollowUp(ctx, auto, userID, "")
		return nil
	}

	_, err := r.Store.CreateLog(ctx, map[string]any{
		"automation_id":      automationID,
		"clerk_user_id":      mapString(auto, "clerk_user_id"),
		"ig_user_id":         igID,
		"media_id":           "",
		"comment_id":         commentID,
		"commenter_username": nil,
		"comment_text":       nil,
		"matched_keyword":    nil,
		"action":             "reveal_sent",
		"created_at":         r.nowISO(),
	})
	if err != nil {
		if IsDuplicateKey(err) {
			// Row already exists (prior delivery or a new cycle after button_dm) —
			// stamp reveal_sent + created_at so the next opening cycle can compare.
			existing, ferr := r.Store.FindLog(ctx, automationID, commentID)
			if ferr != nil {
				return nil
			}
			if existing != nil {
				_ = r.Store.UpdateLog(ctx, mapString(existing, "$id"), map[string]any{
					"action":     "reveal_sent",
					"reason":     nil,
					"created_at": r.nowISO(),
				})
			}
			r.scheduleFollowUp(ctx, auto, userID, "")
			return nil
		}
		return err
	}

	r.scheduleFollowUp(ctx, auto, userID, "")
	return nil
}

// scheduleFollowUp creates a delayed send_followup job if the automation has
// follow-up enabled. It is a no-op if follow-up is not configured, if userID is
// empty, or if a follow-up job already exists for this (automation, user).
func (r *CommentRunner) scheduleFollowUp(ctx context.Context, auto map[string]any, userID, commenterName string) {
	if !mapBool(auto, "follow_up_enabled") {
		return
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		if r.Log != nil {
			r.Log.WarnContext(ctx, "skipping follow-up: empty user_id", "automation_id", mapString(auto, "$id"))
		}
		return
	}
	// W4 dedup: don't stack follow-ups across retries / multi-touch flows.
	pending, err := r.Store.HasPendingFollowUp(ctx, mapString(auto, "$id"), userID)
	if err != nil {
		if r.Log != nil {
			r.Log.WarnContext(ctx, "follow-up dedup check failed", "automation_id", mapString(auto, "$id"), "error", err)
		}
	} else if pending {
		return
	}
	delayMinutes := 1440 // default 24h
	if d := mapInt(auto, "follow_up_delay_minutes"); d > 0 {
		delayMinutes = d
	}
	runAt := r.Now().UTC().Add(time.Duration(delayMinutes) * time.Minute).Format(time.RFC3339Nano)
	_, err = r.Store.CreateJob(ctx, JobTypeFollowUp, map[string]any{
		"instagram_account_id": mapString(auto, "ig_user_id"),
		"user_id":              userID,
		"automation_id":        mapString(auto, "$id"),
		"commenter_name":       commenterName,
	}, runAt)
	if err != nil && r.Log != nil {
		r.Log.WarnContext(ctx, "failed to schedule follow-up job", "automation_id", mapString(auto, "$id"), "error", err)
	}
}

// RunProcessMessage executes a process_message job payload.
// It matches the DM text against active automations with dmTriggerEnabled,
// and sends the reveal directly via sendRevealMessage.
func (r *CommentRunner) RunProcessMessage(ctx context.Context, payload map[string]any) error {
	if r.Store == nil || r.Graph == nil {
		return fmt.Errorf("comment runner not configured")
	}

	igID := mapString(payload, "instagram_account_id")
	messageID := mapString(payload, "message_id")
	messageText := mapString(payload, "message_text")
	senderID := mapString(payload, "sender_id")

	if igID == "" || messageID == "" || senderID == "" {
		return fmt.Errorf("process_message job missing required fields")
	}

	allActive, err := r.Store.ListActiveForIG(ctx, igID)
	if err != nil {
		return err
	}

	// Instagram often delivers postback button taps as inbound `messages`
	// whose text equals the button title (OpenReply / Conversations API).
	// Handle those before keyword DM triggers.
	for _, auto := range allActive {
		if mapString(auto, "opening_dm_mode") != "button" {
			continue
		}
		btn := strings.TrimSpace(mapString(auto, "button_text"))
		if btn == "" || strings.TrimSpace(messageText) != btn {
			continue
		}
		buttonLog, berr := r.Store.FindButtonDMForUser(ctx, mapString(auto, "$id"), senderID)
		if berr != nil {
			return berr
		}
		if buttonLog == nil {
			continue
		}
		accountID := mapString(auto, "ig_user_id")
		if accountID == "" {
			accountID = igID
		}
		if err := r.sendRevealStandard(ctx, auto, accountID, senderID); err != nil {
			return err
		}
	}

	for _, auto := range allActive {
		// Only process automations with DM trigger enabled.
		if !mapBool(auto, "dm_trigger_enabled") {
			continue
		}

		matchedKeyword := ""
		if !mapBool(auto, "match_any_word") {
			mode := mapString(auto, "match_mode")
			wholeWord := mode == "" || mode == "whole_word"

			m := keywords.MatchKeywords(messageText, mapStringSlice(auto, "keywords"), wholeWord)
			if !m.Matched {
				if err := r.failLog(ctx, nil, auto, payload, "skipped_no_match"); err != nil {
					return err
				}
				continue
			}
			matchedKeyword = m.MatchedKeyword
		}

		// Dedup by message ID.
		commentID := "dm:" + messageID
		existing, err := r.Store.FindLog(ctx, mapString(auto, "$id"), commentID)
		if err != nil {
			return err
		}
		if existing != nil {
			action := mapString(existing, "action")
			if action == "dm_sent" || action == "reveal_sent" || action == "skipped" {
				continue
			}
		}

		creator, err := r.Store.GetCreatorByClerkID(ctx, mapString(auto, "clerk_user_id"))
		if err != nil {
			return err
		}
		if creator == nil || mapString(creator, "access_token") == "" {
			if err := r.failLog(ctx, existing, auto, payload, "no_access_token"); err != nil {
				return err
			}
			continue
		}

		token, derr := r.decryptToken(mapString(creator, "access_token"))
		if derr != nil {
			if err := r.failLog(ctx, existing, auto, payload, "token_decrypt_failed"); err != nil {
				return err
			}
			continue
		}

		// Create a log entry for the DM match.
		logRow := existing
		if logRow == nil {
			textTrim := messageText
			if len(textTrim) > 1000 {
				textTrim = textTrim[:1000]
			}
			created, cerr := r.Store.CreateLog(ctx, map[string]any{
				"automation_id":      mapString(auto, "$id"),
				"clerk_user_id":      mapString(auto, "clerk_user_id"),
				"ig_user_id":         igID,
				"media_id":           "",
				"comment_id":         commentID,
				"commenter_username": nil,
				"comment_text":       textTrim,
				"matched_keyword":    nilIfEmpty(matchedKeyword),
				"action":             "pending",
				"created_at":         r.nowISO(),
			})
			if cerr != nil {
				if IsDuplicateKey(cerr) {
					continue
				}
				return cerr
			}
			logRow = created
		}

		// Send the reveal directly via sendRevealMessage, updating the pending
		// log row in place (no second insert on the unique index).
		// The DM path skips the opening DM entirely and delivers the reveal.
		if err := r.sendRevealMessage(ctx, auto, igID, senderID, commentID, token, mapString(logRow, "$id")); err != nil {
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
				return err
			}
			return err
		}
	}

	return nil
}

// RunFollowUp executes a send_followup job payload.
func (r *CommentRunner) RunFollowUp(ctx context.Context, payload map[string]any) error {
	if r.Store == nil || r.Graph == nil {
		return fmt.Errorf("comment runner not configured")
	}

	automationID := mapString(payload, "automation_id")
	userID := mapString(payload, "user_id")
	igID := mapString(payload, "instagram_account_id")
	commenterName := mapString(payload, "commenter_name")
	if automationID == "" || userID == "" || igID == "" {
		return fmt.Errorf("send_followup job missing required fields")
	}

	auto, err := r.Store.GetAutomation(ctx, automationID)
	if err != nil {
		return err
	}
	if auto == nil {
		return fmt.Errorf("automation %s not found", automationID)
	}
	if !igAccountMatches(auto, igID) {
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

	followUpMessage := mapString(auto, "follow_up_message")
	if followUpMessage == "" {
		followUpMessage = "Thanks for your interest! 😊"
	}

	accountID := preferredAccountID(auto, igID)
	if err := r.Graph.SendDirectMessage(ctx, accountID, userID, Personalize(followUpMessage, commenterName), token); err != nil {
		return err
	}

	_, err = r.Store.CreateLog(ctx, map[string]any{
		"automation_id":      automationID,
		"clerk_user_id":      mapString(auto, "clerk_user_id"),
		"ig_user_id":         accountID,
		"media_id":           "",
		"comment_id":         "followup:" + userID,
		"commenter_username": nilIfEmpty(commenterName),
		"comment_text":       nil,
		"matched_keyword":    nil,
		"action":             "reply_sent",
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

	if mapString(job, "type") == JobTypeProcessMessage {
		if err := r.RunProcessMessage(ctx, payload); err != nil {
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

	if mapString(job, "type") == JobTypeFollowUp {
		if err := r.RunFollowUp(ctx, payload); err != nil {
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
	// Appwrite `action` enum: pending|dm_sent|button_dm_sent|reveal_sent|reply_sent|skipped|failed.
	// Specific skip causes (skipped_no_match, skipped_dedup, skipped_rate_limit, …) live in `reason`.
	action := "failed"
	if strings.HasPrefix(reason, "skipped") {
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
	default:
		return fmt.Sprint(t)
	}
}

func logTime(m map[string]any) time.Time {
	if m == nil {
		return time.Time{}
	}
	for _, key := range []string{"created_at", "$createdAt"} {
		raw := mapString(m, key)
		if raw == "" {
			continue
		}
		if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
			return t
		}
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			return t
		}
	}
	return time.Time{}
}

// igAccountMatches accepts either the professional user_id (webhook entry.id)
// or the app-scoped id. Meta Instagram Login uses user_id in webhooks while
// older Kaplun rows stored the app-scoped id — both refer to one account.
// When both IDs are set and differ, still accept: ListActiveForIG / GetAutomation
// already scoped the row; Meta signs the webhook.
func igAccountMatches(auto map[string]any, eventIG string) bool {
	return eventIG != ""
}

func preferredAccountID(auto map[string]any, eventIG string) string {
	if id := mapString(auto, "ig_user_id"); id != "" {
		return id
	}
	if id := mapString(auto, "ig_scoped_id"); id != "" {
		return id
	}
	return eventIG
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

