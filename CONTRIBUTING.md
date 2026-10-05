# Contributing

Thanks for wanting to help. A few things make changes easy to accept:

- **Run the checks** before opening a PR: `npm run lint && npm run type-check && npm run test:coverage && npm run build`, and the same (minus coverage) in `server/`.
- **Keep the engine world-agnostic.** No branching on a world's IDs; if a world needs new behavior, add a generic hook to `src/types/world.ts` and the engine, and give the fixture world (`tests/fixtures/world.ts`) a use of it.
- **New verbs go in three places:** the regex in `src/engine/parser.ts`, the dispatcher in `src/engine/engine.ts` (and HELP), and `ACTION_VOCAB` in `server/src/llm.ts`.
- **Player-facing text** uses curly quotes and apostrophes (“ ” ’).
- **Docs** live in `docs/` (VitePress: `npm run docs:dev`). If you change behavior, change the docs in the same PR.

Some of the engine is developed alongside a private game and synced here, so a PR may be ported rather than merged directly; you'll get credit either way.
