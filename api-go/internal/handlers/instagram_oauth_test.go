package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/platform/appwrite"
	"kaplun/api-go/internal/services/oauth"
)

type fakeOAuth struct {
	short   oauth.TokenResult
	long    oauth.TokenResult
	profile oauth.Profile
	errAt   string
}

func (f *fakeOAuth) ExchangeCodeForShortToken(context.Context, string) (oauth.TokenResult, error) {
	if f.errAt == "short" {
		return oauth.TokenResult{}, context.Canceled
	}
	return f.short, nil
}

func (f *fakeOAuth) ExchangeForLongToken(context.Context, string) (oauth.TokenResult, error) {
	if f.errAt == "long" {
		return oauth.TokenResult{}, context.Canceled
	}
	return f.long, nil
}

func (f *fakeOAuth) FetchInstagramProfile(context.Context, string) (oauth.Profile, error) {
	if f.errAt == "profile" {
		return oauth.Profile{}, context.Canceled
	}
	return f.profile, nil
}

type fakeCreatorStore struct {
	ok    bool
	rowID string
	data  map[string]any
	err   error
}

func (f *fakeCreatorStore) StoreCreatorProfile(_ context.Context, _ string, data map[string]any) (string, bool, error) {
	f.data = data
	return f.rowID, f.ok, f.err
}

type fakeUserEmails struct {
	email string
	err   error
}

func (f *fakeUserEmails) GetUserEmail(_ context.Context, _ string) (string, error) {
	return f.email, f.err
}

func TestInstagramCallbackSuccess(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	expires := 1000
	oauthFake := &fakeOAuth{
		short:   oauth.TokenResult{AccessToken: "short"},
		long:    oauth.TokenResult{AccessToken: "long", ExpiresIn: &expires},
		profile: oauth.Profile{ID: "ig1", Username: "alice", AccountType: "CREATOR"},
	}
	store := &fakeCreatorStore{ok: true}
	h := handlers.NewInstagramOAuthHandler(oauthFake, store, "app", "secret", "https://cb", nil)
	fixed := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	h.Now = func() time.Time { return fixed }

	engine := gin.New()
	engine.GET("/instagram/callback", h.Callback)

	state := url.QueryEscape(`{"clerk_id":"user_1","uid":"u1","redirect_url":"kaplun://instagram-callback"}`)
	req := httptest.NewRequest(http.MethodGet, "/instagram/callback?code=abc&state="+state, nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "status=success") {
		t.Fatalf("expected success redirect meta, got %s", body)
	}
	if !strings.Contains(body, "@alice") {
		t.Fatalf("expected username in body")
	}
	if store.data["access_token"] != "long" {
		t.Fatalf("expected plaintext token, got %#v", store.data["access_token"])
	}
	if store.data["account_type"] != "creator" {
		t.Fatalf("account_type: %v", store.data["account_type"])
	}
}

func TestInstagramCallbackOAuthError(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewInstagramOAuthHandler(&fakeOAuth{}, &fakeCreatorStore{}, "app", "secret", "https://cb", nil)
	engine := gin.New()
	engine.GET("/instagram/callback", h.Callback)

	state := url.QueryEscape(`{"redirect_url":"kaplun://cb"}`)
	req := httptest.NewRequest(http.MethodGet, "/instagram/callback?error=access_denied&error_description=Nope&state="+state, nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	body := rec.Body.String()
	if !strings.Contains(body, "status=error") || !strings.Contains(body, "Nope") {
		t.Fatalf("body: %s", body)
	}
}

func TestInstagramCallbackMissingCode(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	h := handlers.NewInstagramOAuthHandler(&fakeOAuth{}, &fakeCreatorStore{}, "app", "secret", "https://cb", nil)
	engine := gin.New()
	engine.GET("/instagram/callback", h.Callback)

	req := httptest.NewRequest(http.MethodGet, "/instagram/callback?state="+url.QueryEscape(`{"clerk_id":"x"}`), nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if !strings.Contains(rec.Body.String(), "Missing authorization code") {
		t.Fatalf("body: %s", rec.Body.String())
	}
}

func TestInstagramCallbackAlreadyConnectedIncludesOwnerEmail(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	expires := 1000
	oauthFake := &fakeOAuth{
		short:   oauth.TokenResult{AccessToken: "short"},
		long:    oauth.TokenResult{AccessToken: "long", ExpiresIn: &expires},
		profile: oauth.Profile{ID: "ig1", UserID: "1784", Username: "whosfenil", AccountType: "BUSINESS"},
	}
	store := &fakeCreatorStore{
		err: &appwrite.ErrInstagramAlreadyConnected{
			OwnerUserID: "user_owner",
			IGUserID:    "1784",
			Username:    "whosfenil",
		},
	}
	h := handlers.NewInstagramOAuthHandler(oauthFake, store, "app", "secret", "https://cb", nil)
	h.Users = &fakeUserEmails{email: "owner@example.com"}

	engine := gin.New()
	engine.GET("/instagram/callback", h.Callback)

	state := url.QueryEscape(`{"clerk_id":"user_other","redirect_url":"kaplun://instagram-callback"}`)
	req := httptest.NewRequest(http.MethodGet, "/instagram/callback?code=abc&state="+state, nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	body := rec.Body.String()
	if !strings.Contains(body, "status=error") {
		t.Fatalf("expected error redirect, body=%s", body)
	}
	if !strings.Contains(body, "owner%40example.com") && !strings.Contains(body, "owner@example.com") {
		t.Fatalf("expected owner email in body, got %s", body)
	}
	if !strings.Contains(body, "whosfenil") {
		t.Fatalf("expected username in body, got %s", body)
	}
}
