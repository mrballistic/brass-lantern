import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, splitCommands } from '@/engine/parser';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const riddle: World = {
  ...fixtureWorld,
  verbs: { ...fixtureWorld.verbs, answer: { words: ['answer', 'reply'], target: 'text', reply: 'Nobody seems to be awaiting your answer.' } },
  rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, instead: { answer: [{ if: 'said:a well', then: 'solved' }, { say: ['Wrong.'] }] } } },
  events: { ...fixtureWorld.events, solved: [{ set: 'riddle' }, 'There is a clap of thunder.'] },
};

describe('typed words (6a)', () => {
  it('a text verb takes the rest of the line, quotes dropped', () => {
    expect(fallbackParse('answer "a well"', riddle.verbs)).toEqual({ action: 'answer', text: 'a well' });
    expect(fallbackParse('reply a well', riddle.verbs)).toEqual({ action: 'answer', text: 'a well' });
  });
  it('said: matches case- and punctuation-blind, whole words', () => {
    const s = stateWith(riddle, { room: 'bedroom' });
    expect(execute(fallbackParse('answer "A Well."', riddle.verbs)!, { world: riddle, state: s }).lines).toEqual(['There is a clap of thunder.']);
    expect(s.flags.riddle).toBe(true);
    const t = stateWith(riddle, { room: 'bedroom' });
    expect(execute(fallbackParse('answer a wellington', riddle.verbs)!, { world: riddle, state: t }).lines).toEqual(['Wrong.']);
  });
  it('nothing after the verb: its reply, and never a miss for naming nothing', () => {
    const s = stateWith(riddle, { room: 'yard' });
    const r = execute(fallbackParse('answer', riddle.verbs)!, { world: riddle, state: s });
    expect(r.lines).toEqual(['Nobody seems to be awaiting your answer.']);
  });
  it('a quoted phrase is never split, and the text verb ends the line', () => {
    expect(splitCommands('answer "a well. really" then look', riddle.verbs)).toEqual(['answer "a well. really" then look']);
    expect(splitCommands('look. answer a well', riddle.verbs)).toEqual(['look', 'answer a well']);
  });
  it('text stays raw words, never a number or an object', () => {
    expect(fallbackParse('answer 4', riddle.verbs)).toEqual({ action: 'answer', text: '4' });
    const s = stateWith(riddle, { room: 'yard' });
    expect(execute(fallbackParse('answer wallet', riddle.verbs)!, { world: riddle, state: s }).understood).not.toBe(false);
  });
  it('a text verb sets stopLine', () => {
    const s = stateWith(riddle, { room: 'yard' });
    expect(execute(fallbackParse('answer hi', riddle.verbs)!, { world: riddle, state: s }).stopLine).toBe(true);
  });
});
