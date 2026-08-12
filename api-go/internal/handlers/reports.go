package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/profilescore"
)

// ReportsService is the handler-facing interface (fakeable in tests).
type ReportsService interface {
	Generate(ctx context.Context, clerkUserID string) (*profilescore.ReportResult, error)
	GetLatest(ctx context.Context, clerkUserID string) (*profilescore.ReportResult, error)
}

// ReportsHandler serves /reports/profile/* routes.
type ReportsHandler struct {
	service ReportsService
}

// NewReportsHandler constructs a handler with injected service.
func NewReportsHandler(service ReportsService) *ReportsHandler {
	return &ReportsHandler{service: service}
}

// Register mounts report routes on the engine/group.
// Both endpoints require Appwrite JWT auth.
func (h *ReportsHandler) Register(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	authed := rg.Group("")
	authed.Use(auth)
	authed.POST("/profile/generate", h.Generate)
	authed.GET("/profile/latest", h.Latest)
}

// Generate handles POST /reports/profile/generate.
// Always regenerates (new LLM call) — does not serve cache.
func (h *ReportsHandler) Generate(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	result, err := h.service.Generate(c.Request.Context(), clerkUserID)
	if err != nil {
		writeReportsError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// Latest handles GET /reports/profile/latest.
// Returns cached report or 404 when no report exists / cache expired.
func (h *ReportsHandler) Latest(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	result, err := h.service.GetLatest(c.Request.Context(), clerkUserID)
	if err != nil {
		writeReportsError(c, err)
		return
	}
	if result == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "not_found",
			Message: "No cached report found. Generate one first.",
		})
		return
	}
	c.JSON(http.StatusOK, result)
}

func writeReportsError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, profilescore.ErrCreatorNotFound):
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "creator_not_found",
			Message: "Creator profile not found. Connect your Instagram account first.",
		})
	case errors.Is(err, profilescore.ErrInsightsSyncFailed):
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{
			Error:   "insights_sync_failed",
			Message: "Could not sync your Instagram insights. Please try again in a moment.",
		})
	default:
		writeInternal(c, err)
	}
}
