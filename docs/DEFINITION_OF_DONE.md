# Definition of Done (DoD)

> **Gates layer.** A PR is *not* complete until **every** checkbox below is
> satisfied. The gate is enforced at the **PR boundary** — agents iterate
> internally until all gates pass before opening (or requesting review on) a PR.
> Referenced by `AGENTS.md` §3 and `docs/LOOP_ENGINEERING.md`.

## 1. Traceability Gates

- [ ] PR references exactly **one** GitHub Issue (single-issue PR rule).
- [ ] Issue references its `Epic`, `Milestone`, and relevant `FR-###`/`NFR-###`
      from `PRD.md`.
- [ ] Implementation does not exceed the issue's stated scope.

## 2. Code Quality Gates

- [ ] `npm run lint` passes locally (no errors; warnings resolved or justified).
- [ ] No new lint disables (`/* eslint-disable */`) without issue justification.
- [ ] Changes are limited to files required by the issue (no unrelated refactors).
- [ ] Code follows `docs/CODING_STANDARDS.md`.

## 3. Security Gates (Hard)

- [ ] `src/secrets.json` is **not** tracked by git (CI `secret-scan` passes).
- [ ] No credentials, tokens, or secrets are logged, printed, or exposed.
- [ ] `contextIsolation: true` and `nodeIntegration: false` remain unchanged.
- [ ] No new Node APIs or secrets exposed through `window.api` beyond spec.
- [ ] No new dependency added without review note in the PR.

## 4. Testing Gates

- [ ] New logic has tests where a test harness exists; if none exists, the PR
      notes why and opens a follow-up issue.
- [ ] Manual/automated verification steps are documented in the PR body.
- [ ] Transient-failure paths (uploads) include retry/backoff or are justified.

## 5. Documentation Gates

- [ ] `docs/ARCHITECTURE.md` updated if structure/boundaries changed (same PR).
- [ ] `README.md` updated if user-facing behavior changed (same PR).
- [ ] Issue/PR templates or process docs updated if the process changed.

## 6. Review Gates

- [ ] Self-review completed against `docs/REVIEW_CHECKLIST.md`.
- [ ] PR description is complete per `.github/PULL_REQUEST_TEMPLATE.md`.
- [ ] At least one human/maintainer approval (or agent review) recorded.
- [ ] CI is green on all matrix OSes (Windows / macOS / Linux).

## 7. Merge Gates

- [ ] Branch is up to date with `main` (no conflicts).
- [ ] Squash-merged with a message citing the issue id.
- [ ] Linked issue is closed by the merge (or explicitly left open with reason).

**If any box is unchecked, the work is not Done — keep iterating or mark the
issue `blocked` with a comment. Do not open a PR to ask for review of half-done
work (`AGENTS.md` §2).**
