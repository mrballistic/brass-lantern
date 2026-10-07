import { createApp, h, type Component } from 'vue';
import { createPinia } from 'pinia';
import BrassLantern from '@/components/BrassLantern.vue';
import type { GameOptions } from '@/options';

/**
 * Mounts one game on `el` (an element or a selector), in its own Vue app with
 * its own Pinia. `extra`, if given, is rendered inside the game's shell once it
 * has booted (the site's consent banner, say).
 */
export function mountGame(el: Element | string, options: GameOptions, extra?: Component): { unmount(): void } {
  const target = typeof el === 'string' ? document.querySelector(el) : el;
  if (!target) throw new Error(`mountGame: no element matches ${String(el)}.`);
  const app = createApp({
    render: () => h(BrassLantern, { options }, extra ? { default: () => h(extra) } : undefined),
  });
  app.use(createPinia()).mount(target);
  return { unmount: () => app.unmount() };
}
