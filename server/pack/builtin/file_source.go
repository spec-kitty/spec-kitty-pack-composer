package builtin

import (
	"log"
	"os"
	"path/filepath"

	"github.com/spec-kitty/pack-composer/server/pack"
)

// knownSubdirs enumerates the built-in doctrine subdirectories that this WP
// scans directly via pack.Scan/pack.ParseAll. pack.Scan already classifies
// each file's artifact type from its filename suffix (e.g. .tactic.yaml),
// so no per-subdir type mapping is needed here. This list is intentionally
// exact and closed: do not add directives/built-in/, agent_profiles/built-in/,
// templates/, or glossary/ here — those are either sourced via WP02's
// CLI-JSON path or explicitly out of scope for this mission.
//
// If the installed doctrine package's layout changes in a future spec-kitty
// release, see research.md R5 in this mission's spec for the rationale
// behind this exact subdirectory list before updating it.
var knownSubdirs = []string{
	"tactics/built-in",
	"procedures/built-in",
	"styleguides/built-in",
	"toolguides/built-in",
	"missions/built_in_step_contracts",
}

// resolveDoctrineDirFn is overridable in tests so SourceFileScanArtifacts can
// be exercised against fixture trees without a real spec-kitty/doctrine
// install (same seam pattern as lookPathFn/commandFactoryFn in interpreter.go).
var resolveDoctrineDirFn = ResolveDoctrineDir

// StubResolveDoctrineDirFn overrides resolveDoctrineDirFn for tests. Call the
// returned restore func to reset.
func StubResolveDoctrineDirFn(fn func() (string, error)) (restore func()) {
	prev := resolveDoctrineDirFn
	resolveDoctrineDirFn = fn
	return func() { resolveDoctrineDirFn = prev }
}

// scanBuiltinSubdir scans a single known built-in subdirectory (relDir,
// relative to doctrineDir) using the existing pack scanner/parser. A missing
// subdirectory is not an error: it returns (nil, nil) so callers can treat
// "this install doesn't have this content type" gracefully.
func scanBuiltinSubdir(doctrineDir, relDir string) ([]pack.ParsedArtifact, error) {
	dir := filepath.Join(doctrineDir, filepath.FromSlash(relDir))

	if _, err := os.Stat(dir); err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	files, err := pack.Scan(dir)
	if err != nil {
		return nil, err
	}

	artifacts, err := pack.ParseAll(dir, files)
	if err != nil {
		return nil, err
	}

	// Prefix SourceRelativePath with the type-specific subdir so artifacts
	// from different known subdirs can never collide on identity, even
	// though pack.ParseAll itself returns paths relative to `dir`.
	for i := range artifacts {
		artifacts[i].SourceRelativePath = relDir + "/" + artifacts[i].SourceRelativePath
	}
	return artifacts, nil
}

// SourceFileScanArtifacts aggregates artifacts from every known built-in
// subdirectory of the installed doctrine package. It has no error return —
// mirroring cli_source.go's SourceCLIArtifacts shape — because any failure
// anywhere in this pipeline (spec-kitty not on PATH, unreadable shebang,
// interpreter invocation failure, doctrine package not importable, a known
// subdirectory missing) must degrade to an empty result rather than block
// server startup.
func SourceFileScanArtifacts() []pack.ParsedArtifact {
	doctrineDir, err := resolveDoctrineDirFn()
	if err != nil {
		log.Printf("builtin file-scan sourcing skipped: %v", err)
		return nil
	}

	var out []pack.ParsedArtifact
	for _, relDir := range knownSubdirs {
		artifacts, err := scanBuiltinSubdir(doctrineDir, relDir)
		if err != nil {
			log.Printf("builtin file-scan sourcing: skipping subdir %q: %v", relDir, err)
			continue
		}
		out = append(out, artifacts...)
	}
	return out
}
