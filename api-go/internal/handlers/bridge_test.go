package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/bridge"
)

type fakeBridgeService struct {
	session     models.BridgeSession
	err         error
	clerkUserID string
}

func (f *fakeBridgeService) CreateSession(_ context.Context, clerkUserID string) (models.BridgeSession, error) {
	f.clerkUserID = clerkUserID
	return f.session, f.err
}

func TestBridgeCreateSession(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	service := &fakeBridgeService{
		session: models.BridgeSession{UserID: "user_123", Secret: "secret_456"},
	}
	handler := handlers.NewBridgeHandler(service)

	engine := gin.New()
	engine.POST("/auth/appwrite-session", func(c *gin.Context) {
		c.Set("clerk_user_id", "clerk_123")
		handler.CreateSession(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/appwrite-session", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rec.Code)
	}

	var body models.BridgeSession
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.UserID != "user_123" || body.Secret != "secret_456" {
		t.Fatalf("unexpected body: %#v", body)
	}
	if service.clerkUserID != "clerk_123" {
		t.Fatalf("expected clerk user id clerk_123, got %q", service.clerkUserID)
	}
}

func TestBridgeCreateSessionReturnsUpstreamFailure(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	service := &fakeBridgeService{
		err: bridge.WrapUpstreamError(errors.New("boom")),
	}
	handler := handlers.NewBridgeHandler(service)

	engine := gin.New()
	engine.POST("/auth/appwrite-session", func(c *gin.Context) {
		c.Set("clerk_user_id", "clerk_123")
		handler.CreateSession(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/auth/appwrite-session", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected %d, got %d", http.StatusBadGateway, rec.Code)
	}

	var body models.ErrorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Error != "appwrite_session_failed" {
		t.Fatalf("expected appwrite_session_failed, got %#v", body)
	}
}
