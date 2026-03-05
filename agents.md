# AGENTS.md â€” Project Blueprint for an AI Implementation Agent

> Goal: Build a Confluence-like collaborative documentation platform, focused on the features we actually use.
> **Important:** This document is intentionally implementation-oriented but **must not include source code**. It should guide an AI agent to implement the project end-to-end with high quality.

## 0. Nonâ€‘Negotiable Constraints

- **No code in this document.** The agent will produce the code.
- Target initial infra: **single VM 4 vCPU / 8 GB RAM** for ~10 concurrent users.
- Must be able to scale (see scaling section).
- Product is **Confluence-like** (linear pages, spaces, tree navigation), not Notion.
- Collaboration is **Google Docs-like**: multiple users can edit the **same paragraph/cell** simultaneously.
- The editor must support **real tables** (not fake markdown tables).
- Spaces start **empty**: no default structure, no built-in templates.
- Users can create their own templates.
- Search is **submit-only** (no typeahead) but must feel like a serious V1 feature.
- Infinite scroll is desired in search results (implemented via server-side pagination).

## 1. Functional Scope (V1)

### 1.1 Core Concepts

- **Space**: workspace for a team. Contains pages and a free-form tree.
- **Page**: linear rich-text document with headings, lists, code blocks, images, attachments, and **tables**.
- **Template**: a page flagged as a template (`isTemplate=true`). Creating a page from a template copies its content.

### 1.2 Collaboration

- Real-time co-editing with presence:
  - Multiple editors per page (typical max ~3 per page) but many pages can be edited across teams simultaneously.
  - Cursor and selection presence for each editor.
  - Reconnection must be smooth.
- Real-time collaboration is implemented per-page via **rooms**.

### 1.3 Version History (Snapshots)

- Autosave is continuous but **not visible** as a â€œversionâ€.
- Visible versions are created:
  1) Automatically every **10 minutes** if the page changed since the last version.
  2) Automatically when the **last editor leaves** a page (end of editing session).
  3) Manually via â€œCreate version nowâ€ (optional but recommended).
- Version entry shows: timestamp, actor, reason (Auto timer / Auto session end / Manual / Restore).

**Restore behavior**
- Restoring a version:
  - Replaces current content.
  - Creates a **new version** â€œRestored from version Xâ€.
  - Must be **blocked if editors are currently active** on that page.

**Retention policy** (default, configurable)
- Keep **all versions for 30 days**.
- Then compact:
  - **1 version/day for 90 days**.
  - **1 version/week thereafter** (with a max retention window configurable).

### 1.4 Search (V1 Serious)

- Submit-only search (enter + submit).
- Must support:
  - Global search and per-space search.
  - Title + body text search.
  - Filter out archived pages.
  - Ranking: title matches boosted; slight recency boost.
  - Infinite scroll UI backed by strict **cursor-based pagination**.
  - Results show: title, breadcrumb path, space, excerpt/snippet with highlighted terms.
- Must never leak pages the user cannot view.

### 1.5 Navigation & Tree

- Confluence-like left sidebar tree.
- Pages can be created as root or as child of an existing page.
- Drag & drop move is required (prevent cycles).
- Breadcrumbs on page view.

### 1.6 Links & Permalinks

- Pages have stable immutable IDs.
- URL format must be stable and not depend on tree path, e.g.:
  - `/space/<key>/pages/<pageId>-<slug>`
- Internal links should reference **pageId** (not slug), to avoid breakage.
- Support anchors to headings (H2/H3) and â€œcopy link to sectionâ€.
- **Backlinks** are desired (pages that link to this page) â€” can be V1 or early V1+.

### 1.7 Rename & Move: Redirects + Audit

- Renaming updates slug, but **old URLs must redirect** to the new canonical URL.
- Moving a page in the tree should **not** break URLs (since path not in URL).
- Both rename and move must be recorded in an **Audit Log**.

### 1.8 Attachments & Images

- Users can upload attachments and images.
- Storage:
  - Start simple (local disk or S3-compatible storage), but design must allow swapping.
- Inserting image into page should be a 2-step: upload then insert reference.

## 2. Authentication & Security

### 2.1 Auth Methods

- Support **OIDC (SSO)** and **local login**.
- **No guests**.
- Anyone who can SSO can log in (no claim-based restriction).

### 2.2 Account Linking

- If a user logs in via OIDC and a local account with the same normalized email exists, **link** them.
- Prefer refusing OIDC login if `email_verified=false` (configurable).

### 2.3 Sessions

- Access token: 15 minutes.
- Refresh: automatic from frontend.
- Refresh token stored as **HttpOnly cookie**; `Secure` when HTTPS; appropriate `SameSite`.
- Handle CSRF:
  - Prefer `SameSite=Lax` plus Origin/Referer checks and/or a CSRF token strategy.

### 2.4 WebSocket Security

- WebSocket authentication uses the same session/cookie mechanism.
- Joining a page room requires:
  - `view` permission for read-only presence
  - `edit` permission to send edits
- Must prevent any information leakage via WS events.

### 2.5 Authorization Model (Confluence-like)

- Space roles:
  - Space Admin
  - Space Editor
  - Space Viewer
- Page restrictions:
  - view restrictions (override inheritance)
  - edit restrictions (override inheritance)
- Default behavior: pages inherit from space; restrictions are optional and explicit.

## 3. Data Model (Conceptual)

The agent must implement a relational model (PostgreSQL) with these conceptual entities:

- **User**: id, email, displayName, auth identities (OIDC subject), status.
- **Space**: id, key, name, createdAt.
- **SpaceMembership**: userId, spaceId, role.
- **Page**: id, spaceId, parentId nullable, title, slug, archived bool, createdAt, updatedAt.
- **PageContent**: pageId, currentContent (ProseMirror JSON), contentText (flattened for search), updatedAt.
- **PageVersion**: id, pageId, createdAt, actorUserId, reason, snapshotContent (ProseMirror JSON), snapshotText.
- **PageRedirect**: id, pageId, oldSlug, createdAt.
- **AuditLog**: id, at, actorUserId, spaceId, pageId nullable, eventType, before/after payload.
- **Attachment**: id, spaceId, pageId nullable, uploaderUserId, filename, mimeType, size, storageKey, createdAt.
- (Optional) **LinkIndex**: fromPageId, toPageId, createdAt, updatedAt for backlinks.

Notes:
- Store the **editor canonical content** as ProseMirror JSON.
- Also store a **flattened text** representation for search indexing.

## 4. Collaboration Architecture

### 4.1 Tech Choices

- Editor: **Tiptap** (open-source core).
- Collaboration engine: **CRDT (Yjs)**.
- Real-time sync: WebSocket server (Hocuspocus-like architecture is acceptable).

### 4.2 Room Lifecycle

- One room per page.
- Keep room state in memory while at least one client is connected.
- When last client leaves:
  - Persist final state.
  - Potentially create an â€œAuto session endâ€ version.
  - Free memory.

### 4.3 Snapshot Strategy

- Persist autosave frequently enough to avoid data loss.
- Create visible versions according to rules in section 1.3.

## 5. Search Architecture

- Index on:
  - Page title
  - Flattened page text
  - (Optional V1+) headings extracted as weighted fields
- Use PostgreSQL full-text search for V1.
- Cursor-based pagination.
- Implement safe highlighting/snippets (no expensive regex per row).

## 6. API Surface (High-Level)

The agent should define REST endpoints (or equivalent) for:

- Auth: login local, OIDC callback, refresh, logout, me.
- Spaces: CRUD, membership management.
- Pages: CRUD, move, rename, archive, tree fetch, breadcrumbs.
- Content: get current, update/save, enter/leave editing session.
- Versions: list, view, restore, create manual version.
- Search: submit query with filters and cursor pagination.
- Attachments: upload, download, list for a page.
- Audit: query by space/page and date range.

## 7. UI Expectations (No code here)

- Confluence-like layout:
  - Left sidebar with space selector + page tree.
  - Main area: page view and page edit.
- Mode:
  - Default to **read mode**.
  - â€œStart editingâ€ switches to edit mode (and joins WS editing room).
- Search UI:
  - Submit-only, results in an infinite scroll list.
  - Show breadcrumbs and snippets.
- Version history UI:
  - Timeline list with restore.

## 8. Technology Stack (Required)

### 8.1 Frontend

- **Vue.js 3** application.
- Confluence-like UI layout (sidebar tree + main content).
- Runs locally via `npm run dev` (no containerized frontend dev server required).
The frontend architecture must enforce strong separation of concerns. UI components should be small, focused, and composable. Avoid large monolithic components that mix layout, business logic, state management, and side effects. Shared logic must be extracted into composables, services, or utility modules. Each component should have a single clear responsibility. Any file that grows beyond a reasonable size (e.g., 300â€“400 lines) must be refactored into smaller units. The same applies to backend services: avoid long classes with mixed responsibilities; prefer modular domain-driven design with clear boundaries between controllers, services, repositories, and infrastructure layers. Maintain readability and long-term maintainability as first-class priorities.

### 8.2 Backend

- **Node.js + TypeScript**
- **Express** (REST API)
- **Prisma** ORM
- **PostgreSQL** database
- WebSocket real-time collaboration service can live in the same backend process or as a separate process, but must be implemented in TypeScript and integrate with the same auth/session model.

### 8.3 Linting, Formatting, Tests

- Must include a **linter** for both frontend and backend.
- Must include an automated **test suite** (unit + API/integration + E2E where relevant).
- Target coverage: **>= 90%** for core domain logic and API.

## 9. Local Development & Docker (Required)

### 9.1 Environment Defaults

- Docker Compose files must use **development-friendly defaults**.
- Do **not** rely on host machine environment variables for defaults.
- All required configuration must be representable via project `.env` files.

### 9.2 `.env.example`

- Provide a **`.env.example`** containing all environment variables required by the project.
- Values must be initialized for **development defaults**.

### 9.3 `docker-compose.dev.yml`

- Provide `docker-compose.dev.yml` for **dependencies only** (e.g. PostgreSQL, object storage if needed, reverse proxy if needed).
- The **application code runs locally** using:
  - backend: `npm run dev`
  - frontend: `npm run dev`
- Compose must expose ports needed by local apps.

### 9.4 `docker-compose.yml` (Production)

- Provide `docker-compose.yml` for production, running:
  - **frontend image**
  - **backend image**
  - required dependencies (e.g. PostgreSQL, object storage if included)
- Images must be pulled from **GitHub Container Registry**:
  - owner/user: `valcriss`
  - project/repository name: `cnavluence`
- Compose must define sensible defaults (do not rely on host env).

### 9.5 `docker-compose.full.yml` (Production Full)

- Provide `docker-compose.full.yml` for production, running:
  - a **single â€œfullâ€ image** where the backend serves the frontend (static assets) + WS
  - required dependencies (e.g. PostgreSQL, object storage if included)
- This is an alternative deployment mode to simplify operations.

## 10. Operations & Observability

### 10.1 Metrics & Logs

- Required metrics:
  - Active WS connections
  - Active rooms
  - DB query latency (search and page fetch)
  - CPU/RAM
- Structured logs for:
  - auth events
  - permission errors
  - version creation/restores
  - page move/rename

### 10.2 Backups

- Postgres backups daily.
- Attachment storage backups.
- Document restore process must be tested.

## 11. Scaling Guidance

- 10 users: 1Ã— 2vCPU/4GB or 1Ã— 4vCPU/8GB (all-in-one).
- 50 users: prefer separating DB (DB 4/8) from app (2/4 or 4/8).
- 100+: separate app and DB; scale app horizontally behind LB.
- 500+: multiple app instances; DB becomes primary bottleneck; consider dedicated search later.

## 12. Quality Bar

- Use a linter and formatter.
- Provide a comprehensive test suite. Target **>= 90%** coverage for core domain and API.
- Include E2E tests for:
  - page editing (including tables)
  - version restore rules
  - permissions enforcement
  - search pagination and access control
- Security tests/validation for:
  - CSRF
  - permission leaks in search and WS

## 13. Implementation Order (Recommended)

1) Auth (local + OIDC) + session refresh cookie
2) Spaces + membership + permissions (space-level)
3) Pages CRUD + tree + stable URLs + redirects
4) Page view mode
5) Editor single-user (Tiptap, tables), persist ProseMirror JSON
6) WebSocket collab (rooms, presence), enforce permissions
7) Autosave + versions + retention + restore rules
8) Search indexing + submit-only search + infinite scroll (cursor pagination)
9) Audit log (rename/move/permissions/restore) + UI
10) Attachments

---

## Appendix A â€” Event Types (AuditLog)

- SPACE_CREATED
- SPACE_ROLE_CHANGED
- PAGE_CREATED
- PAGE_RENAMED
- PAGE_MOVED
- PAGE_ARCHIVED
- PAGE_RESTORED
- PAGE_PERMISSION_CHANGED
- PAGE_VERSION_CREATED (manual/auto)
- PAGE_VERSION_RESTORED
- ATTACHMENT_UPLOADED

## Appendix B â€” Security Notes

- Never store refresh tokens in localStorage.
- Avoid putting access tokens in WS URLs.
- Ensure search results and redirects never leak restricted pages.
- Ensure WS join rejects unauthorized users early.

