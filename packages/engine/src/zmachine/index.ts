// @brass-lantern/engine/zmachine: Infocom story files (Z-machine), run by ifvms.
// ZMachineSession pulls in the interpreter; a UI that wants it loaded on
// demand imports '@brass-lantern/engine/zmachine/session' dynamically instead.

export { ZMachineSession, type SessionEvents, type SessionOptions } from './session.ts';
export { readStoryFile, type LoadedStory, type StoryFileResult } from './storyfile.ts';
export { IndexedDbShelf, type ShelfEntry } from './shelf.ts';
export { localStorageSaveStore, type SaveStore } from './save-store.ts';
export { LocalStorageDialog, type FileRef } from './dialog.ts';
export type { FilePrompt, StatusLine } from './types.ts';
