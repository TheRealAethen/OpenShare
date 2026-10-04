# electron-store Schema

> Source of truth for the global application state OpenShare persists with
> `electron-store`. Per-video state lives in `meta.json` and is documented in
> [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-data-model). Keep this file in sync
> with any change to `src/publishing/storage.js`, `src/main.js`, or the
> `settings` handlers in the same PR.

## 1. Store Identity and Location

| Item | Value |
|------|-------|
| Store name (`new Store({ name })`) | `openshare-config` |
| Defined in | `src/publishing/storage.js` |
| File on disk | `<userData>/openshare-config.json` (Electron `app.getPath('userData')`) |
| Process | Main process only. The renderer reaches it through IPC, never directly. |

**Dotted keys are nested paths.** `electron-store` treats `quota.<profileId>`
and `history.<profileId>` as paths. The file therefore has two top-level
objects, `quota` and `history`, each keyed by profile ID. Profile IDs have the
form `p_<timestamp>_<random>` and contain no dots, so the paths are safe.

## 2. Top-Level Keys

| Key | Type | Default | Written by | Read by |
|-----|------|---------|------------|---------|
| `profiles` | `Profile[]` | `[]` | `saveProfiles()` (create, rename, delete, connect/disconnect, YouTube channel) | `getProfiles()`, `getProfile()`, `main.js` IPC handlers, publishing engine |
| `quota` | `{ [profileId]: QuotaRecord }` | absent (treated as `{ date: today, used: 0 }`) | `getQuota()` (day rollover), `incrementQuota()` | `getQuota()`, publishing engine |
| `history` | `{ [profileId]: HistoryEntry[] }` | absent (treated as `[]`) | `appendHistory()` | `getHistory()` |
| `settings` | `Settings` | `{ darkMode: false, scale: 100, devMode: false }` | `save-settings` IPC handler | `get-settings` IPC handler, renderer |

### 2.1 `profiles` — `Profile[]`

One object per brand/channel identity.

```json
{
  "id": "p_1790000000000_k3j9x2",
  "name": "My Brand",
  "defaultDesc": "Thanks for watching! #shorts",
  "auth": {
    "youtube":   { "access_token": "…", "refresh_token": "…", "channel": { "name": "…", "avatar": "…" } },
    "tiktok":    { "access_token": "…", "refresh_token": "…" },
    "instagram": { "access_token": "…", "user_id": "…" }
  }
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Immutable identifier. Used as the key in `quota` and `history`, and as the folder name under `userData/profiles/`. |
| `name` | string | Display name. |
| `defaultDesc` | string | Caption copied into each new file's `desc` in `meta.json` when it is added. |
| `auth.<platform>` | object, optional | Present only while the platform is connected. Removing the key disconnects that platform. `<platform>` is `youtube`, `tiktok`, or `instagram`. |
| `auth.<platform>.access_token` / `refresh_token` | string | OAuth tokens. The engine persists refreshed tokens back here. |
| `auth.youtube.channel` | `{ name, avatar }` | Cached channel info for the UI, fetched once after connecting. |
| `auth.instagram.user_id` | string | Graph API user ID required for publishing. |

**Sensitive.** This key contains OAuth tokens. See §5.

### 2.2 `quota` — `{ [profileId]: QuotaRecord }`

Per-profile daily budget of uploaded files.

```json
{ "quota": { "p_1790000000000_k3j9x2": { "date": "2026-10-04", "used": 7 } } }
```

| Field | Type | Purpose |
|-------|------|---------|
| `date` | string `YYYY-MM-DD` (UTC) | Day this count applies to. When it differs from today, `getQuota()` resets `used` to `0`. |
| `used` | integer ≥ 0 | Files fully uploaded today. It counts files, not platform uploads. |

The limit is `DAILY_LIMIT = 30` in `storage.js`. It is per profile across all
platforms, as stated in [PRD.md FR-006](../PRD.md). `used` is incremented once per
run with the number of files that finished on every selected platform.

### 2.3 `history` — `{ [profileId]: HistoryEntry[] }`

Append-only log of finished platform attempts, newest last in storage and
newest first when queried. Introduced by OPN-080.

```json
{ "history": { "p_1790000000000_k3j9x2": [
  { "jobId": "uuid", "fileName": "clip.mp4", "title": "My Clip", "platform": "youtube",
    "status": "uploaded", "timestamp": "2026-10-04T12:00:00.000Z",
    "errorMessage": null, "platformPostId": "abc123" }
] } }
```

| Field | Type | Purpose |
|-------|------|---------|
| `jobId` | UUID | Shared by all platform attempts for one file in one run. |
| `fileName` / `title` | string | File identity at the time of the attempt. `title` falls back to `fileName`. |
| `platform` | `tiktok` \| `youtube` \| `instagram` | Platform that was attempted. |
| `status` | `uploaded` \| `failed` | Outcome of this attempt. |
| `timestamp` | ISO 8601 string | When the attempt finished. |
| `errorMessage` | string \| null | Error text on failure. |
| `platformPostId` | string \| null | Platform's ID for the published video on success. |

Records are never edited or removed by the application.

### 2.4 `settings` — `Settings`

```json
{ "darkMode": false, "scale": 100, "devMode": false }
```

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `darkMode` | boolean | `false` | Dark theme toggle. |
| `scale` | integer percent | `100` | UI font and layout scale. |
| `devMode` | boolean | `false` | Shows renderer error details and debug output. |

The renderer keeps its own copy of the same defaults in `renderer.js`. The
values must stay identical to the defaults in `main.js` (`get-settings`).

## 3. Global State vs. Per-Video State

| Concern | Storage | Scope | Example |
|---------|---------|-------|---------|
| Profiles, connected accounts, OAuth tokens | `electron-store` → `profiles` | Global | `auth.youtube.refresh_token` |
| Daily quota | `electron-store` → `quota` | Per profile | `used` for today |
| Upload history | `electron-store` → `history` | Per profile | Attempt log |
| App settings | `electron-store` → `settings` | Global | `darkMode` |
| Per-video status and schedule | `profiles/<profileId>/meta.json` | Per file | `scheduledAt`, `status` |
| Per-video publish options | `meta.json` | Per file | `title`, `desc`, `privacy`, `madeForKids`, `platforms` |
| Per-video platform results | `meta.json` | Per file | `platformResults`, `failureReason`, `lastError`, `uploadedAt` |
| Client ID / client secret | `src/secrets.json` (dev) or `<userData>/secrets.json` (packaged) | Global | Never in `electron-store` |
| In-flight runtime state | Process memory only | Transient | `_activeProfiles`, `_activeFiles` in `publishingEngine.js` |

Rule of thumb: anything that describes **which profile** or **the app** goes in
`electron-store`. Anything that describes **one video file** goes in that
profile's `meta.json`. Runtime locks are never written to disk.

`meta.json` keys are never copied into `electron-store`, and `electron-store`
keys are never used to describe a single file. The one link between the two is
the profile ID.

## 4. Review Findings

| # | Finding | Resolution |
|---|---------|------------|
| 1 | `ARCHITECTURE.md` §3.1 said the store persists "per-profile upload state". Per-video state is in `meta.json`. | Corrected in `ARCHITECTURE.md`. |
| 2 | `quota`, `history`, and `settings` defaults are spread across `storage.js`, `main.js`, and `renderer.js`. | Documented here. Values are unchanged. |
| 3 | `profiles` and `quota` carried no schema documentation. | Documented in §2. |
| 4 | Secrets and tokens are reachable from the renderer. See §5. | Reported. Not changed in this PR. |

No keys are unused. No key is written but never read. Field names are
consistent across `electron-store` and `meta.json` (for example
`scheduledAt`, `uploadedAt`, `platformResults`).

## 5. Security Note (Open)

Two IPC handlers currently return sensitive data to the renderer, which
[PRD.md NFR-001](../PRD.md) and [AGENTS.md §2](../AGENTS.md) prohibit:

- `get-profiles` returns full `Profile` objects, including
  `auth.*.access_token` and `auth.*.refresh_token`.
- `get-secrets` returns the contents of `secrets.json`, including OAuth
  client secrets.

This document records the behavior and does not change it. The fix needs its
own issue, because it touches the renderer contract. The fix should return
only a boolean `connected` per platform and channel metadata from
`get-profiles`, and it should keep `get-secrets` out of the renderer.
