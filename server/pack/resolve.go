package pack

// PackNode is a minimal, PocketBase-agnostic representation of a pack used by
// the chain resolver. WP06 is responsible for mapping *core.Record -> PackNode.
type PackNode struct {
	ID         string
	ProjectKey string
	ParentID   string
	Origin     string // "local" | "remote" | "built-in"
	Name       string
}

// buildProjectKeyIndex builds a project_key -> node lookup. Nodes with an
// empty ProjectKey are unreachable as anyone's parent and are skipped (an
// empty parent_id means "no parent declared", not "declared parent is the
// empty string").
func buildProjectKeyIndex(nodes []PackNode) map[string]PackNode {
	idx := make(map[string]PackNode, len(nodes))
	for _, n := range nodes {
		if n.ProjectKey == "" {
			continue
		}
		idx[n.ProjectKey] = n
	}
	return idx
}

// Status is the resolution outcome for a pack's ancestor chain.
type Status string

const (
	StatusResolved       Status = "resolved"
	StatusMissing        Status = "missing"
	StatusBrokenAncestor Status = "broken-ancestor"
)

// ParentStatus is the resolution result for a single pack.
type ParentStatus struct {
	Status Status
	// BrokenRef is the raw parent_id or re-visited project_key at the break
	// point; zero value when Status == StatusResolved.
	BrokenRef string
	// BrokenPackName is the display name at the break point, when known.
	BrokenPackName string
}

// ResolveStatus walks every node's ancestor chain and classifies its status
// as resolved, missing (break at the first link), or broken-ancestor (break
// at any link after the first). Keyed by PackNode.ID.
func ResolveStatus(nodes []PackNode) map[string]ParentStatus {
	idx := buildProjectKeyIndex(nodes)

	var builtIn *PackNode
	for i := range nodes {
		if nodes[i].Origin == "built-in" {
			b := nodes[i]
			builtIn = &b
			break
		}
	}

	result := make(map[string]ParentStatus, len(nodes))
	for _, node := range nodes {
		if node.Origin == "built-in" {
			result[node.ID] = ParentStatus{Status: StatusResolved}
			continue
		}
		result[node.ID] = resolveOne(node, idx, builtIn)
	}
	return result
}

// resolveOne walks a single pack's ancestor chain in a loop (no recursion, so
// a long-but-cycle-bounded chain can't blow the stack).
func resolveOne(node PackNode, idx map[string]PackNode, builtIn *PackNode) ParentStatus {
	visited := map[string]bool{node.ID: true}
	current := node
	firstLink := true

	for {
		if current.ParentID == "" {
			if builtIn == nil {
				// Broken-environment case: no built-in node exists at all.
				ref := "<built-in>"
				if firstLink {
					return ParentStatus{Status: StatusMissing, BrokenRef: ref}
				}
				return ParentStatus{Status: StatusBrokenAncestor, BrokenRef: ref}
			}
			return ParentStatus{Status: StatusResolved}
		}

		parent, ok := idx[current.ParentID]
		if !ok {
			if firstLink {
				return ParentStatus{Status: StatusMissing, BrokenRef: current.ParentID}
			}
			return ParentStatus{Status: StatusBrokenAncestor, BrokenRef: current.ParentID}
		}

		if visited[parent.ID] {
			if firstLink {
				return ParentStatus{Status: StatusMissing, BrokenRef: parent.ProjectKey, BrokenPackName: parent.Name}
			}
			return ParentStatus{Status: StatusBrokenAncestor, BrokenRef: parent.ProjectKey, BrokenPackName: parent.Name}
		}

		visited[parent.ID] = true
		current = parent
		firstLink = false
	}
}

// ArtifactOrigin tags where a resolved artifact came from.
type ArtifactOrigin string

const (
	OriginOwn     ArtifactOrigin = "own"
	OriginParent  ArtifactOrigin = "parent"
	OriginBuiltIn ArtifactOrigin = "built-in"
)

// ResolvedArtifact is one artifact in a pack's effective (own + inherited)
// artifact set.
type ResolvedArtifact struct {
	ParsedArtifact
	Origin         ArtifactOrigin
	SourcePackID   string // empty when Origin == own
	SourcePackName string // source pack's project_key (not its display name); empty when Origin == own
}

type artifactKey struct {
	artifactType ArtifactType
	artifactID   string
}

// ResolveEffectiveArtifacts computes the effective (own + inherited)
// artifact set for a single pack: own artifacts always win over ancestor
// artifacts sharing the same (artifact_type, artifact_id) (FR-012), walking
// the resolved ancestor chain nearest-to-farthest and stopping at the first
// break (if any) or at the built-in pack.
func ResolveEffectiveArtifacts(targetID string, nodes []PackNode, artifactsByPackID map[string][]ParsedArtifact) ([]ResolvedArtifact, ParentStatus) {
	status := ResolveStatus(nodes)[targetID]

	var target PackNode
	found := false
	for _, n := range nodes {
		if n.ID == targetID {
			target = n
			found = true
			break
		}
	}
	if !found {
		return nil, status
	}

	idx := buildProjectKeyIndex(nodes)

	seen := make(map[artifactKey]bool)
	result := make([]ResolvedArtifact, 0, len(artifactsByPackID[targetID]))
	for _, art := range artifactsByPackID[targetID] {
		seen[artifactKey{art.ArtifactType, art.ArtifactID}] = true
		result = append(result, ResolvedArtifact{ParsedArtifact: art, Origin: OriginOwn})
	}

	if target.Origin == "built-in" {
		return result, status
	}

	visited := map[string]bool{target.ID: true}
	current := target

	for {
		var next PackNode
		var origin ArtifactOrigin

		if current.ParentID == "" {
			// Implicit built-in fallback: find the built-in node directly
			// (not via project_key, since it need not be current's declared
			// parent_id).
			var builtIn *PackNode
			for i := range nodes {
				if nodes[i].Origin == "built-in" {
					b := nodes[i]
					builtIn = &b
					break
				}
			}
			if builtIn == nil {
				break
			}
			next = *builtIn
			origin = OriginBuiltIn
		} else {
			parent, ok := idx[current.ParentID]
			if !ok || visited[parent.ID] {
				break
			}
			next = parent
			if next.Origin == "built-in" {
				origin = OriginBuiltIn
			} else {
				origin = OriginParent
			}
		}

		for _, art := range artifactsByPackID[next.ID] {
			key := artifactKey{art.ArtifactType, art.ArtifactID}
			if seen[key] {
				continue
			}
			seen[key] = true
			result = append(result, ResolvedArtifact{
				ParsedArtifact: art,
				Origin:         origin,
				SourcePackID:   next.ID,
				SourcePackName: next.ProjectKey,
			})
		}

		if next.Origin == "built-in" {
			break
		}

		visited[next.ID] = true
		current = next
	}

	return result, status
}
