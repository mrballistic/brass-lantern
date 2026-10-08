import type { World } from '../types/world.ts';

export { isLit } from './model.ts';

/** The reply when the player tries to act on something they can't see. */
export function tooDark(world: World): string {
  return world.darkness?.tooDark ?? 'It’s too dark to see.';
}

/** Printed when the room goes dark around the player. */
export function darknessFalls(world: World): string {
  return world.darkness?.fall ?? 'It is now pitch black.';
}

/** What LOOK and arriving show in an unlit dark room. */
export function darknessLook(world: World): string {
  return world.darkness?.look ?? 'It is pitch black.';
}
