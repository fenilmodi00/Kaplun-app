package router_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"kaplun/api-go/internal/config"
	"kaplun/api-go/internal/router"
)

func TestNewRouterHealth(t *testing.T) {
	t.Parallel()

	r := router.New(config.Config{
		CORSOrigins: []string{"*"},
	}, router.Dependencies{})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	if got := rec.Header().Get("X-Request-ID"); got == "" {
		t.Fatal("expected X-Request-ID header to be set")
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}

	if body["status"] != "ok" {
		t.Fatalf("expected status body ok, got %q", body["status"])
	}
}

func TestNewRouterPreservesIncomingRequestID(t *testing.T) {
	t.Parallel()

	r := router.New(config.Config{
		CORSOrigins: []string{"*"},
	}, router.Dependencies{})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("X-Request-ID", "from-test")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if got := rec.Header().Get("X-Request-ID"); got != "from-test" {
		t.Fatalf("expected request id to round-trip, got %q", got)
	}
}

func TestNewRouterOmitsAuthRoutesWithoutDeps(t *testing.T) {
	t.Parallel()

	r := router.New(config.Config{CORSOrigins: []string{"*"}}, router.Dependencies{})

	req := httptest.NewRequest(http.MethodPost, "/auth/appwrite-session", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 without bridge deps, got %d", rec.Code)
	}
}
