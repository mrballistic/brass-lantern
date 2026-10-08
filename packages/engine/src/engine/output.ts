import type { OutputLine, OutputLineType } from '../types/game.ts';

const EVENT_PREFIX = /^[💼🌀👔💕💻💾🔨💥📎✨🪄🤜😖😴🐟🌺📬📞]/u;

export function classify(text: string): OutputLineType {
  if (text.startsWith('> ')) return 'input';
  if (text.startsWith('📍')) return 'location';
  if (EVENT_PREFIX.test(text)) return 'event';
  if (text.startsWith('═') || text.startsWith('“') || text.startsWith('"')) return 'decorative';
  if (text.startsWith('[')) return 'system';
  return 'prose';
}

let counter = 0;
export function makeLine(text: string): OutputLine {
  counter += 1;
  return {
    id: `${Date.now().toString(36)}-${counter.toString(36)}`,
    text,
    timestamp: Date.now(),
    type: classify(text),
  };
}
