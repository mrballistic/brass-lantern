import { describe, expect, it } from 'vitest';
import { childrenOf, initialLocations, inventoryOf, moveItem, parentOf, PLAYER, reachableItems, visibleItemsIn } from '@/engine/model';
import { initialState } from '@/engine/engine';
import { fixtureWorld as world } from '../fixtures/world';

describe('the object tree', () => {
  it('places items from room lists, and leaves unlisted items offstage', () => {
    const loc = initialLocations(world);
    expect(loc.key).toBe('living');
    expect(loc.crate).toBe('shed');
    expect(loc.lit_lamp).toBeNull();
  });

  it('lists children in world order and moves items between places', () => {
    const state = initialState(world);
    expect(childrenOf(world, state, 'living')).toEqual(['key', 'wallet', 'shirt']);
    moveItem(state, 'shirt', PLAYER);
    moveItem(state, 'key', PLAYER);
    // Things you pick up list in the order you picked them up.
    expect(inventoryOf(world, state)).toEqual(['shirt', 'key']);
    expect(childrenOf(world, state, 'living')).toEqual(['wallet']);
    moveItem(state, 'key', 'yard');
    expect(parentOf(state, 'key')).toBe('yard');
  });

  it('a fresh game starts with the start room visited and no item state', () => {
    const state = initialState(world);
    expect(state.visited).toEqual(['bedroom']);
    expect(state.itemState).toEqual({});
  });

  it('Infocom style lists newest first, and untouched things in reverse world order, as Zork does', () => {
    const w = { ...world, style: 'infocom' as const };
    const state = initialState(w);
    expect(childrenOf(w, state, 'living')).toEqual(['shirt', 'wallet', 'key']);
    moveItem(state, 'key', PLAYER);
    moveItem(state, 'shirt', PLAYER);
    expect(inventoryOf(w, state)).toEqual(['shirt', 'key']);
    moveItem(state, 'key', 'living');
    expect(childrenOf(w, state, 'living')).toEqual(['key', 'wallet']);
  });

  it('a fixed item listed in several rooms is present in each of them', () => {
    const w = { ...world, rooms: { ...world.rooms, yard: { ...world.rooms.yard, items: [...world.rooms.yard.items, 'crate'] } } };
    const state = initialState(w);
    expect(state.locations.crate).toBe('yard'); // the first room that lists it
    expect(visibleItemsIn('yard', w, state)).toContain('crate');
    expect(visibleItemsIn('shed', w, state)).toContain('crate');
    state.currentRoom = 'yard';
    expect(reachableItems(w, state)).toContain('crate');
    // Once it's gone from the world (smashed), it's gone everywhere.
    moveItem(state, 'crate', null);
    expect(visibleItemsIn('yard', w, state)).not.toContain('crate');
  });

  it('untouched things keep the order their room lists them in', () => {
    // world.items declares bell before lamp; the yard lists lamp first.
    expect(world.rooms.yard.items.indexOf('lamp')).toBeLessThan(world.rooms.yard.items.indexOf('bell'));
    expect(childrenOf(world, initialState(world), 'yard').filter((id) => id !== 'fence')).toEqual(['bat', 'lamp', 'bell']);
  });
});
