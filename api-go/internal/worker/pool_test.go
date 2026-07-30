package worker_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"kaplun/api-go/internal/worker"
)

func TestPoolSubmitAndShutdown(t *testing.T) {
	t.Parallel()

	pool := worker.NewPool(2, 16)
	var count atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		err := pool.Submit(func(ctx context.Context) {
			defer wg.Done()
			count.Add(1)
		})
		if err != nil {
			t.Fatalf("submit: %v", err)
		}
	}
	wg.Wait()
	pool.Shutdown()

	if got := count.Load(); got != 10 {
		t.Fatalf("expected 10 jobs, got %d", got)
	}

	if err := pool.Submit(func(context.Context) {}); err != worker.ErrPoolClosed {
		t.Fatalf("expected ErrPoolClosed, got %v", err)
	}
}

func TestPoolFull(t *testing.T) {
	t.Parallel()

	pool := worker.NewPool(1, 1)
	defer pool.Shutdown()

	block := make(chan struct{})
	started := make(chan struct{})

	if err := pool.Submit(func(context.Context) {
		close(started)
		<-block
	}); err != nil {
		t.Fatalf("first submit: %v", err)
	}
	<-started

	// Fill the single queue slot while worker is busy.
	if err := pool.Submit(func(context.Context) {}); err != nil {
		t.Fatalf("second submit: %v", err)
	}
	if err := pool.Submit(func(context.Context) {}); err != worker.ErrPoolFull {
		t.Fatalf("expected ErrPoolFull, got %v", err)
	}
	close(block)
}

func TestSafeRunnerSwallowsErrors(t *testing.T) {
	t.Parallel()

	runner := &fakeRunner{err: context.Canceled}
	safe := &worker.SafeRunner{Runner: runner}
	safe.RunJobSafe(context.Background(), "j1")
	if runner.called != "j1" {
		t.Fatalf("expected job j1, got %q", runner.called)
	}
}

func TestEnqueueJob(t *testing.T) {
	t.Parallel()

	pool := worker.NewPool(1, 4)
	defer pool.Shutdown()

	done := make(chan struct{})
	runner := &fakeRunner{onRun: func() { close(done) }}
	safe := &worker.SafeRunner{Runner: runner}

	if err := worker.EnqueueJob(pool, safe, "job-1"); err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for job")
	}
	if runner.called != "job-1" {
		t.Fatalf("expected job-1, got %q", runner.called)
	}
}

func TestBackoffDuration(t *testing.T) {
	t.Parallel()
	if got := worker.BackoffDuration(1); got != 5*time.Minute {
		t.Fatalf("attempt 1: %v", got)
	}
	if got := worker.BackoffDuration(2); got != 15*time.Minute {
		t.Fatalf("attempt 2: %v", got)
	}
	if got := worker.BackoffDuration(3); got != 45*time.Minute {
		t.Fatalf("attempt 3: %v", got)
	}
}

type fakeRunner struct {
	called string
	err    error
	onRun  func()
}

func (f *fakeRunner) RunJob(_ context.Context, jobID string) error {
	f.called = jobID
	if f.onRun != nil {
		f.onRun()
	}
	return f.err
}
