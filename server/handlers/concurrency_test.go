package handlers

import (
	"sync"
	"testing"
	"time"
)

func TestPackLocksRejectsConcurrentAcquire(t *testing.T) {
	t.Parallel()

	locks := &packLocks{locks: map[string]struct{}{}}
	if !locks.TryLock("p1") {
		t.Fatal("first lock should succeed")
	}
	if locks.TryLock("p1") {
		t.Fatal("second lock on same id should fail")
	}
	if !locks.TryLock("p2") {
		t.Fatal("lock on different id should succeed")
	}
	locks.Unlock("p1")
	if !locks.TryLock("p1") {
		t.Fatal("lock should succeed after unlock")
	}
}

func TestPackLocksConcurrentContention(t *testing.T) {
	t.Parallel()

	locks := &packLocks{locks: map[string]struct{}{}}
	var acquired int
	var mu sync.Mutex
	var wg sync.WaitGroup

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if locks.TryLock("same") {
				mu.Lock()
				acquired++
				mu.Unlock()
				time.Sleep(5 * time.Millisecond)
				locks.Unlock("same")
			}
		}()
	}
	wg.Wait()

	if acquired == 0 {
		t.Fatal("expected at least one acquire")
	}
	// After all unlocks, lock should be free.
	if !locks.TryLock("same") {
		t.Fatal("expected lock free after waiters finish")
	}
	locks.Unlock("same")
}
