package pack

// BuildStats aggregates artifact counts for the Stats sidebar card.
func BuildStats(artifacts []ParsedArtifact) Stats {
	byType := map[string]int{
		string(ArtifactDirective):           0,
		string(ArtifactTactic):              0,
		string(ArtifactProcedure):           0,
		string(ArtifactStyleguide):          0,
		string(ArtifactToolguide):           0,
		string(ArtifactProfile):             0,
		string(ArtifactMissionStepContract): 0,
		string(ArtifactTemplate):            0,
		string(ArtifactGlossary):            0,
	}
	for _, a := range artifacts {
		key := string(a.ArtifactType)
		byType[key]++
	}
	return Stats{
		Total:  len(artifacts),
		ByType: byType,
	}
}

// BuildRawSnapshot assembles a JSON-serializable structure for the Raw tab.
func BuildRawSnapshot(meta PackMetadata, artifacts []ParsedArtifact) map[string]any {
	list := make([]map[string]any, 0, len(artifacts))
	for _, a := range artifacts {
		entry := map[string]any{
			"artifact_type":        a.ArtifactType,
			"artifact_id":          a.ArtifactID,
			"name":                 a.Name,
			"parse_ok":             a.ParseOK,
			"source_relative_path": a.SourceRelativePath,
			"content":              a.Content,
		}
		if a.Category != "" {
			entry["category"] = a.Category
		}
		if a.ParseError != "" {
			entry["parse_error"] = a.ParseError
		}
		if len(a.Roles) > 0 {
			entry["roles"] = a.Roles
		}
		if len(a.DomainKeywords) > 0 {
			entry["domain_keywords"] = a.DomainKeywords
		}
		list = append(list, entry)
	}

	links := make([]map[string]string, 0, len(meta.Links))
	for _, l := range meta.Links {
		links = append(links, map[string]string{"label": l.Label, "url": l.URL})
	}

	out := map[string]any{
		"name":        meta.Name,
		"description": meta.Description,
		"version":     meta.Version,
		"links":       links,
		"stats":       BuildStats(artifacts),
		"artifacts":   list,
	}
	if meta.ProjectKey != "" {
		out["project_key"] = meta.ProjectKey
	}
	return out
}
