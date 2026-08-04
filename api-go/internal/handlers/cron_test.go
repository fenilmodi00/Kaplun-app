package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/middleware"
)

type fakeCronStore struct {
	creators    []handlers.CronCreator
	updated     []updatedToken
	deletedLogs int
	counts      map[string]int
}

type updatedToken struct {
	ID, Token, Expires string
}

func (f *fakeCronStore) ListCreatorsWithTokenExpiringBefore(context.Context, string) ([]handlers.CronCreator, error) {
	return f.creators, nil
}

func (f *fakeCronStore) UpdateCreatorToken(_ context.Context, creatorID, token, expiresAtISO string) error {
	f.updated = append(f.updated, updatedToken{ID: creatorID, Token: token, Expires: expiresAtISO})
	return nil
}

func (f *fakeCronStore) DeleteLogsOlderThan(context.Context, string) (int, error) {
	return f.deletedLogs, nil
}

func (f *fakeCronStore) CountJobsByStatus(context.Context) (map[string]int, error) {
	if f.counts == nil {
		return map[string]int{}, nil
	}
	return f.counts, nil
}

type fakeRefresher struct {
	result handlers.TokenRefreshResult
	err    error
	seen   string
}

func (f *fakeRefresher) RefreshLongLivedToken(_ context.Context, token string) (handlers.TokenRefreshResult, error) {
	f.seen = token
	return f.result, f.err
}

type fakeReconcile struct {
	once     map[string]any
	attached int
}

func (f *fakeReconcile) ReconcileOnce(context.Context) (map[string]any, error) {
	if f.once == nil {
		return map[string]any{"enqueued": 0}, nil
	}
	return f.once, nil
}

func (f *fakeReconcile) AttachNextReels(context.Context) (int, error) {
	return f.attached, nil
}

func TestCronRefreshAuthViaMiddleware(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewCronHandler(&fakeCronStore{}, &fakeRefresher{}, &fakeReconcile{})
	engine := gin.New()
	engine.POST("/cron/refresh-tokens", middleware.CronSecret("test-cron-secret"), h.RefreshTokens)

	req := httptest.NewRequest(http.MethodPost, "/cron/refresh-tokens", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/cron/refresh-tokens", nil)
	req.Header.Set("X-Cron-Secret", "test-cron-secret")
	rec = httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	var body map[string]int
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["refreshed"] != 0 || body["failed"] != 0 {
		t.Fatalf("body: %v", body)
	}
}

func TestCronRefreshSuccessAndSkip(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeCronStore{
		creators: []handlers.CronCreator{
			{ID: "c1", AccessToken: "ig_token", TokenExpiresAt: time.Now().Add(5 * 24 * time.Hour).Format(time.RFC3339)},
			{ID: "c2", AccessToken: "", TokenExpiresAt: time.Now().Add(5 * 24 * time.Hour).Format(time.RFC3339)},
		},
	}
	refresher := &fakeRefresher{result: handlers.TokenRefreshResult{AccessToken: "new_token", ExpiresIn: 5184000}}
	h := handlers.NewCronHandler(store, refresher, &fakeReconcile{})
	fixed := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	h.Now = func() time.Time { return fixed }

	engine := gin.New()
	engine.POST("/cron/refresh-tokens", h.RefreshTokens)

	req := httptest.NewRequest(http.MethodPost, "/cron/refresh-tokens", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if refresher.seen != "ig_token" {
		t.Fatalf("expected stored plaintext token, got %q", refresher.seen)
	}
	if len(store.updated) != 1 || store.updated[0].Token != "new_token" {
		t.Fatalf("updated: %#v", store.updated)
	}
}

func TestCronRefreshFailure(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	store := &fakeCronStore{
		creators: []handlers.CronCreator{
			{ID: "c1", AccessToken: "tok"},
		},
	}
	h := handlers.NewCronHandler(store, &fakeRefresher{err: errors.New("timeout")}, nil)
	engine := gin.New()
	engine.POST("/cron/refresh-tokens", h.RefreshTokens)

	req := httptest.NewRequest(http.MethodPost, "/cron/refresh-tokens", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	var body map[string]int
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["refreshed"] != 0 || body["failed"] != 1 {
		t.Fatalf("body: %v", body)
	}
	if len(store.updated) != 0 {
		t.Fatalf("should not update on failure")
	}
}

func TestCronReconcile(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewCronHandler(&fakeCronStore{}, nil, &fakeReconcile{
		once:     map[string]any{"enqueued": 3},
		attached: 2,
	})
	engine := gin.New()
	engine.POST("/cron/reconcile", h.Reconcile)

	req := httptest.NewRequest(http.MethodPost, "/cron/reconcile", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["enqueued"].(float64) != 3 || body["attached"].(float64) != 2 {
		t.Fatalf("body: %v", body)
	}
}

func TestCronRetainLogs(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewCronHandler(&fakeCronStore{deletedLogs: 1}, nil, nil)
	engine := gin.New()
	engine.POST("/cron/retain-logs", h.RetainLogs)

	req := httptest.NewRequest(http.MethodPost, "/cron/retain-logs", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	var body map[string]int
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["deleted_logs"] != 1 {
		t.Fatalf("body: %v", body)
	}
}

func TestCronHealth(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewCronHandler(&fakeCronStore{
		counts: map[string]int{"pending": 1, "processing": 1, "failed": 1, "done": 2},
	}, nil, nil)
	engine := gin.New()
	engine.GET("/cron/health", h.Health)

	req := httptest.NewRequest(http.MethodGet, "/cron/health", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["pending"].(float64) != 1 || body["done"].(float64) != 2 {
		t.Fatalf("body: %v", body)
	}
}
