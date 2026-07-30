package middleware

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
)

func Recovery(logger *slog.Logger) gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		if logger != nil {
			logger.Error("panic recovered", "panic", recovered, "request_id", c.GetString("request_id"))
		}

		c.AbortWithStatusJSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "internal_error",
			Message: "Internal server error",
		})
	})
}
