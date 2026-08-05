package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/automations"
)

// AutomationsService is the handler-facing interface (fakeable in tests).
type AutomationsService interface {
	List(ctx context.Context, clerkUserID string) ([]models.Automation, error)
	Create(ctx context.Context, clerkUserID string, body models.AutomationCreate) (models.Automation, error)
	Get(ctx context.Context, clerkUserID, automationID string) (models.Automation, error)
	Patch(ctx context.Context, clerkUserID, automationID string, body models.AutomationPatch) (models.Automation, error)
	Delete(ctx context.Context, clerkUserID, automationID string) error
	ListLogs(ctx context.Context, clerkUserID, automationID string) ([]models.AutomationLog, error)
	Templates() []models.CampaignTemplate
	OverviewStats(ctx context.Context, clerkUserID string) (models.OverviewStats, error)
	AutomationStats(ctx context.Context, clerkUserID, automationID string) (models.AutomationStats, error)
}

// AutomationsHandler serves /automations routes.
type AutomationsHandler struct {
	service AutomationsService
}

// NewAutomationsHandler constructs a handler with injected service.
func NewAutomationsHandler(service AutomationsService) *AutomationsHandler {
	return &AutomationsHandler{service: service}
}

// Register mounts automation routes on the engine/group.
// Static paths (templates, stats/overview) must be registered before :id.
func (h *AutomationsHandler) Register(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/templates", h.ListTemplates)

	authed := rg.Group("")
	authed.Use(auth)
	authed.GET("", h.List)
	authed.POST("", h.Create)
	authed.GET("/stats/overview", h.OverviewStats)
	authed.GET("/:id", h.Get)
	authed.PATCH("/:id", h.Patch)
	authed.DELETE("/:id", h.Delete)
	authed.GET("/:id/logs", h.ListLogs)
	authed.GET("/:id/stats", h.Stats)
}

func (h *AutomationsHandler) List(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	rows, err := h.service.List(c.Request.Context(), clerkUserID)
	if err != nil {
		writeInternal(c, err)
		return
	}
	if rows == nil {
		rows = []models.Automation{}
	}
	c.JSON(http.StatusOK, models.AutomationsListResponse{Automations: rows})
}

func (h *AutomationsHandler) Create(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	var body models.AutomationCreate
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "validation",
			Message: "invalid request body",
		})
		return
	}
	row, err := h.service.Create(c.Request.Context(), clerkUserID, body)
	if err != nil {
		writeAutomationsError(c, err)
		return
	}
	c.JSON(http.StatusCreated, models.AutomationResponse{Automation: row})
}

func (h *AutomationsHandler) ListTemplates(c *gin.Context) {
	c.JSON(http.StatusOK, models.TemplatesResponse{Templates: h.service.Templates()})
}

func (h *AutomationsHandler) OverviewStats(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	stats, err := h.service.OverviewStats(c.Request.Context(), clerkUserID)
	if err != nil {
		writeInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *AutomationsHandler) Get(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	row, err := h.service.Get(c.Request.Context(), clerkUserID, c.Param("id"))
	if err != nil {
		writeAutomationsError(c, err)
		return
	}
	c.JSON(http.StatusOK, models.AutomationResponse{Automation: row})
}

func (h *AutomationsHandler) Patch(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	var body models.AutomationPatch
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "validation",
			Message: "invalid request body",
		})
		return
	}
	row, err := h.service.Patch(c.Request.Context(), clerkUserID, c.Param("id"), body)
	if err != nil {
		writeAutomationsError(c, err)
		return
	}
	c.JSON(http.StatusOK, models.AutomationResponse{Automation: row})
}

func (h *AutomationsHandler) Delete(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	if err := h.service.Delete(c.Request.Context(), clerkUserID, c.Param("id")); err != nil {
		writeAutomationsError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AutomationsHandler) ListLogs(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	logs, err := h.service.ListLogs(c.Request.Context(), clerkUserID, c.Param("id"))
	if err != nil {
		writeAutomationsError(c, err)
		return
	}
	if logs == nil {
		logs = []models.AutomationLog{}
	}
	c.JSON(http.StatusOK, models.AutomationLogsResponse{Logs: logs})
}

func (h *AutomationsHandler) Stats(c *gin.Context) {
	clerkUserID, ok := requireClerkUser(c)
	if !ok {
		return
	}
	stats, err := h.service.AutomationStats(c.Request.Context(), clerkUserID, c.Param("id"))
	if err != nil {
		writeAutomationsError(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func requireClerkUser(c *gin.Context) (string, bool) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing Authorization header",
		})
		return "", false
	}
	return clerkUserID, true
}

func writeAutomationsError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, automations.ErrNotFound):
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "not_found",
			Message: "Automation not found",
		})
	case errors.Is(err, automations.ErrInstagramNotConnected):
		c.JSON(http.StatusConflict, models.ErrorResponse{
			Error:   "instagram_not_connected",
			Message: "Connect your Instagram professional account before creating automations",
		})
	case errors.Is(err, automations.ErrValidation):
		msg := err.Error()
		var ve *automations.ValidationError
		if errors.As(err, &ve) {
			msg = ve.Message
		}
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "validation",
			Message: msg,
		})
	default:
		writeInternal(c, err)
	}
}

func writeInternal(c *gin.Context, err error) {
	if err != nil {
		slog.Error("automations handler internal error",
			"path", c.FullPath(),
			"method", c.Request.Method,
			"error", err,
		)
	}
	c.JSON(http.StatusInternalServerError, models.ErrorResponse{
		Error:   "internal_error",
		Message: "Internal server error",
	})
}
