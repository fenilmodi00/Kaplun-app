package handlers

import (
	"context"
	"encoding/json"
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

// WebhookStore records payloads and creates durable automation jobs.
type WebhookStore interface {
	RecordWebhookEvent(ctx context.Context, payload string) error
	CreateJob(ctx context.Context, jobType string, payload map[string]any, runAt string) (jobID string, err error)
}

// JobEnqueuer schedules background processing for a created job ID.
type JobEnqueuer interface {
	Enqueue(jobID string) error
}

type WebhooksHandler struct {
	VerifyToken string
	Secrets     []string
	Store       WebhookStore
	Enqueuer    JobEnqueuer
	Log         *slog.Logger
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
		c.Status(http.StatusUnauthorized)
		return
	}

	// Always 200 after a valid signature — Meta retries non-200s.
	defer func() {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}()

	rawStr := string(raw)
	if h.Store != nil {
		if err := h.Store.RecordWebhookEvent(c.Request.Context(), rawStr); err != nil {
			h.warn("failed to record webhook event", err)
		}
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		h.warn("webhook payload is not valid JSON", err)
		return
	}
	if payload == nil {
		payload = map[string]any{}
	}

	if h.Store == nil {
		return
	}

	for _, event := range webhooks.ParseCommentEvents(payload) {
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
		jobID, err := h.Store.CreateJob(c.Request.Context(), "process_comment", jobPayload, "")
		if err != nil {
			h.warn("create process_comment job failed", err)
			continue
		}
		h.enqueue(jobID)
	}

	for _, event := range webhooks.ParsePostbackEvents(payload) {
		if strings.HasPrefix(event.Payload, "reveal:") {
			automationID := strings.TrimPrefix(event.Payload, "reveal:")
			jobPayload := map[string]any{
				"instagram_account_id": event.InstagramAccountID,
				"user_id":              event.UserID,
				"automation_id":        automationID,
			}
			jobID, err := h.Store.CreateJob(c.Request.Context(), "send_reveal", jobPayload, "")
			if err != nil {
				h.warn("create send_reveal job failed", err)
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
			jobID, err := h.Store.CreateJob(c.Request.Context(), "send_reveal", jobPayload, "")
			if err != nil {
				h.warn("create send_reveal job (followcheck) failed", err)
				continue
			}
			h.enqueue(jobID)
		}
	}

	for _, event := range webhooks.ParseReadEvents(payload) {
		readJobPayload := map[string]any{
			"instagram_account_id": event.InstagramAccountID,
			"user_id":              event.UserID,
			"fallback":             true,
		}
		runAt := time.Now().UTC().Add(worker.ReadFallbackDelaySeconds * time.Second).Format(time.RFC3339Nano)
		jobID, err := h.Store.CreateJob(c.Request.Context(), "send_reveal", readJobPayload, runAt)
		if err != nil {
			h.warn("create read_fallback send_reveal job failed", err)
			continue
		}
		h.enqueue(jobID)
	}
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
