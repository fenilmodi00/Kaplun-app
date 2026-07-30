package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/felipeinf/instago/igerrors"
	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/session"
)

type ProxySessionManager interface {
	Get(clerkUserID string) (session.Client, bool)
	GetOrRehydrate(ctx context.Context, clerkUserID string) (session.Client, error)
	Remove(clerkUserID string) bool
}

type InstagramProxyHandler struct {
	sessions ProxySessionManager
	store    session.Store
	logger   *slog.Logger
}

func NewInstagramProxyHandler(sessions ProxySessionManager, store session.Store, logger *slog.Logger) *InstagramProxyHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &InstagramProxyHandler{
		sessions: sessions,
		store:    store,
		logger:   logger,
	}
}

func (h *InstagramProxyHandler) requireClient(c *gin.Context, clerkUserID string) (session.Client, bool) {
	if client, ok := h.sessions.Get(clerkUserID); ok {
		return client, true
	}

	client, err := h.sessions.GetOrRehydrate(c.Request.Context(), clerkUserID)
	if errors.Is(err, session.ErrStaleSession) {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return nil, false
	}
	if errors.Is(err, session.ErrNotFound) || client == nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "not_connected",
			Message: "Please connect your Instagram account first",
		})
		return nil, false
	}
	if err != nil {
		h.logger.Error("rehydrate failed", "clerk_user_id", clerkUserID, "err", err)
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "not_connected",
			Message: "Please connect your Instagram account first",
		})
		return nil, false
	}
	return client, true
}

func (h *InstagramProxyHandler) clearExpired(ctx context.Context, clerkUserID string) {
	h.sessions.Remove(clerkUserID)
	if h.store != nil {
		_, _ = h.store.ClearSession(ctx, clerkUserID)
	}
}

func (h *InstagramProxyHandler) Profile(c *gin.Context) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing Authorization header",
		})
		return
	}

	client, ok := h.requireClient(c, clerkUserID)
	if !ok {
		return
	}

	profile, err := client.FetchProfile()
	var loginRequired *igerrors.LoginRequired
	if errors.As(err, &loginRequired) {
		h.logger.Warn("instagram session expired", "clerk_user_id", clerkUserID)
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return
	}
	if profile == nil {
		if client.AuthFailed() {
			h.clearExpired(c.Request.Context(), clerkUserID)
		}
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return
	}

	c.JSON(http.StatusOK, profile)
}

func (h *InstagramProxyHandler) Media(c *gin.Context) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing Authorization header",
		})
		return
	}

	amount := 25
	if raw := c.Query("amount"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 100 {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error:   "validation",
				Message: "amount must be between 1 and 100",
			})
			return
		}
		amount = n
	}

	client, ok := h.requireClient(c, clerkUserID)
	if !ok {
		return
	}

	items, err := client.FetchMedia(amount)
	var loginRequired *igerrors.LoginRequired
	if errors.As(err, &loginRequired) {
		h.logger.Warn("instagram session expired", "clerk_user_id", clerkUserID)
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return
	}
	if client.AuthFailed() {
		h.clearExpired(c.Request.Context(), clerkUserID)
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return
	}
	if items == nil {
		items = []models.InstagramMediaItem{}
	}

	c.JSON(http.StatusOK, models.MediaListResponse{Data: items})
}

func (h *InstagramProxyHandler) Insights(c *gin.Context) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing Authorization header",
		})
		return
	}

	client, ok := h.requireClient(c, clerkUserID)
	if !ok {
		return
	}

	insights, err := client.FetchInsights()
	var loginRequired *igerrors.LoginRequired
	if errors.As(err, &loginRequired) {
		h.logger.Warn("instagram session expired", "clerk_user_id", clerkUserID)
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "session_expired",
			Message: "Please reconnect your Instagram account",
		})
		return
	}
	if errors.Is(err, session.ErrInsightsUnavailable) || insights == nil {
		if client.AuthFailed() {
			h.clearExpired(c.Request.Context(), clerkUserID)
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "session_expired",
				Message: "Please reconnect your Instagram account",
			})
			return
		}
		c.JSON(http.StatusBadGateway, models.ErrorResponse{
			Error:   "insights_unavailable",
			Message: "Unable to fetch insights",
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusBadGateway, models.ErrorResponse{
			Error:   "insights_unavailable",
			Message: "Unable to fetch insights",
		})
		return
	}

	c.JSON(http.StatusOK, insights)
}

func (h *InstagramProxyHandler) Disconnect(c *gin.Context) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing Authorization header",
		})
		return
	}

	h.sessions.Remove(clerkUserID)
	if h.store != nil {
		_, _ = h.store.ClearSession(c.Request.Context(), clerkUserID)
	}
	h.logger.Info("disconnected instagram session", "clerk_user_id", clerkUserID)
	c.JSON(http.StatusOK, models.DisconnectResponse{Status: "disconnected"})
}
