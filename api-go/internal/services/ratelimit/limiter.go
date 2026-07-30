package ratelimit

import (
	"time"
)

const (
	RateLimitMax         = 750
	RequeueDelayMinutes  = 30
	MaxRequeueAttempts   = 3
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
	CountRecentDMActions(igUserID, since string) int
}

// CheckDMRate enforces Meta's 750 DMs/hour/account private-replies cap.
func CheckDMRate(store Counter, igUserID string, requeueAttempt int) RateDecision {
	since := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano)
	count := store.CountRecentDMActions(igUserID, since)
	if count < RateLimitMax {
		return RateDecision{
			Allowed:      true,
			CurrentCount: count,
		}
	}
	if requeueAttempt >= MaxRequeueAttempts {
		return RateDecision{
			Allowed:      false,
			CurrentCount: count,
			ShouldSkip:   true,
		}
	}
	return RateDecision{
		Allowed:             false,
		CurrentCount:        count,
		ShouldRequeue:       true,
		RequeueDelayMinutes: RequeueDelayMinutes,
	}
}
