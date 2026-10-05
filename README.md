# Brass Lantern

**A small engine for classic parser text adventures**, running in the browser inside a CRT terminal. You write the game as data (rooms, items, people, events, rules) and the engine runs it. Players type *go north* and *give the mug to Gary*; with the optional intent server, they can also type *make that thing stop beeping* and be understood.

**[Play the demo](https://mrballistic.github.io/brass-lantern/demo/)** · **[Read the docs](https://mrballistic.github.io/brass-lantern/)**

```
═══════════════════════════════
        SNACK ATTACK
═══════════════════════════════
✨ IT IS 12:01. YOU ARE HUNGRY.
📍 Your Cubicle
Gray carpet on the walls, gray carpet on the floor. Your desk has one drawer. It is closed.
Exits: hallway (north).
> open drawer
```

## What you get

- **Worlds as data.** One TypeScript object per game. It covers gated rooms, use rules, gifts, dialogue that changes with progress, timed interruptions, hints, a score with ranks, and endings that remember what you did. No engine code to write.
- **A forgiving parser.** Classic verbs and synonyms, chained commands (`take key and wallet`, `north then look`), pronouns, and a second object (`put the disk in the drive`), all with zero latency.
- **An optional LLM, on a short leash.** Input the parser can't handle goes to a small server that asks Gemini which of *your* verbs and IDs it means. Replies are reduced to a verb plus identifiers, so the model never writes the story. The key stays on the server.
- **A terminal worth staring at.** Boot sequence, scanlines, phosphor bloom and decay, flicker, a typewriter that changes pace with the scene. All CSS.
- **Saves in the browser**, and analytics only when you configure them, and then only with the player's consent.
- **Plays Zork, too.** Z-machine story files run in the same terminal, starting with **Zork I**, which Microsoft released under the MIT License in 2025. Pick it from the cartridge menu in the [demo](https://mrballistic.github.io/brass-lantern/demo/).

## Quick start

```bash
git clone https://github.com/mrballistic/brass-lantern.git
cd brass-lantern
npm install
npm run dev            # http://localhost:5173
```

You're now playing **Snack Attack**, the three-room tutorial world. To make your own game, write a world in `src/worlds/` and point `src/app.config.ts` at it. [Your first world](https://mrballistic.github.io/brass-lantern/guide/your-first-world) walks through it.

For loose phrasing, run the intent server too ([guide](https://mrballistic.github.io/brass-lantern/guide/intent-server)):

```bash
cd server && cp .env.example .env    # add GEMINI_KEY
npm install && npm run dev
```

## Docs

- [Getting started](https://mrballistic.github.io/brass-lantern/guide/getting-started)
- [Your first world](https://mrballistic.github.io/brass-lantern/guide/your-first-world)
- [How it works](https://mrballistic.github.io/brass-lantern/guide/how-it-works)
- [The intent server](https://mrballistic.github.io/brass-lantern/guide/intent-server)
- [Testing a world](https://mrballistic.github.io/brass-lantern/guide/testing)
- [Deploying](https://mrballistic.github.io/brass-lantern/guide/deploying)
- [World schema](https://mrballistic.github.io/brass-lantern/reference/world-schema)

They live in `docs/`; `npm run docs:dev` serves them locally.

## Stack

Vue 3, TypeScript, Pinia and Vite in the browser; Node 24 and Express for the optional intent server; Vitest throughout. See [CONTRIBUTING.md](./CONTRIBUTING.md) to help, and [SECURITY.md](./SECURITY.md) to report a problem.

## License

[MIT](./LICENSE). Brass Lantern isn't affiliated with any historical text-adventure publisher, though it owes them everything.

Zork I’s story file is included under its own MIT license; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
