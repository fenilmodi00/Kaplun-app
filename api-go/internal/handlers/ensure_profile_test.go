package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
)

type fakeCreatorProfileEnsurer struct {
	mu         sync.Mutex
	ensuredFor string
	err        error
}

func (f *fakeCreatorProfileEnsurer) EnsureCreatorProfile(_ context.Context, clerkUserID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ensuredFor = clerkUserID
	return f.err
}

func (f *fakeCreatorProfileEnsurer) EnsuredFor() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.ensuredFor
}

func TestEnsureProfileReturnsOK(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	ensurer := &fakeCreatorProfileEnsurer{}
	handler := handlers.NewEnsureProfileHandler(ensurer)

	engine := gin.New()
	engine.POST("/auth/ensure-profile", func(c *gin.Context) {
		c.Set("clerk_user_id", "clerk_123")
		handler.EnsureProfile(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/ensure-profile", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("expected status ok, got %q", body["status"])
	}

	// EnsureCreatorProfile runs in a goroutine; give it time to execute.
	deadline := time.Now().Add(3 * time.Second)
	var got string
	for time.Now().Before(deadline) {
		got = ensurer.EnsuredFor()
		if got == "clerk_123" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if got != "clerk_123" {
		t.Fatalf("expected EnsureCreatorProfile to be called with clerk_123, got %q", got)
	}
}

func TestEnsureProfileRejectsMissingUserID(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := handlers.NewEnsureProfileHandler(&fakeCreatorProfileEnsurer{})

	engine := gin.New()
	engine.POST("/auth/ensure-profile", handler.EnsureProfile)

	req := httptest.NewRequest(http.MethodPost, "/auth/ensure-profile", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
