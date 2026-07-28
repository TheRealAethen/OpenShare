# Loop Engineering

> **Process layer.** The development loop every agent follows, issue → merged PR.
> Drives `AGENTS.md` §3. The core principle: **the quality gate is at the PR
> boundary**, so the agent iterates internally and only surfaces work when it is
> ready for review.

## Principles

1. **Eliminate ambiguity before acting.** Every cycle starts by loading context
   from the issue and the repository docs — never by making a guess.
2. **One issue, one PR.** No scope creep, no parallel unrelated work.
3. **Internal iteration.** Lint, test, and self-review happen *before* the PR
   exists. The PR is a signal that the gates in `docs/DEFINITION_OF_DONE.md` pass.
4. **Block, don't invent.** When a requirement is missing or contradictory, stop
   and mark `blocked`. The backlog is allowed to hold blocked items.

## The Cycle

### Step 1 — Select
Choose the highest-priority **unblocked** issue assigned to you. "Unblocked"
means: no open dependency, no `blocked` label, no pending clarification.

### Step 2 — Gather
Read, in order:
1. `AGENTS.md` (constitution).
2. The GitHub Issue (acceptance criteria, dependencies, linked issues).
3. `docs/ARCHITECTURE.md` and any docs linked from the issue.
4. `docs/CONTRIBUTING.md` (security + workflow).

### Step 3 — Plan
Write a concise implementation plan as an issue comment:
- Files to touch.
- The approach (cite existing patterns from the codebase).
- Anything uncertain → raise as a question on the issue, do not assume.

### Step 4 — Implement
On a topic branch (`feature/<issue-id>-slug` or `fix/<issue-id>-slug`):
- Stay in scope.
- Follow `docs/CODING_STANDARDS.md`.
- Update docs in the same commits when behavior changes.

### Step 5 — Verify
Run locally:
- `npm run lint`
- Tests / static analysis if available.
- Manual verification steps for the changed behavior.

Fix everything that fails. **Do not proceed to Step 6 until this is clean.**

### Step 6 — Self-Review
Walk `docs/REVIEW_CHECKLIST.md` and `docs/DEFINITION_OF_DONE.md`. Confirm every
gate is satisfied. If a gate cannot be satisfied, return to Step 4 or mark the
issue `blocked`.

### Step 7 — Open PR
Open the PR only now, using `.github/PULL_REQUEST_TEMPLATE.md`, linking the issue.
The PR says "ready for review," not "please help me finish."

### Step 8 — Next
After merge (or if blocked), return to Step 1. Do not start a second in-flight
issue that violates single-issue focus.

## Why the Gate Is at the PR Boundary

Pushing review-worthy work early creates noise and supervisory load. By making
the agent responsible for reaching the Definition of Done before the PR, the
human reviewer sees only work that is already internally consistent, tested, and
documented. This is what lets multiple agents work with minimal intervention
while preserving architectural integrity.

## Metrics (optional, for maintainers)

- Cycle time: issue start → PR merge.
- Blocked ratio: blocked issues / total opened.
- DoD failures at review: how often a PR fails a DoD gate post-open (should trend
  to zero as agents mature).
