package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/felipeinf/instago/igerrors"
	"github.com/gin-gonic/gin"

	"kaplun/api-go/internal/handlers"
	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/session"
)

type fakeIGClient struct {
	profile     *models.InstagramProfile
	profileErr  error
	media       []models.InstagramMediaItem
	mediaErr    error
	insights    map[string]any
	insightsErr error
	authFailed  bool
	loggedIn    bool
}

func (f *fakeIGClient) Login(string, string) error          { f.loggedIn = true; return nil }
func (f *fakeIGClient) IsLoggedIn() bool                    { return f.loggedIn }
func (f *fakeIGClient) AuthFailed() bool                    { return f.authFailed }
func (f *fakeIGClient) DumpSettingsJSON() (string, error)   { return `{}`, nil }
func (f *fakeIGClient) RestoreSession(string) (bool, error) { return true, nil }
func (f *fakeIGClient) FetchProfile() (*models.InstagramProfile, error) {
	return f.profile, f.profileErr
}
func (f *fakeIGClient) FetchMedia(int) ([]models.InstagramMediaItem, error) {
	return f.media, f.mediaErr
}
func (f *fakeIGClient) FetchInsights() (map[string]any, error) { return f.insights, f.insightsErr }
func (f *fakeIGClient) Logout() error                          { return nil }

type fakeAuthSessions struct {
	client   session.Client
	err      error
	savedFor string
}

func (f *fakeAuthSessions) GetOrCreate(clerkUserID, username, password string) (session.Client, error) {
	return f.client, f.err
}

func (f *fakeAuthSessions) SaveSession(_ context.Context, clerkUserID string) (bool, error) {
	f.savedFor = clerkUserID
	return true, nil
}

type fakeCreators struct {
	storedFor string
	data      map[string]any
}

func (f *fakeCreators) StoreCreatorProfile(_ context.Context, clerkUserID string, profile map[string]any) (bool, error) {
	f.storedFor = clerkUserID
	f.data = profile
	return true, nil
}

func withClerkUser(id string, h gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("clerk_user_id", id)
		h(c)
	}
}

func TestLoginSuccess(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	client := &fakeIGClient{
		loggedIn: true,
		profile: &models.InstagramProfile{
			PK:       "123",
			Username: "creator",
		},
	}
	sessions := &fakeAuthSessions{client: client}
	creators := &fakeCreators{}
	handler := handlers.NewInstagramAuthHandler(sessions, creators, nil)

	engine := gin.New()
	engine.POST("/login", withClerkUser("clerk_1", handler.Login))

	body, _ := json.Marshal(models.LoginRequest{
		ClerkID:  "clerk_1",
		Username: "creator",
		Password: "secret",
	})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if sessions.savedFor != "clerk_1" {
		t.Fatalf("expected session saved, got %q", sessions.savedFor)
	}
	if creators.storedFor != "clerk_1" {
		t.Fatalf("expected creator stored, got %q", creators.storedFor)
	}
	var profile models.InstagramProfile
	if err := json.Unmarshal(rec.Body.Bytes(), &profile); err != nil {
		t.Fatal(err)
	}
	if profile.Username != "creator" {
		t.Fatalf("unexpected profile: %#v", profile)
	}
}

func TestLoginTableErrors(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		clerkID    string
		bodyClerk  string
		loginErr   error
		wantStatus int
		wantError  string
	}{
		{
			name:       "clerk mismatch",
			clerkID:    "clerk_1",
			bodyClerk:  "other",
			wantStatus: http.StatusUnauthorized,
			wantError:  "clerk_id_mismatch",
		},
		{
			name:       "invalid credentials",
			clerkID:    "clerk_1",
			bodyClerk:  "clerk_1",
			loginErr:   &igerrors.BadPassword{ClientError: igerrors.ClientError{Message: "bad"}},
			wantStatus: http.StatusUnauthorized,
			wantError:  "invalid_credentials",
		},
		{
			name:       "rate limited",
			clerkID:    "clerk_1",
			bodyClerk:  "clerk_1",
			loginErr:   &igerrors.PleaseWaitFewMinutes{ClientError: igerrors.ClientError{Message: "wait"}},
			wantStatus: http.StatusTooManyRequests,
			wantError:  "rate_limited",
		},
		{
			name:       "client error",
			clerkID:    "clerk_1",
			bodyClerk:  "clerk_1",
			loginErr:   &igerrors.ClientError{Message: "boom"},
			wantStatus: http.StatusBadGateway,
			wantError:  "instagram_login_failed",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			sessions := &fakeAuthSessions{err: tt.loginErr, client: &fakeIGClient{}}
			handler := handlers.NewInstagramAuthHandler(sessions, &fakeCreators{}, nil)
			engine := gin.New()
			engine.POST("/login", withClerkUser(tt.clerkID, handler.Login))

			body, _ := json.Marshal(models.LoginRequest{
				ClerkID:  tt.bodyClerk,
				Username: "u",
				Password: "p",
			})
			req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			engine.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status: want %d got %d body=%s", tt.wantStatus, rec.Code, rec.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
				t.Fatal(err)
			}
			if payload["error"] != tt.wantError {
				t.Fatalf("error: want %q got %#v", tt.wantError, payload)
			}
		})
	}
}

type fakeProxySessions struct {
	client       session.Client
	getOK        bool
	rehydrateErr error
	removed      string
}

func (f *fakeProxySessions) Get(string) (session.Client, bool) {
	if !f.getOK {
		return nil, false
	}
	return f.client, true
}

func (f *fakeProxySessions) GetOrRehydrate(context.Context, string) (session.Client, error) {
	if f.rehydrateErr != nil {
		return nil, f.rehydrateErr
	}
	return f.client, nil
}

func (f *fakeProxySessions) Remove(clerkUserID string) bool {
	f.removed = clerkUserID
	return true
}

type fakeProxyStore struct {
	cleared string
}

func (f *fakeProxyStore) SaveSession(context.Context, string, string) (bool, error) {
	return true, nil
}
func (f *fakeProxyStore) GetSession(context.Context, string) (string, error) { return "", nil }
func (f *fakeProxyStore) ClearSession(_ context.Context, clerkUserID string) (bool, error) {
	f.cleared = clerkUserID
	return true, nil
}

func TestProxyEndpoints(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	takenAt := "2026-01-02T03:04:05Z"
	client := &fakeIGClient{
		loggedIn: true,
		profile: &models.InstagramProfile{
			PK:       "99",
			Username: "me",
		},
		media: []models.InstagramMediaItem{{
			PK:        "1",
			TakenAt:   &takenAt,
			LikeCount: 3,
		}},
		insights: map[string]any{"ok": true},
	}
	sessions := &fakeProxySessions{client: client, getOK: true}
	store := &fakeProxyStore{}
	handler := handlers.NewInstagramProxyHandler(sessions, store, nil)

	engine := gin.New()
	engine.GET("/profile", withClerkUser("clerk_1", handler.Profile))
	engine.GET("/media", withClerkUser("clerk_1", handler.Media))
	engine.GET("/insights", withClerkUser("clerk_1", handler.Insights))
	engine.POST("/disconnect", withClerkUser("clerk_1", handler.Disconnect))

	t.Run("profile", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/profile", nil)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("got %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("media envelope", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/media?amount=10", nil)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("got %d %s", rec.Code, rec.Body.String())
		}
		var body models.MediaListResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if len(body.Data) != 1 || body.Data[0].LikeCount != 3 {
			t.Fatalf("unexpected media: %#v", body)
		}
	})

	t.Run("insights", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/insights", nil)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("got %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("disconnect", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/disconnect", nil)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("got %d %s", rec.Code, rec.Body.String())
		}
		var body models.DisconnectResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if body.Status != "disconnected" {
			t.Fatalf("unexpected body %#v", body)
		}
		if sessions.removed != "clerk_1" || store.cleared != "clerk_1" {
			t.Fatalf("expected clear remove, removed=%q cleared=%q", sessions.removed, store.cleared)
		}
	})
}

func TestProxySessionErrors(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name         string
		rehydrateErr error
		getOK        bool
		client       *fakeIGClient
		path         string
		wantStatus   int
		wantError    string
	}{
		{
			name:         "not connected",
			rehydrateErr: session.ErrNotFound,
			path:         "/profile",
			wantStatus:   http.StatusUnauthorized,
			wantError:    "not_connected",
		},
		{
			name:         "stale session",
			rehydrateErr: session.ErrStaleSession,
			path:         "/profile",
			wantStatus:   http.StatusUnauthorized,
			wantError:    "session_expired",
		},
		{
			name:       "auth failed media",
			getOK:      true,
			client:     &fakeIGClient{authFailed: true, mediaErr: &igerrors.LoginRequired{}},
			path:       "/media",
			wantStatus: http.StatusUnauthorized,
			wantError:  "session_expired",
		},
		{
			name:       "insights unavailable",
			getOK:      true,
			client:     &fakeIGClient{insightsErr: session.ErrInsightsUnavailable},
			path:       "/insights",
			wantStatus: http.StatusBadGateway,
			wantError:  "insights_unavailable",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			client := tt.client
			if client == nil {
				client = &fakeIGClient{}
			}
			sessions := &fakeProxySessions{
				client:       client,
				getOK:        tt.getOK,
				rehydrateErr: tt.rehydrateErr,
			}
			handler := handlers.NewInstagramProxyHandler(sessions, &fakeProxyStore{}, nil)
			engine := gin.New()
			engine.GET("/profile", withClerkUser("clerk_1", handler.Profile))
			engine.GET("/media", withClerkUser("clerk_1", handler.Media))
			engine.GET("/insights", withClerkUser("clerk_1", handler.Insights))

			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rec := httptest.NewRecorder()
			engine.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status want %d got %d body=%s", tt.wantStatus, rec.Code, rec.Body.String())
			}
			var payload map[string]any
			_ = json.Unmarshal(rec.Body.Bytes(), &payload)
			if payload["error"] != tt.wantError {
				t.Fatalf("error want %q got %#v", tt.wantError, payload)
			}
		})
	}
}
