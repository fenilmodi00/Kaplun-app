package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/platform/webhooks"
	"kaplun/api-go/internal/worker"
)

const maxCommentTextJobLen = 1500

// WebhookStore creates durable automation jobs.
type WebhookStore interface {
	CreateJob(ctx context.Context, jobType string, payload map[string]any, runAt, dedupKey string) (jobID string, err error)
}

// JobEnqueuer schedules background processing for a created job ID.
type JobEnqueuer interface {
	Enqueue(jobID string) error
}

type WebhooksHandler struct {
	VerifyToken   string
	Secrets       []string
	AllowUnsigned bool // local/dev only — Meta posts still arrive when App Secret is wrong
	Store         WebhookStore
	Enqueuer      JobEnqueuer
	Log           *slog.Logger
}

func NewWebhooksHandler(verifyToken string, secrets []string, store WebhookStore, enqueuer JobEnqueuer) *WebhooksHandler {
	return &WebhooksHandler{
		VerifyToken: verifyToken,
		Secrets:     secrets,
		Store:       store,
		Enqueuer:    enqueuer,
	}
}

func (h *WebhooksHandler) Verify(c *gin.Context) {
	mode := c.Query("hub.mode")
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	if mode == "subscribe" && token == h.VerifyToken {
		c.String(http.StatusOK, challenge)
		return
	}
	c.Status(http.StatusForbidden)
}

func (h *WebhooksHandler) Events(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}

	sig := c.GetHeader("X-Hub-Signature-256")
	if !webhooks.VerifySignature(raw, sig, h.Secrets) {
		if h.AllowUnsigned {
			if h.Log != nil {
				h.Log.Warn("instagram webhook signature bypassed (WEBHOOK_INSECURE_SKIP_SIGNATURE)",
					"has_signature", sig != "",
					"signature_prefix", trimSigPrefix(sig),
					"secrets_configured", len(h.Secrets),
					"body_bytes", len(raw),
				)
			}
		} else {
			if h.Log != nil {
				h.Log.Warn("instagram webhook signature rejected",
					"has_signature", sig != "",
					"signature_prefix", trimSigPrefix(sig),
					"secrets_configured", len(h.Secrets),
					"body_bytes", len(raw),
				)
			}
			c.Status(http.StatusUnauthorized)
			return
		}
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		h.warn("webhook payload is not valid JSON", err)
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}
	if payload == nil {
		payload = map[string]any{}
	}

	comments := webhooks.ParseCommentEvents(payload)
	postbacks := webhooks.ParsePostbackEvents(payload)
	messages := webhooks.ParseMessageEvents(payload)
	reads := webhooks.ParseReadEvents(payload)
	if h.Log != nil {
		h.Log.Info("instagram webhook received",
			"object", payload["object"],
			"comments", len(comments),
			"postbacks", len(postbacks),
			"messages", len(messages),
			"reads", len(reads),
		)
	}

	if h.Store == nil {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	var enqueueErrs []string

	for _, event := range comments {
		text := event.CommentText
		if len(text) > maxCommentTextJobLen {
			text = text[:maxCommentTextJobLen]
		}
		jobPayload := map[string]any{
			"instagram_account_id": event.InstagramAccountID,
			"comment_id":           event.CommentID,
			"comment_text":         text,
			"commenter_id":         event.CommenterID,
			"commenter_name":       event.CommenterName,
			"media_id":             event.MediaID,
		}
		jobID, err := h.Store.CreateJob(c.Request.Context(), "process_comment", jobPayload, "", commentDedupKey(event))
		if err != nil {
			h.warn("create process_comment job failed", err)
			enqueueErrs = append(enqueueErrs, fmt.Sprintf("process_comment %s: %v", event.CommentID, err))
			continue
		}
		h.enqueue(jobID)
	}

	for _, event := range postbacks {
		if strings.HasPrefix(event.Payload, "reveal:") {
			automationID := strings.TrimPrefix(event.Payload, "reveal:")
			jobPayload := map[string]any{
				"instagram_account_id": event.InstagramAccountID,
				"user_id":              event.UserID,
				"automation_id":        automationID,
			}
			jobID, err := h.Store.CreateJob(c.Request.Context(), "send_reveal", jobPayload, "", postbackDedupKey(event))
			if err != nil {
				h.warn("create send_reveal job failed", err)
				enqueueErrs = append(enqueueErrs, fmt.Sprintf("send_reveal %s: %v", event.UserID, err))
				continue
			}
			h.enqueue(jobID)
		} else if strings.HasPrefix(event.Payload, "followcheck:") {
			automationID := strings.TrimPrefix(event.Payload, "followcheck:")
			jobPayload := map[string]any{
				"instagram_account_id": event.InstagramAccountID,
				"user_id":              event.UserID,
				"automation_id":        automationID,
			}
			jobID, err := h.Store.CreateJob(c.Request.Context(), "send_reveal", jobPayload, "", postbackDedupKey(event))
			if err != nil {
				h.warn("create send_reveal job (followcheck) failed", err)
				enqueueErrs = append(enqueueErrs, fmt.Sprintf("send_reveal followcheck %s: %v", event.UserID, err))
				continue
			}
			h.enqueue(jobID)
		}
	}

	for _, event := range messages {
		jobPayload := map[string]any{
			"instagram_account_id": event.InstagramAccountID,
			"message_id":           event.MessageID,
			"message_text":         event.MessageText,
			"sender_id":            event.SenderID,
		}
		jobID, err := h.Store.CreateJob(c.Request.Context(), "process_message", jobPayload, "", messageDedupKey(event))
		if err != nil {
			h.warn("create process_message job failed", err)
			enqueueErrs = append(enqueueErrs, fmt.Sprintf("process_message %s: %v", event.MessageID, err))
			continue
		}
		h.enqueue(jobID)
	}

	for _, event := range reads {
		readJobPayload := map[string]any{
			"instagram_account_id": event.InstagramAccountID,
			"user_id":              event.UserID,
			"fallback":             true,
		}
		runAt := time.Now().UTC().Add(worker.ReadFallbackDelaySeconds * time.Second).Format(time.RFC3339Nano)
		// Do NOT enqueue: delayed jobs are picked up by the sweeper via run_at.
		if _, err := h.Store.CreateJob(c.Request.Context(), "send_reveal", readJobPayload, runAt, readDedupKey(event)); err != nil {
			h.warn("create read_fallback send_reveal job failed", err)
			enqueueErrs = append(enqueueErrs, fmt.Sprintf("read_fallback %s: %v", event.UserID, err))
			continue
		}
	}

	if len(enqueueErrs) > 0 {
		envelope := make(map[string]any, len(payload)+1)
		for k, v := range payload {
			envelope[k] = v
		}
		envelope["enqueue_errors"] = enqueueErrs
		if _, err := h.Store.CreateJob(c.Request.Context(), "webhook_envelope", envelope, "", ""); err != nil {
			h.warn("persist webhook_envelope failed", err)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func commentDedupKey(event webhooks.CommentEvent) string {
	return fmt.Sprintf("process_comment:%s:%s", event.InstagramAccountID, event.CommentID)
}

func postbackDedupKey(event webhooks.PostbackEvent) string {
	mid := event.MID
	if mid == "" {
		mid = event.Payload
	}
	return fmt.Sprintf("postback:%s:%s:%s", event.InstagramAccountID, event.UserID, mid)
}

func messageDedupKey(event webhooks.MessageEvent) string {
	return fmt.Sprintf("process_message:%s:%s:%s", event.InstagramAccountID, event.SenderID, event.MessageID)
}

func readDedupKey(event webhooks.ReadEvent) string {
	return fmt.Sprintf("read_fallback:%s:%s:%d", event.InstagramAccountID, event.UserID, event.Watermark)
}

func (h *WebhooksHandler) enqueue(jobID string) {
	if h.Enqueuer == nil || jobID == "" {
		return
	}
	if err := h.Enqueuer.Enqueue(jobID); err != nil {
		h.warn("enqueue job failed", err)
	}
}

func (h *WebhooksHandler) warn(msg string, err error) {
	if h.Log != nil {
		h.Log.Warn(msg, "error", err)
	}
}

func trimSigPrefix(sig string) string {
	if len(sig) <= 18 {
		return sig
	}
	return sig[:18] + "…"
}
