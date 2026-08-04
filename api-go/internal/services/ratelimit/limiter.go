package ratelimit

import (
	"context"
	"time"
)

const (
	RateLimitMax        = 750
	RequeueDelayMinutes = 30
	MaxRequeueAttempts  = 3
)

// RateDecision mirrors the Python RateDecision dataclass.
type RateDecision struct {
	Allowed             bool
	CurrentCount        int
	ShouldRequeue       bool
	ShouldSkip          bool
	RequeueDelayMinutes int
}

// Counter counts recent DM actions for an IG account in a rolling window.
type Counter interface {
	CountRecentDMActions(ctx context.Context, igUserID, since string) (int, error)
}

// CheckDMRate enforces Meta's 750 DMs/hour/account private-replies cap.
// A store error is returned to the caller (never swallowed); callers decide
// whether to fail-open or retry the job.
func CheckDMRate(ctx context.Context, store Counter, igUserID string, requeueAttempt int) (RateDecision, error) {
	since := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano)
	count, err := store.CountRecentDMActions(ctx, igUserID, since)
	if err != nil {
		return RateDecision{}, err
	}
	if count < RateLimitMax {
		return RateDecision{
			Allowed:      true,
			CurrentCount: count,
		}, nil
	}
	if requeueAttempt >= MaxRequeueAttempts {
		return RateDecision{
			Allowed:      false,
			CurrentCount: count,
			ShouldSkip:   true,
		}, nil
	}
	return RateDecision{
		Allowed:             false,
		CurrentCount:        count,
		ShouldRequeue:       true,
		RequeueDelayMinutes: RequeueDelayMinutes,
	}, nil
}
