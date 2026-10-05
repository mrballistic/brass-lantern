import type { GameState, ParsedAction } from '@/types/game';
import type { Item, Room, UseRule, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { fuzzyMatch, fuzzyMatchExit } from './fuzzy';

export interface EngineResult {
  /** Lines to append to the output log. */
  lines: string[];
  /** Set true if the engine state changed (so the store should persist). */
  mutated: boolean;
  /**
   * False when the engine couldn't make sense of the command: an unknown
   * verb, or a target that matches nothing here. Misses never mutate state,
   * so the store can safely ask the LLM for a better reading and run that
   * instead.
   */
  understood?: boolean;
}

export interface EngineDeps {
  world: World;
  state: GameState;
}

function ok(lines: string[], mutated = false): EngineResult {
  return { lines, mutated };
}

function miss(line: string): EngineResult {
  return { lines: [line], mutated: false, understood: false };
}

export function initialState(world: World): GameState {
  return {
    currentRoom: world.startRoom,
    inventory: [],
    flags: {},
    moveCount: 0,
    gameOver: false,
    itemsRemoved: {},
    itemsAdded: {},
    firedEvents: [],
    misses: 0,
    turns: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/** Apply structural mutations indicated by an event script's bracketed system lines. */
function applyEventEffects(eventKey: string, world: World, state: GameState): void {
  const lines = world.events[eventKey] ?? [];
  for (const line of lines) {
    if (!line.startsWith('[')) continue;

    const flagSet = line.match(/^\[Flag set:\s*(.+?)\]$/i);
    if (flagSet) {
      const flagId = world.flagLabels[flagSet[1].toLowerCase().trim()];
      if (flagId) state.flags[flagId] = true;
    }

    const added = line.match(/^\[Added to inventory:\s*(.+?)\]$/i);
    if (added) {
      const itemId = itemIdForName(added[1], world);
      if (itemId && !state.inventory.includes(itemId)) state.inventory.push(itemId);
    }

    const consumed = line.match(/^\[(.+?) consumed\]$/i);
    if (consumed) {
      const itemId = itemIdForName(consumed[1], world);
      if (itemId) state.inventory = state.inventory.filter((i) => i !== itemId);
    }
  }
}

function itemIdForName(label: string, world: World): string | null {
  const normalized = label.trim().toLowerCase();
  for (const [id, item] of Object.entries(world.items)) {
    if (item.name.toLowerCase() === normalized) return id;
  }
  return null;
}

/** Emit an event's lines, apply its effects, and record that it fired. */
function runEvent(key: string, world: World, state: GameState): string[] {
  applyEventEffects(key, world, state);
  if (!state.firedEvents.includes(key)) state.firedEvents.push(key);
  return [...(world.events[key] ?? [])];
}

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

const COMPASS = ['north', 'south', 'east', 'west', 'up', 'down'];

/**
 * "cubicles (east), lobby (west)". Shows the room's listed exits, each with
 * the compass direction that leads to the same place, if there is one.
 */
function exitList(room: Room): string {
  const labels = room.listExits ?? Object.keys(room.exits);
  return labels
    .map((label) => {
      const name = label.replace(/_/g, ' ');
      if (COMPASS.includes(label)) return name;
      const dir = COMPASS.find((d) => d !== label && room.exits[d] === room.exits[label]);
      return dir ? `${name} (${dir})` : name;
    })
    .join(', ');
}

/** Lines emitted when entering a room (description, items, NPCs, exits). */
function describeRoom(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [`The world frays. Room “${roomId}” does not exist.`];
  const lines: string[] = [];
  lines.push(`📍 ${room.name}`);
  lines.push(room.description);

  const visibleItems = visibleItemsIn(roomId, world, state);
  if (visibleItems.length > 0) {
    const names = visibleItems.map((id) => world.items[id]?.name ?? id);
    lines.push(`You can see: ${names.join(', ')}.`);
  }

  if (room.npcs.length > 0) {
    const names = room.npcs.map((id) => world.npcs[id]?.name ?? id);
    lines.push(`Present: ${names.join(', ')}.`);
  }

  const exits = exitList(room);
  if (exits) lines.push(`Exits: ${exits}.`);
  return lines;
}

export function visibleItemsIn(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [];
  const removed = new Set(state.itemsRemoved[roomId] ?? []);
  const inInventory = new Set(state.inventory);
  const base = room.items.filter((i) => !removed.has(i) && !inInventory.has(i));
  const added = (state.itemsAdded[roomId] ?? []).filter((i) => !inInventory.has(i));
  return [...base, ...added];
}

/** Evaluate onEnter triggers and emit any event-script lines. */
function runOnEnter(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [];
  const out: string[] = [];
  for (const trigger of room.onEnter) {
    if (state.firedEvents.includes(trigger.then)) continue;
    if (evaluateCondition(trigger.if, state)) out.push(...runEvent(trigger.then, world, state));
  }
  return out;
}

const GENERIC_DENIAL = 'Something stops you. The story isn’t ready for you to go there yet.';

function enterRoom(targetId: string, world: World, state: GameState): string[] {
  const target = world.rooms[targetId];
  if (!target) return ['There is nothing in that direction.'];
  if (target.requires && !evaluateCondition(target.requires, state)) {
    return [target.denial ?? GENERIC_DENIAL];
  }
  state.currentRoom = targetId;
  state.moveCount += 1;
  const lines = describeRoom(targetId, world, state);
  lines.push(...runOnEnter(targetId, world, state));
  return lines;
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/** Fuzzy candidates for items, with aliases folded into the matchable name. */
function itemCandidates(ids: string[], world: World): Array<{ id: string; name: string }> {
  return ids.map((id) => {
    const item = world.items[id];
    const name = item ? [item.name, ...(item.aliases ?? [])].join(' ') : id;
    return { id, name };
  });
}

function reachableItems(world: World, state: GameState): string[] {
  return [...visibleItemsIn(state.currentRoom, world, state), ...state.inventory];
}

function matchItem(target: string, ids: string[], world: World): string | null {
  return fuzzyMatch(target, itemCandidates(ids, world));
}

function matchNpc(target: string, world: World, state: GameState): string | null {
  const present = world.rooms[state.currentRoom]?.npcs ?? [];
  return fuzzyMatch(
    target,
    present.map((id) => ({ id, name: world.npcs[id]?.name ?? id })),
  );
}

/* ------------------------------------------------------------------ */
/* Command handlers                                                    */
/* ------------------------------------------------------------------ */

function handleLook(world: World, state: GameState): EngineResult {
  return ok(describeRoom(state.currentRoom, world, state));
}

function handleInventory(world: World, state: GameState): EngineResult {
  if (state.inventory.length === 0) return ok(['Just the weight of corporate despair.']);
  const lines = ['You are carrying:'];
  for (const id of state.inventory) lines.push(`  - ${world.items[id]?.name ?? id}`);
  return ok(lines);
}

function handleGo(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Go where? Try a direction or a place.']);
  const room = world.rooms[state.currentRoom];
  if (!room) return ok(['You are nowhere.']);

  const exitKey = fuzzyMatchExit(target, room.exits);
  if (!exitKey) {
    return miss(`You can’t go that way. Exits: ${exitList(room) || '(none)'}.`);
  }
  return ok(enterRoom(room.exits[exitKey], world, state), true);
}

const ALL = /^(?:all|everything|it all)$/i;

function handleTake(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Take what?']);
  const visibleIds = visibleItemsIn(state.currentRoom, world, state);
  if (ALL.test(target)) {
    const portable = visibleIds.filter((id) => world.items[id]?.portable);
    if (portable.length === 0) return ok(['There is nothing here worth taking.']);
    const lines: string[] = [];
    for (const id of portable) lines.push(...handleTake(id, world, state).lines);
    return ok(lines, true);
  }
  const itemId = matchItem(target, visibleIds, world);
  if (!itemId) {
    if (matchItem(target, state.inventory, world)) return ok(['You already have that.']);
    return miss(`You don’t see a “${target}” here.`);
  }
  const item = world.items[itemId];
  if (!item.portable) return ok([item.refusal ?? `You can’t take the ${item.name}.`]);

  state.inventory.push(itemId);
  const removed = state.itemsRemoved[state.currentRoom] ?? [];
  removed.push(itemId);
  state.itemsRemoved[state.currentRoom] = removed;

  const lines = [`Taken: ${item.name}.`];
  if (item.onTake && !state.firedEvents.includes(item.onTake)) {
    lines.push(...runEvent(item.onTake, world, state));
  }
  return ok(lines, true);
}

function handleDrop(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Drop what?']);
  const itemId = matchItem(target, state.inventory, world);
  if (!itemId) return miss(`You aren’t carrying a “${target}”.`);

  state.inventory = state.inventory.filter((i) => i !== itemId);
  const added = state.itemsAdded[state.currentRoom] ?? [];
  added.push(itemId);
  state.itemsAdded[state.currentRoom] = added;
  const removed = state.itemsRemoved[state.currentRoom] ?? [];
  state.itemsRemoved[state.currentRoom] = removed.filter((i) => i !== itemId);

  return ok([`Dropped: ${world.items[itemId]?.name ?? itemId}.`], true);
}

function handleExamine(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Examine what?']);
  const matchedItem = matchItem(target, reachableItems(world, state), world);
  if (matchedItem) return ok([world.items[matchedItem]?.description ?? 'It’s nondescript.']);

  const matchedNpc = matchNpc(target, world, state);
  if (matchedNpc) return ok([world.npcs[matchedNpc]?.description ?? 'They look back at you.']);

  return miss(`You see no “${target}” here worth examining.`);
}

/** First applicable use rule on `itemId`, given what else is in reach. */
function findUseRule(
  itemId: string,
  other: string | null,
  reach: string[],
  state: GameState,
  world: World,
): UseRule | null {
  for (const rule of world.items[itemId]?.onUse ?? []) {
    if (rule.with) {
      if (!reach.includes(rule.with)) continue;
      if (other && other !== rule.with) continue;
    }
    if (rule.if && !evaluateCondition(rule.if, state)) continue;
    return rule;
  }
  return null;
}

function applyUseRule(rule: UseRule, world: World, state: GameState): EngineResult {
  const lines: string[] = [];
  if (rule.then) lines.push(...runEvent(rule.then, world, state));
  if (rule.say) lines.push(...rule.say);
  return ok(lines, Boolean(rule.then));
}

function handleUse(
  target: string | undefined,
  indirect: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  if (!target) return ok(['Use what?']);
  const reach = reachableItems(world, state);
  const itemId = matchItem(target, reach, world);
  if (!itemId) return miss(`There is no “${target}” here to use.`);
  const otherId = indirect ? matchItem(indirect, reach, world) : null;
  if (indirect && !otherId) return miss(`There is no “${indirect}” here.`);

  // "put the disk in the terminal" and "use the terminal with the disk" mean
  // the same thing, so check the rules on both sides.
  const rule =
    findUseRule(itemId, otherId, reach, state, world) ??
    (otherId ? findUseRule(otherId, itemId, reach, state, world) : null);
  if (rule) return applyUseRule(rule, world, state);

  if (world.items[itemId]?.onWear && state.inventory.includes(itemId)) {
    return handleWear(target, world, state);
  }
  return miss('You can’t see how to use that here.');
}

function handleWear(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Wear what?']);
  const itemId = matchItem(target, state.inventory, world);
  if (!itemId) return miss(`You aren’t carrying a “${target}”.`);
  const item: Item = world.items[itemId];
  if (!item.onWear) return ok(['That is not really wearable.']);
  if (state.firedEvents.includes(item.onWear)) return ok([`You’re already wearing the ${item.name}.`]);
  return ok(runEvent(item.onWear, world, state), true);
}

function handleTalk(target: string | undefined, world: World, state: GameState): EngineResult {
  const present = world.rooms[state.currentRoom]?.npcs ?? [];
  if (!target) {
    if (present.length !== 1) return ok(['Talk to whom?']);
    target = present[0];
  }
  const npcId = matchNpc(target, world, state);
  if (!npcId) return miss(`There is no “${target}” here to talk to.`);
  const dialogue = world.dialogue[npcId];
  if (!dialogue) return ok(['They have nothing to say.']);

  // Pick the most specific (last-matching) condition-gated line; fall back to default.
  let chosen = dialogue.default;
  for (const [key, value] of Object.entries(dialogue)) {
    if (key === 'default') continue;
    if (evaluateCondition(key, state)) chosen = value;
  }
  return ok([chosen]);
}

function handleGive(
  target: string | undefined,
  indirect: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  if (!target) return ok(['Give what?']);
  const itemId = matchItem(target, state.inventory, world);
  if (!itemId) return miss(`You aren’t carrying a “${target}”.`);

  const present = world.rooms[state.currentRoom]?.npcs ?? [];
  let npcId: string | null;
  if (indirect) {
    npcId = matchNpc(indirect, world, state);
    if (!npcId) return miss(`There is no “${indirect}” here to give it to.`);
  } else if (present.length === 1) {
    npcId = present[0];
  } else {
    return ok([present.length === 0 ? 'There is nobody here to give it to.' : 'Give it to whom?']);
  }

  const npc = world.npcs[npcId];
  const item = world.items[itemId];
  const refusal = npc.refuse?.[itemId];
  if (refusal) return ok([refusal]);
  const event = npc.onGive?.[itemId];
  if (!event) {
    return ok([npc.refuseGift ?? `${npc.name} doesn’t want your ${item.name}.`]);
  }
  state.inventory = state.inventory.filter((i) => i !== itemId);
  return ok(runEvent(event, world, state), true);
}

const PRONOUN = /^(?:it|that|this|them)$/i;

function handleSmash(
  target: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  const finale = world.finale;
  const reach = reachableItems(world, state);
  const itemId = target ? matchItem(target, reach, world) : null;
  const item = itemId ? world.items[itemId] : null;

  if (finale && itemId === finale.item) {
    const armed = state.inventory.includes(finale.with);
    if (armed && state.currentRoom === finale.room) return runFinale(world, state);
    if (armed) return ok([finale.wrongRoom ?? 'Not here.']);
    if (finale.bareHanded) {
      if (state.firedEvents.includes(finale.bareHanded)) {
        return ok([finale.bareHandedAgain ?? 'That still won’t work.']);
      }
      return ok(runEvent(finale.bareHanded, world, state), true);
    }
  }

  // Destructible items with their own one-shot event (the alarm clock). The
  // item is removed from the room afterward.
  if (item?.onSmash && itemId) {
    if (state.firedEvents.includes(item.onSmash)) {
      return ok([`The ${item.name} is already in pieces.`]);
    }
    const lines = runEvent(item.onSmash, world, state);
    const removed = state.itemsRemoved[state.currentRoom] ?? [];
    if (!removed.includes(itemId)) removed.push(itemId);
    state.itemsRemoved[state.currentRoom] = removed;
    return ok(lines, true);
  }

  if (target && !itemId) {
    const wreck = smashedHere(world, state).find((id) =>
      matchItem(target, [id], world),
    );
    if (wreck) return ok([`The ${world.items[wreck].name} is already in pieces.`]);
    if (!PRONOUN.test(target)) return miss(`You don’t see a “${target}” worth smashing.`);
  }
  return ok(['Smashing things at work is, somehow, still frowned upon.']);
}

/** Items that started in this room and have since been smashed. */
function smashedHere(world: World, state: GameState): string[] {
  return (world.rooms[state.currentRoom]?.items ?? []).filter((id) => {
    const hook = world.items[id]?.onSmash;
    return hook !== undefined && state.firedEvents.includes(hook);
  });
}

function scoreLines(world: World, state: GameState): string[] {
  const scoring = world.scoring ?? [];
  if (scoring.length === 0) return [];
  const max = scoring.reduce((sum, s) => sum + s.points, 0);
  const score = scoring.reduce((sum, s) => sum + (state.flags[s.flag] ? s.points : 0), 0);
  const rank = [...(world.ranks ?? [])].sort((a, b) => b.min - a.min).find((r) => score >= r.min);
  const lines = [`[Score: ${score} of ${max}, in ${state.moveCount} moves.]`];
  if (rank) lines.push(`[Rank: ${rank.title}]`);
  return lines;
}

function runFinale(world: World, state: GameState): EngineResult {
  const finale = world.finale!;
  const lines = runEvent(finale.event, world, state);
  for (const trigger of finale.epilogue) {
    if (evaluateCondition(trigger.if, state)) lines.push(...runEvent(trigger.then, world, state));
  }
  lines.push(...scoreLines(world, state));
  lines.push(...runEvent(finale.footer, world, state));
  state.gameOver = true;
  return ok(lines, true);
}

function handleSnooze(world: World, state: GameState): EngineResult {
  const snoozable = visibleItemsIn(state.currentRoom, world, state)
    .map((id) => world.items[id])
    .find((item) => item?.onSnooze);
  if (!snoozable?.onSnooze) {
    const wreck = smashedHere(world, state).find((id) => world.items[id].onSnooze);
    if (wreck) {
      return ok([
        `The ${world.items[wreck].name} is in pieces. There is nothing left to snooze.`,
        'You will probably oversleep tomorrow. This feels, on balance, fine.',
      ]);
    }
    return ok(['There is nothing here to snooze.']);
  }
  // Snoozing is repeatable and changes nothing, so it isn't recorded as fired.
  applyEventEffects(snoozable.onSnooze, world, state);
  return ok([...(world.events[snoozable.onSnooze] ?? [])]);
}

function handleInstall(target: string | undefined, world: World, state: GameState): EngineResult {
  // INSTALL is USE with a carried item. With no usable target, try whatever
  // the player is carrying that has a rule here.
  if (target) {
    const result = handleUse(target, undefined, world, state);
    if (result.understood !== false) return result;
  }
  const reach = reachableItems(world, state);
  for (const id of state.inventory) {
    const rule = findUseRule(id, null, reach, state, world);
    if (rule?.with) return applyUseRule(rule, world, state);
  }
  return miss('There is nothing here to install onto.');
}

/** Waiting or sitting is also how you get through some rooms (the commute). */
function handleIdle(action: string, world: World, state: GameState): EngineResult {
  const room = world.rooms[state.currentRoom];
  if (room?.exits[action]) return ok(enterRoom(room.exits[action], world, state), true);
  return ok([world.idle ?? 'Time passes.']);
}

function handleHint(world: World, state: GameState): EngineResult {
  const hint = (world.hints ?? []).find((h) => evaluateCondition(h.if, state));
  return ok([hint ? `[Hint] ${hint.text}` : '[Hint] You’re on your own here. Try LOOK.']);
}

function handleScore(world: World, state: GameState): EngineResult {
  const lines = scoreLines(world, state);
  return ok(lines.length > 0 ? lines : [`[Moves: ${state.moveCount}]`]);
}

function handleHelp(): EngineResult {
  return ok([
    '═══════ COMMANDS ═══════',
    'GO <direction|place>     N / S / E / W also work',
    'LOOK                     Re-describe the current location',
    'TAKE <item>              Pick up an item (synonyms: GET, GRAB; TAKE ALL)',
    'DROP <item>              Drop an item from your inventory',
    'EXAMINE <item|npc>       Inspect (synonyms: INSPECT, LOOK AT)',
    'USE <item> [ON <thing>]  Use an item, or put it in or on something',
    'GIVE <item> TO <npc>     Hand something over',
    'WEAR <item>              Put on a wearable',
    'TALK TO <npc>            Speak with someone (synonyms: ASK)',
    'INVENTORY / I            List what you are carrying',
    'SMASH <target>           Apply violence',
    'SNOOZE                   Hit the snooze button (contextual)',
    'WAIT / Z                 Let time pass',
    'SLEEP                    If there’s somewhere to sleep',
    'HINT                     A nudge in the right direction',
    'SCORE                    How liberated you are so far',
    'SAVE / LOAD              Local terminal memory',
    'RESTART                  Wipe save and start over',
    'COOKIES                  Analytics settings',
    'HELP / ?                 This screen',
    '════════════════════════',
    'Chain commands: TAKE KEY AND WALLET, WEST THEN LOOK.',
    'You can also just type what you want to do in plain English.',
  ]);
}

function handleUnknown(world: World, state: GameState): EngineResult {
  const pool = world.confused ?? [];
  const misses = state.misses ?? 0;
  state.misses = misses + 1;
  const line =
    pool.length > 0
      ? pool[misses % pool.length]
      : 'I don’t understand that. Type HELP for commands, or try saying it differently.';
  return { lines: [line], mutated: false, understood: false };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export function execute(action: ParsedAction, deps: EngineDeps): EngineResult {
  const { world, state } = deps;

  if (state.gameOver && action.action !== 'restart' && action.action !== 'help') {
    return ok(['The game has ended. Type RESTART to play again.']);
  }

  const result = dispatch(action, world, state);
  if (result.understood === false || state.gameOver) return result;

  // Misses don't count as turns: they must not mutate state (see EngineResult).
  state.turns = (state.turns ?? 0) + 1;
  const interruptions = ambientLines(world, state);
  if (interruptions.length === 0) return result;
  return { ...result, lines: [...result.lines, ...interruptions], mutated: true };
}

function ambientLines(world: World, state: GameState): string[] {
  const turns = state.turns ?? 0;
  const out: string[] = [];
  for (const a of world.ambient ?? []) {
    if (a.every <= 0 || a.lines.length === 0) continue;
    if (turns % a.every !== 0 || !evaluateCondition(a.if, state)) continue;
    out.push(a.lines[(turns / a.every - 1) % a.lines.length]);
  }
  return out;
}

function dispatch(action: ParsedAction, world: World, state: GameState): EngineResult {
  switch (action.action) {
    case 'go':
      return handleGo(action.target, world, state);
    case 'look':
      return handleLook(world, state);
    case 'take':
      return handleTake(action.target, world, state);
    case 'drop':
      return handleDrop(action.target, world, state);
    case 'examine':
      return handleExamine(action.target, world, state);
    case 'use':
      return handleUse(action.target, action.indirect, world, state);
    case 'wear':
      return handleWear(action.target, world, state);
    case 'talk':
      return handleTalk(action.target, world, state);
    case 'give':
      return handleGive(action.target, action.indirect, world, state);
    case 'inventory':
      return handleInventory(world, state);
    case 'smash':
      return handleSmash(action.target, world, state);
    case 'snooze':
      return handleSnooze(world, state);
    case 'install':
      return handleInstall(action.target, world, state);
    case 'hint':
      return handleHint(world, state);
    case 'score':
      return handleScore(world, state);
    case 'help':
      return handleHelp();
    case 'sit':
    case 'wait':
      return handleIdle(action.action, world, state);
    case 'quit':
      return ok([world.quit ?? 'There is no quitting. Type RESTART to start over.']);
    case 'restart':
      // RESTART is handled at the store layer (it clears persistence). Engine just signals.
      return ok(['[RESTART]']);
    case 'save':
    case 'load':
      // Handled at the store/persistence layer.
      return ok([`[${action.action.toUpperCase()}]`]);
    default:
      return handleUnknown(world, state);
  }
}

/** Compose the opening: intro lines + first room description. */
export function openingLines(world: World, state: GameState): string[] {
  const lines = [...(world.events.intro ?? [])];
  lines.push(...describeRoom(state.currentRoom, world, state));
  return lines;
}

export function describeCurrentRoom(world: World, state: GameState): string[] {
  return describeRoom(state.currentRoom, world, state);
}

/** Re-export internal helpers for test access. */
export const __test = { enterRoom, scoreLines };
