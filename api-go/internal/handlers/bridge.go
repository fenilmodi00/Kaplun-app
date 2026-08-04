package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/bridge"
)

type BridgeService interface {
	CreateSession(ctx context.Context, clerkUserID string) (models.BridgeSession, error)
}

type BridgeHandler struct {
	service BridgeService
}

func NewBridgeHandler(service BridgeService) *BridgeHandler {
	return &BridgeHandler{service: service}
}

func (h *BridgeHandler) CreateSession(c *gin.Context) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing Authorization header",
		})
		return
	}

	session, err := h.service.CreateSession(c.Request.Context(), clerkUserID)
	if err != nil {
		if bridge.IsUpstreamError(err) {
			c.JSON(http.StatusBadGateway, models.ErrorResponse{
				Error:   "appwrite_session_failed",
				Message: err.Error(),
			})
			return
		}

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "internal_error",
			Message: "Internal server error",
		})
		return
	}

	c.JSON(http.StatusOK, session)
}
