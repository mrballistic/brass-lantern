# Brass Lantern

**Classic parser text adventures in a CRT terminal, in the browser.** Write your own game as data, or load a real Infocom-era story file. **The Zork trilogy** is included.

**[Play the demo](https://mrballistic.github.io/brass-lantern/demo/)** · **[Read the docs](https://mrballistic.github.io/brass-lantern/)**

```
═══════════════════════════════
INSTALLED CARTRIDGES
═══════════════════════════════
  1  SNACK ATTACK      native
  2  ZORK I            Z-machine v3
  3  ZORK II           Z-machine v3
  4  ZORK III          Z-machine v3
  5  ZORK I · NATIVE   native
[Type a number to insert a cartridge. EJECT brings you back here.]
[LOAD plays a Z-machine story file from your computer. It stays in this browser; nothing is uploaded.]
> 2
West of House
You are standing in an open field west of a white house, with a boarded front door.
There is a small mailbox here.
> open mailbox
```

## Two ways to play

**Write a world.** A game is one TypeScript object: rooms, items, people, events and the rules that join them. The engine runs it, with no game code to write. You get:
- gated rooms, use rules, gifts, dialogue that changes with progress, timed interruptions, hints, a score with ranks, and endings that remember what you did;
- a forgiving parser, with synonyms, chained commands (`take key and wallet`, `north then look`), pronouns and a second object (`put the disk in the drive`), all with zero latency;
- an optional LLM on a short leash. Input the parser can't handle goes to a small server that asks Gemini which of *your* verbs and IDs it means. The reply is reduced to a verb plus identifiers, so the model never writes the story, and the key stays on the server.

**Load a story file.** Z-machine games (versions 3, 4, 5 and 8) run unmodified in the same terminal, through [ifvms](https://github.com/curiousdannii/ifvms.js), the interpreter inside Parchment. SAVE and RESTORE work, every turn autosaves, and the status line shows in the header. Zork I, II and III ship with the demo; Microsoft released them under the MIT License in 2025. Type LOAD at the menu to play your own story files, which stay in your browser.

**Or both at once.** The demo includes Zork I rebuilt as a native world, checked line by line against the original story file: it’s how the engine proves it can carry an Infocom-class game ([Porting Zork](https://mrballistic.github.io/brass-lantern/guide/porting-zork)).

Both kinds sit side by side as **cartridges**. With more than one, the terminal opens on a menu; with one, it boots straight in.

**The terminal is the point.** Power-on sequence, scanlines, phosphor bloom and decay, flicker, a block cursor, and a typewriter that changes pace with the scene. All CSS, no canvas.

## Built with Brass Lantern

**[Office Space: The Text Adventure](https://initech.mrballistic.com)** is a full-length game on this engine: four chapters from a very bad Monday at Initech to a field, a baseball bat and a printer that has it coming. It runs with the intent server, so you can type like a person.

## Quick start

```bash
git clone https://github.com/mrballistic/brass-lantern.git
cd brass-lantern
npm install
npm run dev            # http://localhost:5173
```

You'll get the cartridge menu: **Snack Attack**, a three-room tutorial world, and **Zork I, II and III**. What it offers is set in `src/app.config.ts`:

```ts
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork2', title: 'ZORK II', story: 'stories/zork2.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork3', title: 'ZORK III', story: 'stories/zork3.z3', format: 'Z-machine v3' },
  { kind: 'world', id: 'zork1-native', title: 'ZORK I · NATIVE', world: zork1 },
];
```

- **To make your own game**, write a world in `src/worlds/` and add it as a cartridge. [Your first world](https://mrballistic.github.io/brass-lantern/guide/your-first-world) walks through it.
- **To add a story file**, drop it in `public/stories/` and add a `zcode` entry. See [Playing story files](https://mrballistic.github.io/brass-lantern/guide/z-machine).

For loose phrasing in native worlds, run the intent server too ([guide](https://mrballistic.github.io/brass-lantern/guide/intent-server)):

```bash
cd server && cp .env.example .env    # add GEMINI_KEY
npm install && npm run dev
```

## Docs

- [Getting started](https://mrballistic.github.io/brass-lantern/guide/getting-started)
- [Your first world](https://mrballistic.github.io/brass-lantern/guide/your-first-world)
- [Playing story files](https://mrballistic.github.io/brass-lantern/guide/z-machine)
- [Porting Zork](https://mrballistic.github.io/brass-lantern/guide/porting-zork)
- [How it works](https://mrballistic.github.io/brass-lantern/guide/how-it-works)
- [The intent server](https://mrballistic.github.io/brass-lantern/guide/intent-server)
- [Testing a world](https://mrballistic.github.io/brass-lantern/guide/testing)
- [Deploying](https://mrballistic.github.io/brass-lantern/guide/deploying)
- [World schema](https://mrballistic.github.io/brass-lantern/reference/world-schema)
- [Player commands](https://mrballistic.github.io/brass-lantern/reference/commands)

They live in `docs/`; `npm run docs:dev` serves them locally.

## Stack

Vue 3, TypeScript, Pinia and Vite in the browser; ifvms and glkapi.js for story files; Node 24 and Express for the optional intent server; Vitest throughout. Saves stay in the browser's localStorage, and analytics run only if you configure them, and then only with the player's consent. See [CONTRIBUTING.md](./CONTRIBUTING.md) to help, and [SECURITY.md](./SECURITY.md) to report a problem.

## License

[MIT](./LICENSE). Brass Lantern isn't affiliated with any historical text-adventure publisher, though it owes them everything.

The Zork story files, ifvms and glkapi.js are included under their own MIT licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
