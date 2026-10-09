import type { GameState } from '../types/game.ts';
import type { BlowMessages, BlowResult, CombatText, World } from '../types/world.ts';
import { childrenOf, isAlive, isAwake, isCarried, isNpcHidden, isNpcIn, moveItem, npcStateOf } from './model.ts';
import { commandOf } from './scripts.ts';
import { runEventKey, runSteps, stopLine, turnHalted } from './effects.ts';
import { prob, roll } from './rng.ts';
import { currentScore } from './score.ts';

// Fights, ported from Zork I's HERO-BLOW, VILLAIN-BLOW and I-FIGHT
// (historicalsource/zork1, 1actions.zil). The engine owns the mechanics; the
// world supplies the numbers and the words.

const M: BlowResult = 'missed';
const U: BlowResult = 'unconscious';
const K: BlowResult = 'killed';
const L: BlowResult = 'lightWound';
const W: BlowResult = 'seriousWound';
const S: BlowResult = 'stagger';

/** Zork's melee tables. A blow is one of nine entries, from some offset in. */
export const TABLES = {
  DEF1: [M, M, M, M, S, S, U, U, K, K, K, K, K],
  DEF2A: [M, M, M, M, M, S, S, L, L, U],
  DEF2B: [M, M, M, S, S, L, L, L, U, K, K, K],
  DEF3A: [M, M, M, M, M, S, S, L, L, W, W],
  DEF3B: [M, M, M, S, S, L, L, L, W, W, W],
  DEF3C: [M, S, S, L, L, L, L, W, W, W],
} as const satisfies Record<string, BlowResult[]>;

// ZIL's <REST table 2> skips one two-byte entry.
const DEF1_RES = [TABLES.DEF1, TABLES.DEF1.slice(1), TABLES.DEF1.slice(2)];
const DEF2_RES = [TABLES.DEF2A, TABLES.DEF2B, TABLES.DEF2B.slice(1), TABLES.DEF2B.slice(2)];
const DEF3_RES = [TABLES.DEF3A, TABLES.DEF3A.slice(1), TABLES.DEF3B, TABLES.DEF3B.slice(1), TABLES.DEF3C];

/** The table for an attacker of strength `att` against a defender of strength `def` (both at least 1). */
export function pickTable(att: number, def: number): readonly BlowResult[] {
  if (def === 1) return DEF1_RES[Math.min(att, 3) - 1];
  if (def === 2) return DEF2_RES[Math.min(att, 4) - 1];
  return DEF3_RES[Math.max(-2, Math.min(2, att - def)) + 2];
}

/** One blow's result from a table: Zork's <GET tbl <- <RANDOM 9> 1>>. */
function blow(state: GameState, att: number, def: number): BlowResult {
  return pickTable(att, def)[roll(state, 9) - 1];
}

/** The player's strength: grows with score, falls with wounds (Zork's FIGHT-STRENGTH). */
export function fightStrength(world: World, state: GameState, adjusted = true): number {
  const { min, max } = world.combat?.strength ?? { min: 2, max: 7 };
  const step = Math.floor((world.maxScore ?? 0) / (max - min));
  const base = min + (step > 0 ? Math.floor(currentScore(world, state) / step) : 0);
  return adjusted ? base - (state.player?.wounds ?? 0) : base;
}

/** A character's strength now: its state, less what the player's weapon takes off (Zork's VILLAIN-STRENGTH). */
function villainStrength(world: World, state: GameState, npc: string, weapon?: string): number {
  const combat = world.npcs[npc]?.combat;
  let od = state.npcs?.[npc]?.strength ?? combat?.strength ?? 0;
  if (od >= 0 && combat?.fears && weapon === combat.fears.item) od = Math.max(1, od - combat.fears.by);
  return od;
}

/** The first weapon someone holds (Zork's FIND-WEAPON). */
export function weaponHeldBy(world: World, state: GameState, holder: string): string | null {
  if (holder === 'player') {
    // The most recently taken first, as Zork's FIRST? reads the inventory.
    const placed = state.placed ?? {};
    const carried = Object.keys(world.items).filter((id) => world.items[id].weapon && isCarried(state, id));
    return carried.sort((a, b) => (placed[b] ?? -1) - (placed[a] ?? -1))[0] ?? null;
  }
  return childrenOf(world, state, holder).find((id) => world.items[id]?.weapon) ?? null;
}

const ZORK_TEXT: Record<CombatText, string> = {
  bareHands: 'Trying to attack a {defender} with your bare hands is suicidal.',
  notHolding: 'You aren’t even holding the {weapon}.',
  notWeapon: 'Trying to attack the {defender} with a {weapon} is suicidal.',
  notPerson: 'I’ve known strange people, but fighting a {defender}?',
  notCombatant: '{defender} won’t fight you.',
  recovering: 'You are still recovering from that last blow, so your attack is ineffective.',
  defenseless: 'The {how} {defender} cannot defend himself: He dies.',
  dies: 'Almost as soon as the {defender} breathes his last breath, a cloud of sinister black fog envelops him, and when the fog lifts, the carcass has disappeared.',
  regainsFeet: 'The {defender} slowly regains his feet.',
  stillHave: 'Fortunately, you still have a {weapon}.',
  death: 'It appears that that last blow was too much for you. I’m afraid you are dead.',
};

const BRASS_TEXT: Record<CombatText, string> = {
  bareHands: 'You can’t fight the {defender} with your bare hands.',
  notHolding: 'You aren’t holding the {weapon}.',
  notWeapon: 'The {weapon} isn’t a weapon.',
  notPerson: 'You can only fight people.',
  notCombatant: '{defender} won’t fight you.',
  recovering: 'You’re still reeling from that last blow.',
  defenseless: 'The {defender} can’t defend themselves.',
  dies: 'The {defender} is dead.',
  regainsFeet: 'The {defender} gets back up.',
  stillHave: 'You still have the {weapon}.',
  death: 'That last blow was too much for you.',
};

const BRASS_HERO: Required<BlowMessages> = {
  missed: ['You miss the {defender}.'],
  unconscious: ['The {defender} is knocked out.'],
  killed: ['The {defender} is killed.'],
  lightWound: ['You wound the {defender}.'],
  seriousWound: ['You wound the {defender} badly.'],
  stagger: ['The {defender} staggers.'],
  loseWeapon: ['The {defender} drops their weapon.'],
  hesitate: ['The {defender} hesitates.'],
  sittingDuck: ['The {defender} is helpless.'],
};

const BRASS_VILLAIN: Required<BlowMessages> = {
  missed: ['The {defender} misses you.'],
  unconscious: ['The {defender} knocks you out.'],
  killed: ['The {defender} kills you.'],
  lightWound: ['The {defender} wounds you.'],
  seriousWound: ['The {defender} wounds you badly.'],
  stagger: ['The {defender} staggers you.'],
  loseWeapon: ['The {defender} knocks your {weapon} away.'],
  hesitate: ['The {defender} hesitates.'],
  sittingDuck: ['The {defender} finishes you off.'],
};

function fill(text: string, fields: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => fields[key] ?? '');
}

/** A fixed fight line, from the world or the style's default. */
export function combatText(world: World, key: CombatText, fields: Record<string, string> = {}): string {
  const text = world.combat?.texts?.[key] ?? (world.style === 'infocom' ? ZORK_TEXT : BRASS_TEXT)[key];
  return fill(text, fields);
}

/** One message for a blow, picked from the seed (Zork's RANDOM-ELEMENT). */
function blowMessage(
  state: GameState,
  options: string[] | undefined,
  fallback: string[],
  fields: Record<string, string>,
): string {
  const list = options && options.length > 0 ? options : fallback;
  return fill(list[roll(state, list.length) - 1], fields);
}

/** A character dies: the fog line, gone from the room, and its onDeath. */
function killNpc(world: World, state: GameState, npc: string): string[] {
  const s = npcStateOf(state, npc);
  s.strength = 0;
  s.fighting = false;
  const lines = [combatText(world, 'dies', { defender: world.npcs[npc].name })];
  const onDeath = world.npcs[npc].combat?.onDeath;
  if (onDeath) lines.push(...runEventKey(onDeath, world, state));
  return lines;
}

/** The player's blow at a character, after the refusals (Zork's HERO-BLOW and VILLAIN-RESULT). */
export function heroBlow(world: World, state: GameState, npc: string, weapon: string): string[] {
  const name = world.npcs[npc].name;
  const fields = { defender: name, weapon: world.items[weapon]?.name ?? weapon };
  const s = npcStateOf(state, npc);
  s.fighting = true;
  if (state.player?.staggered) {
    state.player.staggered = false;
    return [combatText(world, 'recovering', fields)];
  }
  const att = Math.max(1, fightStrength(world, state));
  let def = villainStrength(world, state, npc, weapon);
  const theirs = weaponHeldBy(world, state, npc);
  const lines: string[] = [];
  let result: BlowResult;
  if (!theirs || def < 0) {
    lines.push(combatText(world, 'defenseless', { ...fields, how: def < 0 ? 'unconscious' : 'unarmed' }));
    result = 'killed';
  } else {
    result = blow(state, att, def);
    if (result === 'stagger' && prob(state, 25)) result = 'loseWeapon';
    lines.push(blowMessage(state, world.combat?.messages?.[result], BRASS_HERO[result], fields));
  }
  switch (result) {
    case 'unconscious':
      def = -def;
      break;
    case 'killed':
    case 'sittingDuck':
      def = 0;
      break;
    case 'lightWound':
      def = Math.max(0, def - 1);
      break;
    case 'seriousWound':
      def = Math.max(0, def - 2);
      break;
    case 'stagger':
      s.staggered = true;
      break;
    case 'loseWeapon':
      if (theirs) moveItem(state, theirs, state.currentRoom);
      break;
  }
  s.strength = def;
  if (def === 0) return [...lines, ...killNpc(world, state, npc)];
  if (result === 'unconscious') {
    s.fighting = false;
    const hook = world.npcs[npc].combat?.onUnconscious;
    if (hook) lines.push(...runEventKey(hook, world, state));
  }
  return lines;
}

/** Wakes a knocked-out character (Zork's AWAKEN): its strength back, and its onWake. */
function awaken(world: World, state: GameState, npc: string): string[] {
  if ((state.npcs?.[npc]?.strength ?? 0) >= 0) return [];
  const s = npcStateOf(state, npc);
  s.strength = -(s.strength ?? 0);
  const hook = world.npcs[npc].combat?.onWake;
  return hook ? runEventKey(hook, world, state) : [];
}

/** The player's weapon in the command just run, if it was an attack with one (Zork's PRSI). */
function attackWeapon(world: World, state: GameState): string | undefined {
  const cmd = commandOf(state);
  return cmd?.verb === 'attack' && cmd.indirect && world.items[cmd.indirect]?.weapon ? cmd.indirect : undefined;
}

/**
 * A character's blow at the player (Zork's VILLAIN-BLOW and WINNER-RESULT).
 * Returns the result, 'staggered' when it spent the blow getting up, or null
 * when the player died.
 */
function villainBlow(world: World, state: GameState, npc: string, lines: string[]): BlowResult | 'staggered' | null {
  const player = (state.player ??= {});
  player.staggered = false;
  const s = npcStateOf(state, npc);
  const name = world.npcs[npc].name;
  if (s.staggered) {
    s.staggered = false;
    lines.push(combatText(world, 'regainsFeet', { defender: name }));
    return 'staggered';
  }
  const att = villainStrength(world, state, npc, attackWeapon(world, state));
  let def = fightStrength(world, state);
  if (def <= 0) return 'missed';
  const od = fightStrength(world, state, false);
  const mine = weaponHeldBy(world, state, 'player');
  let result = blow(state, att, def);
  if (result === 'stagger' && mine && prob(state, 25)) result = 'loseWeapon';
  const fields = { defender: name, weapon: mine ? world.items[mine].name : '' };
  lines.push(blowMessage(state, world.npcs[npc].combat?.messages?.[result], BRASS_VILLAIN[result], fields));
  const limit = world.carry?.limit;
  const lowerLoad = (by: number) => {
    if (limit === undefined) return;
    const load = player.load ?? limit;
    if (load > 50) player.load = load - by;
  };
  switch (result) {
    case 'killed':
    case 'sittingDuck':
      def = 0;
      break;
    case 'lightWound':
      def = Math.max(0, def - 1);
      lowerLoad(10);
      break;
    case 'seriousWound':
      def = Math.max(0, def - 2);
      lowerLoad(20);
      break;
    case 'stagger':
      player.staggered = true;
      break;
    case 'loseWeapon':
      if (mine) {
        moveItem(state, mine, state.currentRoom);
        const next = weaponHeldBy(world, state, 'player');
        if (next) lines.push(combatText(world, 'stillHave', { weapon: world.items[next].name }));
      }
      break;
  }
  if (def === 0) {
    lines.push(...runSteps([{ die: combatText(world, 'death') }], world, state));
    return null;
  }
  if (def < od) {
    player.wounds = od - def;
    player.cureIn = world.combat?.cureWait ?? 30;
  }
  return result;
}

/** After each acted-on turn: characters wake, join fights, and swing (Zork's I-FIGHT and DO-FIGHT). */
export function fightTurn(world: World, state: GameState): string[] {
  const lines: string[] = [];
  const fighters: string[] = [];
  for (const [id, npc] of Object.entries(world.npcs)) {
    const combat = npc.combat;
    if (!combat || !isAlive(world, state, id)) continue;
    const s = state.npcs?.[id];
    if (isNpcIn(world, state, id, state.currentRoom) && !isNpcHidden(world, state, id)) {
      if ((s?.strength ?? 0) < 0) {
        const p = s?.wake ?? 0;
        if (p > 0 && prob(state, p)) {
          npcStateOf(state, id).wake = 0; // Zork's <PUT .OO ,V-PROB 0>, before AWAKEN
          lines.push(...awaken(world, state, id));
        }
        else npcStateOf(state, id).wake = p + (combat.wake ?? 25);
      } else if (s?.fighting || (combat.firstStrike !== undefined && combat.firstStrike > 0 && prob(state, combat.firstStrike))) {
        // A first strike (F-FIRST?) drops the rest of the line, as Zork's P-CONT <>.
        if (!s?.fighting) stopLine(state);
        npcStateOf(state, id).fighting = true;
        fighters.push(id);
      }
    } else {
      if (s?.fighting || s?.staggered) {
        const st = npcStateOf(state, id);
        st.fighting = false;
        st.staggered = false;
        if (state.player) state.player.staggered = false;
      }
      lines.push(...awaken(world, state, id));
    }
  }
  // One round. (Zork's source gives a knocked-out player's foes 1–3 more rounds,
  // but Release 119, the story file, doesn't: a knock-out is just a blow.)
  for (const id of fighters) {
    if (!isAwake(world, state, id) || !state.npcs?.[id]?.fighting) continue;
    const combat = world.npcs[id].combat!;
    if (combat.weapon && combat.onBusy && state.locations[combat.weapon] !== id) {
      lines.push(...runEventKey(combat.onBusy, world, state));
      continue;
    }
    const result = villainBlow(world, state, id, lines);
    if (result === null || turnHalted(state) || state.gameOver) return lines;
  }
  return lines;
}

/** One turn of healing (Zork's I-CURE). */
export function cureTick(world: World, state: GameState): void {
  const p = state.player;
  if (!p || p.cureIn === undefined) return;
  p.cureIn -= 1;
  if (p.cureIn > 0) return;
  p.wounds = Math.max(0, (p.wounds ?? 0) - 1);
  const limit = world.carry?.limit;
  if (p.wounds > 0) {
    if (limit !== undefined && (p.load ?? limit) < limit) p.load = (p.load ?? limit) + 10;
    p.cureIn = world.combat?.cureWait ?? 30;
  } else {
    if (limit !== undefined) p.load = limit;
    p.cureIn = undefined;
  }
}

const WOUNDS = ['', 'a light wound,', 'a serious wound,', 'several wounds,'];
const OUTLOOK = ['expect death soon', 'be killed by one more light wound', 'be killed by a serious wound', 'survive one serious wound'];

/** DIAGNOSE (Zork's V-DIAGNOSE). */
export function diagnoseLines(world: World, state: GameState): string[] {
  const p = state.player;
  const wounds = p?.cureIn !== undefined ? (p.wounds ?? 0) : 0;
  const style = (lines: string[]) => (world.style === 'infocom' ? lines : lines.map((l) => `[${l}]`));
  const moves = (world.combat?.cureWait ?? 30) * (wounds - 1) + (p?.cureIn ?? 0);
  const lines = [wounds === 0 ? (world.diagnose?.healthy ?? 'You are in perfect health.') : (world.diagnose?.wounded ?? `You have ${WOUNDS[wounds] ?? 'serious wounds,'} which will be cured after ${moves} moves.`)];
  // A world without fights has nothing more to say than how you are.
  if (!world.combat) return style(lines);
  const rs = fightStrength(world, state, false) - (p?.wounds ?? 0);
  lines.push(`You can ${OUTLOOK[rs] ?? (rs > 3 ? 'survive several wounds' : 'expect death soon')}.`);
  const deaths = state.vars?.deaths ?? 0;
  if (deaths > 0) lines.push(`You have been killed ${deaths === 1 ? 'once' : 'twice'}.`);
  return style(lines);
}
