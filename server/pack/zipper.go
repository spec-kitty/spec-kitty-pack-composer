package pack

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// ZipPack archives the contents of sourcePath using relative paths.
// Returns the ZIP bytes. Skips junk like .DS_Store and .git.
func ZipPack(sourcePath string) ([]byte, error) {
	root, err := filepath.Abs(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("pack zip: resolve path: %w", err)
	}
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("pack zip: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("pack zip: %s is not a directory", root)
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		name := d.Name()
		if d.IsDir() {
			if name == ".git" || name == "node_modules" || name == "__pycache__" {
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
		if rel == "." || strings.HasPrefix(rel, "../") {
			return nil
		}

		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()

		w, err := zw.Create(rel)
		if err != nil {
			return err
		}
		if _, err := io.Copy(w, f); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		_ = zw.Close()
		return nil, fmt.Errorf("pack zip: walk: %w", err)
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("pack zip: close: %w", err)
	}
	return buf.Bytes(), nil
}
