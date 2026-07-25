# GitHub Issues Seed — Epics & Backlog

> This file is the **seed catalog** for the GitHub backlog. It operationalizes
> `ROADMAP.md` into concrete Epic issues and child work items. Use it to create
> issues in GitHub (via the UI, `gh`, or an automation script).
>
> Conventions used below:
> - Epic issues: title `[EPIC-###] <name>`, label `epic`, linked to its Milestone.
> - Work issues: title `[OPN-###] <summary>`, label `triage`, linked to Epic +
>   Milestone + `FR/NFR` from `PRD.md`.
> - Each issue must use `.github/ISSUE_TEMPLATE/issue.yml` (or `epic.yml`).
> - Dependencies are noted as `deps: OPN-##`; an issue is `blocked` until those close.

---

## EPIC-001 — Architecture & Foundation (MS-001)

Goal: Establish the secure Electron process model, the agent operating
constitution, and the documentation system. Foundation for every other epic.

- [OPN-001] Write `AGENTS.md` constitution — label `epic-foundation`
- [OPN-002] Author `PRD.md` (vision + FR/NFR) — `deps: OPN-001`
- [OPN-003] Author `ROADMAP.md` (milestones + epics) — `deps: OPN-002`
- [OPN-004] Expand `docs/ARCHITECTURE.md` with adapter framework + module boundaries — `deps: OPN-001`
- [OPN-005] Write `docs/LOOP_ENGINEERING.md` — `deps: OPN-001`
- [OPN-006] Write `docs/DEFINITION_OF_DONE.md` — `deps: OPN-001`
- [OPN-007] Write `docs/CODING_STANDARDS.md` — `deps: OPN-001`
- [OPN-008] Write `docs/REVIEW_CHECKLIST.md` — `deps: OPN-001`
- [OPN-009] Write `docs/AGENT_OPERATING_PROCEDURES.md` — `deps: OPN-001`
- [OPN-010] Add GitHub issue + PR templates (`.github/`) — `deps: OPN-001`
- [OPN-011] Add CI gate that fails on `contextIsolation`/`nodeIntegration` changes — `deps: OPN-004`

## EPIC-002 — Storage & Configuration (MS-001)

Goal: Durable profile, file-metadata, settings, and quota persistence; safe
secret handling that never reaches the renderer.

- [OPN-020] Define `electron-store` schema for profiles + quota — `deps: OPN-004`
- [OPN-021] Implement profile CRUD in `main.js` over store — `deps: OPN-020`
- [OPN-022] Implement per-file `meta.json` read/write — `deps: OPN-020`
- [OPN-023] Implement per-profile daily quota tracking + reset on new day — `deps: OPN-020`
- [OPN-024] Isolate secrets handling in `auth.js`; ensure renderer never imports — `deps: OPN-004`

## EPIC-003 — Platform Adapter Framework (MS-002)

Goal: A uniform adapter interface so TikTok/YouTube/Instagram upload logic is
pluggable, testable, isolated from orchestration.

- [OPN-030] Define adapter contract (`authenticate`/`upload`/`status`) — `deps: OPN-004`
- [OPN-031] Refactor `uploader.js` to dispatch via adapter registry — `deps: OPN-030`
- [OPN-032] Add adapter loading/registration mechanism — `deps: OPN-031`

## EPIC-004 — Upload Engine (MS-002)

Goal: Resilient per-platform upload implementations with status reporting,
retry/backoff, failure classification.

- [OPN-040] Implement TikTok adapter (init → PUT → publish) — `deps: OPN-032`
- [OPN-041] Implement YouTube adapter (transcode + resumable insert) — `deps: OPN-032`
- [OPN-042] Implement Instagram adapter (Graph REELS create → publish) — `deps: OPN-032`
- [OPN-043] Add retry/backoff + transient-vs-permanent error classification — `deps: OPN-040,OPN-041,OPN-042`
- [OPN-044] Per-platform `onStatus` progress reporting — `deps: OPN-040,OPN-041,OPN-042`

## EPIC-005 — Scheduler (MS-003)

Goal: Future-dated publishing, daily-run pipeline, resumable idempotent quota.

- [OPN-050] Implement daily-run pipeline in `main.js` — `deps: OPN-043,OPN-023`
- [OPN-051] Select due `pending` files (schedule + quota slice) — `deps: OPN-050`
- [OPN-052] Mark files `uploaded`/`failed` idempotently (no double-publish) — `deps: OPN-050`
- [OPN-053] Persist progress events to renderer (`start`/`status`/`file`/`overall`) — `deps: OPN-044`

## EPIC-006 — Asset Library (MS-003)

Goal: Per-profile gallery ingestion, drag-and-drop, per-file metadata editing.

- [OPN-060] Drag-and-drop gallery ingestion in renderer — `deps: OPN-022`
- [OPN-061] Per-file title/desc/privacy/platform editing UI — `deps: OPN-022`
- [OPN-062] File lifecycle: add / rename / delete with safe fs handling — `deps: OPN-022`

## EPIC-007 — Workspace Management (MS-004)

Goal: Multi-profile UX, onboarding, settings dialog, platform connection flows.

- [OPN-070] Profile grid + create/rename/delete UX — `deps: OPN-021,OPN-060`
- [OPN-071] Settings dialog + "Connect Platforms" OAuth flow — `deps: OPN-024`
- [OPN-072] Onboarding / empty-state guidance — `deps: OPN-070`

## EPIC-008 — Analytics (MS-004)

Goal: Upload history, success/failure reporting, quota utilization.

- [OPN-080] Persist upload history per profile — `deps: OPN-052`
- [OPN-081] Success/failure reporting view — `deps: OPN-053,OPN-080`
- [OPN-082] Quota utilization insights — `deps: OPN-023,OPN-080`

## EPIC-009 — AI Features (MS-004)

Goal: Caption/title generation, schedule suggestions, tagging.

- [OPN-090] Caption/title generation hook (pluggable provider) — `deps: OPN-081`
- [OPN-091] Optimal-schedule suggestion from history — `deps: OPN-082`
- [OPN-092] Content tagging / auto-metadata — `deps: OPN-090`

## EPIC-010 — Release & Distribution (MS-005)

Goal: Packaging, installers, auto-update, release automation.

- [OPN-100] Windows/macOS/Linux packaging via `release.yml` — `deps: OPN-011`
- [OPN-101] Auto-update mechanism — `deps: OPN-100`
- [OPN-102] Release automation + changelog from issues/PRs — `deps: OPN-100`

---

## Creation Script (reference)

The issues above can be created in bulk, e.g. with `gh` (once authenticated):

```bash
# Create epics
gh issue create --title "[EPIC-001] Architecture & Foundation" --label epic \
  --body-file .github/ISSUE_TEMPLATE/epic.yml --milestone "MS-001"

# Create a work issue
gh issue create --title "[OPN-020] Define electron-store schema" --label triage \
  --body "Epic: EPIC-002\nMilestone: MS-001\nPRD: NFR-001\nAC:\n- [ ] schema defined"
```

Until `gh`/git is available in this environment, use this file as the canonical
backlog and create the issues through the GitHub UI with the provided templates.
