package trackedlinks_test

import (
	"context"
	"errors"
	"testing"

	"kaplun/api-go/internal/services/trackedlinks"
)

type fakeLinkStore struct {
	link       trackedlinks.Link
	getErr     error
	recordErr  error
	lookedUp   string
	recorded   string
}

func (f *fakeLinkStore) GetTrackedLink(_ context.Context, slug string) (trackedlinks.Link, error) {
	f.lookedUp = slug
	return f.link, f.getErr
}

func (f *fakeLinkStore) RecordClick(_ context.Context, slug string) error {
	f.recorded = slug
	return f.recordErr
}

func TestResolveRedirect(t *testing.T) {
	t.Parallel()

	store := &fakeLinkStore{
		link: trackedlinks.Link{Slug: "abc123", TargetURL: "https://kaplun.tech"},
	}
	service := trackedlinks.NewService(store)

	got, err := service.ResolveRedirect(context.Background(), "abc123")
	if err != nil {
		t.Fatalf("resolve redirect: %v", err)
	}
	if got.TargetURL != "https://kaplun.tech" {
		t.Fatalf("expected target url, got %#v", got)
	}
	if store.recorded != "abc123" {
		t.Fatalf("expected click recorded for abc123, got %q", store.recorded)
	}
}

func TestResolveRedirectNotFound(t *testing.T) {
	t.Parallel()

	service := trackedlinks.NewService(&fakeLinkStore{
		getErr: trackedlinks.ErrNotFound,
	})

	_, err := service.ResolveRedirect(context.Background(), "missing")
	if !errors.Is(err, trackedlinks.ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}
