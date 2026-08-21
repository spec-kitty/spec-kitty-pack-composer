package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Built-in pack CLI-JSON sourcing (WP02).
//
// ASSUMED CLI SHAPES (no live `spec-kitty` sample was available while writing
// this file — reconcile against the real CLI if the format drifts):
//
//   - `spec-kitty charter context --json` is assumed to return a JSON object
//     with a directive list under one of: "all_directives", "directives",
//     "items" (or, defensively, a bare top-level JSON array). Each entry is
//     assumed to be an object with an id under one of "id", "directive_id",
//     "name", and a source label under "source" or "origin" equal to
//     "builtin" (case-insensitive).
//   - `spec-kitty profiles list --all --json` is assumed to return the same
//     general shape, with the list under "profiles", "all_profiles", or
//     "items", ids under "id", "profile_id", "name", and a source label
//     of "built-in" (hyphenated spelling, per research.md's documented
//     inconsistency). Both spellings ("builtin" / "built-in") are accepted
//     in both enumeration functions for robustness.
//   - `spec-kitty charter context --include directive:<id> --json` /
//     `--include agent-profile:<id> --json` are assumed to emit a larger
//     text/JSON payload containing a trailing literal marker "Full artifact:"
//     followed by a JSON object holding the artifact's full structured
//     content. That object is extracted by locating the marker and then
//     brace-matching from the first "{" after it (see
//     extractFullArtifactJSON), not by a direct key lookup.
//
// Any deviation from this assumed shape is treated as "nothing found" rather
// than an error, per research.md R6: sourcing failures must never propagate
// as errors or panics this deep in the stack.

// fullArtifactMarker precedes the trailing JSON block in `charter context
// --include ... --json` output.
const fullArtifactMarker = "Full artifact:"

// versionOutputPattern matches the "spec-kitty-cli version X.Y.Z" line that
// `spec-kitty --version` prints after its decorative ASCII banner. Verified
// against a live install: `--version` has no `--json` counterpart, so this
// is a plain-text scrape rather than a JSON parse.
var versionOutputPattern = regexp.MustCompile(`(?i)spec-kitty-cli version\s+(\S+)`)

// ResolveCLIVersion shells `spec-kitty --version` and extracts the semantic
// version string it reports (e.g. "3.2.5"). A missing CLI is reported via
// ErrCLINotInstalled; any other failure (non-zero exit, output that doesn't
// match the expected "spec-kitty-cli version <ver>" line) results in
// ("", nil) — an "unknown version" outcome, not an error, so a built-in
// pack with an unresolvable CLI version still bootstraps successfully.
func ResolveCLIVersion() (string, error) {
	if _, err := lookPath("spec-kitty"); err != nil {
		return "", fmt.Errorf("%w: install Spec Kitty CLI and ensure it is on PATH", ErrCLINotInstalled)
	}

	cmd := commandFactory("spec-kitty", "--version")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", nil
	}

	match := versionOutputPattern.FindStringSubmatch(stdout.String())
	if match == nil {
		return "", nil
	}
	return match[1], nil
}

// enumerationAction is a fixed, arbitrary workflow action passed to
// `spec-kitty charter context` purely to satisfy its required `--action`
// flag when enumerating directives (the CLI rejects `--json` without either
// `--action` or `--include`). The returned `all_directives` list describes
// the project-local charter and is the same regardless of which action is
// passed, so the specific value here has no effect on the result.
const enumerationAction = "implement"

// ListBuiltinDirectiveIDs shells `spec-kitty charter context --json` and
// returns the ids of all built-in directives. A missing CLI is reported via
// ErrCLINotInstalled; any other failure (non-zero exit, unexpected output
// shape, malformed JSON) results in (nil, nil) — a valid "zero ids found"
// outcome, not an error.
func ListBuiltinDirectiveIDs() ([]string, error) {
	if _, err := lookPath("spec-kitty"); err != nil {
		return nil, fmt.Errorf("%w: install Spec Kitty CLI and ensure it is on PATH", ErrCLINotInstalled)
	}

	cmd := commandFactory("spec-kitty", "charter", "context", "--action", enumerationAction, "--json")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, nil
	}

	ids := extractBuiltinIDs(
		stdout.Bytes(),
		[]string{"all_directives", "directives", "items"},
		[]string{"id", "directive_id", "name"},
		[]string{"source", "origin"},
	)
	return ids, nil
}

// ListBuiltinProfileIDs shells `spec-kitty profiles list --all --json` and
// returns the ids of all built-in agent profiles. Error semantics mirror
// ListBuiltinDirectiveIDs exactly so callers can treat both uniformly.
func ListBuiltinProfileIDs() ([]string, error) {
	if _, err := lookPath("spec-kitty"); err != nil {
		return nil, fmt.Errorf("%w: install Spec Kitty CLI and ensure it is on PATH", ErrCLINotInstalled)
	}

	cmd := commandFactory("spec-kitty", "profiles", "list", "--all", "--json")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, nil
	}

	ids := extractBuiltinIDs(
		stdout.Bytes(),
		[]string{"profiles", "all_profiles", "items"},
		[]string{"id", "profile_id", "name"},
		[]string{"source", "origin"},
	)
	return ids, nil
}

// FetchDirectiveContent fetches the full structured content of one built-in
// directive via `spec-kitty charter context --include directive:<id> --json`.
func FetchDirectiveContent(id string) (map[string]any, error) {
	return fetchFullArtifact("directive", id)
}

// FetchProfileContent fetches the full structured content of one built-in
// agent profile via
// `spec-kitty charter context --include agent-profile:<id> --json`.
func FetchProfileContent(id string) (map[string]any, error) {
	return fetchFullArtifact("agent-profile", id)
}

// fetchFullArtifact runs `spec-kitty charter context --include
// <includePrefix>:<id> --json`, extracts the trailing "Full artifact:" JSON
// block from stdout, and unmarshals it. A missing CLI is reported via
// ErrCLINotInstalled. Any other failure (non-zero exit, missing marker,
// invalid JSON) results in (nil, nil) — "not found", not an error — so the
// caller can skip that artifact and move on.
func fetchFullArtifact(includePrefix, id string) (map[string]any, error) {
	if _, err := lookPath("spec-kitty"); err != nil {
		return nil, fmt.Errorf("%w: install Spec Kitty CLI and ensure it is on PATH", ErrCLINotInstalled)
	}

	cmd := commandFactory("spec-kitty", "charter", "context", "--include", includePrefix+":"+id, "--json")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, nil
	}

	// With `--json`, the CLI wraps its rendered output (which contains the
	// "Full artifact:" marker and trailing JSON block) inside a "text" (or
	// "context") string field of an outer JSON envelope. Decoding that
	// envelope first un-escapes the embedded text (real quotes/newlines)
	// so the brace-matching scanner below sees valid JSON rather than a
	// doubly-escaped string. If stdout isn't a JSON envelope with a
	// text/context field (e.g. a plain-text CLI response), fall back to
	// scanning stdout directly.
	searchText := stdout.String()
	if unwrapped, ok := unwrapJSONEnvelopeText(stdout.Bytes()); ok {
		searchText = unwrapped
	}

	block, ok := extractFullArtifactJSON(searchText)
	if !ok {
		return nil, nil
	}

	var content map[string]any
	if err := json.Unmarshal(block, &content); err != nil {
		return nil, nil
	}
	return content, nil
}

// unwrapJSONEnvelopeText decodes raw as a JSON object and returns its "text"
// field, falling back to "context" if "text" is empty, un-escaping any
// embedded quotes/newlines in the process. Returns ("", false) if raw isn't
// a JSON object or neither field is populated, so callers can fall back to
// treating raw itself as the search text.
func unwrapJSONEnvelopeText(raw []byte) (string, bool) {
	var envelope struct {
		Text    string `json:"text"`
		Context string `json:"context"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return "", false
	}
	if envelope.Text != "" {
		return envelope.Text, true
	}
	if envelope.Context != "" {
		return envelope.Context, true
	}
	return "", false
}

// extractFullArtifactJSON locates the last occurrence of fullArtifactMarker
// in output (the block is documented as "trailing", and later occurrences
// win over any incidental earlier mention of the marker text), then scans
// forward for the first "{" and its balanced closing "}" using a simple
// brace-counting scanner that tracks JSON string literals (so braces inside
// string values don't throw off the balance). Returns (nil, false) if the
// marker or a balanced JSON object cannot be found.
func extractFullArtifactJSON(output string) ([]byte, bool) {
	markerIdx := strings.LastIndex(output, fullArtifactMarker)
	if markerIdx == -1 {
		return nil, false
	}
	rest := output[markerIdx+len(fullArtifactMarker):]

	start := strings.IndexByte(rest, '{')
	if start == -1 {
		return nil, false
	}

	depth := 0
	inString := false
	escaped := false
	end := -1
	for i := start; i < len(rest); i++ {
		c := rest[i]
		if inString {
			switch {
			case escaped:
				escaped = false
			case c == '\\':
				escaped = true
			case c == '"':
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				end = i
			}
		}
		if end != -1 {
			break
		}
	}
	if end == -1 {
		return nil, false
	}
	return []byte(rest[start : end+1]), true
}

// extractBuiltinIDs parses raw JSON, locates the id list under one of
// listKeys (or accepts a bare top-level array), and returns the ids of
// entries whose source label (checked under sourceKeys) indicates a built-in
// origin. Malformed entries are skipped rather than failing the whole
// extraction. Returns nil if the JSON doesn't parse or no matching list is
// found — callers treat that identically to "zero built-in ids".
func extractBuiltinIDs(data []byte, listKeys, idKeys, sourceKeys []string) []string {
	var top any
	if err := json.Unmarshal(data, &top); err != nil {
		return nil
	}

	list := findEntryList(top, listKeys)
	if list == nil {
		return nil
	}

	var ids []string
	seen := make(map[string]bool, len(list))
	for _, entryAny := range list {
		entry, ok := entryAny.(map[string]any)
		if !ok {
			continue
		}
		source := firstStringField(entry, sourceKeys)
		if !isBuiltinSource(source) {
			continue
		}
		id := firstStringField(entry, idKeys)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids
}

// findEntryList locates the array of entries within a decoded JSON value,
// accepting either a bare top-level array or an object with the list under
// one of listKeys.
func findEntryList(top any, listKeys []string) []any {
	switch v := top.(type) {
	case []any:
		return v
	case map[string]any:
		for _, key := range listKeys {
			if val, ok := v[key]; ok {
				if arr, ok := val.([]any); ok {
					return arr
				}
			}
		}
	}
	return nil
}

// firstStringField returns the first non-empty string value found under any
// of keys in entry.
func firstStringField(entry map[string]any, keys []string) string {
	for _, key := range keys {
		if val, ok := entry[key]; ok {
			if s, ok := val.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

// isBuiltinSource reports whether a source/origin label denotes a built-in
// artifact, accepting both documented spellings ("builtin" and "built-in")
// case-insensitively.
func isBuiltinSource(source string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(source, "-", ""))
	return normalized == "builtin"
}
