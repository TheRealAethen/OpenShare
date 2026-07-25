# Review Checklist

> **Review layer.** Used by reviewers (human or agent) and during self-review
> (`docs/LOOP_ENGINEERING.md` Step 6). Mirrors the Definition of Done
> (`docs/DEFINITION_OF_DONE.md`) in review-friendly form.

## Traceability
- [ ] PR addresses exactly **one** issue. Link present in description.
- [ ] Issue references Epic, Milestone, and `FR-###`/`NFR-###` from `PRD.md`.
- [ ] No out-of-scope changes bundled in.

## Correctness
- [ ] Change does what the acceptance criteria require.
- [ ] Edge cases handled (empty gallery, unauthenticated platform, past-due schedule).
- [ ] Daily-run is idempotent (no double-upload on rerun).

## Code Quality
- [ ] `npm run lint` is clean (CI confirms on Win/Mac/Linux).
- [ ] Follows `docs/CODING_STANDARDS.md` (naming, structure, boundaries).
- [ ] No unrelated refactors or formatting noise.
- [ ] Functions are small and single-purpose where reasonable.

## Security (must all pass)
- [ ] `src/secrets.json` not tracked; no secrets in diff.
- [ ] No credentials/tokens logged or exposed.
- [ ] `contextIsolation` / `nodeIntegration` unchanged.
- [ ] No new Node/secret surface in `window.api`.
- [ ] Any new dependency reviewed and justified.

## Tests & Verification
- [ ] Tests added/updated where a harness exists.
- [ ] Verification steps documented in PR body.
- [ ] Transient-failure retry/backoff present or justified.

## Documentation
- [ ] `docs/ARCHITECTURE.md` updated for boundary/structural changes.
- [ ] `README.md` updated for user-facing changes.
- [ ] Process docs updated if the process changed.

## Merge Readiness
- [ ] Branch up to date with `main`, no conflicts.
- [ ] PR description complete per `.github/PULL_REQUEST_TEMPLATE.md`.
- [ ] At least one approval recorded.
- [ ] CI green on all matrix OSes.

**Any unchecked security box is an automatic rejection.**
