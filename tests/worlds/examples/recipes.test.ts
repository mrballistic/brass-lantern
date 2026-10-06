import { describe, expect, it } from 'vitest';
import { containers } from '@/worlds/examples/containers';
import { darkness } from '@/worlds/examples/darkness';
import { endings } from '@/worlds/examples/endings';
import { fortune } from '@/worlds/examples/fortune';
import { guard } from '@/worlds/examples/guard';
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
  it('a guard and something heavy', () => {
    const { state, text } = play(guard, ['take anvil', 'take sword', 'north', 'north', 'attack guard with sword', 'attack guard with sword', 'attack guard with sword', 'attack guard with sword', 'diagnose', 'north']);
    expect(state.gameOver).toBe(true);
    expect(text).toMatchInlineSnapshot(`
      "📍 Armory
      Racks of rusted weapons. An anvil squats in the corner. A gate is north.
      You can see: sword, anvil.
      Exits: north.
      > take anvil
      [That’s too heavy to carry with everything else.]
      > take sword
      Taken: sword.
      > north
      📍 Gatehouse
      A stone arch. Beyond it, daylight. The armory is south.
      Present: guard.
      Exits: south, north.
      > north
      The guard steps in front of you.
      The guard shoves you back.
      > attack guard with sword
      You’re still reeling from that last blow.
      The guard’s club whistles past your head.
      > attack guard with sword
      You wound the guard.
      The club catches your shoulder.
      > attack guard with sword
      The guard drops their weapon.
      The guard gropes for his club.
      > attack guard with sword
      The guard can’t defend themselves.
      The guard is dead.
      > diagnose
      [You have a light wound, which will be cured after 28 moves.]
      [You can be killed by one more light wound.]
      > north
      📍 Courtyard
      Sunlight, at last.
      ✨ You walk out into the sun.
      You’re free."
    `);
  });
  it('a script', () => {
    expect(play(fortune, ['consult madame', 'consult madame']).text).toMatchInlineSnapshot(`
      "📍 Fortune Teller’s Tent
      Velvet, incense, and a crystal ball.
      Present: Madame Zora.
      > consult madame
      “You will find what you lost under the sofa.”
      > consult madame
      “I have told you already,” she sighs.
      “You will find what you lost under the sofa.”"
    `);
  });
});
