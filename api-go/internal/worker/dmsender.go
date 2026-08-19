package worker

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"strings"
	"time"

	"kaplun/api-go/internal/platform/meta"
)

// DMSender owns the send-variant dispatch for a triggered automation: public reply,
// opening DM (button vs direct), follow gate, template-rejection fallback, log
// updates, and follow-up scheduling. CommentRunner delegates its send leg here.
type DMSender struct {
	Graph         GraphSender
	Store         CommentStore
	PublicBaseURL string
	Log           *slog.Logger
	Now           func() time.Time
}

// NewDMSender constructs a DMSender with a UTC clock default.
func NewDMSender(store CommentStore, graph GraphSender) *DMSender {
	return &DMSender{
		Store: store,
		Graph: graph,
		Now:   func() time.Time { return time.Now().UTC() },
	}
}

// Send delivers the DM leg for one triggered automation: public reply first, then the
// opening DM (button postback or direct private reply), with crash-safe and
// cross-campaign dedup, the follow gate, template-rejection fallback, log
// updates, and follow-up scheduling.
func (s *DMSender) Send(ctx context.Context, auto, event, logRow map[string]any, token, commenterName string) error {
	if s.Graph == nil {
		return fmt.Errorf("graph sender not configured")
	}

	commentID := mapString(event, "comment_id")
	igID := mapString(event, "instagram_account_id")
	logID := mapString(logRow, "$id")

	// STEP 7: public reply first — the log row already exists at this point, so
	// a successful send is stamped (public_reply_sent_at) and never double-posts
	// across job retries. ANY failure is recorded (public_reply_error) and never
	// blocks the DM leg.
	if mapBool(auto, "public_reply_enabled") && mapString(logRow, "public_reply_sent_at") == "" {
		msg := ""
		if msgs := mapStringSlice(auto, "public_reply_messages"); len(msgs) > 0 {
			msg = msgs[rand.Intn(len(msgs))]
		} else {
			msg = mapString(auto, "public_reply_message")
		}
		if msg != "" {
			if err := s.Graph.SendCommentReply(ctx, commentID, Personalize(msg, commenterName), token); err != nil {
				if s.Log != nil {
					s.Log.WarnContext(ctx, "public reply failed",
						"automation_id", mapString(auto, "$id"),
						"error", err,
					)
				}
				reason := err.Error()
				if len(reason) > 500 {
					reason = reason[:500]
				}
				if uerr := s.Store.UpdateLog(ctx, logID, map[string]any{
					"public_reply_error": reason,
				}); uerr != nil && s.Log != nil {
					s.Log.WarnContext(ctx, "failed to record public reply error",
						"automation_id", mapString(auto, "$id"),
						"error", uerr,
					)
				}
			} else if uerr := s.Store.UpdateLog(ctx, logID, map[string]any{
				"public_reply_sent_at": s.nowISO(),
				"public_reply_error":   nil,
			}); uerr != nil && s.Log != nil {
				// The reply was posted; a missed stamp risks a re-post on retry,
				// but failing the job here would guarantee one. Log only.
				s.Log.WarnContext(ctx, "failed to stamp public_reply_sent_at",
					"automation_id", mapString(auto, "$id"),
					"error", uerr,
				)
			}
		}
	}

	// Crash-safe dedup: dm_sent_at is stamped in the same UpdateLog that flips
	// the action, so a set timestamp proves the DM leg already delivered.
	if mapString(logRow, "dm_sent_at") != "" {
		return nil
	}

	// Cross-campaign dedup: Meta allows exactly one private reply per comment.
	// If another campaign already sent a DM for this comment, skip the DM leg
	// but keep the public reply (which is per-campaign and not subject to the limit).
	autoID := mapString(auto, "$id")
	existingLogs, err := s.Store.FindLogByCommentID(ctx, commentID)
	if err != nil {
		return err
	}
	for _, other := range existingLogs {
		if mapString(other, "automation_id") != autoID {
			if s.Log != nil {
				s.Log.InfoContext(ctx, "cross-campaign dedup",
					"comment_id", commentID,
					"automation_id", autoID,
					"other_automation_id", mapString(other, "automation_id"),
				)
			}
			// Appwrite enum only allows: pending|dm_sent|button_dm_sent|reveal_sent|reply_sent|skipped|failed.
			// Put the specific skip cause in reason, not action.
			return s.Store.UpdateLog(ctx, mapString(logRow, "$id"), map[string]any{
				"action": "skipped",
				"reason": "skipped_dedup",
			})
		}
	}

	dmText := mapString(auto, "dm_message")
	revealText := mapString(auto, "reveal_message")

	// Follow gate: if requireFollow is true and mode is NOT button, check follow status
	// before sending the DM. If not following, send a follow prompt button instead.
	if mapBool(auto, "require_follow") && mapString(auto, "opening_dm_mode") != "button" {
		commenterID := mapString(event, "commenter_id")
		if commenterID != "" {
			following, fErr := s.Graph.GetUserFollowStatus(ctx, token, commenterID)
			if fErr != nil {
				// Log but fail-open — if we can't verify, send the DM anyway
				if s.Log != nil {
					s.Log.WarnContext(ctx, "follow status check failed, sending DM anyway",
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
				if err := s.Graph.SendPrivateReplyWithButton(
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
				return s.Store.UpdateLog(ctx, logID, map[string]any{
					"action":     "dm_sent",
					"reason":     "follow_prompt_sent",
					"dm_sent_at": s.nowISO(),
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
		if err := s.Graph.SendPrivateReplyWithButton(
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
				fallbackMsg := Personalize(dmText, commenterName)
				if fbErr := s.Graph.SendDirectMessage(ctx, igID, commenterID, fallbackMsg, token); fbErr != nil {
					return err
				}
				if err := s.Store.UpdateLog(ctx, logID, map[string]any{
					"action":     "dm_sent",
					"reason":     nil,
					"dm_sent_at": s.nowISO(),
				}); err != nil {
					return err
				}
				s.scheduleFollowUp(ctx, auto, commenterID, commenterName)
				return nil
			}
			return err
		}
		if err := s.Store.UpdateLog(ctx, logID, map[string]any{
			"action":     "button_dm_sent",
			"reason":     nil,
			"dm_sent_at": s.nowISO(),
		}); err != nil {
			return err
		}
		s.scheduleFollowUp(ctx, auto, mapString(event, "commenter_id"), commenterName)
		return nil
	}

	if err := s.Graph.SendPrivateReply(ctx, igID, commentID, Personalize(dmText, commenterName), token); err != nil {
		return err
	}
	if err := s.Store.UpdateLog(ctx, logID, map[string]any{
		"action":     "dm_sent",
		"reason":     nil,
		"dm_sent_at": s.nowISO(),
	}); err != nil {
		return err
	}
	s.scheduleFollowUp(ctx, auto, mapString(event, "commenter_id"), commenterName)
	return nil
}

// scheduleFollowUp creates a delayed send_followup job if the automation has
// follow-up enabled. It is a no-op if follow-up is not configured, if userID is
// empty, or if a follow-up job already exists for this (automation, user).
func (s *DMSender) scheduleFollowUp(ctx context.Context, auto map[string]any, userID, commenterName string) {
	if !mapBool(auto, "follow_up_enabled") {
		return
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		if s.Log != nil {
			s.Log.WarnContext(ctx, "skipping follow-up: empty user_id", "automation_id", mapString(auto, "$id"))
		}
		return
	}
	// W4 dedup: don't stack follow-ups across retries / multi-touch flows.
	pending, err := s.Store.HasPendingFollowUp(ctx, mapString(auto, "$id"), userID)
	if err != nil {
		if s.Log != nil {
			s.Log.WarnContext(ctx, "follow-up dedup check failed", "automation_id", mapString(auto, "$id"), "error", err)
		}
	} else if pending {
		return
	}
	delayMinutes := 1440 // default 24h
	if d := mapInt(auto, "follow_up_delay_minutes"); d > 0 {
		delayMinutes = d
	}
	runAt := s.Now().UTC().Add(time.Duration(delayMinutes) * time.Minute).Format(time.RFC3339Nano)
	_, err = s.Store.CreateJob(ctx, JobTypeFollowUp, map[string]any{
		"instagram_account_id": mapString(auto, "ig_user_id"),
		"user_id":              userID,
		"automation_id":        mapString(auto, "$id"),
		"commenter_name":       commenterName,
	}, runAt, mapString(auto, "$id")+":"+userID)
	if err != nil && s.Log != nil {
		s.Log.WarnContext(ctx, "failed to schedule follow-up job", "automation_id", mapString(auto, "$id"), "error", err)
	}
}

func (s *DMSender) nowISO() string {
	now := time.Now().UTC()
	if s.Now != nil {
		now = s.Now().UTC()
	}
	return now.Format(time.RFC3339Nano)
}
