package worker

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// JobRecord is the minimal job row the sweeper needs.
type JobRecord struct {
	ID       string
	Status   string
	Attempts int
}

// SweeperStore lists due/stale jobs and updates their status.
type SweeperStore interface {
	ListDueJobs(ctx context.Context, nowISO string) ([]JobRecord, error)
	ListStaleProcessingJobs(ctx context.Context, staleBeforeISO string) ([]JobRecord, error)
	UpdateJob(ctx context.Context, jobID string, data map[string]any) error
}

// Sweeper periodically runs due jobs and recovers stale processing rows.
type Sweeper struct {
	Store    SweeperStore
	Runner   JobRunner
	Interval time.Duration
	Log      *slog.Logger
	Now      func() time.Time

	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}
}

func NewSweeper(store SweeperStore, runner JobRunner, interval time.Duration) *Sweeper {
	if interval <= 0 {
		interval = time.Minute
	}
	return &Sweeper{
		Store:    store,
		Runner:   runner,
		Interval: interval,
		Now:      time.Now,
	}
}

// Start begins the sweeper loop. Calling Start twice is a no-op until Stop.
func (s *Sweeper) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.done = make(chan struct{})
	go s.loop(ctx)
}

// Stop cancels the loop and waits for the current iteration to finish.
func (s *Sweeper) Stop() {
	s.mu.Lock()
	cancel := s.cancel
	done := s.done
	s.cancel = nil
	s.mu.Unlock()

	if cancel == nil {
		return
	}
	cancel()
	<-done
}

func (s *Sweeper) loop(ctx context.Context) {
	defer close(s.done)

	ticker := time.NewTicker(s.Interval)
	defer ticker.Stop()

	s.Tick(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.Tick(ctx)
		}
	}
}

// Tick runs one sweeper iteration (exported for tests).
func (s *Sweeper) Tick(ctx context.Context) {
	if s.Store == nil {
		return
	}

	now := s.Now().UTC()
	nowISO := now.Format(time.RFC3339Nano)

	due, err := s.Store.ListDueJobs(ctx, nowISO)
	if err != nil {
		s.logError("list due jobs failed", err)
	} else {
		safe := &SafeRunner{Runner: s.Runner, Log: s.Log}
		for _, job := range due {
			safe.RunJobSafe(ctx, job.ID)
		}
	}

	staleBefore := now.Add(-time.Duration(StaleProcessingMinutes) * time.Minute).Format(time.RFC3339Nano)
	stale, err := s.Store.ListStaleProcessingJobs(ctx, staleBefore)
	if err != nil {
		s.logError("list stale jobs failed", err)
		return
	}

	for _, job := range stale {
		attempts := job.Attempts + 1
		updatedAt := s.Now().UTC().Format(time.RFC3339Nano)
		data := map[string]any{
			"attempts":   attempts,
			"updated_at": updatedAt,
		}
		if attempts >= MaxAttempts {
			data["status"] = "failed"
		} else {
			data["status"] = "pending"
			data["run_at"] = updatedAt
		}
		if err := s.Store.UpdateJob(ctx, job.ID, data); err != nil {
			s.logError("update stale job failed", err)
		}
	}
}

func (s *Sweeper) logError(msg string, err error) {
	if s.Log != nil {
		s.Log.Error(msg, "error", err)
	}
}
