<p align="center"><img src="https://raw.githubusercontent.com/mrballistic/brass-lantern/main/docs/public/brand/lantern-mark-amber.svg" alt="" width="72" height="72"></p>

# Brass Lantern intent server

`@brass-lantern/server`: maps loose player input (“pocket my billfold”) onto your game’s verbs and IDs with Gemini. The model only classifies; it never writes story text.

## Install

```bash
npm i @brass-lantern/server express
```

Node 24 or later. `express` 5 is an optional peer, needed only for the router.

## Use

```ts
import express from 'express';
import { intentRoute } from '@brass-lantern/server/express';

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use('/api', intentRoute({ apiKey: process.env.GEMINI_KEY! }));   // POST /api/parse-intent
```

Then give the game `intentEndpoint: '/api/parse-intent'`. Not on Express? `parseIntent(input, context, { apiKey })` from `@brass-lantern/server` is the same thing as a function. Both accept `models`, `timeoutMs` and, for the route, `rateLimitPerMinute`.

The package reads no environment variables: you pass the key in. Keep it on the server, and never give it a `VITE_` name, which Vite would inline into the public bundle. The route sets no CORS headers, on purpose.

## Docs

[Using the library](https://mrballistic.github.io/brass-lantern/guide/using-the-library) is the guide for all three packages; the [docs](https://mrballistic.github.io/brass-lantern/) cover worlds, story files and the intent server. Source and issues: [github.com/mrballistic/brass-lantern](https://github.com/mrballistic/brass-lantern). MIT licensed.
