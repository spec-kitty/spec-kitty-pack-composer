package pack

import (
	"fmt"
	"testing"
)

const builtInKey = "spec-kitty-builtin"

func builtInNode() PackNode {
	return PackNode{ID: "builtin-id", ProjectKey: builtInKey, ParentID: "", Origin: "built-in", Name: "Built-in"}
}

func TestResolveStatus(t *testing.T) {
	tests := []struct {
		name       string
		nodes      []PackNode
		wantStatus map[string]ParentStatus
	}{
		{
			name: "missing parent - no match in project_key index",
			nodes: []PackNode{
				builtInNode(),
				{ID: "a", ProjectKey: "a-key", ParentID: "nonexistent-key", Origin: "local", Name: "A"},
			},
			wantStatus: map[string]ParentStatus{
				"a": {Status: StatusMissing, BrokenRef: "nonexistent-key"},
			},
		},
		{
			name: "direct cycle A -> B -> A",
			nodes: []PackNode{
				builtInNode(),
				{ID: "a", ProjectKey: "a-key", ParentID: "b-key", Origin: "local", Name: "A"},
				{ID: "b", ProjectKey: "b-key", ParentID: "a-key", Origin: "local", Name: "B"},
			},
			// Both A's and B's own direct parent reference resolves (each
			// finds a real pack), so per data-model.md's first-link vs.
			// later-link rule the cycle break is detected on the *second*
			// link of each walk, classifying both as broken-ancestor (FR-015
			// still surfaces this with the same "broken" UI treatment as
			// missing, but the payload distinguishes it).
			wantStatus: map[string]ParentStatus{
				"a": {Status: StatusBrokenAncestor, BrokenRef: "a-key", BrokenPackName: "A"},
				"b": {Status: StatusBrokenAncestor, BrokenRef: "b-key", BrokenPackName: "B"},
			},
		},
		{
			name: "indirect/broken-ancestor: C -> B -> A, A -> B breaks the cycle further up",
			nodes: []PackNode{
				builtInNode(),
				{ID: "c", ProjectKey: "c-key", ParentID: "b-key", Origin: "local", Name: "C"},
				{ID: "b", ProjectKey: "b-key", ParentID: "missing-key", Origin: "local", Name: "B"},
			},
			wantStatus: map[string]ParentStatus{
				"c": {Status: StatusBrokenAncestor, BrokenRef: "missing-key"},
				"b": {Status: StatusMissing, BrokenRef: "missing-key"},
			},
		},
		{
			name: "no parent declared falls back to built-in",
			nodes: []PackNode{
				builtInNode(),
				{ID: "a", ProjectKey: "a-key", ParentID: "", Origin: "local", Name: "A"},
			},
			wantStatus: map[string]ParentStatus{
				"a": {Status: StatusResolved},
			},
		},
		{
			name: "built-in node itself always resolves, regardless of other nodes",
			nodes: []PackNode{
				builtInNode(),
				{ID: "a", ProjectKey: "a-key", ParentID: "cycles-with-itself", Origin: "local", Name: "A"},
			},
			wantStatus: map[string]ParentStatus{
				"builtin-id": {Status: StatusResolved},
			},
		},
		{
			name: "no built-in node present + empty parent_id -> broken-environment missing",
			nodes: []PackNode{
				{ID: "a", ProjectKey: "a-key", ParentID: "", Origin: "local", Name: "A"},
			},
			wantStatus: map[string]ParentStatus{
				"a": {Status: StatusMissing, BrokenRef: "<built-in>"},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ResolveStatus(tc.nodes)
			for id, want := range tc.wantStatus {
				gotStatus, ok := got[id]
				if !ok {
					t.Fatalf("no status computed for id %q", id)
				}
				if gotStatus != want {
					t.Errorf("id %q: got %+v, want %+v", id, gotStatus, want)
				}
			}
		})
	}
}

func TestResolveStatus_LongerCycle(t *testing.T) {
	// A -> B -> C -> A (indirect cycle, length 3).
	nodes := []PackNode{
		builtInNode(),
		{ID: "a", ProjectKey: "a-key", ParentID: "b-key", Origin: "local", Name: "A"},
		{ID: "b", ProjectKey: "b-key", ParentID: "c-key", Origin: "local", Name: "B"},
		{ID: "c", ProjectKey: "c-key", ParentID: "a-key", Origin: "local", Name: "C"},
	}
	got := ResolveStatus(nodes)
	for _, id := range []string{"a", "b", "c"} {
		if got[id].Status == StatusResolved {
			t.Errorf("id %q: expected broken status in a cycle, got resolved", id)
		}
	}
	// The first link for each node resolves fine (their direct parent
	// exists), so the break is detected further up the chain.
	if got["a"].Status != StatusBrokenAncestor {
		t.Errorf("a: got %+v, want broken-ancestor", got["a"])
	}
}

func Test10DeepChain(t *testing.T) {
	nodes := []PackNode{builtInNode()}
	// P1 -> P2 -> ... -> P9 -> built-in
	for i := 1; i <= 9; i++ {
		id := fmt.Sprintf("p%d", i)
		key := fmt.Sprintf("p%d-key", i)
		parentKey := ""
		if i < 9 {
			parentKey = fmt.Sprintf("p%d-key", i+1)
		}
		nodes = append(nodes, PackNode{ID: id, ProjectKey: key, ParentID: parentKey, Origin: "local", Name: id})
	}

	got := ResolveStatus(nodes)
	if got["p1"].Status != StatusResolved {
		t.Errorf("p1: got %+v, want resolved", got["p1"])
	}
	for i := 1; i <= 9; i++ {
		id := fmt.Sprintf("p%d", i)
		if got[id].Status != StatusResolved {
			t.Errorf("%s: got %+v, want resolved", id, got[id])
		}
	}
}

func artifact(typ ArtifactType, id, name string) ParsedArtifact {
	return ParsedArtifact{ArtifactType: typ, ArtifactID: id, Name: name, ParseOK: true, Content: map[string]any{}}
}

func TestResolveEffectiveArtifacts(t *testing.T) {
	t.Run("own artifact overrides inherited one with same (type, id) - own-wins", func(t *testing.T) {
		nodes := []PackNode{
			builtInNode(),
			{ID: "parent", ProjectKey: "parent-key", ParentID: "", Origin: "local", Name: "Parent"},
			{ID: "child", ProjectKey: "child-key", ParentID: "parent-key", Origin: "local", Name: "Child"},
		}
		artifacts := map[string][]ParsedArtifact{
			"parent": {artifact(ArtifactDirective, "d1", "Parent D1")},
			"child":  {artifact(ArtifactDirective, "d1", "Child D1 (override)")},
		}

		got, status := ResolveEffectiveArtifacts("child", nodes, artifacts)
		if status.Status != StatusResolved {
			t.Fatalf("status: got %+v, want resolved", status)
		}
		if len(got) != 1 {
			t.Fatalf("expected exactly 1 artifact (own wins, no duplicate), got %d: %+v", len(got), got)
		}
		if got[0].Origin != OriginOwn || got[0].Name != "Child D1 (override)" {
			t.Errorf("expected own artifact to win, got %+v", got[0])
		}
	})

	t.Run("no parent declared falls back to built-in directly", func(t *testing.T) {
		nodes := []PackNode{
			builtInNode(),
			{ID: "a", ProjectKey: "a-key", ParentID: "", Origin: "local", Name: "A"},
		}
		artifacts := map[string][]ParsedArtifact{
			"a":          {artifact(ArtifactDirective, "own1", "Own")},
			"builtin-id": {artifact(ArtifactDirective, "b1", "Builtin D1")},
		}

		got, status := ResolveEffectiveArtifacts("a", nodes, artifacts)
		if status.Status != StatusResolved {
			t.Fatalf("status: got %+v, want resolved", status)
		}
		if len(got) != 2 {
			t.Fatalf("expected 2 artifacts, got %d: %+v", len(got), got)
		}
		foundBuiltIn := false
		for _, a := range got {
			if a.ArtifactID == "b1" {
				foundBuiltIn = true
				if a.Origin != OriginBuiltIn {
					t.Errorf("expected built-in origin, got %+v", a)
				}
				if a.SourcePackID != "builtin-id" || a.SourcePackName != builtInKey {
					t.Errorf("expected source pack info set, got %+v", a)
				}
			}
		}
		if !foundBuiltIn {
			t.Errorf("expected built-in artifact to be inherited, got %+v", got)
		}
	})

	t.Run("direct parent missing -> only own artifacts, no partial inheritance", func(t *testing.T) {
		nodes := []PackNode{
			builtInNode(),
			{ID: "a", ProjectKey: "a-key", ParentID: "does-not-exist", Origin: "local", Name: "A"},
		}
		artifacts := map[string][]ParsedArtifact{
			"a": {artifact(ArtifactDirective, "own1", "Own")},
		}

		got, status := ResolveEffectiveArtifacts("a", nodes, artifacts)
		if status.Status != StatusMissing {
			t.Fatalf("status: got %+v, want missing", status)
		}
		if len(got) != 1 || got[0].ArtifactID != "own1" {
			t.Errorf("expected only own artifact, got %+v", got)
		}
	})

	t.Run("zero net inherited artifacts - own set already covers everything upstream", func(t *testing.T) {
		nodes := []PackNode{
			builtInNode(),
			{ID: "parent", ProjectKey: "parent-key", ParentID: "", Origin: "local", Name: "Parent"},
			{ID: "child", ProjectKey: "child-key", ParentID: "parent-key", Origin: "local", Name: "Child"},
		}
		artifacts := map[string][]ParsedArtifact{
			"parent":     {artifact(ArtifactDirective, "d1", "Parent D1")},
			"builtin-id": {artifact(ArtifactDirective, "d1", "Builtin D1")},
			"child": {
				artifact(ArtifactDirective, "d1", "Child D1"),
			},
		}

		got, status := ResolveEffectiveArtifacts("child", nodes, artifacts)
		if status.Status != StatusResolved {
			t.Fatalf("status: got %+v, want resolved", status)
		}
		if len(got) != 1 {
			t.Fatalf("expected exactly own artifacts (no placeholder), got %d: %+v", len(got), got)
		}
		if got[0].Origin != OriginOwn {
			t.Errorf("expected own origin, got %+v", got[0])
		}
	})

	t.Run("built-in pack as target returns only its own artifacts", func(t *testing.T) {
		nodes := []PackNode{
			builtInNode(),
			{ID: "a", ProjectKey: "a-key", ParentID: "", Origin: "local", Name: "A"},
		}
		artifacts := map[string][]ParsedArtifact{
			"builtin-id": {artifact(ArtifactDirective, "b1", "Builtin D1")},
			"a":          {artifact(ArtifactDirective, "own1", "Own")},
		}

		got, status := ResolveEffectiveArtifacts("builtin-id", nodes, artifacts)
		if status.Status != StatusResolved {
			t.Fatalf("status: got %+v, want resolved", status)
		}
		if len(got) != 1 || got[0].ArtifactID != "b1" || got[0].Origin != OriginOwn {
			t.Errorf("expected only built-in's own artifact, got %+v", got)
		}
	})
}
