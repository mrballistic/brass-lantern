import { describe, expect, it } from 'vitest';
import { containers } from '@/worlds/examples/containers';
import { darkness } from '@/worlds/examples/darkness';
import { endings } from '@/worlds/examples/endings';
import { timers } from '@/worlds/examples/timers';
import { play } from '../../helpers/play';

// The recipes in docs/guide/building-worlds/recipes.md. If these break, that page is wrong.

describe('recipes', () => {
  it('containers', () => {
    expect(play(containers, ['look', 'take key', 'open jar', 'take key from jar', 'unlock tin with key', 'open tin', 'take cookie', 'put key in tin']).text).toMatchInlineSnapshot(`
      "📍 Pantry
      Narrow shelves, a smell of cinnamon.
      You can see: cookie tin.
      Sitting on the shelf is:
        A glass jar
        The glass jar contains:
          A tin key
      > look
      📍 Pantry
      Narrow shelves, a smell of cinnamon.
      You can see: cookie tin.
      Sitting on the shelf is:
        A glass jar
        The glass jar contains:
          A tin key
      > take key
      The glass jar is closed.
      > open jar
      Opened.
      > take key from jar
      Taken: tin key.
      > unlock tin with key
      Unlocked.
      > open tin
      The lid pops off with a sigh of cinnamon.
      > take cookie
      Taken: cookie.
      > put key in tin
      Done."
    `);
  });
  it('darkness', () => {
    expect(play(darkness, ['down', 'take jam', 'east', 'take lamp', 'turn on lamp', 'down', 'take jam']).text).toMatchInlineSnapshot(`
      "📍 Shed
      A garden shed. A hatch in the floor leads down.
      You can see: oil lamp.
      Exits: down.
      > down
      📍 Darkness
      It is pitch black. Something breathes nearby.
      > take jam
      It’s too dark to see.
      > east
      You stumble into something with far too many teeth.
          ****  You have died  ****
      You wake on the shed floor with a headache and a new respect for the dark.
      📍 Shed
      A garden shed. A hatch in the floor leads down.
      You can see: oil lamp.
      Exits: down.
      > take lamp
      Taken: oil lamp.
      > turn on lamp
      The oil lamp is now on.
      > down
      📍 Cellar
      Damp stone walls. Steps lead up.
      You can see: jar of jam.
      Exits: up.
      > take jam
      Taken: jar of jam."
    `);
  });
  it('timers', () => {
    expect(play(timers, ['turn on kettle', 'wait', 'wait', 'wait', 'wait']).text).toMatchInlineSnapshot(`
      "📍 Kitchen
      A small kitchen with a kettle on the stove.
      You can see: kettle.
      > turn on kettle
      The kettle is now on.
      > wait
      Time passes.
      The tap drips.
      > wait
      Time passes.
      > wait
      Time passes.
      The kettle shrieks. Tea time.
      > wait
      Time passes.
      The clock chimes the hour."
    `);
  });
  it('endings', () => {
    expect(play(endings, ['dig', 'take spade', 'dig in flowerbed']).text).toMatchInlineSnapshot(`
      "📍 Garden
      An overgrown garden. A chapel stands to the east. Something glints in a flowerbed.
      You can see: spade.
      Exits: east.
      > dig
      The soil is packed hard. You need a spade.
      > take spade
      Taken: spade.
      > dig in flowerbed
      You dig. Your spade rings on a strongbox full of coins.
      ✨ You are rich, and the garden is a mess.
      [Score: 50 of 50, in 2 moves.]
      Type RESTART to try another ending."
    `);
    expect(play(endings, ['east', 'pray']).text).toMatchInlineSnapshot(`
      "📍 Garden
      An overgrown garden. A chapel stands to the east. Something glints in a flowerbed.
      You can see: spade.
      Exits: east.
      > east
      📍 Chapel
      Cool and quiet. The garden is west.
      Exits: west.
      > pray
      A warm calm settles over you.
      ✨ You leave lighter than you came.
      [Score: 10 of 50, in 1 move.]
      Type RESTART to try another ending."
    `);
  });
});
