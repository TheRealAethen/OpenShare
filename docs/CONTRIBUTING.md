# Contributing & Security

OpenShare is **proprietary software** owned by Fellipe Bittencourt.
Contributions are currently closed to the public; this document covers internal
development and security practices.

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/short-description
   ```
2. Keep changes focused; run `npm run lint` before committing.
3. Open a pull request; CI must pass (lint on Windows/macOS/Linux).
4. Squash-merge into `main` after review.

## Security Policy

- **Secrets:** Never commit credentials. `src/secrets.json` is git-ignored.
  Use environment variables or the app's Settings dialog for local testing.
- **Dependencies:** Review new dependencies; `npm install` only from trusted
  registries. Keep `electron` and `googleapis` up to date for security patches.
- **Renderer safety:** Keep `nodeIntegration: false` and `contextIsolation: true`.
  Do not expose Node APIs or secrets through the `contextBridge` beyond
  `window.api`.
- **Reporting:** Report suspected vulnerabilities privately to the author;
  do not open public issues for security matters.

## Code Style

- ES module-free CommonJS (Node 18 / Electron 30).
- Prettier-friendly 2-space indentation.
- IPC handlers live in `main.js`; UI logic in `renderer/renderer.js`.
- Keep platform-specific upload logic isolated in `uploader.js`.
