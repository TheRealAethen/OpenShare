# OpenShare — Architecture & System Design

## 1. Overview

OpenShare is a desktop application (Electron) that automates video distribution
across **TikTok**, **YouTube**, and **Instagram** from a single gallery per
profile. The goal is to let a content owner publish the same clip to multiple
platforms while respecting each platform's daily limits and allowing future
scheduling.

Key design principles:

- **Separation of concerns** — the Electron main process owns all platform
  secrets and network I/O; the renderer never touches credentials directly.
- **Security by isolation** — `contextIsolation` is enabled and the renderer
  only talks to the main process through a controlled `contextBridge` API.
- **Per-profile isolation** — each profile has its own folder, metadata, and
  OAuth tokens, so multiple brands/accounts can coexist.
- **Resumable daily runs** — a per-profile daily quota is tracked in persistent
  store so runs can be safely re-invoked across days.
- **Pluggable platform adapters** — upload logic is isolated behind a uniform
  adapter interface so each platform can evolve independently and be tested in
  isolation (see EPIC-003 / EPIC-004).

> This document is the architectural source of truth referenced by `AGENTS.md` and
> the GitHub Issues. Any change that alters these boundaries must update this file
> in the **same PR** that introduces the change.

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Renderer (UI)                         │
│  index.html · renderer.js · styles.css                       │
│  Views: Home | Files | Schedule | Settings                   │
└───────────────┬─────────────────────────────────────────────┘
                │  window.api (contextBridge)
┌───────────────▼─────────────────────────────────────────────┐
│                      Preload (preload.js)                    │
│  exposes ipcRenderer.invoke / onProgress as window.api       │
└───────────────┬─────────────────────────────────────────────┘
                │  IPC (invoke / handle)
┌───────────────▼─────────────────────────────────────────────┐
│                     Main Process (main.js)                   │
│  - Window lifecycle & webPreferences                         │
│  - Profile CRUD, file metadata, quota tracking (electron-store)
│  - Schedules run-daily pipeline                              │
│  - Orchestrates adapters via the Upload Engine               │
└───────┬───────────────────┬───────────────────┬─────────────┘
        │                   │                   │
┌───────▼──────┐    ┌────────▼────────┐   ┌──────▼──────────┐
│ auth.js      │    │ uploader.js      │   │ electron-store  │
│ OAuth 2.0    │    │ adapter dispatch │   │ config + quota  │
│ flows        │    │ + platform impls  │   │ + profiles      │
└───────┬──────┘    └────────┬────────┘   └─────────────────┘
        │                    │
        ▼                    ▼
  Platform OAuth      Platform Upload APIs
  (localhost:18923)   (TikTok / YouTube / Instagram)
```

## 3. Process Model

### 3.1 Main Process (`src/main.js`)
- Creates the `BrowserWindow` with `contextIsolation: true` and
  `nodeIntegration: false`. **These two settings are immutable invariants**
  (see `CONTRIBUTING.md` and `AGENTS.md` §2).
- Registers IPC handlers for profiles, files, quota, settings, secrets, auth,
  and the daily run.
- Persists global application state (profiles, connected accounts, daily quota,
  upload history, settings) in an `electron-store` instance (`openshare-config`).
  Per-video state lives in each profile's `meta.json`. See
  [ELECTRON_STORE_SCHEMA.md](./ELECTRON_STORE_SCHEMA.md) for the full schema.
- Stores profile media under `userData/profiles/<profileId>/`.

### 3.2 Auth (`src/auth.js`)
- Implements OAuth 2.0 authorization-code flows for each platform.
- Spawns a local HTTP server on `localhost:18923` to receive the redirect.
  Instagram cannot use `localhost` (Meta requires HTTPS), so its redirect goes
  to the public `docs/callback.html` page, which forwards the result to
  `openshare://`. See [GITHUB_PAGES.md](./GITHUB_PAGES.md).
- `state` is 32 random bytes from `crypto.randomBytes`, kept in memory per login
  attempt with a 10-minute TTL. The callback handler consumes it on its first
  valid use. A missing, unknown, expired, or other-platform `state` gets a 400
  and no code is exchanged, but the pending login keeps waiting, so a stray
  request cannot end it.
- Instagram uses Instagram Login: the short-lived token is form-encoded from
  `api.instagram.com`, exchanged for a long-lived token on `graph.instagram.com`,
  and the account is looked up with `/me`. Only Business and Creator accounts
  are accepted. The stored auth object holds `access_token`, `user_id`,
  `account_type` and `expires_at`. Refresh is not implemented yet.
- Exchanges the authorization code for access/refresh tokens.
- Secrets are loaded from / saved to `src/secrets.json` (git-ignored).

### 3.3 Upload Engine & Platform Adapter Framework (`src/uploader.js`)
The uploader is the boundary between orchestration and platform specifics.

- Adapters live in `src/adapters/`, each extending `BaseAdapter`:
  - `TikTokAdapter.js` — file init → PUT upload → publish.
  - `YouTubeAdapter.js` — optional ffmpeg transcode to H.264/AAC MP4 → resumable
    `videos.insert` via googleapis; also exposes `getChannel(tokens)`.
  - `InstagramAdapter.js` — Graph API media creation (REELS) → publish.
- `uploader.js` builds an `AdapterRegistry` at module load and registers one
  instance per platform. It contains no platform logic.
- `uploadToPlatform(platform, tokens, filePath, opts)` resolves the adapter with
  `registry.get(platform)` and delegates to its `upload(tokens, filePath, opts)`.
  An unregistered platform rejects with `Unsupported platform`.
- `getYouTubeChannel(tokens)` delegates to the YouTube adapter's `getChannel()`.
- Reports per-platform status through an `onStatus` callback used for progress.
- Adapters are **pluggable**: to add a platform, create a `BaseAdapter` subclass
  and register it in `uploader.js`. Orchestration code never branches on a
  platform string.
- Failure classification (transient vs permanent) and retry/backoff live here so
  the daily-run pipeline can decide whether to mark a file `failed` or retry.

### 3.4 Renderer (`src/renderer/*`)
- Pure presentation + interaction. Talks only via `window.api`.
- Renders profile grid, file cards (with title/desc/privacy/platform toggles),
  drag-and-drop gallery, scheduling UI, and a live progress panel.

### 3.5 Background Worker (`src/publishing/worker.js`)
- Generic FIFO job executor built on `EventEmitter`.
- Lifecycle: `start()` → `enqueue(job)` → sequential execution → `stop()`.
- Emits `started`, `idle`, `jobStarted`, `jobCompleted`, `jobFailed`, `stopped`.
- Maintains an ephemeral `_runtimeState` Map for in-memory state that is
  **never** persisted. Cleared on `stop()`.
- On app startup (`main.js`), `resetStaleUploadingStates()` scans every
  profile's `meta.json` and resets any record with `status: "uploading"` back to
  `status: "pending"`. This prevents files from being permanently orphaned after
  a crash.

## 4. Data Model

### Profile
```json
{
  "id": "p_<timestamp>_<rand>",
  "name": "My Brand",
  "auth": {
    "youtube": { "access_token": "...", "refresh_token": "...", "channel": { "name": "...", "avatar": "..." } },
    "tiktok":  { "access_token": "...", "refresh_token": "..." },
    "instagram": { "access_token": "...", "user_id": "..." }
  },
  "defaultDesc": "Thanks for watching! #shorts"
}
```

### File metadata (`meta.json` per profile folder)
Only terminal or pending states are persisted. Runtime states (`uploading`,
`progress`, `retrying`) live in the Worker's in-memory `_runtimeState` and are
**never** written to `meta.json`. On startup, any stale `uploading` record found
in `meta.json` is automatically reset to `pending` (see §3.5).
```json
{
  "clip.mp4": {
    "scheduledAt": "2026-07-20T10:00:00.000Z",
    "status": "pending | uploaded | failed",
    "uploadedAt": "2026-07-18T12:00:00.000Z",
    "lastError": null,
    "platforms": ["tiktok", "youtube", "instagram"],
    "privacy": "private",
    "madeForKids": false,
    "title": "My Clip",
    "desc": "Default caption"
  }
}
```

> The `electron-store` keys (`profiles`, `quota`, `history`, `settings`) are
> documented in [ELECTRON_STORE_SCHEMA.md](./ELECTRON_STORE_SCHEMA.md). The
> sections below describe the same data in context.

### Upload history (per profile, append-only)
Stored in `electron-store` under `history.<profileId>` as an array. Each
platform attempt that finishes, successfully or with an error, appends one
record. Attempts skipped because the platform already succeeded are not
recorded again. Unauthenticated platforms are not recorded either, since no
attempt was made.
```json
{
  "jobId": "uuid — one per file per run",
  "fileName": "clip.mp4",
  "title": "My Clip",
  "platform": "youtube",
  "status": "uploaded | failed",
  "timestamp": "2026-10-04T12:00:00.000Z",
  "errorMessage": null,
  "platformPostId": "id returned by the platform, or null"
}
```
Isolation: each profile's history lives under its own key. Writes go only to
that key, and `getHistory(profileId, { platform, status, offset, limit })`
reads only that key. It returns the newest records first with `{ items, total }`.
Records are never edited or removed by the app.

### Quota (per profile, per day)
```json
{ "date": "2026-07-18", "used": 7 }
```

## 5. Daily Upload Pipeline

1. `run-daily` invoked for a profile.
2. Read today's quota; if `used >= 30`, return `limit-reached`.
3. List files and evaluate each one (`src/publishing/selection.js`). A file is
   selected only if all of these hold, checked in this order:
    - `status` is `uploaded` → skipped `SKIPPED_ALREADY_UPLOADED`.
    - `status` is not `pending` or `failed` → skipped `SKIPPED_NOT_ELIGIBLE_STATUS`.
      `failed` files are eligible for retry; they are not rewritten to `pending`
      on disk.
    - `scheduledAt` is set and in the future → skipped `SKIPPED_NOT_DUE`.
4. Slice the selected files to remaining quota; the rest are skipped
   `SKIPPED_QUOTA_REACHED`. Quota is spent only on selected files. Every skip is
   logged to the console with its reason and shown in the UI log, except
   already-uploaded files, which are logged to the console only.
   A file in flight in this process, or one whose status changes before its
   upload starts, is skipped `SKIPPED_IN_FLIGHT` or `SKIPPED_NOT_ELIGIBLE_STATUS`.
5. For each file, for each selected platform:
    - Skip if not authenticated (`not-authenticated`).
    - Upload via the platform adapter; record per-platform result.
6. During execution the file's runtime state (`uploading`) is tracked in
   the Worker's in-memory `_runtimeState` — it is **not** persisted to
   `meta.json`. Only terminal states (`uploaded`, `failed`) are written to
   `meta.json`.
8. Each platform's result is written to `platformResults` in `meta.json` as
   soon as its upload succeeds, so a rerun never re-publishes that platform.
   When all selected platforms have succeeded the file is marked `uploaded`;
   otherwise it is `failed` with error detail. Failed files are retried on the
   next run, and only platforms without an `ok` result are uploaded again.
9. Increment quota by number of fully uploaded files.
10. Emit progress events (`start`, `status`, `file`, `overall`) to the renderer.
11. **Idempotency:** a re-run never re-publishes a file already `uploaded`
    (resumable; see NFR-004 in `PRD.md`). Each file's status is re-read from
    `meta.json` immediately before its upload, and a profile or file already
    in flight in this process is skipped, so overlapping runs (scheduler tick,
    repeated "Run Daily Upload" clicks) cannot publish the same file twice.
    `reset-file` and `retry-file` never move an `uploaded` file back to `pending`.

## 6. Security Design

- **Process isolation:** renderer has no Node integration; only `window.api`.
- **Secret handling:** OAuth client secrets and tokens never reach the renderer.
  IPC returns profiles through `toPublicProfile()` (`src/profileView.js`), which
  gives metadata, `isConnected` booleans, and channel name/avatar only. Secret
  status is `hasClientId` / `hasClientSecret` booleans, and new secrets are
  written by `save-secret`, which merges them in the main process. Blank fields
  keep the saved value. `src/secrets.json` is git-ignored.
- **CSP:** `index.html` ships a Content-Security-Policy restricting sources.
- **State validation:** OAuth `state` is randomized and verified.
- **File safety:** `delete-file` retries on `EBUSY`; renames sanitize filenames.
- **Immutable invariants:** `contextIsolation` and `nodeIntegration` are never
  disabled. CI and `AGENTS.md` enforce this as a hard gate.

## 7. External Dependencies

| Package          | Purpose                                   |
|------------------|-------------------------------------------|
| `electron`       | Desktop runtime                           |
| `electron-store` | Persistent config / quota / profiles      |
| `googleapis`     | YouTube Data API v3 client                |
| `node-fetch`     | HTTP for TikTok/Instagram APIs            |
| `form-data`      | Multipart uploads                         |
| `ffmpeg` (system)| Optional transcode for YouTube            |

## 8. Module Boundaries (for agents)

| Concern                | Allowed files                     | Forbidden from        |
|------------------------|-----------------------------------|-----------------------|
| Secrets / tokens       | `src/auth.js`, `src/secrets.json` | `renderer/*`, preload |
| Platform upload logic  | `src/uploader.js` (+ adapters)    | `main.js` internals   |
| IPC surface            | `src/main.js` + `src/preload.js`  | `renderer/*` direct   |
| Persistence            | `electron-store` in `main.js`     | renderer / adapters   |
| UI                     | `src/renderer/*`                   | `main.js` orchestration |

When an issue implies crossing these boundaries, raise it on the issue before
implementing (see `AGENTS.md` §2 — no unilateral architectural decisions).
