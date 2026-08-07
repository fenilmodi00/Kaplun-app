package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/models"
)

// CreatorProfileEnsurer creates a minimal creators row when one does not exist.
type CreatorProfileEnsurer interface {
	EnsureCreatorProfile(ctx context.Context, clerkUserID string) error
}

// EnsureProfileHandler spawns a background creator-profile creation and returns
// immediately — matching the old bridge service's fire-and-forget behaviour.
type EnsureProfileHandler struct {
	ensurer CreatorProfileEnsurer
}

func NewEnsureProfileHandler(ensurer CreatorProfileEnsurer) *EnsureProfileHandler {
	return &EnsureProfileHandler{ensurer: ensurer}
}

// EnsureProfile reads the authenticated user ID from the Gin context (set by
// the AppwriteAuth middleware), spawns EnsureCreatorProfile in a goroutine,
// and returns 200 immediately.
func (h *EnsureProfileHandler) EnsureProfile(c *gin.Context) {
	clerkUserID := c.GetString("clerk_user_id")
	if clerkUserID == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "unauthorized",
			Message: "Missing user ID in context",
		})
		return
	}

	// Fire-and-forget: match the old bridge service behaviour so the
	// session response is not delayed. Failures are ignored (idempotent
	// on next sign-in).
	go func() {
		_ = h.ensurer.EnsureCreatorProfile(context.Background(), clerkUserID)
	}()

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
