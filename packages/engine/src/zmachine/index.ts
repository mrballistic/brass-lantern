// @brass-lantern/engine/zmachine: Infocom story files (Z-machine), minus the
// interpreter: the story shelf, saves, story-file reading and the types.
// ZMachineSession, which pulls in ifvms, is only in
// '@brass-lantern/engine/zmachine/session', so a bundler can keep the
// interpreter in a chunk of its own: import that entry dynamically.

export { readStoryFile, type LoadedStory, type StoryFileResult } from './storyfile.ts';
export { IndexedDbShelf, type ShelfEntry } from './shelf.ts';
export { localStorageSaveStore, type SaveStore } from './save-store.ts';
export { SaveStoreDialog, type FileRef } from './dialog.ts';
export type { FilePrompt, SessionEvents, SessionOptions, StatusLine } from './types.ts';
