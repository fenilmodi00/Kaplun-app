package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func CronSecret(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if secret == "" || c.GetHeader("X-Cron-Secret") != secret {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		c.Next()
	}
}
