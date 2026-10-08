// @brass-lantern/engine: worlds as data, the parser and the turn loop.
// Story files are behind '@brass-lantern/engine/zmachine'; Zork I, the
// tutorial and the examples behind '@brass-lantern/engine/worlds'.

// The headless turn loop and the world audit.
export { createGame, runTurn, type EngineReply } from './engine/game.ts';
export { auditWorld } from './engine/audit.ts';

// The lower-level engine, for UIs that run their own loop.
export {
  captureLine,
  describeCurrentRoom,
  execute,
  initialState,
  openingLines,
  visibleItemsIn,
  type EngineDeps,
  type EngineResult,
} from './engine/engine.ts';
export { BUILT_IN_WORDS, fallbackParse, splitCommands, strictParse } from './engine/parser.ts';
export { conditionProblems, evaluateCondition } from './engine/conditions.ts';
export {
  interpret,
  newConversation,
  remember,
  resolvePronouns,
  type Conversation,
  type Step,
} from './engine/conversation.ts';
export { buildContext, parseIntentRemote, type IntentContext, type IntentOptions } from './engine/intent-client.ts';
export { setScriptFreeze, type Script, type ScriptContext } from './engine/scripts.ts';
export { classify, makeLine } from './engine/output.ts';
export { inventoryOf, isLit, npcsSeen } from './engine/model.ts';
export { scriptLines, statusText } from './engine/verbs/meta.ts';
export { migrateSave } from './engine/migrate.ts';

// Types (and the two save-format values that travel with them).
export * from './types/game.ts';
export type * from './types/world.ts';
export type * from './types/cartridge.ts';
