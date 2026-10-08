# The intent server

Players don’t type like parsers. The intent server hears what the regex parser couldn’t handle, such as “make that thing stop beeping” or “pocket my billfold”, and asks an LLM which of the engine’s verbs and IDs that means. It’s optional: without it the game is fully playable, and loose phrasing just gets a “didn’t understand” reply.

It ships as `@brass-lantern/server`, with `parseIntent` (a function) and `intentRoute` (an Express router). The repo also has a small Express app around them for the demo, described under [Run the repo’s server](#run-the-repo-s-server).

## Use it in your own backend

The package reads no environment variables; you pass the key in. [Using the library](./using-the-library#the-intent-server) has the full wiring:

```ts
import { intentRoute } from '@brass-lantern/server/express';

app.set('trust proxy', 'loopback'); // behind a reverse proxy on the same machine
app.use(express.json({ limit: '32kb' }));
app.use('/api', intentRoute({ apiKey, models, timeoutMs, rateLimitPerMinute }));
```

Behind Apache or nginx, `trust proxy` lets the rate limit see each player’s address; without it every request seems to come from the proxy, and all your players share one bucket. Then set `intentEndpoint: '/api/parse-intent'` in the game’s options. Without it (or with `null` or an empty string) the game never asks.

## Run the repo’s server

```bash
npm install                                  # at the repo root: installs every workspace
cd packages/server
cp .env.example .env        # then set GEMINI_KEY (get one at https://aistudio.google.com/apikey)
npm run dev                 # http://127.0.0.1:3001
```

With `npm run dev` running at the repo root too, Vite proxies `/api/*` to it, so the browser just calls its own origin. This app reads its settings from the environment (below); the library does not.

::: danger Keep the key on the server
The browser never talks to Google; only this server does, with the key in a request header. **Never give the key a `VITE_` prefix.** Vite inlines `VITE_*` variables into the public bundle.
:::

## The API

`POST /api/parse-intent`

```json
{
  "input": "hand gary his mug",
  "context": {
    "roomName": "Hallway",
    "exits": ["south", "cubicle", "north", "break_room"],
    "items": ["mug"],
    "npcs": ["gary (Gary)"],
    "inventory": ["stapler"],
    "verbs": []
  }
}
```

Response: `{ "action": "give", "target": "mug", "indirect": "gary" }`, or `{ "action": "unknown" }` when there’s no good reading or every model fails. Items whose name matches their ID are sent as the bare ID; others as `id (name)`.

The reply can also carry a `prep` (`put … under`, `throw … off`, `read … through`), a `direction` (`push … north`), and a `number` (`turn dial to 4`, 0 to 1000; the client keeps it only when `target` or `indirect` is the word `number` or its digits). For an order (`tell robot to take lamp`), `indirect` is the command as a few plain lowercase words instead of an identifier; the engine parses it as it would typed text.

`verbs` lists the world’s own verbs, which the server accepts alongside its built-in list. Bad requests and rate limiting get an error status instead: 400 with only an `error` field for a missing input or malformed context; 400 with `fallback` as well for input over 200 characters; 429 (with `Retry-After`) and 500, both with `fallback`. The `fallback` is always `{ "action": "unknown" }`. The bundled client treats any non-OK response as `unknown`, so the player just sees the literal reply.

The repo’s server app also answers `GET /health` with `{"ok":true}`; `intentRoute` itself serves only `POST /parse-intent`.

## How it decides

The server calls Gemini’s REST API directly, with no SDK:

- **Structured output.** `responseMimeType: application/json` with a schema whose verb field is an enum of the engine’s actions. Temperature 0, minimal thinking, 150 output tokens.
- **A model chain inside one deadline.** It tries `gemini-3.5-flash-lite`, then `gemini-3.6-flash`, within 5 seconds in total. Every attempt but the last is capped at 2.5s, so a stalled model still leaves time for the fallback.
- **Error handling.** A retired model (404), rate limiting (429) and server errors (5xx) move on to the next model. Bad requests and bad keys (400/401/403) stop, since every model would repeat them.
- **Sanitizing.** The reply must name a known verb, and `target` / `indirect` must look like identifiers. Anything else is dropped, so model output can never carry prose to the player.
- **The prompt** treats player input as data, and tells the model to answer with IDs from the context.

## Configuration

These apply to the repo’s own server app. All of them are read in `packages/server/src/config.ts`; the library entry points take the same settings as parameters instead.

| Variable | Default | |
|---|---|---|
| `GEMINI_KEY` | (required) | The server refuses to start without it. |
| `GEMINI_MODELS` | `gemini-3.5-flash-lite,gemini-3.6-flash` | Comma-separated, tried in order. `GEMINI_MODEL` (one model) also works. |
| `PORT` | `3001` | |
| `HOST` | `127.0.0.1` | Loopback by default; put a reverse proxy in front. |
| `RATE_LIMIT_PER_MINUTE` | `30` | Per client, per process. |

Google retires models regularly. A retired model just answers 404 and the chain moves on, so update the list when you notice, before the last one goes.

## Abuse limits

There’s no auth, by design: the endpoint only classifies short commands. Its cost is bounded instead:

- **Input caps:** 200 characters of input, and context lists of at most 50 entries of 100 characters each.
- **Rate limit:** per client, with IPv6 bucketed by /64 so one user can’t rotate addresses, plus a global ceiling.
- **No CORS headers**, so other websites can’t spend your quota from their visitors’ browsers.
- **Your provider’s quota** as the backstop. Keep a spending limit on the key.
