package middleware_test

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/middleware"
)

func TestAppwriteAuthSetsUserIDOnSuccess(t *testing.T) {
	t.Parallel()

	// Fake Appwrite /account endpoint that returns a valid $id.
	fakeAppwrite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Appwrite-Project") != "proj" {
			t.Error("missing X-Appwrite-Project header")
		}
		if r.Header.Get("X-Appwrite-JWT") != "valid_jwt" {
			t.Error("missing or wrong X-Appwrite-JWT header")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"$id": "user_abc"})
	}))
	t.Cleanup(fakeAppwrite.Close)

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	handler := middleware.AppwriteAuth(fakeAppwrite.URL, "proj", logger)

	engine := gin.New()
	engine.GET("/test", handler, func(c *gin.Context) {
		uid, _ := c.Get("clerk_user_id")
		c.JSON(http.StatusOK, gin.H{"uid": uid})
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer valid_jwt")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["uid"] != "user_abc" {
		t.Fatalf("expected uid user_abc, got %q", body["uid"])
	}
}

func TestAppwriteAuthRejectsMissingAuthHeader(t *testing.T) {
	t.Parallel()

	fakeAppwrite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"$id": "user_abc"})
	}))
	t.Cleanup(fakeAppwrite.Close)

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	handler := middleware.AppwriteAuth(fakeAppwrite.URL, "proj", logger)

	engine := gin.New()
	engine.GET("/test", handler)

	// No Authorization header at all.
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAppwriteAuthRejectsNonBearerHeader(t *testing.T) {
	t.Parallel()

	fakeAppwrite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"$id": "user_abc"})
	}))
	t.Cleanup(fakeAppwrite.Close)

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	handler := middleware.AppwriteAuth(fakeAppwrite.URL, "proj", logger)

	engine := gin.New()
	engine.GET("/test", handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Token abc123")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAppwriteAuthRejectsAppwriteNon200(t *testing.T) {
	t.Parallel()

	// Fake Appwrite returns 401.
	fakeAppwrite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "invalid token"})
	}))
	t.Cleanup(fakeAppwrite.Close)

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	handler := middleware.AppwriteAuth(fakeAppwrite.URL, "proj", logger)

	engine := gin.New()
	engine.GET("/test", handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer bad_token")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAppwriteAuthRejectsUnreachable(t *testing.T) {
	t.Parallel()

	// Point at a server that will be closed immediately — connection refused.
	unreachable := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	unreachable.Close()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	handler := middleware.AppwriteAuth(unreachable.URL, "proj", logger)

	engine := gin.New()
	engine.GET("/test", handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
