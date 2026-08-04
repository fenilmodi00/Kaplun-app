package worker

import (
	"context"
	"log/slog"
	"time"
)

const (
	JobTypeProcessComment = "process_comment"
	JobTypeSendReveal     = "send_reveal"
	JobTypeFollowUp       = "send_followup"
	JobTypeProcessMessage = "process_message"

	MaxAttempts            = 3
	StaleProcessingMinutes = 10
	RequeueDelayMinutes    = 30
	ReadFallbackDelaySeconds = 300
)

var BackoffMinutes = []int{5, 15, 45}

// JobRunner executes a durable automation job by ID (process_comment / send_reveal).
type JobRunner interface {
	RunJob(ctx context.Context, jobID string) error
}

// ProcessCommentHandler handles process_comment job payloads.
type ProcessCommentHandler interface {
	ProcessComment(ctx context.Context, payload map[string]any) (result string, err error)
}

// SendRevealHandler handles send_reveal job payloads.
type SendRevealHandler interface {
	SendReveal(ctx context.Context, payload map[string]any) error
}

// FollowUpHandler handles send_followup job payloads.
type FollowUpHandler interface {
	SendFollowUp(ctx context.Context, payload map[string]any) error
}

// ProcessMessageHandler handles process_message job payloads.
type ProcessMessageHandler interface {
	ProcessMessage(ctx context.Context, payload map[string]any) error
}

// FollowUpJob is the payload for a send_followup job.
type FollowUpJob struct {
	InstagramAccountID string `json:"instagram_account_id"`
	UserID             string `json:"user_id"`
	AutomationID       string `json:"automation_id"`
	CommenterName      string `json:"commenter_name"`
}

// ProcessMessageJob is the payload for a process_message job.
type ProcessMessageJob struct {
	InstagramAccountID string `json:"instagram_account_id"`
	MessageID          string `json:"message_id"`
	MessageText        string `json:"message_text"`
	SenderID           string `json:"sender_id"`
}

// SafeRunner wraps a JobRunner so background callers never observe panics or errors.
type SafeRunner struct {
	Runner JobRunner
	Log    *slog.Logger
}

func (s *SafeRunner) RunJobSafe(ctx context.Context, jobID string) {
	defer func() {
		if recovered := recover(); recovered != nil {
			if s.Log != nil {
				s.Log.ErrorContext(ctx, "run_job_safe panic", "job_id", jobID, "panic", recovered)
			}
		}
	}()

	if s.Runner == nil {
		return
	}
	if err := s.Runner.RunJob(ctx, jobID); err != nil && s.Log != nil {
		s.Log.ErrorContext(ctx, "run_job_safe error", "job_id", jobID, "error", err)
	}
}

// EnqueueJob submits a job ID to the pool for SafeRunner execution.
func EnqueueJob(pool *Pool, safe *SafeRunner, jobID string) error {
	if pool == nil || safe == nil || jobID == "" {
		return nil
	}
	return pool.Submit(func(ctx context.Context) {
		safe.RunJobSafe(ctx, jobID)
	})
}

func BackoffDuration(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	idx := attempt - 1
	if idx >= len(BackoffMinutes) {
		idx = len(BackoffMinutes) - 1
	}
	return time.Duration(BackoffMinutes[idx]) * time.Minute
}
