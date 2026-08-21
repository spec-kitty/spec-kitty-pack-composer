// Package charter holds pure Go domain logic for the charter-composition
// feature, mirroring server/pack's layering: plain structs and functions in
// here, PocketBase I/O kept in server/handlers.
package charter

// Item is a PocketBase-agnostic representation of a charter_items row, used
// by the conflict-group engine below. server/handlers is responsible for
// mapping *core.Record -> Item and back.
type Item struct {
	ID            string
	ArtifactType  string
	ArtifactID    string
	PackName      string
	Enabled       bool
	MissingSource bool
}

// identityKey is the (artifact_type, artifact_id) tuple that defines a
// conflict group per data-model.md's "Conflict group (derived, not stored)"
// invariant.
type identityKey struct {
	artifactType string
	artifactID   string
}

func keyFor(item Item) identityKey {
	return identityKey{artifactType: item.ArtifactType, artifactID: item.ArtifactID}
}

// groupKeyString renders an identityKey as the map key used by the exported
// group-keyed functions below.
func groupKeyString(k identityKey) string {
	return k.artifactType + "\x00" + k.artifactID
}

// GroupConflicts groups items by (ArtifactType, ArtifactID), keeping only
// groups where 2+ items share that identity but differ in PackName — same
// pack can't conflict with itself. WP01's unique index already prevents two
// rows with the same pack_name in one charter, but this still guards
// defensively rather than assuming the index is the only caller.
//
// The grouping is genuinely N-way: a group with 3+ distinct-pack members is
// returned as a single group, not decomposed into pairs.
func GroupConflicts(items []Item) map[string][]Item {
	byKey := make(map[identityKey][]Item)
	for _, item := range items {
		k := keyFor(item)
		byKey[k] = append(byKey[k], item)
	}

	result := make(map[string][]Item)
	for k, group := range byKey {
		if !hasMultipleDistinctPacks(group) {
			continue
		}
		result[groupKeyString(k)] = group
	}
	return result
}

func hasMultipleDistinctPacks(items []Item) bool {
	packs := make(map[string]bool, len(items))
	for _, item := range items {
		packs[item.PackName] = true
	}
	return len(packs) >= 2
}

// ConflictingIDs returns, for every item ID that belongs to a conflict
// group, the list of the other item IDs in that same group. This is
// exactly contracts/charters-api.yaml's CharterItem.conflicting_item_ids.
func ConflictingIDs(items []Item) map[string][]string {
	groups := GroupConflicts(items)

	result := make(map[string][]string)
	for _, group := range groups {
		for _, item := range group {
			others := make([]string, 0, len(group)-1)
			for _, other := range group {
				if other.ID != item.ID {
					others = append(others, other.ID)
				}
			}
			result[item.ID] = others
		}
	}
	return result
}

// ResolveEnable is a pure function (no I/O): given the full set of a
// charter's items and the ID of the one being enabled, it returns a new
// slice where enableID's Enabled is true, every other member of its
// conflict group is forced to false, and every unrelated item is
// untouched.
//
// autoDisabledIDs lists only the IDs that were actually flipped from
// true -> false by this call — a group member that was already false
// stays false but is not reported, since nothing changed for it.
func ResolveEnable(items []Item, enableID string) (updated []Item, autoDisabledIDs []string) {
	updated = make([]Item, len(items))
	copy(updated, items)

	targetIdx := -1
	for i := range updated {
		if updated[i].ID == enableID {
			targetIdx = i
			break
		}
	}
	if targetIdx == -1 {
		// Unknown ID: nothing to enable, nothing to disable.
		return updated, []string{}
	}
	updated[targetIdx].Enabled = true

	groups := GroupConflicts(updated)
	key := groupKeyString(keyFor(updated[targetIdx]))
	group, inGroup := groups[key]

	autoDisabledIDs = []string{}
	if !inGroup {
		return updated, autoDisabledIDs
	}

	memberIDs := make(map[string]bool, len(group))
	for _, member := range group {
		memberIDs[member.ID] = true
	}

	for i := range updated {
		if updated[i].ID == enableID || !memberIDs[updated[i].ID] {
			continue
		}
		if updated[i].Enabled {
			autoDisabledIDs = append(autoDisabledIDs, updated[i].ID)
		}
		updated[i].Enabled = false
	}

	return updated, autoDisabledIDs
}
