// @brass-lantern/engine/zmachine: Infocom story files (Z-machine), run by ifvms.
// ZMachineSession pulls in the interpreter; a UI that wants it loaded on
// demand imports '@brass-lantern/engine/zmachine/session' dynamically instead.

export { ZMachineSession, type SessionEvents, type SessionOptions } from './session';
export { readStoryFile, type LoadedStory, type StoryFileResult } from './storyfile';
export { IndexedDbShelf, type ShelfEntry } from './shelf';
export { localStorageSaveStore, type SaveStore } from './save-store';
export { LocalStorageDialog, type FileRef } from './dialog';
export type { FilePrompt, StatusLine } from './types';
