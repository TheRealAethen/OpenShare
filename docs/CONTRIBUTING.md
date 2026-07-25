# Contributing & Security

OpenShare is **proprietary software** owned by Fellipe Bittencourt.
Contributions are currently closed to the public; this document covers internal
development, agent workflow, and security practices.

This file is part of the engineering operating system described in `AGENTS.md`.
Read `AGENTS.md` first — it is the constitution and overrides everything here.

## 1. The Golden Rule

**Never implement work that is not backed by a GitHub Issue.** Every change —
feature, fix, refactor, doc — must trace `PR → Issue → Epic → Milestone → PRD`.
If no issue exists, open one (use the issue templates in `.github/ISSUE_TEMPLATE`)
before writing code. See `AGENTS.md` §0.

## 2. Development Workflow (Agent Loop)

The full cycle is documented in `docs/LOOP_ENGINEERING.md`. In short:

1. Pick the highest-priority **unblocked** issue assigned to you.
2. Read `AGENTS.md` → the issue → `docs/ARCHITECTURE.md` → this file.
3. Post a concise plan as an issue comment.
4. Branch: `feature/<issue-id>-slug` or `fix/<issue-id>-slug` from `main`.
5. Implement **only** what the issue scopes.
6. Run `npm run lint` (and tests if present) locally.
7. Self-review against `docs/DEFINITION_OF_DONE.md`.
8. Open a PR (one issue per PR) only when all gates pass.

## 3. Branch & PR Conventions

- Branch from `main`; keep branches short-lived and single-purpose.
- PR title: `<issue-id> — short summary` (e.g. `OPN-42 — add quota reset on new day`).
- PR body must use `.github/PULL_REQUEST_TEMPLATE.md` and link the issue.
- Squash-merge into `main` after review and green CI.

## 4. Security Policy (Hard Invariants)

- **Secrets:** Never commit credentials. `src/secrets.json` is git-ignored.
  Use environment variables or the app's Settings dialog for local testing.
  Never read, log, print, or transmit `secrets.json` contents.
- **Dependencies:** Review new dependencies; `npm install` only from trusted
  registries. Keep `electron` and `googleapis` up to date for security patches.
- **Renderer safety:** Keep `nodeIntegration: false` and `contextIsolation: true`.
  **These two settings are immutable.** Do not expose Node APIs or secrets
  through the `contextBridge` beyond `window.api`.
- **CI enforcement:** The `secret-scan` job fails the build if `src/secrets.json`
  is ever tracked. The `lint` job runs on Windows/macOS/Linux.
- **Reporting:** Report suspected vulnerabilities privately to the author;
  do not open public issues for security matters.

## 5. Code Style

- ES module-free CommonJS (Node 18 / Electron 30).
- Prettier-friendly 2-space indentation.
- IPC handlers live in `main.js`; UI logic in `renderer/renderer.js`.
- Keep platform-specific upload logic isolated in `uploader.js` (adapters).

## 6. Documentation Discipline

When behavior changes, update the relevant docs **in the same PR**:
- `docs/ARCHITECTURE.md` for structural/boundary changes.
- `README.md` for user-facing behavior changes.
- Issue templates / PR template if the process changed.

Undocumented behavior change is an incomplete change (fails the Definition of
Done, `docs/DEFINITION_OF_DONE.md`).
