package session_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/session"
)

type fakeClient struct {
	id           string
	loggedIn     bool
	authFailed   bool
	loginErr     error
	profile      *models.InstagramProfile
	profileErr   error
	media        []models.InstagramMediaItem
	mediaErr     error
	insights     map[string]any
	insightsErr  error
	settingsJSON string
	restoreOK    bool
	restoreErr   error
	logoutCalls  int
	loginCalls   int
}

func (f *fakeClient) Login(username, password string) error {
	f.loginCalls++
	if f.loginErr != nil {
		return f.loginErr
	}
	f.loggedIn = true
	f.authFailed = false
	return nil
}

func (f *fakeClient) IsLoggedIn() bool { return f.loggedIn }
func (f *fakeClient) AuthFailed() bool { return f.authFailed }
func (f *fakeClient) DumpSettingsJSON() (string, error) {
	if f.settingsJSON == "" {
		return `{"cookies":{}}`, nil
	}
	return f.settingsJSON, nil
}
func (f *fakeClient) RestoreSession(settingsJSON string) (bool, error) {
	if f.restoreErr != nil {
		return false, f.restoreErr
	}
	if !f.restoreOK {
		return false, nil
	}
	f.loggedIn = true
	return true, nil
}
func (f *fakeClient) FetchProfile() (*models.InstagramProfile, error) {
	return f.profile, f.profileErr
}
func (f *fakeClient) FetchMedia(amount int) ([]models.InstagramMediaItem, error) {
	return f.media, f.mediaErr
}
func (f *fakeClient) FetchInsights() (map[string]any, error) {
	return f.insights, f.insightsErr
}
func (f *fakeClient) Logout() error {
	f.logoutCalls++
	f.loggedIn = false
	return nil
}

type fakeStore struct {
	sessions map[string]string
	cleared  []string
	saved    []string
}

func (s *fakeStore) SaveSession(_ context.Context, clerkUserID, sessionJSON string) (bool, error) {
	if s.sessions == nil {
		s.sessions = map[string]string{}
	}
	s.sessions[clerkUserID] = sessionJSON
	s.saved = append(s.saved, clerkUserID)
	return true, nil
}

func (s *fakeStore) GetSession(_ context.Context, clerkUserID string) (string, error) {
	if s.sessions == nil {
		return "", nil
	}
	return s.sessions[clerkUserID], nil
}

func (s *fakeStore) ClearSession(_ context.Context, clerkUserID string) (bool, error) {
	s.cleared = append(s.cleared, clerkUserID)
	if s.sessions != nil {
		delete(s.sessions, clerkUserID)
	}
	return true, nil
}

func TestLRUEvictsLeastRecentlyUsed(t *testing.T) {
	t.Parallel()

	cache := session.NewLRU[int](2)
	cache.Put("a", 1)
	cache.Put("b", 2)
	if _, ok := cache.Get("a"); !ok {
		t.Fatal("expected a present")
	}
	evictedKey, evictedVal, evicted := cache.Put("c", 3)
	if !evicted || evictedKey != "b" || evictedVal != 2 {
		t.Fatalf("expected b/2 evicted, got %q/%d/%v", evictedKey, evictedVal, evicted)
	}
	if _, ok := cache.Peek("b"); ok {
		t.Fatal("expected b gone")
	}
	if got, ok := cache.Peek("a"); !ok || got != 1 {
		t.Fatalf("expected a=1, got %d ok=%v", got, ok)
	}
}

func TestGetOrCreateReusesLoggedInClient(t *testing.T) {
	t.Parallel()

	client := &fakeClient{id: "c1", loggedIn: true}
	created := 0
	svc := session.NewService(session.Options{
		MaxSessions: 10,
		Factory: func(clerkUserID string) session.Client {
			created++
			return client
		},
	})

	got1, err := svc.GetOrCreate("user1", "u", "p")
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	got2, err := svc.GetOrCreate("user1", "u", "p")
	if err != nil {
		t.Fatalf("second create: %v", err)
	}
	if created != 1 {
		t.Fatalf("expected one factory call, got %d", created)
	}
	if got1 != got2 {
		t.Fatal("expected same client instance")
	}
	if client.loginCalls != 1 {
		t.Fatalf("expected one login, got %d", client.loginCalls)
	}
}

func TestGetOrCreateReloginWhenNotLoggedIn(t *testing.T) {
	t.Parallel()

	client := &fakeClient{id: "c1", loggedIn: false}
	svc := session.NewService(session.Options{
		Factory: func(string) session.Client { return client },
	})

	if _, err := svc.GetOrCreate("user1", "u", "p"); err != nil {
		t.Fatalf("create: %v", err)
	}
	client.loggedIn = false
	if _, err := svc.GetOrCreate("user1", "u", "p"); err != nil {
		t.Fatalf("relogin: %v", err)
	}
	if client.loginCalls != 2 {
		t.Fatalf("expected 2 logins, got %d", client.loginCalls)
	}
}

func TestGetOrRehydrateFromStore(t *testing.T) {
	t.Parallel()

	store := &fakeStore{sessions: map[string]string{"user1": `{"cookies":{"sessionid":"x"}}`}}
	client := &fakeClient{restoreOK: true}
	svc := session.NewService(session.Options{
		Store:   store,
		Factory: func(string) session.Client { return client },
	})

	got, err := svc.GetOrRehydrate(context.Background(), "user1")
	if err != nil {
		t.Fatalf("rehydrate: %v", err)
	}
	if got != client {
		t.Fatal("expected restored client")
	}
	if !client.loggedIn {
		t.Fatal("expected logged in after restore")
	}
}

func TestGetOrRehydrateStaleClearsStore(t *testing.T) {
	t.Parallel()

	store := &fakeStore{sessions: map[string]string{"user1": `{"cookies":{}}`}}
	client := &fakeClient{restoreOK: false}
	svc := session.NewService(session.Options{
		Store:   store,
		Factory: func(string) session.Client { return client },
	})

	_, err := svc.GetOrRehydrate(context.Background(), "user1")
	if !errors.Is(err, session.ErrStaleSession) {
		t.Fatalf("expected stale, got %v", err)
	}
	if len(store.cleared) != 1 || store.cleared[0] != "user1" {
		t.Fatalf("expected clear, got %#v", store.cleared)
	}
}

func TestGetOrRehydrateMalformedJSON(t *testing.T) {
	t.Parallel()

	store := &fakeStore{sessions: map[string]string{"user1": "not-json"}}
	svc := session.NewService(session.Options{
		Store:   store,
		Factory: func(string) session.Client { return &fakeClient{} },
	})

	_, err := svc.GetOrRehydrate(context.Background(), "user1")
	if !errors.Is(err, session.ErrStaleSession) {
		t.Fatalf("expected stale, got %v", err)
	}
}

func TestRemoveAndLogoutAll(t *testing.T) {
	t.Parallel()

	var n atomic.Int32
	makeClient := func(string) session.Client {
		n.Add(1)
		return &fakeClient{loggedIn: true}
	}
	svc := session.NewService(session.Options{Factory: makeClient})

	c1, _ := svc.GetOrCreate("a", "u", "p")
	c2, _ := svc.GetOrCreate("b", "u", "p")
	if !svc.Remove("a") {
		t.Fatal("expected remove a")
	}
	if c1.(*fakeClient).logoutCalls != 1 {
		t.Fatal("expected logout on remove")
	}
	count := svc.LogoutAll()
	if count != 1 {
		t.Fatalf("expected 1 logout_all, got %d", count)
	}
	if c2.(*fakeClient).logoutCalls != 1 {
		t.Fatal("expected logout on logout_all")
	}
}

func TestLRUEvictionLogsOut(t *testing.T) {
	t.Parallel()

	clients := map[string]*fakeClient{}
	svc := session.NewService(session.Options{
		MaxSessions: 1,
		Factory: func(id string) session.Client {
			c := &fakeClient{id: id}
			clients[id] = c
			return c
		},
	})

	if _, err := svc.GetOrCreate("a", "u", "p"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetOrCreate("b", "u", "p"); err != nil {
		t.Fatal(err)
	}
	if clients["a"].logoutCalls != 1 {
		t.Fatalf("expected eviction logout, got %d", clients["a"].logoutCalls)
	}
	if _, ok := svc.Get("a"); ok {
		t.Fatal("expected a evicted")
	}
}

func TestSaveSession(t *testing.T) {
	t.Parallel()

	store := &fakeStore{}
	client := &fakeClient{settingsJSON: `{"ok":true}`}
	svc := session.NewService(session.Options{
		Store:   store,
		Factory: func(string) session.Client { return client },
	})
	if _, err := svc.GetOrCreate("user1", "u", "p"); err != nil {
		t.Fatal(err)
	}
	ok, err := svc.SaveSession(context.Background(), "user1")
	if err != nil || !ok {
		t.Fatalf("save: ok=%v err=%v", ok, err)
	}
	if store.sessions["user1"] != `{"ok":true}` {
		t.Fatalf("unexpected saved session: %#v", store.sessions)
	}
}
