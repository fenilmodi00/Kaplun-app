package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/trackedlinks"
)

type TrackedLinksService interface {
	ResolveRedirect(ctx context.Context, slug string) (trackedlinks.Link, error)
}

type TrackedLinksHandler struct {
	service TrackedLinksService
}

func NewTrackedLinksHandler(service TrackedLinksService) *TrackedLinksHandler {
	return &TrackedLinksHandler{service: service}
}

func (h *TrackedLinksHandler) Redirect(c *gin.Context) {
	link, err := h.service.ResolveRedirect(c.Request.Context(), c.Param("slug"))
	if err != nil {
		if errors.Is(err, trackedlinks.ErrNotFound) {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "not_found",
				Message: "Tracked link not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "internal_error",
			Message: "Internal server error",
		})
		return
	}

	c.Redirect(http.StatusFound, link.TargetURL)
}
