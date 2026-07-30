package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/platform/clerk"
)

type ClerkVerifier interface {
	VerifyToken(token string) (string, error)
}

func ClerkAuth(verifier ClerkVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := clerk.ExtractBearerToken(c.GetHeader("Authorization"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "unauthorized",
				Message: "Missing Authorization header",
			})
			return
		}

		userID, err := verifier.VerifyToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid or expired JWT token",
			})
			return
		}

		c.Set("clerk_user_id", userID)
		c.Next()
	}
}
