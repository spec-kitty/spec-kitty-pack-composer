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
| `POST` | `/api/packs/{id}/refresh` | Re-scan recorded path; concurrent refresh/export → 409. |
| `POST` | `/api/packs/{id}/export` | Validate then ZIP (ZIP always returned when zip succeeds). Headers: `X-Pack-Validation-Status`, optional `X-Pack-Validation-Errors`. Missing Spec Kitty CLI → 503. |
| `DELETE` | `/api/packs/{id}` | Optional body `{ "delete_files": true }` only for `origin=local`. |

## Security note

Collections are intentionally open (no auth). Bind to localhost or a trusted network only.
