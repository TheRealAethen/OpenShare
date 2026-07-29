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
npm install              # install dependencies (including electron-builder)
npm start                # run the app in development (Electron)
npm run lint             # eslint on src
npm run build:installer  # build installers for current platform
npm run package          # build installers for all platforms (win + mac + linux)
npm run build:win        # Windows-only installer
npm run build:mac        # macOS-only installer
```

## Packaging

The project uses [`electron-builder`](https://www.electron.build/) configured in
`package.json` under the `"build"` key. Installers are output to the `dist/`
directory.

Outputs:

| Platform | Artifact                       |
|----------|--------------------------------|
| Windows  | `dist/OpenShare-Setup-*.exe`   |
| macOS    | `dist/OpenShare-*.dmg`         |
| macOS    | `dist/OpenShare-*.zip`         |
| Linux    | `dist/OpenShare-*.AppImage`    |

### Local build

```bash
npm run build:installer
```

This runs `electron-builder` which packages the app and produces the
platform-specific installer(s) in `dist/`. No code signing is configured for
local builds; unsigned installers work for testing.

### Code signing (CI)

The CI `release.yml` workflow signs the binaries using secrets set in the
repository:

- **Windows:** `WIN_CERTIFICATE_BASE64` + `WIN_CERTIFICATE_PASSWORD`
- **macOS:** `MAC_CERTIFICATE_BASE64` + `MAC_CERTIFICATE_PASSWORD` +
  `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`

These are optional — unsigned builds still work for local use.

## Release Process

1. Bump the `version` in `package.json`.
2. Commit and push to `main`.
3. Tag the commit: `git tag v1.0.0 && git push origin v1.0.0`.
4. The `.github/workflows/release.yml` workflow builds all three platforms and
   publishes a GitHub Release with the installers attached.

> Note: `src/secrets.json` (credentials) is git-ignored and must never be
> included in a release artifact.
