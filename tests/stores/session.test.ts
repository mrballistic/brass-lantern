import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app.config', async () => {
  const { fixtureWorld } = await import('../fixtures/world');
  return {
    appName: 'TEST TERMINAL',
    storagePrefix: 'test',
    cartridges: [
      { kind: 'world', id: 'house', title: 'TEST HOUSE', world: fixtureWorld, saveKey: 'test:save' },
      { kind: 'zcode', id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' },
    ],
  };
});

const { useSession } = await import('@/stores/session');
const { useZGameStore } = await import('@/stores/zgame');
const { useGameStore } = await import('@/stores/game');

const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

describe('session router', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('shows the menu on boot when there is nothing to resume', async () => {
    const s = useSession();
    await s.boot();
    expect(s.mode.value).toBe('menu');
    expect(texts(s.output.value)).toContain('  1  TEST HOUSE   native');
    expect(s.status.value).toBe('');
    expect(s.title.value).toBe('');
  });

  it('a number inserts that cartridge', async () => {
    const s = useSession();
    await s.boot();
    await s.submit('1');
    expect(s.mode.value).toBe('world');
    expect(s.title.value).toBe('TEST HOUSE');
    expect(s.status.value).toBe('MOVES: 0');
    expect(texts(s.output.value)).toContain('📍 Bedroom');
    expect(localStorage.getItem('test:cartridge')).toBe('house');
  });

  it('a bad choice says how to choose', async () => {
    const s = useSession();
    await s.boot();
    await s.submit('9');
    await s.submit('zork');
    expect(s.mode.value).toBe('menu');
    expect(texts(s.output.value).filter((t) => t === '[Type a number from 1 to 2.]')).toHaveLength(2);
  });

  it('EJECT returns to the menu and forgets the last cartridge', async () => {
    const s = useSession();
    await s.boot();
    await s.submit('1');
    await s.submit('eject');
    expect(s.mode.value).toBe('menu');
    expect(localStorage.getItem('test:cartridge')).toBeNull();
  });

  it('resumes the last cartridge with progress, instead of the menu', async () => {
    localStorage.setItem('test:cartridge', 'house');
    localStorage.setItem('test:save', JSON.stringify({ version: '1.0', savedAt: '', gameState: { ...useGameStore().game, currentRoom: 'living' }, outputHistory: [] }));
    const s = useSession();
    await s.boot();
    expect(s.mode.value).toBe('world');
    expect(s.restored.value).toBe(true);
  });

  it('starts a story cartridge through the zgame store, and routes input to it', async () => {
    const zgame = useZGameStore();
    const init = vi.spyOn(zgame, 'initialize').mockResolvedValue();
    const submit = vi.spyOn(zgame, 'submit').mockImplementation(() => {});
    const s = useSession();
    await s.boot();
    await s.submit('2');
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ id: 'story' }));
    expect(s.mode.value).toBe('zcode');
    await s.submit('open mailbox');
    expect(submit).toHaveBeenCalledWith('open mailbox');
  });

  it('EJECT, or inserting another cartridge, stops the story session', async () => {
    const zgame = useZGameStore();
    vi.spyOn(zgame, 'initialize').mockResolvedValue();
    const stop = vi.spyOn(zgame, 'stop');
    const s = useSession();
    await s.boot();
    await s.submit('2');
    stop.mockClear();
    await s.submit('eject');
    expect(stop).toHaveBeenCalledTimes(1);
    await s.submit('1');
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('shows the Z-machine status line in the header', async () => {
    const zgame = useZGameStore();
    vi.spyOn(zgame, 'initialize').mockResolvedValue();
    const s = useSession();
    await s.boot();
    await s.submit('2');
    zgame.status = { location: 'Kitchen', detail: 'Score: 10  Turns: 7' };
    expect(s.status.value).toBe('Kitchen  Score: 10  Turns: 7');
  });

  it('answers COOKIES in the menu and in story cartridges', async () => {
    const zgame = useZGameStore();
    vi.spyOn(zgame, 'initialize').mockResolvedValue();
    const s = useSession();
    await s.boot();
    await s.submit('cookies');
    expect(texts(s.output.value)).toContain('[This build has no analytics. Nothing is collected.]');
    await s.submit('2');
    await s.submit('cookies');
    expect(texts(zgame.output)).toContain('[This build has no analytics. Nothing is collected.]');
  });
});
