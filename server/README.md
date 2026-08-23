# Pack Composer server (PocketBase)

Go-extended PocketBase binary that hosts pack metadata collections and (later) custom import/refresh/export/remove routes.

## Prerequisites

- Go 1.23+
- [Spec Kitty CLI](https://github.com) on `PATH` — required by later work packages for `spec-kitty doctrine pack validate` during export/validate flows. Not needed just to start the API.

## Run

From this directory:

```bash
go run . serve
```

Defaults:

| Setting | Value |
|---|---|
| HTTP bind | `127.0.0.1:8090` (override with `--http`) |
| Data directory | `./pb_data` (created on first run) |
| Dashboard | `http://127.0.0.1:8090/_/` |
| REST API | `http://127.0.0.1:8090/api/` |

Examples:

```bash
# Custom bind
go run . serve --http=127.0.0.1:8090

# Build a static binary
go build -o pack-composer-server .
./pack-composer-server serve
```

## CORS (Angular UI)

The server allows the Angular dev origins used by the PocketBase JS SDK:

- `http://localhost:4200`
- `http://127.0.0.1:4200`

To allow additional origins at serve time:

```bash
go run . serve --origins=http://localhost:4200,http://127.0.0.1:4200,https://example.com
```

Note: the OnServe hook re-binds CORS to the Angular localhost origins above; prefer changing `main.go` if you need a permanent origin list.

## Collections

On bootstrap the app ensures these collections exist (open for local single-user use — no auth this mission):

- `packs` — unique `source_path`
- `pack_artifacts` — relation to `packs` with cascade delete; unique `(pack, source_relative_path)`
- `pack_version_history` — relation to `packs` with cascade delete

## Custom pack routes

Mounted under `/api/packs` (see `kitty-specs/pack-management-01KZV7CG/contracts/packs-api.yaml`):

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/packs/import` | Body `{ "source_path": "..." }`. Upserts by absolute `source_path` (same path refreshes the existing pack — research R8). Rejects zero artifacts with 400. |
| `POST` | `/api/packs/{id}/refresh` | Re-scan recorded path; concurrent refresh/export → 409. Answers disk freshness, not upstream freshness — see Provenance. |
| `POST` | `/api/packs/{id}/export` | Validate then ZIP (ZIP always returned when zip succeeds). Headers: `X-Pack-Validation-Status`, optional `X-Pack-Validation-Errors`. Missing Spec Kitty CLI → 503. |
| `DELETE` | `/api/packs/{id}` | Optional body `{ "delete_files": true }` only for `origin=local`. |

## Provenance

`refresh` answers one freshness question: has the file at the recorded path
changed. It does not answer whether an artifact still matches the document it
was written from, because nothing on the artifact recorded that document.

Each artifact now carries `provenance_status` and a `provenance` payload,
populated on import and refresh from the canonical sidecar Spec Kitty already
writes at `<artifact_dir>/.provenance/<artifact_id>.yaml`.

| Status | Meaning |
|---|---|
| `authored` | The artifact is itself the source of truth. No upstream document exists, so there is nothing to be stale against. This is the expected answer for hand-written doctrine and is **not** a defect. |
| `declared` | A sidecar records what the artifact was derived from, so staleness is answerable. |
| `undeclared` | The artifact claims derivation in its own body but no sidecar records from what. This is the one state that is a defect. |

Sidecars are matched on the `artifact_id` inside the YAML body, not on the
filename. The writer sanitizes filenames because ids can contain path
separators and colons, so the body is the only lossless key.

Sidecar directories are never ingested as artifacts. This is enforced
explicitly, because the scanner classifies every file under `templates/**` and
`glossary/**` as an artifact, so a `.provenance/` directory beneath either root
would otherwise be stored as pack content.

Records written before these fields existed keep an empty status until their
pack is next imported or refreshed. Nothing has read a sidecar for them yet, and
guessing would be worse than saying so.

## Security note

Collections are intentionally open (no auth). Bind to localhost or a trusted network only.
