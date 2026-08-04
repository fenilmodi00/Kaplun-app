package bridge

import (
	"context"
	"errors"
	"fmt"

	"kaplun/api-go/internal/models"
)

type SessionCreator interface {
	CreateUserSession(ctx context.Context, clerkUserID string) (models.BridgeSession, error)
	EnsureCreatorProfile(ctx context.Context, clerkUserID string) error
}

type Service struct {
	creator SessionCreator
}

type upstreamError struct {
	err error
}

func (e *upstreamError) Error() string {
	return e.err.Error()
}

func (e *upstreamError) Unwrap() error {
	return e.err
}

func NewService(creator SessionCreator) *Service {
	return &Service{creator: creator}
}

func (s *Service) CreateSession(ctx context.Context, clerkUserID string) (models.BridgeSession, error) {
	session, err := s.creator.CreateUserSession(ctx, clerkUserID)
	if err != nil {
		return models.BridgeSession{}, WrapUpstreamError(err)
	}
	// Match FastAPI: ensure creator profile in the background so the session
	// response is not delayed. Failures are ignored (idempotent on next sign-in).
	go func() {
		_ = s.creator.EnsureCreatorProfile(context.Background(), clerkUserID)
	}()
	return session, nil
}

func WrapUpstreamError(err error) error {
	return &upstreamError{err: fmt.Errorf("bridge upstream failed: %w", err)}
}

func IsUpstreamError(err error) bool {
	var target *upstreamError
	return errors.As(err, &target)
}
