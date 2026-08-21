// Package builtin sources the built-in pack's artifacts.
//
// This file (cli_source.go, WP02) covers the CLI-JSON half: built-in
// directives and agent profiles fetched via the spec-kitty CLI. The
// file-scan half (interpreter.go / file_source.go, WP03) lands separately in
// this same package.
package builtin

import (
	"github.com/spec-kitty/pack-composer/server/cli"
	"github.com/spec-kitty/pack-composer/server/pack"
)

// SourceCLIArtifacts enumerates built-in directives and agent profiles via
// the spec-kitty CLI (server/cli's ListBuiltinDirectiveIDs/ListBuiltinProfileIDs
// and FetchDirectiveContent/FetchProfileContent) and maps the results into
// pack.ParsedArtifact values.
//
// This function has no error return by design: per research.md R6, any
// failure anywhere in the CLI-sourcing pipeline (CLI missing, non-zero exit,
// unexpected output shape, an individual artifact unreachable) must degrade
// to that artifact simply being absent from the result, never an error or
// panic that could block WP04's bootstrap. Artifacts that can't be fetched
// are omitted entirely rather than added as ParseOK: false stubs, since an
// unreachable built-in artifact is "not populated," not a parse error to
// surface in the UI.
func SourceCLIArtifacts() []pack.ParsedArtifact {
	var artifacts []pack.ParsedArtifact

	directiveIDs, _ := cli.ListBuiltinDirectiveIDs()
	for _, id := range directiveIDs {
		content, err := cli.FetchDirectiveContent(id)
		if err != nil || content == nil {
			continue
		}
		artifacts = append(artifacts, pack.ParsedArtifact{
			ArtifactType:       pack.ArtifactDirective,
			ArtifactID:         id,
			Name:               nameFromContent(content, id),
			ParseOK:            true,
			Content:            content,
			SourceRelativePath: "builtin://directive/" + id,
		})
	}

	profileIDs, _ := cli.ListBuiltinProfileIDs()
	for _, id := range profileIDs {
		content, err := cli.FetchProfileContent(id)
		if err != nil || content == nil {
			continue
		}
		artifacts = append(artifacts, pack.ParsedArtifact{
			ArtifactType:       pack.ArtifactProfile,
			ArtifactID:         id,
			Name:               nameFromContent(content, id),
			ParseOK:            true,
			Content:            content,
			SourceRelativePath: "builtin://profile/" + id,
		})
	}

	return artifacts
}

// nameFromContent derives a display name defensively from a fetched
// artifact's content map, since the real CLI's field names are not
// guaranteed to follow a rigid schema. Falls back to the artifact id.
func nameFromContent(content map[string]any, id string) string {
	for _, key := range []string{"name", "title", "id"} {
		if v, ok := content[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return id
}
