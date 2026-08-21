package charter

import (
	"archive/zip"
	"bytes"
	"fmt"
)

// bundleZipEntries is the fixed name/content order archived by ZipBundle,
// matching the real Spec-Kitty project's .kittify/charter/ layout so a
// maintainer can extract the zip straight into an existing project.
func bundleZipEntries(bundle *CharterBundle) []struct {
	name    string
	content []byte
} {
	return []struct {
		name    string
		content []byte
	}{
		{"charter.md", bundle.CharterMD},
		{"governance.yaml", bundle.GovernanceYAML},
		{"directives.yaml", bundle.DirectivesYAML},
		{"metadata.yaml", bundle.MetadataYAML},
	}
}

// ZipBundle archives bundle's four files under a .kittify/charter/ prefix
// into an in-memory ZIP archive suitable for a file-download response.
// A zero-enabled-items bundle (WP05's edge case) still produces a valid,
// non-empty zip, since AssembleBundle always emits non-empty file bytes.
func ZipBundle(bundle *CharterBundle) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, entry := range bundleZipEntries(bundle) {
		w, err := zw.Create(".kittify/charter/" + entry.name)
		if err != nil {
			return nil, fmt.Errorf("charter zip: create %s: %w", entry.name, err)
		}
		if _, err := w.Write(entry.content); err != nil {
			return nil, fmt.Errorf("charter zip: write %s: %w", entry.name, err)
		}
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("charter zip: close: %w", err)
	}
	return buf.Bytes(), nil
}
