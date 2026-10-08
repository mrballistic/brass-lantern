import { computed } from 'vue';
import { makeLine, type Cartridge } from '@brass-lantern/engine';
import { readStoryFile, type StoryFileResult } from '@brass-lantern/engine/zmachine';
import { cookiesReply } from '../options.ts';
import { useGameContext, type GameContext } from './context.ts';

export type SessionMode = 'menu' | 'world' | 'zcode';

const FILE_TYPES = '.z3, .z5, .z8 or .zblorb';

function whyNot(name: string, r: Exclude<StoryFileResult, { ok: true }>): string {
  switch (r.error) {
    case 'glulx':
      return `[${name} is a Glulx game. Brass Lantern plays Z-machine story files: ${FILE_TYPES}.]`;
    case 'version':
      return `[${name} is a version ${r.version} story file; versions 3, 4, 5 and 8 work here.]`;
    case 'too-big':
      return `[${name} is too big to be a Z-machine story file.]`;
    default:
      return `[${name} isn’t a Z-machine story file.]`;
  }
}

/**
 * One interface for the terminal, whatever is running: the cartridge menu,
 * a native world, or a Z-machine story. Outside a component, pass the game's context.
 */
export function useSession(ctx: GameContext = useGameContext()) {
  const carts = ctx.useCartridgeStore();
  const game = ctx.useGameStore();
  const zgame = ctx.useZGameStore();

  const mode = computed<SessionMode>(() => carts.active?.kind ?? 'menu');
  const output = computed(() =>
    mode.value === 'world' ? game.output : mode.value === 'zcode' ? zgame.output : carts.output,
  );
  const isParsing = computed(() => mode.value === 'world' && game.isParsing);
  const restored = computed(() =>
    mode.value === 'world' ? game.restored : mode.value === 'zcode' ? zgame.restored : false,
  );
  const status = computed(() =>
    mode.value === 'world' ? game.headerStatus : mode.value === 'zcode' ? zgame.headerStatus : '',
  );
  const title = computed(() => (carts.hasMenu ? (carts.active?.title ?? '') : ''));

  async function start(c: Cartridge): Promise<void> {
    carts.insert(c);
    zgame.stop();
    if (c.kind === 'world') game.initialize(c);
    else await zgame.initialize(c);
  }

  /** After the boot animation: resume or boot the obvious cartridge, or show the menu. */
  async function boot(): Promise<void> {
    await carts.loadShelf();
    const c = ctx.catalog.autoBootCartridge(carts.all);
    if (c) await start(c);
    else carts.showMenu();
  }

  /** Should the terminal open a file picker for this input? (It has to, before awaiting, to keep the keypress's user activation.) */
  function wantsFile(raw: string): boolean {
    return mode.value === 'menu' && carts.hasMenu && /^(load|open)$/i.test(raw.trim());
  }

  /** A file the player chose or dropped: put it on the shelf and play it. */
  async function loadFile(file: File): Promise<void> {
    let result: StoryFileResult;
    try {
      result = readStoryFile(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch {
      carts.output.push(makeLine(`[${file.name} couldn’t be read.]`));
      return;
    }
    if (!result.ok) {
      carts.output.push(makeLine(whyNot(file.name, result)));
      return;
    }
    const { cartridge, stored } = await carts.addLocal(result.story);
    await start(cartridge);
    if (!stored) zgame.appendLine(`[This browser wouldn’t keep ${cartridge.title}, so it’s here only until you reload.]`);
  }

  async function submit(raw: string): Promise<void> {
    const input = raw.trim();
    const lower = input.toLowerCase();
    if (lower === 'eject' && carts.hasMenu && mode.value !== 'menu') {
      zgame.stop();
      carts.eject();
      return;
    }
    // A native world handles these itself, as store commands (with its line and UNDO bookkeeping).
    if (mode.value === 'world') {
      await game.submit(input);
      return;
    }
    const lines = mode.value === 'zcode' ? zgame.output : carts.output;
    if (lower === 'cookies' || lower === 'privacy') {
      lines.push(makeLine(`> ${input}`), makeLine(cookiesReply(ctx.options)));
      return;
    }
    // THEME, BLOOM and EFFECTS: the same theme state and replies as in a native world.
    const themeReply = game.themeInput(input);
    if (themeReply !== null) {
      lines.push(makeLine(`> ${input}`), makeLine(themeReply));
      return;
    }
    if (mode.value === 'zcode') {
      zgame.submit(input);
      return;
    }
    if (wantsFile(input)) {
      lines.push(makeLine(`> ${input}`), makeLine(`[Choose a story file: ${FILE_TYPES}.]`));
      return;
    }
    const remove = /^(?:remove|forget)\s+(\d+)$/i.exec(input);
    if (remove) {
      await carts.remove(input, Number(remove[1]));
      return;
    }
    const chosen = carts.choose(input);
    if (chosen) await start(chosen);
  }

  return { mode, output, isParsing, restored, status, title, boot, start, submit, wantsFile, loadFile };
}
