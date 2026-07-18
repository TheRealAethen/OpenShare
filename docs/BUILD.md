# OpenShare — Build & Release

## Build Prerequisites

- Node.js 18+ and npm
- ffmpeg available on the build host (only used at runtime for YouTube)
- For Windows/macOS code signing (recommended for distribution):
  - `WIN_CERTIFICATE_BASE64` + `WIN_CERTIFICATE_PASSWORD` (Windows)
  - `MAC_CERTIFICATE_BASE64` + `MAC_CERTIFICATE_PASSWORD` + `APPLE_ID` +
    `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` (macOS)
  - These are configured as GitHub Actions secrets; they are **optional** —
    unsigned builds still work for local use.

## Commands

```bash
npm install        # install dependencies
npm start          # run the app in development (Electron)
npm run lint       # eslint on src
```

## Packaging

The CI `release.yml` workflow uses [`electron-builder`](https://www.electron.build/)
to produce native installers. To run a build locally you would add
`electron-builder` and a `build` section to `package.json`, then:

```bash
npx electron-builder --win --mac --linux
```

Outputs:

| Platform | Artifact                       |
|----------|--------------------------------|
| Windows  | `dist/OpenShare-Setup-*.exe`   |
| macOS    | `dist/OpenShare-*.dmg`         |
| Linux    | `dist/OpenShare-*.AppImage`    |

## Release Process

1. Bump the `version` in `package.json`.
2. Commit and push.
3. Tag the commit: `git tag v1.0.0 && git push origin v1.0.0`.
4. The `release.yml` workflow builds all three platforms and publishes a GitHub
   Release with the installers attached.

> Note: `src/secrets.json` (credentials) is git-ignored and must never be
> included in a release artifact.
