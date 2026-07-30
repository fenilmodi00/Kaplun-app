package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	refreshWindowDays = 10
	retainLogsDays    = 14
)

type CronCreator struct {
	ID             string
	AccessToken    string
	TokenExpiresAt string
}

type TokenRefreshResult struct {
	AccessToken string
	ExpiresIn   int
}

type CronStore interface {
	ListCreatorsWithTokenExpiringBefore(ctx context.Context, thresholdISO string) ([]CronCreator, error)
	UpdateCreatorToken(ctx context.Context, creatorID, encryptedToken, expiresAtISO string) error
	DeleteLogsOlderThan(ctx context.Context, cutoffISO string) (int, error)
	DeleteWebhookEventsOlderThan(ctx context.Context, cutoffISO string) (int, error)
	CountJobsByStatus(ctx context.Context) (map[string]int, error)
	GetLastWebhookEventTime(ctx context.Context) (*string, error)
}

type TokenRefresher interface {
	RefreshLongLivedToken(ctx context.Context, token string) (TokenRefreshResult, error)
}

type TokenCrypto interface {
	Encrypt(plaintext string) (string, error)
	DecryptOrPlaintext(stored string) string
}

type ReconcileService interface {
	ReconcileOnce(ctx context.Context) (map[string]any, error)
	AttachNextReels(ctx context.Context) (int, error)
}

type CronHandler struct {
	Store      CronStore
	Refresher  TokenRefresher
	Crypto     TokenCrypto
	Reconciler ReconcileService
	Now        func() time.Time
}

func NewCronHandler(store CronStore, refresher TokenRefresher, crypto TokenCrypto, reconcile ReconcileService) *CronHandler {
	return &CronHandler{
		Store:      store,
		Refresher:  refresher,
		Crypto:     crypto,
		Reconciler: reconcile,
		Now:        time.Now,
	}
}

func (h *CronHandler) RefreshTokens(c *gin.Context) {
	threshold := h.Now().UTC().Add(time.Duration(refreshWindowDays) * 24 * time.Hour).Format(time.RFC3339Nano)
	creators, err := h.Store.ListCreatorsWithTokenExpiringBefore(c.Request.Context(), threshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"refreshed": 0, "failed": 0})
		return
	}

	refreshed, failed := 0, 0
	for _, creator := range creators {
		if creator.AccessToken == "" {
			continue
		}
		token := creator.AccessToken
		if h.Crypto != nil {
			token = h.Crypto.DecryptOrPlaintext(creator.AccessToken)
		}
		out, err := h.Refresher.RefreshLongLivedToken(c.Request.Context(), token)
		if err != nil {
			failed++
			continue
		}
		encrypted := out.AccessToken
		if h.Crypto != nil {
			enc, encErr := h.Crypto.Encrypt(out.AccessToken)
			if encErr != nil {
				failed++
				continue
			}
			encrypted = enc
		}
		expiresAt := h.Now().UTC().Add(time.Duration(out.ExpiresIn) * time.Second).Format(time.RFC3339Nano)
		if err := h.Store.UpdateCreatorToken(c.Request.Context(), creator.ID, encrypted, expiresAt); err != nil {
			failed++
			continue
		}
		refreshed++
	}

	c.JSON(http.StatusOK, gin.H{"refreshed": refreshed, "failed": failed})
}

func (h *CronHandler) Reconcile(c *gin.Context) {
	result := map[string]any{"enqueued": 0}
	if h.Reconciler != nil {
		once, err := h.Reconciler.ReconcileOnce(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"enqueued": 0, "attached": 0})
			return
		}
		for k, v := range once {
			result[k] = v
		}
		attached, err := h.Reconciler.AttachNextReels(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"enqueued": result["enqueued"], "attached": 0})
			return
		}
		result["attached"] = attached
	} else {
		result["attached"] = 0
	}
	c.JSON(http.StatusOK, result)
}

func (h *CronHandler) RetainLogs(c *gin.Context) {
	cutoff := h.Now().UTC().Add(-time.Duration(retainLogsDays) * 24 * time.Hour).Format(time.RFC3339Nano)
	deletedLogs, err := h.Store.DeleteLogsOlderThan(c.Request.Context(), cutoff)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"deleted_logs": 0, "deleted_webhook_events": 0})
		return
	}
	deletedEvents, err := h.Store.DeleteWebhookEventsOlderThan(c.Request.Context(), cutoff)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"deleted_logs": deletedLogs, "deleted_webhook_events": 0})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"deleted_logs":           deletedLogs,
		"deleted_webhook_events": deletedEvents,
	})
}

func (h *CronHandler) Health(c *gin.Context) {
	counts, err := h.Store.CountJobsByStatus(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{})
		return
	}
	last, err := h.Store.GetLastWebhookEventTime(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"pending":               counts["pending"],
		"processing":            counts["processing"],
		"failed":                counts["failed"],
		"done":                  counts["done"],
		"last_webhook_event_at": last,
	})
}
