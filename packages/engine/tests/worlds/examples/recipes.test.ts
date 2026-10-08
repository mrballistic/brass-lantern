import { describe, expect, it } from 'vitest';
import { containers } from '../../../src/worlds/examples/containers';
import { darkness } from '../../../src/worlds/examples/darkness';
import { echo } from '../../../src/worlds/examples/echo';
import { raft } from '../../../src/worlds/examples/raft';
import { endings } from '../../../src/worlds/examples/endings';
import { fortune } from '../../../src/worlds/examples/fortune';
import { guard } from '../../../src/worlds/examples/guard';
import { timers } from '../../../src/worlds/examples/timers';
import { topics } from '../../../src/worlds/examples/topics';
import { wanderer } from '../../../src/worlds/examples/wanderer';
import { workshop } from '../../../src/worlds/examples/workshop';
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

  it('topics and orders', () => {
    expect(play(topics, ['ask librarian about books', 'ask librarian about dragons', 'ask librarian about the weather', 'librarian, open the door', 'ask librarian about the archive', 'ask librarian about the archive', 'unlock door with key', 'open door', 'north']).text).toMatchInlineSnapshot(`
      "📍 Library
      Tall shelves, a reading lamp, and a locked door marked ARCHIVE.
      Present: librarian.
      Exits: north.
      > ask librarian about books
      “Shelved by colour. Don’t ask.”
      > ask librarian about dragons
      “Second floor, between the cookbooks and the tax law.”
      > ask librarian about the weather
      “I couldn’t say, dear.”
      > librarian, open the door
      “Shh.”
      > ask librarian about the archive
      “Oh, the archive.” She slides a brass key across the desk.
      > ask librarian about the archive
      “You have the key. Go on, then.”
      > unlock door with key
      Unlocked.
      > open door
      Opened.
      > north
      📍 Archive
      Boxes of old letters. You found it.
      Exits: south.
      ✨ The letters are all here.
      You found what you came for."
    `);
  });

  it('a wandering cat', () => {
    expect(play(wanderer, ['wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'look', 'east', 'look']).text).toMatchInlineSnapshot(`
      "📍 Hall
      A narrow hall. The kitchen is east, the garden south.
      You can see: sock.
      Exits: east, south.
      > wait
      Time passes.
      > wait
      Time passes.
      > wait
      Time passes.
      > wait
      Time passes.
      > wait
      Time passes.
      > wait
      Time passes.
      The cat pads in.
      The cat bats the sock away somewhere. It’s gone.
      > look
      📍 Hall
      A narrow hall. The kitchen is east, the garden south.
      Present: cat.
      Exits: east, south.
      > east
      📍 Kitchen
      A warm kitchen. The hall is west.
      Exits: west.
      The cat pads in.
      > look
      📍 Kitchen
      A warm kitchen. The hall is west.
      Present: cat.
      Exits: west.
      The cat stalks off."
    `);
  });

  it('a room that listens', () => {
    const { text, state } = play(echo, ['in', 'hello there', 'echo', 'look', 'out']);
    expect(text).toMatchInlineSnapshot(`
      "📍 Ledge
      A narrow ledge outside a cave. The cave mouth is in.
      > in
      📍 Echoing Cave
      A vast cave. Every sound comes back to you, louder. The way out is out.
      > hello there
      there there ...
      > echo
      The cave falls silent.
      > look
      📍 Echoing Cave
      A vast cave, quiet now. The way out is out.
      > out
      📍 Ledge"
    `);
    expect(state.moveCount).toBe(3);
  });

  it('a raft on a pond', () => {
    const { text } = play(raft, ['east', 'board raft', 'east', 'disembark', 'east', 'take cone', 'drop cone', 'look', 'disembark']);
    expect(text).toMatchInlineSnapshot(`
      "📍 Pond Bank
      A muddy bank. A pond stretches east.
      There is a raft here.
      > east
      You can’t go there without a vehicle.
      > board raft
      You are now in the raft.
      > east
      📍 Pond, in the raft
      The middle of the pond. Lily pads drift by. An island lies to the east, the bank to the west.
      > disembark
      (raft)
      You realize that getting out here would be fatal.
      > east
      The raft comes to a rest on the shore.

      📍 Island, in the raft
      A tiny island with one tree. The pond is west.
      There is a pine cone here. (outside the raft)
      > take cone
      Taken.
      > drop cone
      Dropped.
      > look
      📍 Island, in the raft
      A tiny island with one tree. The pond is west.
      The raft contains:
        A pine cone
      > disembark
      (raft)
      You are on your own feet again."
    `);
  });

  it('orders, numbers and a buggy', () => {
    const orders = ['robot, push the button', 'robot, take wrench', 'robot, go east', 'turn dial to 2', 'examine dial', 'east', 'east', 'board buggy', 'east', 'east', 'west'];
    expect(play(workshop, orders).text).toMatchInlineSnapshot(`
      "📍 Workshop
      Benches, a big brass dial on the wall and a red button. The yard is east.
      You can see: dial, red button, wrench.
      Present: robot.
      Exits: east.
      > robot, push the button
      The robot extends its clamp and presses the button. Somewhere, a bell rings.
      > robot, take wrench
      Click!
      > robot, go east
      Whirr, click!
      > turn dial to 2
      The dial clicks round to 2. Nothing else happens.
      > examine dial
      The brass dial points at 2.
      > east
      📍 Yard
      A gravel yard. The workshop is west, and dunes begin to the east.
      You can see: dune buggy.
      Present: robot.
      Exits: west, east.
      > east
      You can’t go there without a vehicle.
      > board buggy
      You are now in the dune buggy.
      > east
      Sand sprays behind you.
      📍 Dune (in the dune buggy)
      Soft sand rolls away in every direction. The yard is west; a bigger dune lies east.
      Exits: west, east.
      > east
      The engine roars.
      📍 Crest (in the dune buggy)
      The top of the biggest dune. You can see the whole desert, and it is all sand.
      Exits: west.
      > west
      The engine roars.
      📍 Dune (in the dune buggy)
      Soft sand rolls away in every direction. The yard is west; a bigger dune lies east.
      Exits: west, east."
    `);
    expect(play(workshop, ['turn dial to 4']).text).toMatchInlineSnapshot(`
      "📍 Workshop
      Benches, a big brass dial on the wall and a red button. The yard is east.
      You can see: dial, red button, wrench.
      Present: robot.
      Exits: east.
      > turn dial to 4
      The dial clicks to 4, and a hatch in the floor swings open. Inside is a tin of biscuits.
      A good day in the workshop."
    `);
  });
});
