package bridge_test

import (
	"context"
	"errors"
	"testing"

	"kaplun/api-go/internal/models"
	"kaplun/api-go/internal/services/bridge"
)

type fakeSessionCreator struct {
	session          models.BridgeSession
	createErr        error
	ensureErr        error
	createdFor       string
	ensuredFor       string
}

func (f *fakeSessionCreator) CreateUserSession(_ context.Context, clerkUserID string) (models.BridgeSession, error) {
	f.createdFor = clerkUserID
	return f.session, f.createErr
}

func (f *fakeSessionCreator) EnsureCreatorProfile(_ context.Context, clerkUserID string) error {
	f.ensuredFor = clerkUserID
	return f.ensureErr
}

func TestCreateSession(t *testing.T) {
	t.Parallel()

	creator := &fakeSessionCreator{
		session: models.BridgeSession{
			UserID: "user_123",
			Secret: "secret_456",
		},
	}
	service := bridge.NewService(creator)

	got, err := service.CreateSession(context.Background(), "clerk_123")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if creator.createdFor != "clerk_123" {
		t.Fatalf("expected CreateUserSession to use clerk_123, got %q", creator.createdFor)
	}
	if got.UserID != "user_123" || got.Secret != "secret_456" {
		t.Fatalf("unexpected bridge session: %#v", got)
	}
}

func TestCreateSessionWrapsAppwriteErrors(t *testing.T) {
	t.Parallel()

	service := bridge.NewService(&fakeSessionCreator{
		createErr: errors.New("boom"),
	})

	_, err := service.CreateSession(context.Background(), "clerk_123")
	if err == nil {
		t.Fatal("expected create session error")
	}
	if !bridge.IsUpstreamError(err) {
		t.Fatalf("expected upstream error, got %v", err)
	}
}
