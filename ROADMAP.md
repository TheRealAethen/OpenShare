# ROADMAP.md — Milestones & Epic Backlog

> **Milestone layer.** Each milestone groups a set of Epics. Each Epic groups a
> set of GitHub Issues. Every issue must reference its Epic and Milestone so the
> chain `PR → Issue → Epic → Milestone → PRD` is auditable.

## How to Use This File

- Milestones are tracked as **GitHub Milestones** (with the `MS-###` label).
- Epics are tracked as **GitHub Milestones** or parent **Epic issues** (with the
  `EPIC-###` label). Issues are linked to them.
- Agents pick work by selecting the highest-priority **unblocked** issue whose
  milestone is active. See `AGENTS.md` §3.

## Milestones

| Milestone | Theme                       | Epics covered            | Status      |
|-----------|-----------------------------|--------------------------|-------------|
| MS-001    | Foundations                 | EPIC-001, EPIC-002       | In progress |
| MS-002    | Connectivity                | EPIC-003, EPIC-004       | Planned     |
| MS-003    | Automation                  | EPIC-005, EPIC-006       | Planned     |
| MS-004    | Scale & Intelligence        | EPIC-007, EPIC-008, EPIC-009 | Planned  |
| MS-005    | Ship It                     | EPIC-010                 | Planned     |

## Epics

### EPIC-001: Architecture & Foundation
Establish the secure Electron process model, documentation system, and the
agent operating constitution (`AGENTS.md`, `ARCHITECTURE.md`, CI invariants).
*Depends on:* none. *Feeds:* every other epic.

### EPIC-002: Storage & Configuration
Durable profile, file-metadata, settings, and quota persistence via
`electron-store`; secrets handling that never touches the renderer.
*Depends on:* EPIC-001.

### EPIC-003: Platform Adapter Framework
A uniform adapter interface so TikTok/YouTube/Instagram upload logic is
pluggable, testable, and isolated from the main process orchestration.
*Depends on:* EPIC-002.

### EPIC-004: Upload Engine
Resilient, per-platform upload implementations with status reporting,
retry/backoff, and failure classification.
*Depends on:* EPIC-003.

### EPIC-005: Scheduler
Future-dated publishing, the daily-run pipeline, and quota enforcement that is
resumable and idempotent.
*Depends on:* EPIC-004.

### EPIC-006: Asset Library
Per-profile gallery: ingestion, drag-and-drop, per-file metadata editing, and
media lifecycle (add/delete/rename).
*Depends on:* EPIC-002.

### EPIC-007: Workspace Management
Multi-profile UX, onboarding, settings dialog, and platform connection flows.
*Depends on:* EPIC-006, EPIC-003.

### EPIC-008: Analytics
Upload history, success/failure reporting, and quota utilization insights.
*Depends on:* EPIC-005.

### EPIC-009: AI Features
Caption/title generation, optimal-schedule suggestions, and content tagging.
*Depends on:* EPIC-008.

### EPIC-010: Release & Distribution
Packaging, installers (Win/Mac/Linux), auto-update, and release automation.
*Depends on:* all prior epics.

## Dependency Graph (simplified)

```
EPIC-001 ─▶ EPIC-002 ─▶ EPIC-003 ─▶ EPIC-004 ─▶ EPIC-005 ─▶ EPIC-008 ─▶ EPIC-009
                │                        │            │
                └─▶ EPIC-006 ─▶ EPIC-007 ┘            │
                                                      │
EPIC-001 … EPIC-009 ──────────────────────────▶ EPIC-010
```

## Issue Hygiene Rules

- Each issue references: `Epic: EPIC-###`, `Milestone: MS-###`, and the relevant
  `FR-###` / `NFR-###` from `PRD.md`.
- Issues carry acceptance criteria, dependencies, testing notes, and rollout notes.
- Blocked issues get the `blocked` label and a comment — never silent workarounds.
