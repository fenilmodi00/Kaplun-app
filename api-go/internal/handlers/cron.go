package handlers

import (
	"context"
	"log/slog"
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
	UpdateCreatorToken(ctx context.Context, creatorID, token, expiresAtISO string) error
	DeleteLogsOlderThan(ctx context.Context, cutoffISO string) (int, error)
	CountJobsByStatus(ctx context.Context) (map[string]int, error)
}

// TokenRefreshStore is the narrow store surface the token-refresh sweep needs;
// shared by the cron handler and the in-process daily refresh loop.
type TokenRefreshStore interface {
	ListCreatorsWithTokenExpiringBefore(ctx context.Context, thresholdISO string) ([]CronCreator, error)
	UpdateCreatorToken(ctx context.Context, creatorID, token, expiresAtISO string) error
}

type TokenRefresher interface {
	RefreshLongLivedToken(ctx context.Context, token string) (TokenRefreshResult, error)
}

type ReconcileService interface {
	ReconcileOnce(ctx context.Context) (map[string]any, error)
	AttachNextReels(ctx context.Context) (int, error)
}

type CronHandler struct {
	Store      CronStore
	Refresher  TokenRefresher
	Reconciler ReconcileService
	Log        *slog.Logger
	Now        func() time.Time
}

func NewCronHandler(store CronStore, refresher TokenRefresher, reconcile ReconcileService) *CronHandler {
	return &CronHandler{
		Store:      store,
		Refresher:  refresher,
		Reconciler: reconcile,
		Now:        time.Now,
	}
}

// RefreshExpiringTokens refreshes every creator token expiring within
// refreshWindowDays and persists the new token + expiry (plaintext — the Expo
// app reads access_token directly). A store-list failure returns err;
// per-creator failures are logged and counted, never swallowed.
func RefreshExpiringTokens(ctx context.Context, store TokenRefreshStore, refresher TokenRefresher, now func() time.Time, logger *slog.Logger) (refreshed, failed int, err error) {
	if now == nil {
		now = time.Now
	}
	threshold := now().UTC().Add(time.Duration(refreshWindowDays) * 24 * time.Hour).Format(time.RFC3339Nano)
	creators, err := store.ListCreatorsWithTokenExpiringBefore(ctx, threshold)
	if err != nil {
		return 0, 0, err
	}

	for _, creator := range creators {
		if creator.AccessToken == "" {
			continue
		}
		out, rerr := refresher.RefreshLongLivedToken(ctx, creator.AccessToken)
		if rerr != nil {
			failed++
			if logger != nil {
				logger.WarnContext(ctx, "creator token refresh failed", "creator_id", creator.ID, "error", rerr)
			}
			continue
		}
		expiresAt := now().UTC().Add(time.Duration(out.ExpiresIn) * time.Second).Format(time.RFC3339Nano)
		if uerr := store.UpdateCreatorToken(ctx, creator.ID, out.AccessToken, expiresAt); uerr != nil {
			failed++
			if logger != nil {
				logger.WarnContext(ctx, "creator token persist failed", "creator_id", creator.ID, "error", uerr)
			}
			continue
		}
		refreshed++
	}
	return refreshed, failed, nil
}

func (h *CronHandler) RefreshTokens(c *gin.Context) {
	refreshed, failed, err := RefreshExpiringTokens(c.Request.Context(), h.Store, h.Refresher, h.Now, h.Log)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"refreshed": 0, "failed": 0})
		return
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
		c.JSON(http.StatusInternalServerError, gin.H{"deleted_logs": 0})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"deleted_logs": deletedLogs,
	})
}

func (h *CronHandler) Health(c *gin.Context) {
	counts, err := h.Store.CountJobsByStatus(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"pending":    counts["pending"],
		"processing": counts["processing"],
		"failed":     counts["failed"],
		"done":       counts["done"],
	})
}
