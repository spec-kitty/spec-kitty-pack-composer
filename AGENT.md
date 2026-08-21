# Agent guidelines

- Do not commit personal or machine-local paths (home directories, absolute host paths, user-specific locations). Chat replies may mention them; commits and public documentation must not.
- Do not introduce company-specific names, branding, or internal rules anywhere in this repository.
- Stay inside the project directory unless the user explicitly gives another path. Do not embed outside-project paths in commits or public documentation.
- Treat paths outside the project as read-only. Ask before writing or changing anything there.
- Keep guidance and examples platform-neutral (macOS, Linux, Windows). Prefer portable path forms (forward slashes or path helpers), not OS-specific examples.
- Exceptions to these rules must be documented here with a rationale. None at present.
