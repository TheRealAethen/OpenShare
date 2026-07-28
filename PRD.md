# PRD.md — Product Requirements Document

> **Vision layer.** Every milestone, epic, issue, and PR in this repository must
> trace back to a statement in this document. If a proposed change has no home
> here, it needs a PRD update (via issue) before implementation.

## 1. Purpose

OpenShare is a desktop application (Electron) that lets a content owner publish
the same video clip to **TikTok**, **YouTube**, and **Instagram** from one place,
while respecting each platform's constraints and the owner's publishing cadence.

The product exists to remove the manual, repetitive work of cross-posting: drop
clips into per-brand galleries, authenticate each platform once, optionally
schedule, and let a daily run upload up to the platform-safe quota.

## 2. Target Users

- **Solo creators / small brands** running multiple channel identities from one
  machine.
- **Agencies** managing several client profiles, each isolated from the others.

## 3. Goals (What Good Looks Like)

1. A user manages **multiple profiles**, each with its own media library and
   platform authentications, fully isolated on disk.
2. A user drops videos into a profile gallery and publishes them to all
   connected platforms with one action.
3. The app enforces a **per-profile daily quota** (default 30 videos/day across
   the three platforms) and stops the daily run safely at the limit.
4. A user can **schedule** a video for a future date; it is skipped until due.
5. The app authenticates via **official OAuth 2.0** flows for each platform and
   keeps all secrets in the main process / git-ignored files.
6. The app is **secure by construction**: renderer never holds credentials,
   `contextIsolation`/`nodeIntegration` settings are immutable invariants.

## 4. Non-Goals (Explicitly Out of Scope)

- Server-side / cloud-hosted publishing. OpenShare is a local desktop tool.
- Social analytics dashboards beyond basic upload-status history.
- Editing or trimming videos (transcoding only for format compatibility).
- Multi-user accounts / team RBAC inside the app.

## 5. Platform Constraints (Hard Limits to Respect)

| Platform    | Known constraint                                   |
|-------------|----------------------------------------------------|
| TikTok      | Video upload API (init → PUT → publish).           |
| YouTube     | Data API v3 `videos.insert` resumable; prefers H.264/AAC MP4. |
| Instagram   | Graph API Reels/video publish (create → publish).  |
| All         | Daily volume caps; OpenShare defaults to 30/profile/day. |

## 6. Functional Requirements

| ID     | Requirement                                                        |
|--------|--------------------------------------------------------------------|
| FR-001 | Create, rename, delete profiles; each isolated under `userData`.  |
| FR-002 | Authenticate TikTok, YouTube, Instagram per profile via OAuth.     |
| FR-003 | Drag-and-drop gallery per profile; per-file title/desc/privacy.    |
| FR-004 | Set a future `scheduledAt` per file.                               |
| FR-005 | "Run Daily Upload" processes due `pending` files up to quota.      |
| FR-006 | Track per-profile daily quota; persist across runs/days.           |
| FR-007 | Report per-file, per-platform status with live progress.           |
| FR-008 | Retry/backoff on transient upload failures; mark `failed` w/ detail.|

## 7. Non-Functional Requirements

| ID     | Requirement                                                        |
|--------|--------------------------------------------------------------------|
| NFR-001| Secrets never reach the renderer; CSP enforced in `index.html`.    |
| NFR-002| Lint passes on Windows, macOS, Linux (CI matrix).                  |
| NFR-003| No new dependency without review; keep Electron/Google APIs current.|
| NFR-004| Deterministic, resumable daily runs (no double-uploads on rerun).  |

## 8. Success Metrics

- A new profile can be created, authenticated, and have a video published to all
  three platforms within one session.
- Re-running the daily upload never re-publishes an already-`uploaded` file.
- Zero secrets detected in the repository by CI secret-scan.

## 9. Traceability

This PRD maps to:

- **Milestones** → `ROADMAP.md`
- **Epics** → GitHub Milestones (`EPIC-001` … `EPIC-010`)
- **Work items** → GitHub Issues (each references the epic + this PRD section)
- **Change** → GitHub PRs linked to issues

Any implementation that cannot cite an FR/NFR ID or a roadmap item is out of
scope and must be raised as a new issue first.
