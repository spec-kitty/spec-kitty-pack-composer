# Pack Composer

> [!WARNING]
> This project is under active development. Expect breaking changes, missing features, and rough edges.

Pack Composer is a tool for managing and visualizing [Spec Kitty](https://github.com) doctrine packs. It lets you view, adjust, build, import, and export packs from a self-hostable instance — useful for organizational collaboration or local development.

The project has two parts:

- **`server/`** — a Go-extended [PocketBase](https://pocketbase.io/) backend that stores pack metadata and exposes import/refresh/export/remove APIs.
- **`web-ui/`** — an [Angular](https://angular.dev/) frontend for browsing and managing packs.

## Prerequisites

- [Go](https://go.dev/) 1.23+
- [Node.js](https://nodejs.org/) and npm
- [Spec Kitty CLI](https://github.com) on `PATH` (only required for export/validate flows)

## Running locally

### 1. Start the server

```bash
cd server
go run . serve
```

By default, the API is served at `http://127.0.0.1:8090/api/` and an admin dashboard at `http://127.0.0.1:8090/_/`.

### 2. Start the web UI

```bash
cd web-ui
npm install
npm start
```

Open `http://localhost:4200/` in your browser. The UI is configured to talk to the server running on `localhost:8090`.

## Notes

- The server currently runs without authentication and is intended for localhost or trusted-network use only.
- See `server/README.md` for backend API details and `web-ui/README.md` for frontend tooling.
