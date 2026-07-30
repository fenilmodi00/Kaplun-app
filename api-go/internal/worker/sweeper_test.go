package worker_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"kaplun/api-go/internal/worker"
)

type fakeSweeperStore struct {
	mu       sync.Mutex
	due      []worker.JobRecord
	stale    []worker.JobRecord
	updates  []map[string]any
	updateID []string
}

func (f *fakeSweeperStore) ListDueJobs(context.Context, string) ([]worker.JobRecord, error) {
	return f.due, nil
}

func (f *fakeSweeperStore) ListStaleProcessingJobs(context.Context, string) ([]worker.JobRecord, error) {
	return f.stale, nil
}

func (f *fakeSweeperStore) UpdateJob(_ context.Context, jobID string, data map[string]any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updateID = append(f.updateID, jobID)
	f.updates = append(f.updates, data)
	return nil
}

func TestSweeperTickRunsDueAndRecoversStale(t *testing.T) {
	t.Parallel()

	store := &fakeSweeperStore{
		due:   []worker.JobRecord{{ID: "due1", Status: "pending"}},
		stale: []worker.JobRecord{{ID: "stale1", Status: "processing", Attempts: 0}},
	}
	runner := &fakeRunner{}
	sw := worker.NewSweeper(store, runner, time.Hour)
	fixed := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	sw.Now = func() time.Time { return fixed }

	sw.Tick(context.Background())

	if runner.called != "due1" {
		t.Fatalf("expected due job run, got %q", runner.called)
	}
	if len(store.updates) != 1 || store.updateID[0] != "stale1" {
		t.Fatalf("expected stale update, got ids=%v updates=%v", store.updateID, store.updates)
	}
	if store.updates[0]["status"] != "pending" {
		t.Fatalf("expected pending requeue, got %v", store.updates[0])
	}
}

func TestSweeperTickDeadLettersMaxAttempts(t *testing.T) {
	t.Parallel()

	store := &fakeSweeperStore{
		stale: []worker.JobRecord{{ID: "dead", Status: "processing", Attempts: 2}},
	}
	sw := worker.NewSweeper(store, &fakeRunner{}, time.Hour)
	sw.Tick(context.Background())

	if store.updates[0]["status"] != "failed" {
		t.Fatalf("expected failed, got %v", store.updates[0])
	}
	if store.updates[0]["attempts"] != 3 {
		t.Fatalf("expected attempts 3, got %v", store.updates[0]["attempts"])
	}
}

func TestSweeperStartStop(t *testing.T) {
	t.Parallel()

	store := &fakeSweeperStore{}
	sw := worker.NewSweeper(store, &fakeRunner{}, 20*time.Millisecond)
	sw.Start()
	time.Sleep(50 * time.Millisecond)
	sw.Stop()
	sw.Stop() // idempotent
}
