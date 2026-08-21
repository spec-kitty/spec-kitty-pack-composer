package handlers

import (
	"sync"
)

// packLocks guards in-flight refresh/export per pack id.
// A second concurrent refresh or export for the same pack returns HTTP 409.
type packLocks struct {
	mu    sync.Mutex
	locks map[string]struct{}
}

var defaultPackLocks = &packLocks{locks: map[string]struct{}{}}

// defaultCharterLocks guards in-flight charter exports the same way
// defaultPackLocks guards pack refresh/export — packLocks is keyed by an
// arbitrary string id and has no pack-specific fields, so it is reused
// directly rather than duplicating the mutex-guarded map logic.
var defaultCharterLocks = &packLocks{locks: map[string]struct{}{}}

// TryLock acquires an exclusive in-memory lock for packID.
// Returns false if the pack is already locked (caller should respond 409).
func (p *packLocks) TryLock(packID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, busy := p.locks[packID]; busy {
		return false
	}
	p.locks[packID] = struct{}{}
	return true
}

// Unlock releases the lock for packID.
func (p *packLocks) Unlock(packID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.locks, packID)
}
