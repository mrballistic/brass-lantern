# Security

Please report vulnerabilities privately through GitHub's **Report a vulnerability** button on the [Security tab](https://github.com/mrballistic/brass-lantern/security), not in a public issue.

Things worth knowing when you deploy the engine:

- **The Gemini key belongs on the server only.** The browser talks to your intent server, never to Google. Never give the key a `VITE_` prefix: Vite inlines `VITE_*` variables into the public bundle.
- **The intent server has no auth by design.** It's bounded by a per-client rate limit, input size caps and same-origin only (no CORS headers). Put it behind a reverse proxy, and keep your provider's quota limits on.
- **Model output is untrusted.** The server reduces every reply to a known verb plus identifiers before the browser sees it.
