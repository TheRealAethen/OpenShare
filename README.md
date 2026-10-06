# OpenShare

> Automatic multi-platform video uploader for **TikTok**, **YouTube** and **Instagram**, built with Electron.

OpenShare is a cross-platform desktop application that lets you manage multiple
"profiles" (brand accounts / channels), drop videos into a per-profile gallery,
and publish them to all connected platforms at once — with daily quota limits
and future scheduling.

- **Author:** Fellipe Bittencourt
- **License:** Proprietary — see [LICENSE](./LICENSE)
- **Status:** Active development

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Setup](#setup)
- [Usage](#usage)
- [Documentation](#documentation)
- [Project Structure](#project-structure)
- [Continuous Integration / Deployment](#continuous-integration--deployment)
- [License](#license)

## Features

- **Profiles** — each profile stores its own video library in a separate folder
  and carries its own platform authentications.
- **Gallery** — every file in a profile is uploaded to *all three platforms* at
  once (one video = 3 platform uploads).
- **Daily quota** — max **30 videos per profile per day** (across the 3
  platforms). A daily run processes due videos, then stops when the limit is hit.
- **Scheduling** — set a future date on any file; it waits until that date (and
  the next daily run) before uploading.
- **OAuth** — uses official platform APIs (you must register a developer app).

## Architecture

OpenShare is built on **Electron**, following the standard main / renderer
process split with a secure `contextBridge` preload script.

| Layer        | File(s)                       | Responsibility                                                   |
|--------------|-------------------------------|------------------------------------------------------------------|
| Main process | `src/main.js`                 | Window lifecycle, IPC handlers, profile/quota/file state, storage |
| Auth         | `src/auth.js`                 | OAuth 2.0 flows (TikTok, YouTube, Instagram) via local redirect   |
| Uploader     | `src/uploader.js`             | Platform-specific upload logic, transcoding, channel lookup       |
| Preload      | `src/preload.js`              | Exposes a safe `window.api` bridge (context isolation)            |
| Renderer     | `src/renderer/*`              | UI (Home, Files, Schedule, Settings), progress, auth modals       |

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full design and
[UML diagrams](./docs/UML.md).

## Requirements

- **Node.js** 18+ and **npm**
- **Electron** 30+
- **ffmpeg** (optional, recommended) — used to transcode to H.264/AAC MP4 for
  YouTube uploads
- Developer app credentials from each platform (see Setup)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Register developer apps and obtain credentials:
   - **TikTok** — https://developers.tiktok.com/ (Video Upload permission)
   - **YouTube** — https://console.cloud.google.com/ (YouTube Data API v3, OAuth client)
   - **Instagram** — https://developers.facebook.com/ (Instagram Graph API, Reels/Video publish)
3. Copy `src/secrets.json` is already a template. Fill in your `clientId` /
   `clientSecret` for each platform (you can also enter them in the app's
   Settings → Connect Platforms dialog).
4. Set each OAuth app's redirect URI to `http://localhost:18923/callback`.
   Instagram requires HTTPS, so use `https://theRealAethen.github.io/OpenShare/callback`
   for it (see [GitHub Pages setup](./docs/GITHUB_PAGES.md)).

> ⚠️ Never commit real credentials. `src/secrets.json` is git-ignored.

## Usage

```bash
npm start
```

Then: create a profile → authenticate each platform → drop videos into the
gallery → optionally set a schedule date → click **Run Daily Upload**.

- One daily run uploads up to 30 videos per profile (90 platform uploads total).
  Re-run the next day for the next batch.
- Scheduled videos are skipped until their date arrives.

## Engineering Operating System

This repository runs as a **self-organizing engineering system**. Every change
must trace `PR → Issue → Epic → Milestone → PRD`. Agents and contributors must
read `AGENTS.md` (the constitution) before any action.

- [AGENTS.md — Constitution](./AGENTS.md) ← **read first**
- [PRD.md — Product Requirements](./PRD.md)
- [ROADMAP.md — Milestones & Epics](./ROADMAP.md)
- [Loop Engineering](./docs/LOOP_ENGINEERING.md)
- [Definition of Done](./docs/DEFINITION_OF_DONE.md)
- [Coding Standards](./docs/CODING_STANDARDS.md)
- [Review Checklist](./docs/REVIEW_CHECKLIST.md)
- [Agent Operating Procedures](./docs/AGENT_OPERATING_PROCEDURES.md)
- [GitHub Issues Seed (Epics & backlog)](./docs/GITHUB_ISSUES_SEED.md)

## Documentation

- [Architecture & System Design](./docs/ARCHITECTURE.md)
- [UML Diagrams](./docs/UML.md)
- [Build & Release](./docs/BUILD.md)
- [Contributing & Security](./docs/CONTRIBUTING.md)
- [GitHub Pages: landing page & OAuth callback](./docs/GITHUB_PAGES.md)

## Project Structure

```
OpenShare/
├── src/
│   ├── main.js            # Main process: IPC, storage, quota, window
│   ├── auth.js            # OAuth flows for each platform
│   ├── uploader.js        # Platform upload implementations
│   ├── preload.js         # ContextBridge API
│   ├── secrets.json       # Credentials (git-ignored) — template only
│   └── renderer/          # UI (HTML/CSS/JS)
├── docs/                  # Documentation, UML, system design
├── .github/workflows/     # CI/CD pipelines
├── package.json
├── LICENSE
└── README.md
```

## Continuous Integration / Deployment

GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`** — installs dependencies and lints the codebase on every push and
  pull request (Windows, macOS, Linux).
- **`release.yml`** — builds packaged installers for Windows, macOS and Linux
  and publishes them as GitHub Releases when a version tag (`v*`) is pushed.

## License

This project is **proprietary software** owned by Fellipe Bittencourt.
All rights reserved. See the [LICENSE](./LICENSE) file for the full terms.
Unauthorized copying, distribution, modification or commercial use is prohibited.
