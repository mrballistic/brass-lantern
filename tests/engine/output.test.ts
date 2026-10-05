import { classify, makeLine } from '@/engine/output';

describe('classify', () => {
  it('classifies user input ("> ")', () => {
    expect(classify('> take stapler')).toBe('input');
  });

  it('classifies location prefix (📍)', () => {
    expect(classify('📍 Bedroom')).toBe('location');
  });

  it.each([
    ['👔 The boss appears'],
    ['💼 Bob Slydell tilts his head.'],
    ['🌀 Dr. Smith sets the metronome ticking.'],
    ['💕 Pat catches your eye'],
    ['💻 Michael Bolton looks around'],
    ['💾 You slide the floppy disk into the drive.'],
    ['🔨 You bring the bat down on the printer.'],
    ['💥 Plastic splinters fly.'],
    ['📎 Gary begins to mumble about fire.'],
    ['✨ CHAPTER 1: ANOTHER CASE OF THE MONDAYS'],
  ])('classifies event-emoji line: %s', (text) => {
    expect(classify(text)).toBe('event');
  });

  it('classifies decorative banner ("═")', () => {
    expect(classify('═══════════════════════════════════════════')).toBe('decorative');
  });

  it('classifies a quoted line ("\\"") as decorative', () => {
    expect(classify('"And so it begins..."')).toBe('decorative');
  });

  it('classifies a bracketed system note ("[")', () => {
    expect(classify('[Flag set: Hypnotized]')).toBe('system');
  });

  it('classifies default prose', () => {
    expect(classify('The blinds are drawn.')).toBe('prose');
  });
});

describe('makeLine', () => {
  it('produces unique IDs across calls', () => {
    const a = makeLine('first');
    const b = makeLine('second');
    const c = makeLine('third');
    expect(a.id).not.toBe(b.id);
    expect(b.id).not.toBe(c.id);
    expect(a.id).not.toBe(c.id);
  });

  it('sets the correct type via classify', () => {
    expect(makeLine('> take stapler').type).toBe('input');
    expect(makeLine('📍 Bedroom').type).toBe('location');
    expect(makeLine('[Flag set: Foo]').type).toBe('system');
    expect(makeLine('Just prose.').type).toBe('prose');
  });

  it('includes a timestamp (number, close to now)', () => {
    const before = Date.now();
    const line = makeLine('hello');
    const after = Date.now();
    expect(typeof line.timestamp).toBe('number');
    expect(line.timestamp).toBeGreaterThanOrEqual(before);
    expect(line.timestamp).toBeLessThanOrEqual(after);
  });

  it('preserves the input text', () => {
    expect(makeLine('hello world').text).toBe('hello world');
  });
});
