package pack

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// suffix → artifact type for Spec Kitty filename conventions (R7).
var typedSuffixes = []struct {
	suffix string
	typ    ArtifactType
}{
	{".directive.yaml", ArtifactDirective},
	{".tactic.yaml", ArtifactTactic},
	{".procedure.yaml", ArtifactProcedure},
	{".styleguide.yaml", ArtifactStyleguide},
	{".toolguide.yaml", ArtifactToolguide},
	{".agent.yaml", ArtifactProfile},
	{".step-contract.yaml", ArtifactMissionStepContract},
}

var skipBasenames = map[string]struct{}{
	".DS_Store": {},
	"Thumbs.db": {},
}

// Scan walks sourcePath recursively and returns recognizable artifact files.
// An empty list is a valid "no artifacts" signal for upstream import rejection.
func Scan(sourcePath string) ([]ScannedFile, error) {
	root, err := filepath.Abs(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("pack scan: resolve path: %w", err)
	}
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("pack scan: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("pack scan: %s is not a directory", root)
	}

	var out []ScannedFile
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		name := d.Name()
		if d.IsDir() {
			if name == ".git" || name == "node_modules" || name == "__pycache__" {
				return filepath.SkipDir
			}
			// Sidecars are metadata about artifacts, never artifacts. This has
			// to be explicit: classify() treats every file under templates/**
			// and glossary/** as an artifact, so an unskipped .provenance
			// directory under either root would be ingested as content.
			if isProvenanceDir(d) {
				return filepath.SkipDir
			}
			return nil
		}
		if _, skip := skipBasenames[name]; skip {
			return nil
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)

		if typ, ok := classify(rel); ok {
			out = append(out, ScannedFile{RelativePath: rel, ArtifactType: typ})
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("pack scan: walk: %w", err)
	}
	return out, nil
}

func classify(relSlash string) (ArtifactType, bool) {
	base := filepath.Base(relSlash)
	lowerBase := strings.ToLower(base)
	for _, s := range typedSuffixes {
		if strings.HasSuffix(lowerBase, s.suffix) {
			return s.typ, true
		}
	}

	// templates/** and glossary/** (any file under those roots)
	parts := strings.Split(relSlash, "/")
	if len(parts) >= 2 {
		switch strings.ToLower(parts[0]) {
		case "templates":
			return ArtifactTemplate, true
		case "glossary":
			return ArtifactGlossary, true
		}
	}
	return "", false
}
