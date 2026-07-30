package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/services/trackedlinks"
)

type fakeTrackedLinksService struct {
	link trackedlinks.Link
	err  error
}

func (f *fakeTrackedLinksService) ResolveRedirect(_ context.Context, slug string) (trackedlinks.Link, error) {
	if f.err != nil {
		return trackedlinks.Link{}, f.err
	}
	return f.link, nil
}

func TestTrackedRedirect(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := handlers.NewTrackedLinksHandler(&fakeTrackedLinksService{
		link: trackedlinks.Link{Slug: "abc123", TargetURL: "https://kaplun.tech"},
	})

	engine := gin.New()
	engine.GET("/r/:slug", handler.Redirect)

	req := httptest.NewRequest(http.MethodGet, "/r/abc123", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected %d, got %d", http.StatusFound, rec.Code)
	}
	if location := rec.Header().Get("Location"); location != "https://kaplun.tech" {
		t.Fatalf("expected redirect location, got %q", location)
	}
}

func TestTrackedRedirectNotFound(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := handlers.NewTrackedLinksHandler(&fakeTrackedLinksService{
		err: trackedlinks.ErrNotFound,
	})

	engine := gin.New()
	engine.GET("/r/:slug", handler.Redirect)

	req := httptest.NewRequest(http.MethodGet, "/r/missing", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, rec.Code)
	}
}
