# Coding Standards

> **Standards layer.** Enforced by `npm run lint` and the Definition of Done
> (`docs/DEFINITION_OF_DONE.md`). Referenced by `AGENTS.md` and
> `docs/LOOP_ENGINEERING.md`.

## 1. Language & Runtime

- **CommonJS** modules (no `import`/`export`). Node 18 / Electron 30 target.
- No transpilation step; ship the source as-is to Electron.
- Prefer `async`/`await` over raw promise chains for readability.

## 2. Formatting

- 2-space indentation. No tabs.
- Semicolons required.
- Double quotes for strings (Prettier default).
- Max line length 100; break long IPC handler signatures sensibly.
- Trailing commas in multiline literals.

## 3. Naming

- `camelCase` for variables, functions, methods.
- `PascalCase` for constructors / classes (rare in this codebase).
- `UPPER_SNAKE` only for module-level constants (e.g. `DAILY_QUOTA = 30`).
- File names: `kebab-case.js` for new modules (existing files keep their names).

## 4. Structure & Boundaries

- IPC handlers **only** in `src/main.js`; surface them via `src/preload.js`.
- Platform upload logic **only** in `src/uploader.js` (or adapter files it loads).
- UI logic **only** in `src/renderer/renderer.js` + `index.html` + `styles.css`.
- Secrets **only** in `src/auth.js` / `src/secrets.json`. Never import secrets
  into the renderer or preload.
- Keep `main.js` as orchestration; push business logic into focused modules.

## 5. Error Handling

- Catch and classify upload errors (transient vs permanent) in the adapter layer.
- Never swallow errors silently; log with context and record `lastError`.
- Use `try/catch` around all `await` calls that can fail (network, fs).

## 6. Comments

- No comments unless they explain **why** (non-obvious intent, platform quirks).
- Document public IPC channel names and adapter contract in `ARCHITECTURE.md`.
- Avoid TODOs without a linked issue id: `// TODO(OPN-42): ...`.

## 7. Testing

- Pure functions (quota math, scheduling selection) should be unit-testable.
- Keep side-effecting code (fs, network) behind small functions that can be
  stubbed.
- When adding a new module, add a `*.test.js` next to it if a harness exists.

## 8. Lint Rules (`.eslintrc.json`)

- `eslint` with the repo config; treat errors as build failures.
- `no-console` is allowed in the main process for diagnostics, but never log
  secrets/tokens.
- No `eslint-disable` without an issue reference in the PR.

## 9. Security Non-Negotiables

- `contextIsolation: true`, `nodeIntegration: false` — never change.
- No `eval`, no `dangerouslySetInnerHTML`, no inline event handlers in renderer.
- CSP in `index.html` must remain restrictive.
