package worker

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"kaplun/api-go/internal/services/keywords"
	"kaplun/api-go/internal/services/ratelimit"
)

// ErrRequeue signals that a comment event hit the DM rate limit and the job
// should be retried later instead of being marked done.
var ErrRequeue = errors.New("requeue")

// TriggeredAutomation is the result of matching one comment event against one
// automation: the automation, the matched keyword, and the log row recording the
// pending send.
type TriggeredAutomation struct {
	Automation     map[string]any
	MatchedKeyword string
	LogRow        map[string]any
}

// TriggerMatcher matches comment events against active automations: keyword match,
// dedup, creator token presence, and DM rate limiting. It returns the automations
// that should send; the caller performs the actual send.
type TriggerMatcher struct {
	Store CommentStore
	Log   *slog.Logger
	Now   func() time.Time
}

// NewTriggerMatcher constructs a TriggerMatcher with a UTC clock default.
func NewTriggerMatcher(store CommentStore) *TriggerMatcher {
	return &TriggerMatcher{
		Store: store,
		Now:   func() time.Time { return time.Now().UTC() },
	}
}

// Match evaluates one comment event against all active automations for the IG account
// and returns the automations that should send. It returns ErrRequeue when the DM
// rate limit is hit and the job should be retried later.
func (m *TriggerMatcher) Match(ctx context.Context, event map[string]any) ([]TriggeredAutomation, error) {
	igID := mapString(event, "instagram_account_id")
	mediaID := mapString(event, "media_id")
	commentID := mapString(event, "comment_id")
	commentText := mapString(event, "comment_text")
	commenterName := mapString(event, "commenter_name")
	requeueAttempt := mapInt(event, "requeue_attempt")

	allActive, err := m.Store.ListActiveForIG(ctx, igID)
	if err != nil {
		return nil, err
	}

	var triggered []TriggeredAutomation
	for _, auto := range filterAutomationsForMedia(allActive, mediaID) {
		matchedKeyword := ""
		if !mapBool(auto, "match_any_word") {
			mode := mapString(auto, "match_mode")
			wholeWord := mode == "" || mode == "whole_word"

			km := keywords.MatchKeywords(commentText, mapStringSlice(auto, "keywords"), wholeWord)
			if !km.Matched {
				if err := m.failLog(ctx, nil, auto, event, "skipped_no_match"); err != nil {
					return nil, err
				}
				continue
			}
			matchedKeyword = km.MatchedKeyword
		}

		existing, err := m.Store.FindLog(ctx, mapString(auto, "$id"), commentID)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			action := mapString(existing, "action")
			if action == "dm_sent" || action == "button_dm_sent" || action == "skipped" || mapString(existing, "dm_sent_at") != "" {
				continue
			}
		}

		creator, err := m.Store.GetCreatorByClerkID(ctx, mapString(auto, "clerk_user_id"))
		if err != nil {
			return nil, err
		}
		if creator == nil || mapString(creator, "access_token") == "" {
			if err := m.failLog(ctx, existing, auto, event, "no_access_token"); err != nil {
				return nil, err
			}
			continue
		}

		rate, rateErr := ratelimit.CheckDMRate(ctx, m.Store, igID, requeueAttempt)
		if rateErr != nil {
			// Fail-open like the pre-ctx counter (which counted 0 on error),
			// but never silently.
			if m.Log != nil {
				m.Log.WarnContext(ctx, "dm rate check failed, allowing send",
					"automation_id", mapString(auto, "$id"),
					"error", rateErr,
				)
			}
			rate = ratelimit.RateDecision{Allowed: true}
		}
		if !rate.Allowed {
			if rate.ShouldSkip {
				if err := m.failLog(ctx, existing, auto, event, "skipped_rate_limit"); err != nil {
					return nil, err
				}
				continue
			}
			return nil, ErrRequeue
		}

		logRow := existing
		if logRow == nil {
			commentTrim := commentText
			if len(commentTrim) > 1000 {
				commentTrim = commentTrim[:1000]
			}
			created, cerr := m.Store.CreateLog(ctx, map[string]any{
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
				"created_at":         m.nowISO(),
			})
			if cerr != nil {
				if IsDuplicateKey(cerr) {
					continue
				}
				return nil, cerr
			}
			logRow = created
		}

		triggered = append(triggered, TriggeredAutomation{
			Automation:     auto,
			MatchedKeyword: matchedKeyword,
			LogRow:        logRow,
		})
	}

	return triggered, nil
}

func (m *TriggerMatcher) failLog(ctx context.Context, existing, auto, event map[string]any, reason string) error {
	// Appwrite `action` enum: pending|dm_sent|button_dm_sent|reveal_sent|reply_sent|skipped|failed.
	// Specific skip causes (skipped_no_match, skipped_dedup, skipped_rate_limit, …) live in `reason`.
	action := "failed"
	if strings.HasPrefix(reason, "skipped") {
		action = "skipped"
	}
	if existing != nil {
		return m.Store.UpdateLog(ctx, mapString(existing, "$id"), map[string]any{
			"action": action,
			"reason": reason,
		})
	}
	_, err := m.Store.CreateLog(ctx, map[string]any{
		"automation_id": mapString(auto, "$id"),
		"clerk_user_id": mapString(auto, "clerk_user_id"),
		"ig_user_id":    mapString(event, "instagram_account_id"),
		"media_id":      mapString(event, "media_id"),
		"comment_id":    mapString(event, "comment_id"),
		"action":        action,
		"reason":        reason,
		"created_at":    m.nowISO(),
	})
	if IsDuplicateKey(err) {
		return nil
	}
	return err
}

func (m *TriggerMatcher) nowISO() string {
	now := time.Now().UTC()
	if m.Now != nil {
		now = m.Now().UTC()
	}
	return now.Format(time.RFC3339Nano)
}
