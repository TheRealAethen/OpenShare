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
└───────┬───────────────────┬───────────────────┬─────────────┘
        │                   │                   │
┌───────▼──────┐    ┌────────▼────────┐   ┌──────▼──────────┐
│ auth.js      │    │ uploader.js      │   │ electron-store  │
│ OAuth 2.0    │    │ TikTok/YouTube/  │   │ config + quota  │
│ flows        │    │ Instagram upload │   │ + profiles      │
└───────┬──────┘    └────────┬────────┘   └─────────────────┘
        │                    │
        ▼                    ▼
  Platform OAuth      Platform Upload APIs
  (localhost:18923)   (TikTok / YouTube / Instagram)
```

## 3. Process Model

### 3.1 Main Process (`src/main.js`)
- Creates the `BrowserWindow` with `contextIsolation: true` and
  `nodeIntegration: false`.
- Registers IPC handlers for profiles, files, quota, settings, secrets, auth,
  and the daily run.
- Persists configuration and per-profile upload state in an
  `electron-store` instance (`openshare-config`).
- Stores profile media under `userData/profiles/<profileId>/`.

### 3.2 Auth (`src/auth.js`)
- Implements OAuth 2.0 authorization-code flows for each platform.
- Spawns a local HTTP server on `localhost:18923` to receive the redirect.
- Validates the `state` parameter to mitigate CSRF.
- Exchanges the authorization code for access/refresh tokens.
- Secrets are loaded from / saved to `src/secrets.json` (git-ignored).

### 3.3 Uploader (`src/uploader.js`)
- `uploadToPlatform(platform, tokens, filePath, opts)` dispatches to the correct
  implementation:
  - **TikTok** — file init → PUT upload → publish.
  - **YouTube** — optional ffmpeg transcode to H.264/AAC MP4 → resumable
    `videos.insert` via googleapis.
  - **Instagram** — Graph API media creation (REELS) → publish.
- Reports per-platform status through an `onStatus` callback used for progress.

### 3.4 Renderer (`src/renderer/*`)
- Pure presentation + interaction. Talks only via `window.api`.
- Renders profile grid, file cards (with title/desc/privacy/platform toggles),
  drag-and-drop gallery, scheduling UI, and a live progress panel.

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
```json
{
  "clip.mp4": {
    "scheduledAt": "2026-07-20T10:00:00.000Z",
    "status": "pending | uploading | uploaded | failed",
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

### Quota (per profile, per day)
```json
{ "date": "2026-07-18", "used": 7 }
```

## 5. Daily Upload Pipeline

1. `run-daily` invoked for a profile.
2. Read today's quota; if `used >= 30`, return `limit-reached`.
3. List files; select `pending` files whose `scheduledAt` (if any) is now or past.
4. Slice to remaining quota.
5. For each file, for each selected platform:
   - Skip if not authenticated (`not-authenticated`).
   - Upload; record per-platform result.
6. Mark file `uploaded` only if **all** selected platforms succeeded,
   otherwise `failed` with error detail.
7. Increment quota by number of fully uploaded files.
8. Emit progress events (`start`, `status`, `file`, `overall`) to the renderer.

## 6. Security Design

- **Process isolation:** renderer has no Node integration; only `window.api`.
- **Secret handling:** OAuth client secrets and tokens never reach the renderer
  except opaque auth state. `src/secrets.json` is git-ignored.
- **CSP:** `index.html` ships a Content-Security-Policy restricting sources.
- **State validation:** OAuth `state` is randomized and verified.
- **File safety:** `delete-file` retries on `EBUSY`; renames sanitize filenames.

## 7. External Dependencies

| Package          | Purpose                                   |
|------------------|-------------------------------------------|
| `electron`       | Desktop runtime                           |
| `electron-store` | Persistent config / quota / profiles      |
| `googleapis`     | YouTube Data API v3 client                |
| `node-fetch`     | HTTP for TikTok/Instagram APIs            |
| `form-data`      | Multipart uploads                         |
| `ffmpeg` (system)| Optional transcode for YouTube            |
