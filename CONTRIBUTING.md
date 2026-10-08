# Contributing

Thanks for wanting to help. A few things make changes easy to accept:

- **Run the checks** before opening a PR: `npm run lint && npm run type-check && npm run test:coverage && npm run build:packages && npm run build && npm run smoke`. This is an npm-workspaces repo: `packages/engine`, `packages/vue` and `packages/server` are the published libraries, `apps/site` is the demo, and `docs/` the VitePress site.
- **Keep the engine world-agnostic.** No branching on a world's IDs; if a world needs new behavior, add a generic hook to `packages/engine/src/types/world.ts` and the engine, and give the fixture world (`packages/engine/tests/fixtures/world.ts`) a use of it.
- **Most new verbs are world verbs** (`world.verbs` plus `instead` rules) and need no engine change. **A built-in verb goes in four places:** the regex and `BUILT_IN_WORDS` in `packages/engine/src/engine/parser.ts`, the dispatcher in `packages/engine/src/engine/engine.ts`, HELP in `packages/engine/src/engine/verbs/meta.ts`, and `ACTION_VOCAB` in `packages/server/src/llm.ts`.
- **Player-facing text** uses curly quotes and apostrophes (“ ” ’).
- **Docs** live in `docs/` (VitePress: `npm run docs:dev`). If you change behavior, change the docs in the same PR.

Versions follow the packages: a release tag (`v2.0.0`) must match every package.json, and the release workflow publishes the three packages.
