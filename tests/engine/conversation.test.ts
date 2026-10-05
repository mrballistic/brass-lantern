import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { interpret, newConversation, remember, resolvePronouns, type Conversation } from '@/engine/conversation';
import { fallbackParse } from '@/engine/parser';
import type { GameState } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

/** One line of input through the conversation layer and the engine (no LLM). */
function say(conv: Conversation, state: GameState, input: string): string[] {
  const step = interpret(input, conv, world, state);
  if ('reply' in step) return step.reply;
  const parsed = 'run' in step ? step.run : fallbackParse(step.parse, world.verbs);
  if (!parsed) return ['(unparsed)'];
  const action = 'run' in step ? parsed : resolvePronouns(parsed, conv);
  const r = execute(action, { world, state });
  remember(conv, action, r);
  return r.lines;
}

describe('answers', () => {
  it('a which-question takes an answer naming one candidate', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    expect(say(conv, s, 'take key')[0]).toContain('Which do you mean');
    say(conv, s, 'rusty');
    expect(s.locations.rusty_key).toBe('player');
    expect(conv.pending).toBeNull();
  });

  it('a command instead of an answer drops the question and runs', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    say(conv, s, 'take key');
    say(conv, s, 'east');
    expect(s.currentRoom).toBe('bedroom');
    expect(conv.pending).toBeNull();
  });

  it('a what-question takes the missing noun', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    expect(say(conv, s, 'take')).toEqual(['What do you want to take?']);
    say(conv, s, 'wallet');
    expect(s.locations.wallet).toBe('player');
  });

  it('an answer is marked so the store never sends it to the LLM', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    say(conv, s, 'take');
    expect(interpret('wallet', conv, world, s)).toMatchObject({ viaAnswer: true });
  });

  it('an answer for the second object fills that slot', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    say(conv, s, 'unlock chest');
    say(conv, s, 'key');
    expect(s.itemState.chest?.locked).toBe(false);
  });
});

describe('pronouns', () => {
  it('it follows things and her follows people, for both objects', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'yard', carrying: ['wallet'] });
    say(conv, s, 'examine neighbor');
    say(conv, s, 'examine wallet');
    say(conv, s, 'give it to her');
    expect(s.flags.paid).toBe(true);
  });

  it('it means the item actually acted on, not the words typed', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    say(conv, s, 'take wall');
    expect(conv.it).toBe('wallet');
    say(conv, s, 'drop it');
    expect(s.locations.wallet).toBe('living');
  });
});
