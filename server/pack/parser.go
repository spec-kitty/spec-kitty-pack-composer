package pack

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ParseAll parses each scanned file. Per-file failures never abort the pack.
func ParseAll(sourcePath string, files []ScannedFile) ([]ParsedArtifact, error) {
	root, err := filepath.Abs(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("pack parse: resolve path: %w", err)
	}

	out := make([]ParsedArtifact, 0, len(files))
	for _, f := range files {
		out = append(out, parseOne(root, f))
	}
	return out, nil
}

// ParseFile parses a single artifact file relative to sourcePath.
func ParseFile(sourcePath string, file ScannedFile) (ParsedArtifact, error) {
	root, err := filepath.Abs(sourcePath)
	if err != nil {
		return ParsedArtifact{}, fmt.Errorf("pack parse: resolve path: %w", err)
	}
	return parseOne(root, file), nil
}

func parseOne(root string, file ScannedFile) ParsedArtifact {
	rel := file.RelativePath
	stem := filenameStem(rel)
	art := ParsedArtifact{
		ArtifactType:       file.ArtifactType,
		ArtifactID:         stem,
		Name:               stem,
		SourceRelativePath: rel,
		Content:            map[string]any{},
		ParseOK:            false,
	}

	abs := filepath.Join(root, filepath.FromSlash(rel))
	data, err := os.ReadFile(abs)
	if err != nil {
		art.ParseError = err.Error()
		art.Content = stubContent(rel, art.ParseError)
		return art
	}

	ext := strings.ToLower(filepath.Ext(rel))
	switch ext {
	case ".yaml", ".yml":
		content, err := decodeYAML(data)
		if err != nil {
			art.ParseError = err.Error()
			art.Content = stubContent(rel, art.ParseError)
			return art
		}
		return enrich(art, content, stem)
	case ".json":
		content, err := decodeJSON(data)
		if err != nil {
			art.ParseError = err.Error()
			art.Content = stubContent(rel, art.ParseError)
			return art
		}
		return enrich(art, content, stem)
	default:
		// Markdown / templates / other: treat as raw text, not a parse failure.
		raw := string(data)
		content := map[string]any{"raw": raw}
		if title := firstMarkdownHeading(raw); title != "" {
			art.Name = title
		}
		art.Content = content
		art.ParseOK = true
		return art
	}
}

func enrich(art ParsedArtifact, content map[string]any, stem string) ParsedArtifact {
	art.Content = content
	art.ParseOK = true
	art.ArtifactID = firstString(content, "id", "profile-id")
	if art.ArtifactID == "" {
		art.ArtifactID = stem
	}
	art.Name = firstString(content, "title", "name")
	if art.Name == "" {
		art.Name = stem
	}
	art.Category = firstString(content, "category")

	if art.ArtifactType == ArtifactProfile {
		art.Roles = stringSlice(content["roles"])
		if sc, ok := content["specialization-context"].(map[string]any); ok {
			art.DomainKeywords = stringSlice(sc["domain-keywords"])
		}
	}
	return art
}

func stubContent(path, errMsg string) map[string]any {
	return map[string]any{
		"path":  path,
		"error": errMsg,
	}
}

func decodeYAML(data []byte) (map[string]any, error) {
	var raw any
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	return normalizeMap(convertYAMLValue(raw))
}

func decodeJSON(data []byte) (map[string]any, error) {
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	return normalizeMap(convertYAMLValue(raw))
}

func normalizeMap(raw any) (map[string]any, error) {
	switch v := raw.(type) {
	case map[string]any:
		return v, nil
	case nil:
		return map[string]any{}, nil
	default:
		return map[string]any{"value": v}, nil
	}
}

func convertYAMLValue(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[k] = convertYAMLValue(val)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[fmt.Sprint(k)] = convertYAMLValue(val)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, val := range t {
			out[i] = convertYAMLValue(val)
		}
		return out
	default:
		return t
	}
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch s := v.(type) {
			case string:
				if strings.TrimSpace(s) != "" {
					return strings.TrimSpace(s)
				}
			}
		}
	}
	return ""
}

func stringSlice(v any) []string {
	switch t := v.(type) {
	case []string:
		return append([]string(nil), t...)
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
		return out
	default:
		return nil
	}
}

func filenameStem(rel string) string {
	base := filepath.Base(rel)
	lower := strings.ToLower(base)
	for _, s := range typedSuffixes {
		if strings.HasSuffix(lower, s.suffix) {
			return base[:len(base)-len(s.suffix)]
		}
	}
	ext := filepath.Ext(base)
	if ext != "" {
		return strings.TrimSuffix(base, ext)
	}
	return base
}

func firstMarkdownHeading(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") {
			h := strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
			if h != "" {
				return h
			}
		}
	}
	return ""
}
