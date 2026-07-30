package ratelimit_test

import (
	"testing"

	"kaplun/api-go/internal/services/ratelimit"
)

type fakeStore struct {
	n int
}

func (f fakeStore) CountRecentDMActions(igUserID, since string) int {
	return f.n
}

func TestAllowedUnderCap(t *testing.T) {
	t.Parallel()

	d := ratelimit.CheckDMRate(fakeStore{n: 10}, "ig1", 0)
	if !d.Allowed || d.CurrentCount != 10 {
		t.Fatalf("unexpected decision: %#v", d)
	}
}

func TestAtCapRequeuesFirstTimes(t *testing.T) {
	t.Parallel()

	d := ratelimit.CheckDMRate(fakeStore{n: ratelimit.RateLimitMax}, "ig1", 1)
	if d.Allowed || !d.ShouldRequeue || d.RequeueDelayMinutes != 30 || d.ShouldSkip {
		t.Fatalf("unexpected decision: %#v", d)
	}
}

func TestAtCapSkipsAfterMaxAttempts(t *testing.T) {
	t.Parallel()

	d := ratelimit.CheckDMRate(fakeStore{n: ratelimit.RateLimitMax}, "ig1", 3)
	if d.Allowed || !d.ShouldSkip || d.ShouldRequeue {
		t.Fatalf("unexpected decision: %#v", d)
	}
}
