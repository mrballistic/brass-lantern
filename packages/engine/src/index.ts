// @brass-lantern/engine: worlds as data, the parser and the turn loop.
// Story files are behind '@brass-lantern/engine/zmachine'; Zork I, the
// tutorial and the examples behind '@brass-lantern/engine/worlds'.

// The headless turn loop and the world audit.
export { createGame, runTurn, type EngineReply } from './engine/game';
export { auditWorld } from './engine/audit';

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
} from './engine/engine';
export { BUILT_IN_WORDS, fallbackParse, splitCommands, strictParse } from './engine/parser';
export { conditionProblems, evaluateCondition } from './engine/conditions';
export {
  interpret,
  newConversation,
  remember,
  resolvePronouns,
  type Conversation,
  type Step,
} from './engine/conversation';
export { buildContext, parseIntentRemote, type IntentContext, type IntentOptions } from './engine/intent-client';
export { setScriptFreeze, type Script, type ScriptContext } from './engine/scripts';
export { classify, makeLine } from './engine/output';
export { inventoryOf, isLit, npcsSeen } from './engine/model';
export { scriptLines, statusText } from './engine/verbs/meta';
export { migrateSave } from './engine/migrate';

// Types (and the two save-format values that travel with them).
export * from './types/game';
export type * from './types/world';
export type * from './types/cartridge';
