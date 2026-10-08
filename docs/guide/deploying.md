# Deploying

A Brass Lantern game is a static site, plus the intent server if you want loose phrasing understood. If you use the packages in your own app ([Using the library](./using-the-library)), deploy your app the way you already do and mount `intentRoute` in your backend; this page is about the repo’s demo site and server.

## Static only

`npm run build` writes `apps/site/dist/`, which any static host can serve: GitHub Pages, Netlify, an S3 bucket, a web server. Without an intent server the game still plays on the regex parser alone; players just get a "didn't understand" reply where the server would have helped.

To serve from a subpath, set the base at build time:

```bash
VITE_BASE=/my-game/ npm run build
```

That's how the [demo](https://mrballistic.github.io/brass-lantern/demo/) is published: `.github/workflows/pages.yml` builds these docs and the demo together and deploys them to GitHub Pages on every push to `main`.

## With the intent server

The SPA calls `/api/parse-intent` on its own origin, so serve both from one host and proxy `/api/` to the server:

```apache
# Apache (mod_proxy, mod_proxy_http)
DocumentRoot /var/www/my-game
<Directory /var/www/my-game>
    FallbackResource /index.html
</Directory>
ProxyPass        /api/  http://127.0.0.1:3001/api/
ProxyPassReverse /api/  http://127.0.0.1:3001/api/
```

```nginx
# nginx
root /var/www/my-game;
location / { try_files $uri /index.html; }
location /api/ { proxy_pass http://127.0.0.1:3001; }
```

Build and run the server:

```bash
npm ci && npm run build -w @brass-lantern/server
GEMINI_KEY=… NODE_ENV=production node packages/server/dist/index.js
```

::: warning Install the dev dependencies
The repo’s server imports `express`, which this repo keeps as a dev dependency (the published package treats it as an optional peer). Don’t install with `npm ci --omit=dev` before running `node packages/server/dist/index.js`: the server won’t start. Install everything, or write your own small app around `intentRoute` and install `express` yourself.
:::

In production, use a process manager (systemd, pm2, a container) and keep the key in an environment file only that service can read. The server drains in-flight requests on SIGTERM, so rolling restarts don't drop players' commands.

## Suggestions from running one

- **Cache hashed assets forever and `index.html` never**, and upload the assets before `index.html`. Then a deploy never serves a page whose scripts haven't arrived yet.
- **Deploy as a user that can only write the site**, not an admin. A CI deploy key is as powerful as the account it logs into.
- **Pin your CI actions to commit SHAs**, and keep deploy secrets in a deployment environment that only release tags can use.
- **Check that the key never reaches the bundle.** A CI step that greps `dist/` for `AIza` fails the build if it ever does.
- **Analytics (the demo site):** set `VITE_GA_MEASUREMENT_ID` at build time to turn on its GA4 reporting. The consent banner appears only then. In your own app, analytics are whatever you wire to `GameOptions.analytics`.
