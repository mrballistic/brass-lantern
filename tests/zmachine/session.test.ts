import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession } from '@/zmachine/session';
import type { StatusLine } from '@/zmachine/types';

const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

async function waitFor(check: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for the game');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A session plus a transcript, and type() to play a turn and get its output. */
function harness(dialog = new LocalStorageDialog('test')) {
  const lines: string[] = [];
  const state = { waiting: false, exited: false, status: null as StatusLine | null, errors: [] as string[] };
  const session = new ZMachineSession(story, dialog, {
    onLines: (l) => lines.push(...l),
    onStatus: (s) => {
      state.status = s;
    },
    onWaiting: () => {
      state.waiting = true;
    },
    onExit: () => {
      state.exited = true;
    },
    onError: (m) => state.errors.push(m),
  });
  async function type(command: string): Promise<string> {
    await waitFor(() => state.waiting);
    state.waiting = false;
    const from = lines.length;
    session.submit(command);
    await waitFor(() => state.waiting || state.exited);
    return lines.slice(from).join('\n');
  }
  return { session, lines, state, type, dialog };
}

describe('ZMachineSession with Zork I', () => {
  beforeEach(() => localStorage.clear());

  it('boots, shows the status line, and plays a turn without echo or prompt', async () => {
    const h = harness();
    h.session.start();
    await waitFor(() => h.state.waiting);
    expect(h.lines).toContain('West of House');
    expect(h.state.status).toEqual({ location: 'West of House', detail: 'Score: 0  Turns: 0' });
    const out = await h.type('open mailbox');
    expect(out).toBe('Opening the small mailbox reveals a leaflet.');
    expect(h.state.status?.detail).toBe('Score: 0  Turns: 1');
  });

  it('saves under a name and restores it', async () => {
    const h = harness();
    h.session.start();
    expect(await h.type('save')).toContain('[Save as? Type a name, or CANCEL.]');
    expect(await h.type('before leaflet')).toContain('Ok.');
    await h.type('open mailbox');
    expect(await h.type('take leaflet')).toContain('Taken.');
    expect(await h.type('restore')).toContain('[Restore which save? before leaflet. Or CANCEL.]');
    expect(await h.type('before leaflet')).toContain('Ok.');
    expect(await h.type('inventory')).toContain('You are empty-handed.');
  });

  it('says so when there is nothing to restore', async () => {
    const h = harness();
    h.session.start();
    const out = await h.type('restore');
    expect(out).toContain('[There are no saved games yet.]');
    expect(out).toContain('Failed.');
  });

  it('fails cleanly on a misspelled save name, and on CANCEL', async () => {
    const h = harness();
    h.session.start();
    await h.type('save');
    await h.type('real one');
    await h.type('restore');
    expect(await h.type('rael one')).toContain('Failed.');
    await h.type('save');
    expect(await h.type('cancel')).toContain('Failed.');
    expect(await h.type('look')).toContain('West of House');
  });

  it('fails cleanly on CANCEL at a restore prompt', async () => {
    const h = harness();
    h.session.start();
    await h.type('save');
    await h.type('kept');
    await h.type('restore');
    expect(await h.type('cancel')).toContain('Failed.');
    expect(await h.type('look')).toContain('West of House');
  });

  it('refuses to save when storage is unavailable, and keeps playing', async () => {
    const h = harness(new LocalStorageDialog('test', null));
    h.session.start();
    const out = await h.type('save');
    expect(out).toContain('[Saving isn’t available in this browser.]');
    expect(out).toContain('Failed.');
    expect(await h.type('open mailbox')).toContain('reveals a leaflet');
  });

  it('says so when a save doesn’t fit in storage, even though the game says Ok.', async () => {
    // Small writes (the availability probe) succeed; anything bigger fails, like nearly-full storage.
    const real = window.localStorage;
    const tight: Storage = {
      get length() { return real.length; },
      key: (i) => real.key(i),
      getItem: (k) => real.getItem(k),
      removeItem: (k) => real.removeItem(k),
      clear: () => real.clear(),
      setItem: (k, v) => {
        if (v.length > 50) throw new Error('QuotaExceededError');
        real.setItem(k, v);
      },
    };
    const h = harness(new LocalStorageDialog('test', tight));
    h.session.start();
    await h.type('save');
    const out = await h.type('slot');
    expect(out).toContain('[That save didn’t fit: browser storage is full.]');
  });

  it('declines SCRIPT (transcripts aren’t saved here) and keeps playing', async () => {
    const h = harness();
    h.session.start();
    const out = await h.type('script');
    expect(out).toContain('[Transcripts aren’t supported here.]');
    expect(out).not.toContain('Save as?');
    expect(await h.type('look')).toContain('West of House');
  });

  it('autosaves every turn, and a new session resumes without replaying', async () => {
    const dialog = new LocalStorageDialog('test');
    const first = harness(dialog);
    first.session.start();
    await first.type('open mailbox');
    await first.type('take leaflet');

    const second = harness(dialog);
    second.session.start();
    await waitFor(() => second.state.waiting);
    expect(second.lines).toEqual([]);
    expect(second.state.status?.detail).toBe('Score: 0  Turns: 2');
    expect(await second.type('inventory')).toContain('leaflet');
  });

  it('ends on QUIT, and clears the autosave', async () => {
    const h = harness();
    h.session.start();
    await h.type('open mailbox');
    expect(await h.type('quit')).toContain('Do you wish to leave the game? (Y is affirmative):');
    await h.type('y');
    expect(h.state.exited).toBe(true);
    const autosaves = Object.keys(localStorage).filter((k) => k.includes(':z:auto:'));
    expect(autosaves).toEqual([]);
  });
});
