package cli

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// scriptCommandFactory returns a commandFactory stub that ignores the real
// args and always runs the given shell script (mirrors validate_test.go's
// pattern of faking `spec-kitty` output via a small shell script).
func scriptCommandFactory(script string) func(name string, args ...string) *exec.Cmd {
	return func(name string, args ...string) *exec.Cmd {
		return exec.Command(script)
	}
}

func writeScript(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "fake-spec-kitty.sh")
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func stubCLIFound(t *testing.T) {
	t.Helper()
	restore := StubLookPath(func(string) (string, error) { return "/usr/bin/spec-kitty", nil })
	t.Cleanup(restore)
}

func stubCLIMissing(t *testing.T) {
	t.Helper()
	restore := StubLookPath(func(string) (string, error) { return "", errors.New("not found") })
	t.Cleanup(restore)
}

// --- ListBuiltinDirectiveIDs / ListBuiltinProfileIDs ---

// Regression: `spec-kitty charter context --json` rejects the call unless
// either --action or --include is supplied ("--action is required unless
// --include is provided."). ListBuiltinDirectiveIDs must always pass
// --action so the command doesn't fail before ever reaching the CLI's
// directive-listing logic.
func TestListBuiltinDirectiveIDsPassesActionFlag(t *testing.T) {
	stubCLIFound(t)
	var capturedArgs []string
	restore := StubCommandFactory(func(name string, args ...string) *exec.Cmd {
		capturedArgs = args
		return scriptCommandFactory(writeScript(t, `#!/bin/sh
echo '{"all_directives": []}'
`))(name, args...)
	})
	t.Cleanup(restore)

	if _, err := ListBuiltinDirectiveIDs(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	hasAction := false
	for _, a := range capturedArgs {
		if a == "--action" {
			hasAction = true
		}
	}
	if !hasAction {
		t.Fatalf("expected --action flag in args, got %v", capturedArgs)
	}
}

func TestListBuiltinDirectiveIDsFiltersBySpellingAndSource(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
cat <<'EOF'
{
  "all_directives": [
    {"id": "DIRECTIVE_001", "source": "builtin"},
    {"id": "DIRECTIVE_002", "source": "built-in"},
    {"id": "DIRECTIVE_003", "source": "BUILTIN"},
    {"id": "DIRECTIVE_004", "source": "project"},
    {"id": "DIRECTIVE_005"},
    {"not_an_id": "oops", "source": "builtin"}
  ]
}
EOF
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	ids, err := ListBuiltinDirectiveIDs()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]bool{"DIRECTIVE_001": true, "DIRECTIVE_002": true, "DIRECTIVE_003": true}
	if len(ids) != len(want) {
		t.Fatalf("want %d ids, got %v", len(want), ids)
	}
	for _, id := range ids {
		if !want[id] {
			t.Errorf("unexpected id in result: %s", id)
		}
	}
}

func TestListBuiltinProfileIDsFiltersBySpellingAndSource(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
cat <<'EOF'
{
  "profiles": [
    {"id": "implementer-ivan", "source": "built-in"},
    {"id": "architect-alphonso", "source": "builtin"},
    {"id": "custom-profile", "source": "project"}
  ]
}
EOF
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	ids, err := ListBuiltinProfileIDs()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]bool{"implementer-ivan": true, "architect-alphonso": true}
	if len(ids) != len(want) {
		t.Fatalf("want %d ids, got %v", len(want), ids)
	}
	for _, id := range ids {
		if !want[id] {
			t.Errorf("unexpected id in result: %s", id)
		}
	}
}

func TestListBuiltinDirectiveIDsUnexpectedShapeReturnsEmptyNoError(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
echo '{"something_else": true}'
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	ids, err := ListBuiltinDirectiveIDs()
	if err != nil {
		t.Fatalf("want nil error, got %v", err)
	}
	if len(ids) != 0 {
		t.Fatalf("want zero ids, got %v", ids)
	}
}

func TestListBuiltinDirectiveIDsInvalidJSONReturnsEmptyNoError(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
echo 'not json at all'
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	ids, err := ListBuiltinDirectiveIDs()
	if err != nil {
		t.Fatalf("want nil error, got %v", err)
	}
	if len(ids) != 0 {
		t.Fatalf("want zero ids, got %v", ids)
	}
}

func TestListBuiltinDirectiveIDsNonZeroExitReturnsEmptyNoError(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
echo '{"all_directives": [{"id": "X", "source": "builtin"}]}'
exit 1
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	ids, err := ListBuiltinDirectiveIDs()
	if err != nil {
		t.Fatalf("want nil error, got %v", err)
	}
	if len(ids) != 0 {
		t.Fatalf("want zero ids on non-zero exit, got %v", ids)
	}
}

func TestListBuiltinDirectiveIDsCLIMissing(t *testing.T) {
	stubCLIMissing(t)

	ids, err := ListBuiltinDirectiveIDs()
	if !errors.Is(err, ErrCLINotInstalled) {
		t.Fatalf("want ErrCLINotInstalled, got %v", err)
	}
	if ids != nil {
		t.Errorf("want nil ids, got %v", ids)
	}
}

func TestListBuiltinProfileIDsCLIMissing(t *testing.T) {
	stubCLIMissing(t)

	ids, err := ListBuiltinProfileIDs()
	if !errors.Is(err, ErrCLINotInstalled) {
		t.Fatalf("want ErrCLINotInstalled, got %v", err)
	}
	if ids != nil {
		t.Errorf("want nil ids, got %v", ids)
	}
}

// --- ResolveCLIVersion ---

func TestResolveCLIVersionParsesVersionLine(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
cat <<'EOF'
                      Spec Kitty - Spec-Driven Development Toolkit
                                     v3.2.5

spec-kitty-cli version 3.2.5
EOF
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	version, err := ResolveCLIVersion()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if version != "3.2.5" {
		t.Fatalf("got %q, want %q", version, "3.2.5")
	}
}

func TestResolveCLIVersionUnexpectedOutputReturnsEmptyNoError(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
echo 'not the expected format'
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	version, err := ResolveCLIVersion()
	if err != nil {
		t.Fatalf("want nil error, got %v", err)
	}
	if version != "" {
		t.Fatalf("want empty version, got %q", version)
	}
}

func TestResolveCLIVersionNonZeroExitReturnsEmptyNoError(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
echo 'spec-kitty-cli version 1.0.0'
exit 1
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	version, err := ResolveCLIVersion()
	if err != nil {
		t.Fatalf("want nil error, got %v", err)
	}
	if version != "" {
		t.Fatalf("want empty version on non-zero exit, got %q", version)
	}
}

func TestResolveCLIVersionCLIMissing(t *testing.T) {
	stubCLIMissing(t)

	version, err := ResolveCLIVersion()
	if !errors.Is(err, ErrCLINotInstalled) {
		t.Fatalf("want ErrCLINotInstalled, got %v", err)
	}
	if version != "" {
		t.Errorf("want empty version, got %q", version)
	}
}

// --- FetchDirectiveContent / FetchProfileContent ---

func TestFetchDirectiveContentWellFormedBlock(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
cat <<'EOF'
Some preamble text describing the directive in prose.

Full artifact:
{"id": "DIRECTIVE_001", "title": "Example Directive", "nested": {"a": 1, "b": [1, 2, 3]}}
EOF
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	content, err := FetchDirectiveContent("DIRECTIVE_001")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if content == nil {
		t.Fatal("want non-nil content")
	}
	if content["id"] != "DIRECTIVE_001" || content["title"] != "Example Directive" {
		t.Errorf("unexpected content: %#v", content)
	}
}

func TestFetchProfileContentWellFormedBlock(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
cat <<'EOF'
Full artifact:
{"id": "implementer-ivan", "name": "Implementer Ivan"}
EOF
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	content, err := FetchProfileContent("implementer-ivan")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if content == nil || content["name"] != "Implementer Ivan" {
		t.Errorf("unexpected content: %#v", content)
	}
}

func TestFetchDirectiveContentMissingMarkerReturnsNilNilNotError(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
echo 'no marker here, just prose output'
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	content, err := FetchDirectiveContent("DIRECTIVE_001")
	if err != nil {
		t.Fatalf("want nil error, got %v", err)
	}
	if content != nil {
		t.Errorf("want nil content, got %#v", content)
	}
}

func TestFetchDirectiveContentTruncatedJSONReturnsNilNilNotPanic(t *testing.T) {
	stubCLIFound(t)
	script := writeScript(t, `#!/bin/sh
printf 'Full artifact:\n{"id": "DIRECTIVE_001", "title": "trunc'
`)
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	content, err := FetchDirectiveContent("DIRECTIVE_001")
	if err != nil {
		t.Fatalf("want nil error, got %v", err)
	}
	if content != nil {
		t.Errorf("want nil content, got %#v", content)
	}
}

func TestFetchDirectiveContentCLIMissing(t *testing.T) {
	stubCLIMissing(t)

	content, err := FetchDirectiveContent("DIRECTIVE_001")
	if !errors.Is(err, ErrCLINotInstalled) {
		t.Fatalf("want ErrCLINotInstalled, got %v", err)
	}
	if content != nil {
		t.Errorf("want nil content, got %#v", content)
	}
}

// Regression: with --json, the real CLI wraps its rendered output (marker +
// trailing JSON block) inside a "text" field of an outer JSON envelope, so
// every quote/newline in that block is escaped once more than a naive
// brace-matching scan over raw stdout expects. FetchDirectiveContent must
// unwrap the envelope's "text" field before scanning for the marker.
func TestFetchDirectiveContentUnwrapsJSONEnvelope(t *testing.T) {
	stubCLIFound(t)
	// json.Marshal-style escaping of a "text" value that itself contains
	// the marker followed by a nested JSON object, mirroring real CLI output.
	envelope := `{"result": "success", "text": "Directive DIRECTIVE_001: Example\nFull artifact:\n{\"id\": \"DIRECTIVE_001\", \"title\": \"Example Directive\", \"nested\": {\"a\": 1}}\n"}`
	script := writeScript(t, "#!/bin/sh\ncat <<'SCRIPTEOF'\n"+envelope+"\nSCRIPTEOF\n")
	restore := StubCommandFactory(scriptCommandFactory(script))
	t.Cleanup(restore)

	content, err := FetchDirectiveContent("DIRECTIVE_001")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if content == nil {
		t.Fatal("want non-nil content")
	}
	if content["id"] != "DIRECTIVE_001" || content["title"] != "Example Directive" {
		t.Errorf("unexpected content: %#v", content)
	}
}

func TestFetchProfileContentCLIMissing(t *testing.T) {
	stubCLIMissing(t)

	content, err := FetchProfileContent("implementer-ivan")
	if !errors.Is(err, ErrCLINotInstalled) {
		t.Fatalf("want ErrCLINotInstalled, got %v", err)
	}
	if content != nil {
		t.Errorf("want nil content, got %#v", content)
	}
}

// --- extractFullArtifactJSON (unit-tested in isolation from process exec) ---

func TestExtractFullArtifactJSONNestedBraces(t *testing.T) {
	output := "prose\nFull artifact:\n" + `{"a": {"b": {"c": 1}}, "d": "text with { and } braces"}` + "\ntrailer"
	block, ok := extractFullArtifactJSON(output)
	if !ok {
		t.Fatal("expected ok=true")
	}
	want := `{"a": {"b": {"c": 1}}, "d": "text with { and } braces"}`
	if string(block) != want {
		t.Errorf("got %q, want %q", string(block), want)
	}
}

func TestExtractFullArtifactJSONMarkerAppearsMoreThanOnce(t *testing.T) {
	output := "Full artifact: not really, this is prose mentioning the phrase.\n" +
		"Full artifact:\n" + `{"real": true}`
	block, ok := extractFullArtifactJSON(output)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if string(block) != `{"real": true}` {
		t.Errorf("got %q, want the JSON after the last marker occurrence", string(block))
	}
}

func TestExtractFullArtifactJSONNoTrailingNewline(t *testing.T) {
	output := "Full artifact:" + `{"x": 1}`
	block, ok := extractFullArtifactJSON(output)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if string(block) != `{"x": 1}` {
		t.Errorf("got %q", string(block))
	}
}

func TestExtractFullArtifactJSONMarkerMissing(t *testing.T) {
	_, ok := extractFullArtifactJSON("no marker anywhere in this text")
	if ok {
		t.Fatal("expected ok=false when marker is absent")
	}
}

func TestExtractFullArtifactJSONNoOpeningBraceAfterMarker(t *testing.T) {
	_, ok := extractFullArtifactJSON("Full artifact:\nno json here at all")
	if ok {
		t.Fatal("expected ok=false when no '{' follows the marker")
	}
}

func TestExtractFullArtifactJSONUnbalancedBraces(t *testing.T) {
	_, ok := extractFullArtifactJSON("Full artifact:\n{\"a\": {\"b\": 1}")
	if ok {
		t.Fatal("expected ok=false for unbalanced braces")
	}
}
