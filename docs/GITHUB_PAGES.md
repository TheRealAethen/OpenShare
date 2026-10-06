# GitHub Pages: Landing Page and OAuth Callback

The public site lives in `docs/` and is served by GitHub Pages:

| File | URL | Purpose |
|------|-----|---------|
| `docs/index.html` | `https://theRealAethen.github.io/OpenShare/` | Landing page with the download button |
| `docs/callback.html` | `https://theRealAethen.github.io/OpenShare/callback` | OAuth redirect target. Forwards the result to the app through `openshare://` |
| `docs/assets/` | (linked from the pages) | `site.css` and `callback.js` |

The hostname is case-insensitive, so `therealaethen.github.io` also works.

## Enable Pages (maintainer, one time)

1. Open the repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Set **Branch** to `main` and the folder to `/docs`, then save.
4. Wait for the first deployment. The site appears at the URL above.

Pages publishes everything in `docs/`, including the Markdown documents in that folder. Those documents are already public in the repository, so no new information is exposed.

## Register the OAuth redirect (Meta)

In the Meta app's Instagram Login settings, add this value as the **Valid OAuth Redirect URI**, exactly as written:

```
https://theRealAethen.github.io/OpenShare/callback
```

Meta rejects `http://` callbacks, so this HTTPS address is the only valid option for Instagram Login.

## How the callback works

1. Meta redirects the browser to `callback.html?code=...&state=...`.
2. `assets/callback.js` keeps only `code`, `state`, `error` and `error_description`, and drops everything else.
3. It removes the query string from the address bar and browser history.
4. The page shows a **Return to OpenShare** button. Its link is `openshare://callback?code=...&state=...`.
5. The app receives the link (see the custom-protocol issue) and checks `state` before using the code.

The button requires a click because browsers block protocol redirects that are not triggered by the user.

## Privacy and security

- The landing page has no analytics, trackers, or third-party scripts. A Content-Security-Policy meta tag restricts it to its own files.
- `Referrer-Policy: no-referrer` stops the authorization code from being sent to other sites.
- The bridge has a fixed destination (`openshare://`) and cannot be used as an open redirect.
- The bridge never validates `state`. That check happens in the app, because the bridge has no secrets and no record of login attempts.

## Test locally

```bash
cd docs
python -m http.server 8000
```

Open `http://localhost:8000/callback.html?code=test&state=test`. The button should link to `openshare://callback?code=test&state=test`. Browsers do not allow `http://` redirects to Meta, so the real flow can only be tested on the published HTTPS address.
