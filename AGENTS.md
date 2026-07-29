# AGENTS.md — Constitution for Engineering Agents

> **This file is the first thing any autonomous agent (or human contributor) must
> read before touching the repository.** It defines the rules that govern how work
> is discovered, planned, implemented, and shipped. Violating these rules breaks
> the auditability of the project.

OpenShare is an **Electron desktop application** that automates multi-platform
video publishing to **TikTok**, **YouTube**, and **Instagram**, with per-profile
galleries, daily quota limits, and scheduling.

---

## 0. The One Rule That Overrides Everything

**No agent may implement work that is not backed by a GitHub Issue.**

- Every change must trace: **implementation → PR → Issue → Epic → Milestone → PRD**.
- If you cannot find an issue that justifies the work, **stop and open one first (THIS IS ONLY IF YOU HAVE EXPLICIT PERMISSION FROM THE HUMAN.)**.
- Do not "fix it because it looks wrong" without an issue. Do not refactor on a
  whim. Do not make architectural decisions on your own.
- Ambiguity is resolved by asking the issue owner / maintainer, **not** by
  inventing a solution.
- OpenCode and other implementing agents **MUST NOT CREATE A NEW ISSUE WITHOUT A HUMAN'S EXPLICIT PERMISSION FIRST.** **The only exception to this is if OpenCode finds something like: -A security vulnerability; -A reproducible data-loss bug; -A release blocker, and even when the exception applies, you MUST explain why the issue was created.**
- **Governance documents (AGENTS.md, PRD.md, ROADMAP.md, CONTRIBUTING.md, coding standards, and similar files) must not be modified unless the assigned GitHub Issue explicitly requires it. Suggestions for changes should be REPORTED, NEVER IMPLEMENTED FIRST.**

This rule exists to eliminate drift. It is the difference between a project that
scales across many agents and one that collapses into conflicting forks of intent.

---

## 1. Mandatory Pre-Action Sequence

Before writing, editing, deleting, or even planning **any** change, an agent MUST:

1. **Read this file** (`AGENTS.md`) in full.
2. **Read the relevant GitHub Issue** the work is tied to. Understand its
   acceptance criteria, dependencies, and linked issues.
3. **Read referenced architecture documents** — at minimum `docs/ARCHITECTURE.md`
   and any docs linked from the issue (e.g. `docs/BUILD.md`, `docs/UML.md`).
4. **Read `CONTRIBUTING.md`** for the security and workflow constraints.
5. Confirm the issue is **unblocked** (no open dependency, no `blocked` label,
   no pending clarification).

Only after all five steps may the agent begin implementation.

---

## 2. Operating Constraints

- **Stay in scope.** Modify only files required by the issue. If you discover
  unrelated problems, open a *new* issue and link it — do not fix it inline.
- **Single-issue PRs.** Every PR addresses exactly one GitHub Issue. If a PR
  drifts into other concerns, split it.
- **Document as you go.** When behavior changes, update the relevant docs
  (`docs/ARCHITECTURE.md`, `README.md`, templates) in the *same* PR. Undocumented
  behavior change is an incomplete change.
- **Never expose secrets.** `src/secrets.json` is git-ignored. Never read,
  log, print, or commit credentials or tokens. Never disable
  `contextIsolation` / `nodeIntegration` in `src/main.js`.
- **No architectural decisions unilaterally.** If the issue implies a design
  choice not already documented, raise it on the issue and wait. Document the
  decision in the issue once resolved.
- **Keep the loop internal.** Iterate on your own implementation until it passes
  every gate in the Definition of Done. The gate is at the **PR boundary** — do
  not open a PR to ask for review of half-done work.

---

## 3. The Development Loop (Loop Engineering)

Follow this cycle for every issue. Full detail in `docs/LOOP_ENGINEERING.md`.

1. **Select** the highest-priority unblocked issue assigned to you.
2. **Gather** all context: the issue, linked issues, architecture docs, tests.
3. **Plan** a concise implementation plan; post it as an issue comment.
4. **Implement** the feature/fix on a topic branch (`feature/<issue-id>-slug`
   or `fix/<issue-id>-slug`).
5. **Verify** — run formatting, lint, tests, and static analysis locally.
6. **Self-review** against `docs/DEFINITION_OF_DONE.md`.
7. **Open the PR** only when all gates pass, linking the issue.
8. **Move to the next issue.** Do not start parallel work that violates single-issue focus.

---

## 4. When Requirements Are Unclear

- Mark the issue as **`blocked`** with a comment describing exactly what is missing.
- Do **not** invent requirements, defaults, or scope.
- Do **not** close the issue with a workaround. A blocked issue waits for the
  owner. The backlog is allowed to have blocked items — that is a signal, not a failure.

---

## 5. Traceability Map

| Layer        | Artifact                              | Owner / Source        |
|--------------|---------------------------------------|-----------------------|
| Vision       | `PRD.md`                              | Product owner         |
| Milestones   | `ROADMAP.md`                          | Product owner         |
| Epics        | GitHub Milestones / Epic issues       | Maintainers           |
| Work items   | GitHub Issues (backlog)               | Agents + maintainers  |
| Change       | GitHub Pull Request                   | Agent                 |
| Standards    | `docs/CODING_STANDARDS.md`            | Maintainers           |
| Gates        | `docs/DEFINITION_OF_DONE.md`          | Maintainers           |
| Review       | `docs/REVIEW_CHECKLIST.md`            | Reviewers             |
| Procedure    | `docs/AGENT_OPERATING_PROCEDURES.md`  | Maintainers           |

---

## 6. Quick Reference

- **Never** implement without an issue.
- **Always** read `AGENTS.md` → Issue → `ARCHITECTURE.md` → `CONTRIBUTING.md` first.
- **Always** keep PRs to one issue.
- **Always** update docs with behavior changes.
- **Never** touch secrets, `contextIsolation`, or `nodeIntegration`.
- **Always** pass the Definition of Done before opening a PR.
- **Block, don't invent**, when requirements are unclear.
- **Before implementing a fix, ask: "What incorrect assumption allowed this bug to exist?"**

---

*This file is the constitution. If any other document conflicts with it, this
file wins, and the conflicting document must be updated via an issue.*
