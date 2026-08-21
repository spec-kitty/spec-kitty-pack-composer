package charter

import (
	"archive/zip"
	"bytes"
	"io"
	"testing"
	"time"
)

func readZipEntry(t *testing.T, zr *zip.Reader, name string) []byte {
	t.Helper()
	f, err := zr.Open(name)
	if err != nil {
		t.Fatalf("open %s: %v", name, err)
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return data
}

func TestZipBundleRoundTrip(t *testing.T) {
	bundle, err := AssembleBundle("Charter A", oneItemPerKind(), time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("AssembleBundle: %v", err)
	}

	zipBytes, err := ZipBundle(bundle)
	if err != nil {
		t.Fatalf("ZipBundle: %v", err)
	}
	if len(zipBytes) == 0 {
		t.Fatal("ZipBundle returned empty bytes")
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}

	wantNames := map[string][]byte{
		".kittify/charter/charter.md":      bundle.CharterMD,
		".kittify/charter/governance.yaml": bundle.GovernanceYAML,
		".kittify/charter/directives.yaml": bundle.DirectivesYAML,
		".kittify/charter/metadata.yaml":   bundle.MetadataYAML,
	}
	if len(zr.File) != len(wantNames) {
		t.Fatalf("zip has %d entries, want exactly %d", len(zr.File), len(wantNames))
	}

	for name, want := range wantNames {
		got := readZipEntry(t, zr, name)
		if !bytes.Equal(got, want) {
			t.Errorf("entry %s content mismatch:\ngot:  %q\nwant: %q", name, got, want)
		}
	}
}

func TestZipBundleZeroItemsStillNonEmpty(t *testing.T) {
	bundle, err := AssembleBundle("Charter Empty", nil, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("AssembleBundle: %v", err)
	}

	zipBytes, err := ZipBundle(bundle)
	if err != nil {
		t.Fatalf("ZipBundle: %v", err)
	}
	if len(zipBytes) == 0 {
		t.Fatal("zero-enabled-items bundle must still produce a non-empty zip")
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	if len(zr.File) != 4 {
		t.Fatalf("zip has %d entries, want exactly 4", len(zr.File))
	}
	md := readZipEntry(t, zr, ".kittify/charter/charter.md")
	if len(md) == 0 {
		t.Error("charter.md entry must not be empty even with zero items")
	}
}
