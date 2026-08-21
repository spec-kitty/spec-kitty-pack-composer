package charter

import (
	"reflect"
	"sort"
	"testing"
)

func TestGroupConflicts(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		items      []Item
		wantGroups map[string][]string // groupKeyString -> sorted item IDs
	}{
		{
			name: "two items same identity different packs conflict",
			items: []Item{
				{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1"},
				{ID: "b", ArtifactType: "directive", ArtifactID: "X", PackName: "pack2"},
			},
			wantGroups: map[string][]string{
				groupKeyString(identityKey{"directive", "X"}): {"a", "b"},
			},
		},
		{
			name: "three items same identity three packs form one group",
			items: []Item{
				{ID: "a", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack1"},
				{ID: "b", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack2"},
				{ID: "c", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack3"},
			},
			wantGroups: map[string][]string{
				groupKeyString(identityKey{"tactic", "Y"}): {"a", "b", "c"},
			},
		},
		{
			name: "two items same identity same pack are not a conflict pair",
			items: []Item{
				{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1"},
				{ID: "b", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1"},
			},
			wantGroups: map[string][]string{},
		},
		{
			name: "items with different identities never group together",
			items: []Item{
				{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1"},
				{ID: "b", ArtifactType: "tactic", ArtifactID: "X", PackName: "pack2"},
				{ID: "c", ArtifactType: "directive", ArtifactID: "Z", PackName: "pack2"},
			},
			wantGroups: map[string][]string{},
		},
		{
			name:       "empty input",
			items:      nil,
			wantGroups: map[string][]string{},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := GroupConflicts(tc.items)
			gotIDs := make(map[string][]string, len(got))
			for k, group := range got {
				ids := make([]string, 0, len(group))
				for _, item := range group {
					ids = append(ids, item.ID)
				}
				sort.Strings(ids)
				gotIDs[k] = ids
			}
			if !reflect.DeepEqual(gotIDs, tc.wantGroups) {
				t.Fatalf("GroupConflicts() = %+v, want %+v", gotIDs, tc.wantGroups)
			}
		})
	}
}

func TestConflictingIDs(t *testing.T) {
	t.Parallel()

	t.Run("two-way conflict lists each other", func(t *testing.T) {
		items := []Item{
			{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1"},
			{ID: "b", ArtifactType: "directive", ArtifactID: "X", PackName: "pack2"},
		}
		got := ConflictingIDs(items)
		if !reflect.DeepEqual(got["a"], []string{"b"}) {
			t.Fatalf("a's conflicts = %v, want [b]", got["a"])
		}
		if !reflect.DeepEqual(got["b"], []string{"a"}) {
			t.Fatalf("b's conflicts = %v, want [a]", got["b"])
		}
	})

	t.Run("three-way conflict each lists the other two", func(t *testing.T) {
		items := []Item{
			{ID: "a", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack1"},
			{ID: "b", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack2"},
			{ID: "c", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack3"},
		}
		got := ConflictingIDs(items)
		for _, id := range []string{"a", "b", "c"} {
			others := got[id]
			sort.Strings(others)
			want := []string{}
			for _, other := range []string{"a", "b", "c"} {
				if other != id {
					want = append(want, other)
				}
			}
			if !reflect.DeepEqual(others, want) {
				t.Fatalf("%s's conflicts = %v, want %v", id, others, want)
			}
		}
	})

	t.Run("unrelated items have no entry", func(t *testing.T) {
		items := []Item{
			{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1"},
			{ID: "b", ArtifactType: "tactic", ArtifactID: "Z", PackName: "pack2"},
		}
		got := ConflictingIDs(items)
		if len(got) != 0 {
			t.Fatalf("expected no conflicts, got %+v", got)
		}
	})
}

func TestResolveEnable(t *testing.T) {
	t.Parallel()

	t.Run("enabling B in 2-member group disables A", func(t *testing.T) {
		items := []Item{
			{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1", Enabled: true},
			{ID: "b", ArtifactType: "directive", ArtifactID: "X", PackName: "pack2", Enabled: false},
		}
		updated, autoDisabled := ResolveEnable(items, "b")

		if !reflect.DeepEqual(autoDisabled, []string{"a"}) {
			t.Fatalf("autoDisabled = %v, want [a]", autoDisabled)
		}
		byID := indexByID(updated)
		if !byID["b"].Enabled {
			t.Fatal("b should be enabled")
		}
		if byID["a"].Enabled {
			t.Fatal("a should be disabled")
		}
	})

	t.Run("enabling C in 3-member group only reports the previously-enabled member", func(t *testing.T) {
		items := []Item{
			{ID: "a", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack1", Enabled: true},
			{ID: "b", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack2", Enabled: false},
			{ID: "c", ArtifactType: "tactic", ArtifactID: "Y", PackName: "pack3", Enabled: false},
		}
		updated, autoDisabled := ResolveEnable(items, "c")

		if !reflect.DeepEqual(autoDisabled, []string{"a"}) {
			t.Fatalf("autoDisabled = %v, want [a] (b was already disabled, so it must not be reported)", autoDisabled)
		}
		byID := indexByID(updated)
		if !byID["c"].Enabled {
			t.Fatal("c should be enabled")
		}
		if byID["a"].Enabled {
			t.Fatal("a should be disabled")
		}
		if byID["b"].Enabled {
			t.Fatal("b should remain disabled")
		}
	})

	t.Run("enabling an item with no conflict group touches nothing else", func(t *testing.T) {
		items := []Item{
			{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1", Enabled: false},
			{ID: "b", ArtifactType: "tactic", ArtifactID: "Z", PackName: "pack2", Enabled: true},
		}
		updated, autoDisabled := ResolveEnable(items, "a")

		if len(autoDisabled) != 0 {
			t.Fatalf("autoDisabled = %v, want empty", autoDisabled)
		}
		byID := indexByID(updated)
		if !byID["a"].Enabled {
			t.Fatal("a should be enabled")
		}
		if !byID["b"].Enabled {
			t.Fatal("unrelated item b should be untouched (still enabled)")
		}
	})

	t.Run("unrelated items outside the group are never touched in a multi-item charter", func(t *testing.T) {
		items := []Item{
			{ID: "a", ArtifactType: "directive", ArtifactID: "X", PackName: "pack1", Enabled: true},
			{ID: "b", ArtifactType: "directive", ArtifactID: "X", PackName: "pack2", Enabled: false},
			{ID: "z", ArtifactType: "glossary", ArtifactID: "Q", PackName: "pack9", Enabled: true},
		}
		updated, autoDisabled := ResolveEnable(items, "b")

		if !reflect.DeepEqual(autoDisabled, []string{"a"}) {
			t.Fatalf("autoDisabled = %v, want [a]", autoDisabled)
		}
		byID := indexByID(updated)
		if !byID["z"].Enabled {
			t.Fatal("unrelated item z should be untouched (still enabled)")
		}
	})
}

func indexByID(items []Item) map[string]Item {
	out := make(map[string]Item, len(items))
	for _, item := range items {
		out[item.ID] = item
	}
	return out
}
