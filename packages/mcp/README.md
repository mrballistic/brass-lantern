<p><img src="https://raw.githubusercontent.com/mrballistic/brass-lantern/main/docs/public/brand/lantern-mark-amber.svg" alt="" width="72" height="72"></p>

# Brass Lantern MCP server

`@brass-lantern/mcp`: a local [Model Context Protocol](https://modelcontextprotocol.io) server that lets a coding agent write, audit and play a Brass Lantern world, and read the docs for the version it is using.

## Install

In Claude Code:

```bash
claude mcp add brass-lantern -- npx -y @brass-lantern/mcp
```

Or in any client’s JSON config:

```json
{ "mcpServers": { "brass-lantern": { "command": "npx", "args": ["-y", "@brass-lantern/mcp"] } } }
```

Node 24 or later. World paths are relative to where the client starts the server. Worlds must be inside that directory or one you allow with `--root <dir>` (repeatable). Each `audit_world` and `play` call runs in its own worker thread and is stopped after 10 seconds; `--timeout <seconds>` changes that.

## Tools

- `audit_world`: checks a world file for broken exits, bad conditions, missing references and more.
- `play`: types commands into a fresh, seeded game and returns the transcript and final state.
- `docs`: the documentation for this version, as an index, a page, or a search.

It uses the world’s own project’s engine when it has one, and every reply says which engine ran.

## Safety

It runs the world module it is pointed at, with your permissions, like your test runner. It is local stdio only and makes no network calls. The allowed-directories check confines which world file is loaded, not what that module imports or does: any module inside an allowed directory can be run. It is not a sandbox.

## Docs

[Coding agents](https://mrballistic.github.io/brass-lantern/guide/coding-agents) covers the tools, the engine choice and the limits in full. Source and issues: [github.com/mrballistic/brass-lantern](https://github.com/mrballistic/brass-lantern). MIT licensed.
