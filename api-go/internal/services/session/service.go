package session

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
)

var (
	ErrStaleSession = errors.New("stale session")
	ErrNotFound     = errors.New("session not found")
)

// Service is a thread-safe registry of per-user Instagram clients with LRU eviction.
type Service struct {
	cache   *LRU[Client]
	factory ClientFactory
	store   Store
	logger  *slog.Logger
}

type Options struct {
	MaxSessions int
	Factory     ClientFactory
	Store       Store
	SessionsDir string
	Logger      *slog.Logger
}

func NewService(opts Options) *Service {
	max := opts.MaxSessions
	if max <= 0 {
		max = DefaultMaxSessions
	}
	factory := opts.Factory
	if factory == nil {
		dir := opts.SessionsDir
		if dir == "" {
			dir = "data/sessions"
		}
		factory = DefaultClientFactory(dir)
	}
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		cache:   NewLRU[Client](max),
		factory: factory,
		store:   opts.Store,
		logger:  logger,
	}
}

// GetOrCreate returns an existing logged-in client or creates and logs in a new one.
func (s *Service) GetOrCreate(clerkUserID, username, password string) (Client, error) {
	if client, ok := s.cache.Get(clerkUserID); ok {
		if client.IsLoggedIn() {
			return client, nil
		}
		if err := client.Login(username, password); err != nil {
			return nil, err
		}
		return client, nil
	}

	client := s.factory(clerkUserID)
	if err := client.Login(username, password); err != nil {
		return nil, err
	}

	s.putWithEviction(clerkUserID, client)
	return client, nil
}

// GetOrRehydrate returns an in-memory client or restores one from Appwrite-backed Store.
func (s *Service) GetOrRehydrate(ctx context.Context, clerkUserID string) (Client, error) {
	if client, ok := s.cache.Get(clerkUserID); ok {
		return client, nil
	}

	if s.store == nil {
		return nil, ErrNotFound
	}

	token, err := s.store.GetSession(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}
	if token == "" {
		return nil, ErrNotFound
	}

	var probe any
	if err := json.Unmarshal([]byte(token), &probe); err != nil {
		s.logger.Warn("malformed session JSON; clearing", "clerk_user_id", clerkUserID)
		_, _ = s.store.ClearSession(ctx, clerkUserID)
		return nil, ErrStaleSession
	}

	client := s.factory(clerkUserID)
	restored, err := client.RestoreSession(token)
	if err != nil || !restored {
		s.logger.Warn("stale session; clearing", "clerk_user_id", clerkUserID, "err", err)
		_, _ = s.store.ClearSession(ctx, clerkUserID)
		_ = os.Remove(filepath.Join("data", "sessions", clerkUserID+".json"))
		return nil, ErrStaleSession
	}

	// Race: another goroutine may have inserted while we rehydrated.
	if existing, ok := s.cache.Get(clerkUserID); ok {
		return existing, nil
	}
	s.putWithEviction(clerkUserID, client)
	return client, nil
}

// SaveSession persists the current Instagram session JSON via Store.
func (s *Service) SaveSession(ctx context.Context, clerkUserID string) (bool, error) {
	client, ok := s.cache.Peek(clerkUserID)
	if !ok {
		return false, nil
	}
	if s.store == nil {
		return false, nil
	}
	raw, err := client.DumpSettingsJSON()
	if err != nil {
		return false, err
	}
	return s.store.SaveSession(ctx, clerkUserID, raw)
}

// Get returns the in-memory client without rehydration.
func (s *Service) Get(clerkUserID string) (Client, bool) {
	return s.cache.Get(clerkUserID)
}

// Remove logs out and drops a client from the registry.
func (s *Service) Remove(clerkUserID string) bool {
	client, ok := s.cache.Remove(clerkUserID)
	if !ok {
		return false
	}
	if err := client.Logout(); err != nil {
		s.logger.Warn("logout during remove failed", "clerk_user_id", clerkUserID, "err", err)
	}
	return true
}

// LogoutAll logs out every active session (graceful shutdown).
func (s *Service) LogoutAll() int {
	clients := s.cache.PopAll()
	count := 0
	for _, client := range clients {
		if err := client.Logout(); err != nil {
			s.logger.Warn("logout during shutdown failed", "err", err)
			continue
		}
		count++
	}
	return count
}

func (s *Service) putWithEviction(clerkUserID string, client Client) {
	evictedKey, evictedClient, evicted := s.cache.Put(clerkUserID, client)
	if !evicted {
		return
	}
	s.logger.Info("LRU eviction", "clerk_user_id", evictedKey, "active", s.cache.Len())
	if err := evictedClient.Logout(); err != nil {
		s.logger.Warn("logout during eviction failed", "clerk_user_id", evictedKey, "err", err)
	}
}
