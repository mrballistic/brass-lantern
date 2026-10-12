# Brass Lantern 2.3.0: an MCP server for coding agents

**Status:** draft for the owner’s review (2026-10-12). Decisions marked **(proposed)** are recommendations, not yet approved.

## Goal

Let a coding agent write a Brass Lantern world and check its own work. `llms.txt` (docs PR #27) gives an agent the documentation in one read. This release adds what reading can’t give: running the engine on the agent’s world. The loop becomes write → audit → play → fix, without a human pasting transcripts.

Ship it as a fourth package, **`@brass-lantern/mcp`**, a stdio [Model Context Protocol](https://modelcontextprotocol.io) server, released with the other packages as **2.3.0**.

Success looks like this: an agent in Claude Code (or any MCP client), given only “make a three-room game where you need a key”, writes the world file, audits it clean, plays it to the ending, and fixes what the playthrough shows, all through these tools.

## Constraints

- **The engine stays as it is.** The server is a thin layer over public exports (`createGame`, `auditWorld`, the `World` type). If a tool needs something the engine doesn’t export, export it in its own commit with a test. Don’t reach into internals.
- **Local and stdio only.** The server runs the user’s own world module with the user’s privileges, the way their test runner does. There is no network listener, no remote transport and no telemetry. The docs say plainly that it executes the world file it is pointed at.
- **Lockstep versions.** All four packages are 2.3.0, as the release workflow requires. The engine, vue and server ship with no behavior change unless an export is added.
- Repo rules carry over: smart punctuation in player- and doc-facing text, American spelling, tests first, coverage thresholds (80/80/80, 75 branches). Never read `.env` files. The owner approves the publish.

## 1. The package

- `packages/mcp`, published as `@brass-lantern/mcp`, ESM, Node 24 (matching the server package). Binary: `brass-lantern-mcp`.
- Dependencies: `@modelcontextprotocol/sdk` (the official TypeScript SDK; tools are declared with its zod schemas), `@brass-lantern/engine` (`^2.3.0`), and **`jiti`** for loading a `.ts` world without a build step **(proposed)**. The alternatives are requiring a compiled `.js` world, which agents rarely have, or `tsx` as a loader, which is heavier and changes process-wide hooks.
- Setup in a client, documented for Claude Code with a generic JSON snippet for others:
  ```json
  { "mcpServers": { "brass-lantern": { "command": "npx", "args": ["-y", "@brass-lantern/mcp"] } } }
  ```
  Paths in tool calls resolve against the server’s working directory (the project the client launched it in).

## 2. Loading a world

Every engine tool takes `path` (a `.ts`, `.mts`, `.js` or `.mjs` module) and an optional `export` (an export name).

- **Which export:** the named one. If none is named: the default export if it’s world-shaped, otherwise the only world-shaped named export. Several candidates is an error that lists their names. World-shaped means an object with `rooms`, `items`, `npcs` and `startRoom`.
- **Which engine (proposed):** the engine **the world’s own project resolves** (`createRequire(path)` → `@brass-lantern/engine`), so an agent auditing a 2.2 project gets 2.2’s rules. The server’s bundled engine is the fallback when the project has none. Every engine tool reports the version it used.
- **Fresh every call:** the module is loaded fresh each time (no module cache), so an edit is seen on the next call.
- **Errors are results, not crashes:** a syntax error, a missing file or a throwing module comes back as an error result naming the file and the message. The server keeps running.

## 3. Tools

All replies are plain text an agent can read, with the structured parts as compact JSON blocks.

1. **`audit_world { path, export? }`**: runs `auditWorld`. Returns the problems, one per line, or “No problems.” Also reports the world’s size (room, item, NPC and event counts) and the engine version used.
2. **`play { path, export?, commands: string[], seed? }`**: a fresh game (seeded; default seed 1, so runs repeat exactly), then each command through `Game.send`, the same path the browser takes minus the LLM.
   - Returns a transcript (the opening lines, then `> command` and the reply lines for each) and the final state: room, inventory, flags set, score and moves, and game over or not.
   - Stateless **(proposed)**: each call replays from the start. Worlds are deterministic under a seed, replay is fast, and nothing has to be cleaned up. Sessions can come later if agents need them.
   - Caps: 500 commands per call; output trimmed past 2,000 lines, with a note.
   - Lines the regex parser can’t read are reported as “not understood (the intent server would see this)”, since there is no LLM here.
3. **`docs { page?, query? }`** **(proposed)**: the documentation for the engine version in use, from the same per-page markdown `llms.txt` points at, bundled into the package at build.
   - No arguments: the index.
   - `page` (for example `reference/world-schema`): that page.
   - `query`: the matching sections (headings plus their text), best first, capped.
   - It works offline and can’t drift from the version the agent is auditing against.

Not in this release: writing or scaffolding world files (the agent’s own editor does that), the intent server, story files (Z-machine), and remote transports.

## 4. Docs bundling

The generator from PR #27 moves from `docs/.vitepress/llms.ts` to `scripts/llms.mjs` (or stays TypeScript under `scripts/`), so both the docs build and `packages/mcp`’s build call it. The MCP build writes the per-page markdown into `packages/mcp/dist/docs/`. The published package carries the docs of its own version.

## 5. Testing

- **Unit:**
  - World loading: a default export; one named export; several, which is an error; a `.ts` file; a syntax error, which comes back as an error result; an edit picked up on the next call.
  - Engine resolution: the project’s engine when present, else the bundled one.
  - Each tool’s output format.
  - `play` caps.
- **Integration:** start the built server over stdio with the SDK’s client and run `audit_world`, `play` and `docs` against a fixture world file in `packages/mcp/tests/fixtures/`. That file is a small world with a deliberate audit problem, plus a clean one.
- **The real loop:** `play` drives the tutorial world (Snack Attack) to its ending through the tool and matches `tutorial.test.ts`’s winning run.
- **Smoke:** `npm run smoke` grows a step that packs `@brass-lantern/mcp`, installs it into the scratch project, and runs `brass-lantern-mcp` against a world there through the SDK client.

## 6. Release

- Versions to 2.3.0 everywhere. `scripts/release-check.mjs` checks the new package’s engine range.
- `release.yml`’s publish loop gains `mcp` (after `engine`).
- **Owner steps before the tag:**
  - Create the npm package with a placeholder version, as was done for the first three (`0.0.0-stage`). npm’s trusted publishing can only be configured on a package that exists.
  - Add the Trusted Publisher: repo `mrballistic/brass-lantern`, workflow `release.yml`, environment `npm-publish`.
- **Docs:**
  - A guide page, “Coding agents”, covering `llms.txt` and the MCP server with client setup, the three tools, and the execution warning.
  - README and getting-started links.
  - CHANGELOG.

## Open questions for the owner

1. Package name `@brass-lantern/mcp` and binary `brass-lantern-mcp`?
2. Stateless `play` (replay each call) for now, with sessions only if agents need them?
3. Use the project’s own engine when it has one, rather than always the bundled one?
4. Include the `docs` tool, or rely on `llms.txt` alone?
