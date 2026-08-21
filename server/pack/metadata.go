package pack

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

var (
	mdLinkRE      = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	htmlCommentRE = regexp.MustCompile(`(?s)<!--.*?-->`)
)

// ExtractMetadata reads .pack-version, org-charter, and README for pack display fields.
// Name falls back to the directory basename when README has no title.
func ExtractMetadata(sourcePath string) (PackMetadata, error) {
	root, err := filepath.Abs(sourcePath)
	if err != nil {
		return PackMetadata{}, err
	}

	meta := PackMetadata{
		Name:  filepath.Base(root),
		Links: []Link{},
	}

	if v, ok := readTrimmedFile(filepath.Join(root, ".pack-version")); ok {
		meta.Version = v
	} else if v, ok := readTrimmedFile(filepath.Join(root, "pack", ".pack-version")); ok {
		meta.Version = v
	}

	if key, ok := readProjectKey(root); ok {
		meta.ProjectKey = key
	}

	if key, ok := readParentID(root); ok {
		meta.ParentID = key
	}

	readmePath, ok := findREADME(root)
	if !ok {
		return meta, nil
	}
	data, err := os.ReadFile(readmePath)
	if err != nil {
		return meta, nil
	}
	title, desc, links := parseREADME(string(data))
	if title != "" {
		meta.Name = title
	}
	meta.Description = desc
	meta.Links = links
	return meta, nil
}

type orgCharterFile struct {
	OrgName string `yaml:"org_name"`
	Extends string `yaml:"extends"`
}

// readProjectKey loads the pack project key from org-charter.yaml `org_name`
// (pack root or pack/ subdirectory).
func readProjectKey(root string) (string, bool) {
	candidates := []string{
		filepath.Join(root, "org-charter.yaml"),
		filepath.Join(root, "pack", "org-charter.yaml"),
	}
	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var charter orgCharterFile
		if err := yaml.Unmarshal(data, &charter); err != nil {
			continue
		}
		key := strings.TrimSpace(charter.OrgName)
		if key != "" {
			return key, true
		}
	}
	return "", false
}

// readParentID loads the pack's declared parent reference from org-charter.yaml
// `extends` (pack root or pack/ subdirectory). Returns ("", false) when no
// org-charter.yaml exists or none declares a non-empty `extends` — this is the
// common, valid, non-error case (no parent declared).
func readParentID(root string) (string, bool) {
	candidates := []string{
		filepath.Join(root, "org-charter.yaml"),
		filepath.Join(root, "pack", "org-charter.yaml"),
	}
	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var charter orgCharterFile
		if err := yaml.Unmarshal(data, &charter); err != nil {
			continue
		}
		key := strings.TrimSpace(charter.Extends)
		if key != "" {
			return key, true
		}
	}
	return "", false
}

// stripHTMLComments removes Markdown/HTML comments (<!-- ... -->), including
// multi-line banner blocks common in doctrine pack READMEs.
func stripHTMLComments(raw string) string {
	return htmlCommentRE.ReplaceAllString(raw, "")
}

func readTrimmedFile(path string) (string, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	v := strings.TrimSpace(string(data))
	if v == "" {
		return "", false
	}
	return v, true
}

func findREADME(root string) (string, bool) {
	candidates := []string{"README.md", "Readme.md", "readme.md", "README.MD"}
	for _, c := range candidates {
		p := filepath.Join(root, c)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, true
		}
	}
	return "", false
}

func parseREADME(raw string) (title, description string, links []Link) {
	links = []Link{}
	cleaned := stripHTMLComments(raw)
	sc := bufio.NewScanner(strings.NewReader(cleaned))
	var bodyLines []string
	seenTitle := false
	blankAfterTitle := false

	for sc.Scan() {
		line := sc.Text()
		trimmed := strings.TrimSpace(line)

		if !seenTitle {
			if strings.HasPrefix(trimmed, "#") {
				title = strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
				seenTitle = true
				continue
			}
			if trimmed == "" {
				continue
			}
			// No heading — treat first non-empty as start of body.
			seenTitle = true
			bodyLines = append(bodyLines, trimmed)
			continue
		}

		if !blankAfterTitle {
			if trimmed == "" {
				if len(bodyLines) > 0 {
					blankAfterTitle = true
				}
				continue
			}
			bodyLines = append(bodyLines, trimmed)
			continue
		}

		// After first paragraph, keep scanning for links only.
		_ = line
	}

	description = strings.TrimSpace(strings.Join(bodyLines, " "))

	for _, m := range mdLinkRE.FindAllStringSubmatch(cleaned, -1) {
		if len(m) >= 3 {
			links = append(links, Link{Label: m[1], URL: m[2]})
		}
	}
	return title, description, links
}
