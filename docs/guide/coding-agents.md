# Coding agents

Two ways to give a coding agent (Claude Code, Cursor, Codex and the like) what it needs to build a Brass Lantern world: the docs as one file, and a local MCP server that can also audit and play the world it writes.

## The docs as one file

The site publishes its documentation as markdown, built from the same pages you are reading.

- [llms.txt](https://mrballistic.github.io/brass-lantern/llms.txt) is the index: a one-line summary and a link to every page. Each page also has a `.md` copy beside it (add `.md` to its address). Use this when the agent should fetch only the pages it needs.
- [llms-full.txt](https://mrballistic.github.io/brass-lantern/llms-full.txt) is every page in one file, with the example worlds’ code inlined. Use this when the agent can take it all in one read: it then has the schema, the conditions, the effects and the recipes together.

## The MCP server

`@brass-lantern/mcp` is a local [Model Context Protocol](https://modelcontextprotocol.io) server. It lets an agent close the loop on a world it is writing: **write** the world file, **audit** it, **play** a few commands to see how it actually reads, **fix** what turned up, and repeat. It also serves this version’s docs, so the agent reads the schema that matches the engine.

### Install

In Claude Code:

```bash
claude mcp add brass-lantern -- npx -y @brass-lantern/mcp
```

For any client that takes JSON config:

```json
{
  "mcpServers": {
    "brass-lantern": {
      "command": "npx",
      "args": ["-y", "@brass-lantern/mcp"]
    }
  }
}
```

Node 24 or later. World paths in tool calls are relative to the directory the client starts the server in (normally your project), or absolute. Worlds must be inside that directory or one you allow with `--root <dir>`, which you can repeat and which is relative to the same directory:

```bash
claude mcp add brass-lantern -- npx -y @brass-lantern/mcp --root ../shared-worlds
```

### The tools

**`audit_world`** checks a world file the way the engine’s `auditWorld` does: exits that go nowhere, conditions that don’t parse, effects naming things that don’t exist, unmapped flag labels and more.

Inputs: `path` (a `.ts`, `.mts`, `.js` or `.mjs` module) and optionally `export` (which export is the world; by default the default export, else the only world-shaped one).

```json
{ "path": "src/worlds/office.ts" }
```

```text
World: default in /project/src/worlds/office.ts
Engine: @brass-lantern/engine 2.3.0 (the project’s)
Size: 1 room, 0 items, 0 characters, 0 events

1 problem:
- room hall: exit north goes nowhere (“nowhere”)
```

**`play`** starts a fresh game and types each command as a player would, with no LLM. It is stateless: every call begins at the start, and the game is seeded (default seed 1, or pass `seed`) so a run repeats exactly. To continue a session, send the whole command list again. At most 500 commands run per call, and a transcript over 2,000 lines keeps its opening and its last 200 lines, with a note where the middle was cut. The game stops when it ends.

Inputs: `path`, optionally `export`, `commands` (the lines to type, in order) and optionally `seed`.

```json
{ "path": "src/worlds/office.ts", "commands": ["open drawer", "take key", "north"] }
```

````text
World: default in /project/src/worlds/office.ts
Engine: @brass-lantern/engine 2.3.0 (the project’s)
Seed: 1

…the opening…
> open drawer
You open the drawer. Inside is a brass key.
> take key
Taken.
> pull the lever with feeling
[not understood by the parser: “pull the lever with feeling”. With the intent server running, an LLM would get a chance to read it.]
…

Final state:
```json
{
  "room": "Lobby (lobby)",
  "inventory": ["brass key"],
  "flags": [],
  "score": 0,
  "moves": 2,
  "gameOver": false
}
````

The “not understood by the parser” note marks input the regex parser can’t read. A real player with the [intent server](./intent-server) would have it sent to the LLM; here nothing is, so treat the note as “this phrasing needs a verb, an alias or a rule” rather than as a bug. The final state includes `score`, from the engine’s `currentScore`. Notes (such as “Game over after 3 of 5 commands.”) come in a blank-line-separated block just before “Final state:”. Two things depend on the engine in use: a project engine older than 2.3.0 has no `currentScore`, so `score` comes from the world’s `score` variable, or is `null` if the world keeps none; and an engine without the parser helpers skips the “not understood” note. Neither is a fault in the world.

**`docs`** serves the documentation bundled with the server. With no arguments it returns the index of pages; with `page` (such as `reference/world-schema`) one page’s markdown; with `query` (such as `timers fuses`) the best-matching sections. If you give both, `page` wins.

```json
{ "query": "timers fuses" }
```

```text
…the best-matching sections, each with its page path…
```

### Which engine

The server audits and plays a world with the engine the world’s own project uses, so a project on 2.2 is checked by 2.2’s rules. It looks for `@brass-lantern/engine` from the world file. If the project has none, the server uses the engine bundled with it, and the reply says “bundled with the MCP server” without further comment. If the project’s engine is found but can’t be used (it can’t be resolved or fails to import, or lacks `createGame` or `auditWorld`), the server falls back to the bundled one and adds a note saying why. Every reply states the engine version and whose it is, so you always know what you were checked against.

A world file is re-read on every call, so an edit shows on the next one. That covers `.ts` and `.mts` worlds and the project files they import (loaded with no module cache), and `.mjs` and `.js` worlds along with the project files they import. Packages a world imports stay cached and are not reloaded.

### Safety and limits

The server **runs the world module it is pointed at**, with your permissions, the same way your test runner runs your tests. Point it at code you trust. It speaks only over local stdio and makes no network calls of its own. A world file is only loaded when it is inside the directory the server started in or one you passed with `--root`, compared after resolving symlinks; anything else is refused with a message naming `--root`. That check confines which world file is loaded, not what the module then imports or does: any module inside an allowed directory can be run. It is not a sandbox.

A world’s console output (`console.log`, `dir`, `table` and the rest) goes to stderr, so it can’t break the protocol.

Two limits to know: a world whose script loops forever hangs the server until the client restarts it, and a world that calls `process.exit()` ends the server the same way. There is no per-call timeout yet.
