package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/felipeinf/instago/igerrors"
	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/session"
)

type SessionManager interface {
	GetOrCreate(clerkUserID, username, password string) (session.Client, error)
	SaveSession(ctx context.Context, clerkUserID string) (bool, error)
}

type InstagramAuthHandler struct {
	sessions SessionManager
	creators session.CreatorStore
	logger   *slog.Logger
}

func NewInstagramAuthHandler(sessions SessionManager, creators session.CreatorStore, logger *slog.Logger) *InstagramAuthHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &InstagramAuthHandler{
		sessions: sessions,
		creators: creators,
		logger:   logger,
	}
}

func (h *InstagramAuthHandler) Login(c *gin.Context) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing Authorization header",
		})
		return
	}

	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "validation",
			Message: err.Error(),
		})
		return
	}

	if req.ClerkID != clerkUserID {
		h.logger.Warn("clerk id mismatch", "body", req.ClerkID, "jwt_sub", clerkUserID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "clerk_id_mismatch"})
		return
	}

	client, err := h.sessions.GetOrCreate(clerkUserID, req.Username, req.Password)
	if err != nil {
		if writeLoginError(c, err) {
			return
		}
		h.logger.Warn("instagram login failed", "clerk_user_id", clerkUserID, "err", err)
		c.JSON(http.StatusBadGateway, models.ErrorResponse{
			Error:   "instagram_login_failed",
			Message: err.Error(),
		})
		return
	}

	profile, err := client.FetchProfile()
	if err != nil || profile == nil {
		msg := "Could not retrieve profile"
		if err != nil {
			msg = err.Error()
		}
		h.logger.Error("fetch_profile failed after login", "clerk_user_id", clerkUserID, "err", err)
		c.JSON(http.StatusBadGateway, models.ErrorResponse{
			Error:   "instagram_login_failed",
			Message: msg,
		})
		return
	}

	if h.creators != nil {
		creatorData := models.ProfileToCreatorDict(clerkUserID, *profile)
		if _, err := h.creators.StoreCreatorProfile(c.Request.Context(), clerkUserID, creatorData); err != nil {
			h.logger.Warn("store creator profile failed", "clerk_user_id", clerkUserID, "err", err)
		}
	}

	if ok, err := h.sessions.SaveSession(c.Request.Context(), clerkUserID); err != nil || !ok {
		h.logger.Warn("failed to persist IG session", "clerk_user_id", clerkUserID, "ok", ok, "err", err)
	}

	h.logger.Info("login successful", "clerk_user_id", clerkUserID, "username", profile.Username)
	c.JSON(http.StatusOK, profile)
}

func writeLoginError(c *gin.Context, err error) bool {
	var badPassword *igerrors.BadPassword
	var twoFactor *igerrors.TwoFactorRequired
	var badCreds *igerrors.BadCredentials
	if errors.As(err, &badPassword) || errors.As(err, &twoFactor) || errors.As(err, &badCreds) {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "invalid_credentials",
			Message: err.Error(),
		})
		return true
	}

	var pleaseWait *igerrors.PleaseWaitFewMinutes
	var rateLimit *igerrors.RateLimitError
	var throttled *igerrors.ClientThrottled
	if errors.As(err, &pleaseWait) || errors.As(err, &rateLimit) || errors.As(err, &throttled) {
		c.JSON(http.StatusTooManyRequests, models.ErrorResponse{
			Error:   "rate_limited",
			Message: "Instagram rate limit reached. Try again later.",
		})
		return true
	}

	var clientErr *igerrors.ClientError
	if errors.As(err, &clientErr) {
		c.JSON(http.StatusBadGateway, models.ErrorResponse{
			Error:   "instagram_login_failed",
			Message: err.Error(),
		})
		return true
	}

	return false
}
