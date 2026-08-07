package middleware

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
)

var (
	errMissingAuth    = errors.New("missing authorization header")
	errMalformedAuth  = errors.New("authorization header must be 'Bearer <token>'")
)

// AppwriteAuth returns a Gin middleware that validates a Bearer JWT against
// Appwrite's GET /account endpoint. On success the user's $id is stored in the
// Gin context under the key "clerk_user_id" (kept for backward compatibility).
// On failure a 401 JSON error is returned.
func AppwriteAuth(endpoint, projectID string, logger *slog.Logger) gin.HandlerFunc {
	client := &http.Client{Timeout: 10 * time.Second}

	return func(c *gin.Context) {
		token, err := extractBearerToken(c.GetHeader("Authorization"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "session_expired",
				Message: "Missing Authorization header",
			})
			return
		}

		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, strings.TrimRight(endpoint, "/")+"/account", nil)
		if err != nil {
			logger.Error("appwrite auth: create request", "error", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "session_expired",
				Message: "Authentication service unavailable",
			})
			return
		}
		req.Header.Set("X-Appwrite-Project", projectID)
		req.Header.Set("X-Appwrite-JWT", token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			logger.Error("appwrite auth: request failed", "error", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "session_expired",
				Message: "Authentication service unavailable",
			})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			logger.Warn("appwrite auth: non-200 response", "status", resp.StatusCode, "body", string(body))
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "session_expired",
				Message: "Invalid or expired session",
			})
			return
		}

		var account struct {
			ID string `json:"$id"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&account); err != nil {
			logger.Error("appwrite auth: decode response", "error", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "session_expired",
				Message: "Authentication service unavailable",
			})
			return
		}

		if account.ID == "" {
			logger.Error("appwrite auth: empty $id in response")
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "session_expired",
				Message: "Invalid session",
			})
			return
		}

		c.Set("clerk_user_id", account.ID)
		c.Next()
	}
}

// extractBearerToken extracts the Bearer token from an Authorization header.
// Copied from the deleted clerk package to avoid a dependency on it.
func extractBearerToken(authorization string) (string, error) {
	if strings.TrimSpace(authorization) == "" {
		return "", errMissingAuth
	}

	parts := strings.SplitN(authorization, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || strings.TrimSpace(parts[1]) == "" {
		return "", errMalformedAuth
	}

	return strings.TrimSpace(parts[1]), nil
}
