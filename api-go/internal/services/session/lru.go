package session

import (
	"container/list"
	"sync"
)

const DefaultMaxSessions = 50

type lruEntry[V any] struct {
	key   string
	value V
}

// LRU is a thread-safe least-recently-used cache with a fixed capacity.
type LRU[V any] struct {
	mu       sync.Mutex
	capacity int
	items    map[string]*list.Element
	order    *list.List
}

func NewLRU[V any](capacity int) *LRU[V] {
	if capacity <= 0 {
		capacity = DefaultMaxSessions
	}
	return &LRU[V]{
		capacity: capacity,
		items:    make(map[string]*list.Element, capacity),
		order:    list.New(),
	}
}

// Get returns the value and moves it to most-recently-used.
func (c *LRU[V]) Get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var zero V
	el, ok := c.items[key]
	if !ok {
		return zero, false
	}
	c.order.MoveToBack(el)
	return el.Value.(*lruEntry[V]).value, true
}

// Peek returns the value without updating recency.
func (c *LRU[V]) Peek(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var zero V
	el, ok := c.items[key]
	if !ok {
		return zero, false
	}
	return el.Value.(*lruEntry[V]).value, true
}

// Put inserts or updates a value. If capacity is exceeded, it evicts the
// least-recently-used entry and returns it.
func (c *LRU[V]) Put(key string, value V) (evictedKey string, evictedValue V, evicted bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if el, ok := c.items[key]; ok {
		c.order.MoveToBack(el)
		el.Value.(*lruEntry[V]).value = value
		return "", evictedValue, false
	}

	if c.order.Len() >= c.capacity {
		front := c.order.Front()
		if front != nil {
			old := front.Value.(*lruEntry[V])
			delete(c.items, old.key)
			c.order.Remove(front)
			evictedKey = old.key
			evictedValue = old.value
			evicted = true
		}
	}

	el := c.order.PushBack(&lruEntry[V]{key: key, value: value})
	c.items[key] = el
	return evictedKey, evictedValue, evicted
}

// Remove deletes a key and returns the previous value when present.
func (c *LRU[V]) Remove(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var zero V
	el, ok := c.items[key]
	if !ok {
		return zero, false
	}
	entry := el.Value.(*lruEntry[V])
	delete(c.items, key)
	c.order.Remove(el)
	return entry.value, true
}

// Len returns the number of entries.
func (c *LRU[V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}

// PopAll removes and returns every entry (most-recent first among equals is undefined).
func (c *LRU[V]) PopAll() []V {
	c.mu.Lock()
	defer c.mu.Unlock()

	out := make([]V, 0, c.order.Len())
	for c.order.Len() > 0 {
		el := c.order.Front()
		entry := el.Value.(*lruEntry[V])
		delete(c.items, entry.key)
		c.order.Remove(el)
		out = append(out, entry.value)
	}
	return out
}
