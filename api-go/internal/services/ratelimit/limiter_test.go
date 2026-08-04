package ratelimit_test

import (
	"context"
	"errors"
	"testing"

	"kaplun/api-go/internal/services/ratelimit"
)

type fakeStore struct {
	n   int
	err error
}

func (f fakeStore) CountRecentDMActions(_ context.Context, igUserID, since string) (int, error) {
	return f.n, f.err
}

func TestAllowedUnderCap(t *testing.T) {
	t.Parallel()

	d, err := ratelimit.CheckDMRate(context.Background(), fakeStore{n: 10}, "ig1", 0)
	if err != nil {
		t.Fatalf("CheckDMRate: %v", err)
	}
	if !d.Allowed || d.CurrentCount != 10 {
		t.Fatalf("unexpected decision: %#v", d)
	}
}

func TestAtCapRequeuesFirstTimes(t *testing.T) {
	t.Parallel()

	d, err := ratelimit.CheckDMRate(context.Background(), fakeStore{n: ratelimit.RateLimitMax}, "ig1", 1)
	if err != nil {
		t.Fatalf("CheckDMRate: %v", err)
	}
	if d.Allowed || !d.ShouldRequeue || d.RequeueDelayMinutes != 30 || d.ShouldSkip {
		t.Fatalf("unexpected decision: %#v", d)
	}
}

func TestAtCapSkipsAfterMaxAttempts(t *testing.T) {
	t.Parallel()

	d, err := ratelimit.CheckDMRate(context.Background(), fakeStore{n: ratelimit.RateLimitMax}, "ig1", 3)
	if err != nil {
		t.Fatalf("CheckDMRate: %v", err)
	}
	if d.Allowed || !d.ShouldSkip || d.ShouldRequeue {
		t.Fatalf("unexpected decision: %#v", d)
	}
}

func TestStoreErrorPropagates(t *testing.T) {
	t.Parallel()

	want := errors.New("appwrite down")
	if _, err := ratelimit.CheckDMRate(context.Background(), fakeStore{err: want}, "ig1", 0); !errors.Is(err, want) {
		t.Fatalf("expected store error, got %v", err)
	}
}
