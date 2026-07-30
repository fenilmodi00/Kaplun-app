package worker

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
)

var (
	ErrPoolClosed = errors.New("worker pool closed")
	ErrPoolFull   = errors.New("worker pool queue full")
)

// Pool is a bounded worker pool. Submit never blocks the caller forever:
// if the queue is full it returns ErrPoolFull.
type Pool struct {
	jobs   chan func(context.Context)
	wg     sync.WaitGroup
	closed atomic.Bool
}

func NewPool(workers, queueSize int) *Pool {
	if workers < 1 {
		workers = 1
	}
	if queueSize < 1 {
		queueSize = workers
	}

	p := &Pool{
		jobs: make(chan func(context.Context), queueSize),
	}
	for i := 0; i < workers; i++ {
		p.wg.Add(1)
		go p.loop()
	}
	return p
}

func (p *Pool) loop() {
	defer p.wg.Done()
	for job := range p.jobs {
		job(context.Background())
	}
}

// Submit enqueues fn for execution. Returns ErrPoolClosed or ErrPoolFull without
// blocking when the pool cannot accept work.
func (p *Pool) Submit(fn func(context.Context)) error {
	if fn == nil {
		return nil
	}
	if p.closed.Load() {
		return ErrPoolClosed
	}
	select {
	case p.jobs <- fn:
		return nil
	default:
		return ErrPoolFull
	}
}

// Shutdown closes the queue and waits for in-flight jobs to finish.
func (p *Pool) Shutdown() {
	if !p.closed.CompareAndSwap(false, true) {
		return
	}
	close(p.jobs)
	p.wg.Wait()
}
