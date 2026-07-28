# Agent Operating Procedures

> **Procedure layer.** Concrete, step-by-step operating rules for agents, sitting
> beneath `AGENTS.md` (the constitution) and `docs/LOOP_ENGINEERING.md` (the loop).
> Where this file and `AGENTS.md` disagree, `AGENTS.md` wins.

## A. Before Any Action

1. Read `AGENTS.md` in full (the constitution is mandatory reading).
2. Locate the GitHub Issue you are working. If none exists for the task, **stop**
   and open one using `.github/ISSUE_TEMPLATE/issue.md`. Do not proceed without it.
3. Confirm the issue is unblocked: no `blocked` label, no open dependency, no
   "needs clarification" comment. If blocked, do not work around it — leave it.

## B. Reading Order for Context

Always load context in this order: `AGENTS.md` → Issue → `docs/ARCHITECTURE.md`
→ `docs/CONTRIBUTING.md` → linked docs (`BUILD.md`, `UML.md`, etc.). Never start
by editing files; start by understanding.

## C. Branching & Commits

- Branch from `main`: `feature/<issue-id>-slug` or `fix/<issue-id>-slug`.
- One logical change per commit; commit messages reference the issue id.
- Never commit `src/secrets.json` or any credential.
- Never amend/force-push shared branches unless explicitly instructed.

## D. Implementation Rules

- Modify **only** files required by the issue. Discovered unrelated problems →
  open a new issue and link it; do not fix inline.
- No unilateral architectural decisions. If the issue implies a design choice not
  documented in `ARCHITECTURE.md`, raise it on the issue and wait.
- Update docs in the **same** PR when behavior changes.
- Keep `contextIsolation`/`nodeIntegration` untouched.

## E. Verification Before PR

Run, and fix until clean:
- `npm run lint`
- Any tests / static analysis available.
- Manual verification steps for the changed behavior.

## F. Opening a PR

- Use `.github/PULL_REQUEST_TEMPLATE.md`.
- Title: `<issue-id> — short summary`.
- Body: summary, changes, testing, docs updated, DoD confirmation, risks/rollout.
- Link the issue. Request review only when all DoD gates pass.

## G. When Blocked or Unclear

- Add a comment to the issue stating exactly what is missing.
- Apply the `blocked` label if you have permission; otherwise request it.
- Stop work on that issue. Pick the next unblocked issue (Step 8 of the loop).
- Never invent requirements, defaults, or scope to "unblock" yourself.

## H. Prohibited Actions (Automatic Violation)

- Implementing without a linked issue.
- Bundling multiple issues into one PR.
- Editing `contextIsolation` / `nodeIntegration`.
- Reading, logging, or committing `src/secrets.json` contents.
- Disabling lint rules without an issue justification in the PR.
- "Fixing" unrelated code inside a scoped PR.

## I. Handoff

When handing an issue to another agent or a human:
- Leave a final comment with: plan, what was done, verification evidence, and any
  open questions. The next actor should not need to re-derive context.
