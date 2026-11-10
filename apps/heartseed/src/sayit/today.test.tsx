/* oxlint-disable effect/noNullish, effect/noAsyncFunction -- a React screen test: it drives Today through the rig's promise-based `act` turns, and reads nodes whose absent attributes and matches are null. */

/**
 * Today's Say it as a reader and a screen reader meet it, through the rig
 * (`src/test/today-rig.tsx`), which holds every frame a test waits through
 * to Today's rule for each word: the colour its text is seen in, whether
 * the screen reader reads it, its name and its role. It counts words
 * without printing one.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Layer, Option } from 'effect';
import passage from 'virtual:heartseed-passage';

import { DictationSource } from '../dictation';
import { recite, scriptedSource } from '../dictation/script';
import type { SayItView } from '../sayit';
import { BLADE, failing, mount, WORDS } from '../test/today-rig';
import { screenOf } from './screen';

/** A daytime instant for the clock: the store's other verse was planted long before it. */
const AT = Date.UTC(2026, 10, 5, 15);

describe('Today’s Say it', () => {
  it('reads a whole recital: each lit word by its name, the miss as a numbered mark, the count, the suggestion and the grade, then a changed grade, a peek, Next, and Say it again at the seed’s due', async () => {
    const n = WORDS.length;
    const today = await mount(
      scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 1 })),
      undefined,
      undefined,
      { now: AT },
    );
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    expect(today.button()).toHaveLength(1);
    expect(today.one('[data-testid="passage"]')?.textContent).toBe(passage.text);
    expect(today.all('[data-testid^="word-"]')).toHaveLength(0);
    expect(today.radios()).toHaveLength(0);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
    expect(today.one('[data-testid="passage"]')).toBe(null);
    const named = WORDS.filter((_, index) => {
      const node = today.word(index);
      return (
        node !== null &&
        node.textContent === WORDS[index] &&
        node.getAttribute('aria-hidden') !== 'true' &&
        node.getAttribute('role') !== 'button'
      );
    });
    expect(named).toHaveLength(n - 1);
    const mark = today.word(10);
    expect(mark?.getAttribute('role')).toBe('button');
    expect(mark?.getAttribute('aria-label')).toBe('Missed word 11');
    expect(mark?.textContent).toBe('');
    expect(today.one('[data-testid="summary"]')?.textContent).toBe(`${n - 1} of ${n} words`);
    expect(today.host.textContent?.includes('Suggested: Hard')).toBe(true);
    expect(today.radios().map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Again',
      'Hard',
      'Good',
      'Easy',
    ]);
    expect(today.checked()).toEqual(['false', 'true', 'false', 'false']);
    expect(today.all('[role="alert"]')).toHaveLength(0);
    expect(today.actions()).toEqual(['Next']);
    expect(today.ticks.n).toBe(n - 1);
    expect(today.kept.map((recall) => [recall.grade, recall.missed, recall.peeked])).toEqual([
      [2, 1, 0],
    ]);
    await today.click(today.radios()[2]);
    expect(await today.until(() => today.checked()[2] === 'true')).toBe(true);
    expect(today.checked()).toEqual(['false', 'false', 'true', 'false']);
    expect(today.host.textContent?.includes('Suggested: Hard')).toBe(true);
    await today.click(today.word(10));
    expect(
      await today.until(() => today.word(10)?.getAttribute('aria-label') !== 'Missed word 11'),
    ).toBe(true);
    expect(today.word(10)?.getAttribute('aria-label')).toBe(`${WORDS[10]}, peeked`);
    expect(today.word(10)?.textContent).toBe(WORDS[10]);
    expect(today.all('[aria-label^="Missed word"]')).toHaveLength(0);
    expect(today.one('[data-testid="summary"]')?.textContent).toBe(
      `${n - 1} of ${n} words, 1 peeked`,
    );
    expect(today.checked()).toEqual(['false', 'false', 'true', 'false']);
    expect(today.kept.map((recall) => [recall.grade, recall.peeked])).toEqual([
      [2, 0],
      [3, 0],
      [3, 1],
    ]);
    expect(today.reached.get('matched') ?? 0).toBeGreaterThanOrEqual(3 * (n - 1));
    expect(today.reached.get('miss') ?? 0).toBeGreaterThanOrEqual(2);
    expect(today.reached.get('peek') ?? 0).toBeGreaterThanOrEqual(1);
    expect(today.actions()).toEqual(['Next']);
    expect(await today.renew('initials')).toBe(true);
    expect(today.ends).toEqual([
      { grew: ['1 grew a stage.'], grown: [`${passage.reference}, seed`] },
    ]);
    expect([today.actions(), today.radios().length, today.kept.length]).toEqual([['Say it'], 0, 3]);
    expect(today.all('[data-testid^="word-"]')).toHaveLength(n);
    expect(today.unsaid.get('initials') ?? 0).toBeGreaterThanOrEqual(n);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
    expect(today.one('[data-testid="summary"]')?.textContent).toBe(`${n - 1} of ${n} words`);
    expect(today.word(10)?.getAttribute('aria-label')).toBe('Missed word 11');
    expect([today.actions(), today.checked(), today.ticks.n]).toEqual([
      ['Next'],
      ['false', 'true', 'false', 'false'],
      2 * (n - 1),
    ]);
    expect(today.kept.map((recall) => [recall.grade, recall.peeked])).toEqual([
      [2, 0],
      [3, 0],
      [3, 1],
      [2, 0],
    ]);
    expect(today.kept[3]?.startedAt).toBe(today.time.now ?? 0);
    await today.leave();
  });

  it('hides each unsaid word from the screen reader and reads Listening while it listens, with no grade', async () => {
    const today = await mount(
      scriptedSource(recite(passage.text, { every: 5, pace: 400 })),
      BLADE,
      { cue: 'none' },
    );
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.label() === 'Listening')).toBe(true);
    const words = today.all('[data-testid^="word-"]');
    expect(words).toHaveLength(WORDS.length);
    const hidden = words.filter((node) => node.getAttribute('aria-hidden') === 'true');
    expect(hidden.length).toBeGreaterThan(WORDS.length - 5);
    expect(today.radios()).toHaveLength(0);
    expect(today.one('[data-testid="summary"]')).toBe(null);
    await today.leave();
  });

  it('shows a word still being heard softly but hides it from the screen reader, and draws each unsaid word as an empty slot', async () => {
    const today = await mount(
      scriptedSource(recite(passage.text, { every: 100, pace: 60 })),
      BLADE,
      { cue: 'none' },
    );
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await today.until(() => (today.reached.get('tentative') ?? 0) > 0)).toBe(true);
    expect(today.reached.get('pending') ?? 0).toBeGreaterThan(WORDS.length - 5);
    expect(today.reached.get('matched') ?? 0).toBe(0);
    expect(today.ticks.n).toBe(0);
    await today.leave();
  });

  it('leaving mid-recital cancels it once and keeps nothing, with the registry still alive', async () => {
    const cancels = { n: 0 };
    const counted = Layer.effect(
      DictationSource,
      Effect.map(DictationSource, (inner) =>
        DictationSource.of({
          ...inner,
          cancel: Effect.andThen(
            Effect.sync(() => void (cancels.n += 1)),
            inner.cancel,
          ),
        }),
      ),
    ).pipe(Layer.provide(scriptedSource(recite(passage.text, { every: 5, pace: 400 }))));
    const today = await mount(counted, BLADE, { cue: 'none' });
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.label() === 'Listening')).toBe(true);
    await today.show(false);
    expect(today.button()).toHaveLength(0);
    expect(await today.until(() => cancels.n > 0)).toBe(true);
    expect(cancels.n).toBe(1);
    expect(today.kept).toEqual([]);
    await today.leave();
  });

  for (const [reason, ending, says] of [
    ['denied', 'denied', 'Settings'],
    ['unavailable', 'unavailable', 'available'],
    ['interrupted', 'interrupted', 'interrupted'],
    ['error', 'failed', 'Say it again'],
  ] as const)
    it(`ends a recital that could not be heard (${ending}) with one alert, the verse whole, no grade, and Say it again`, async () => {
      const today = await mount(failing(reason));
      expect(await today.until(() => today.label() === 'Say it')).toBe(true);
      await today.click(today.button()[0]);
      expect(await today.until(() => today.all('[role="alert"]').length === 1)).toBe(true);
      expect(today.one('[role="alert"]')?.textContent?.includes(says)).toBe(true);
      expect(today.one('[data-testid="passage"]')?.textContent).toBe(passage.text);
      expect(today.radios()).toHaveLength(0);
      expect(today.label()).toBe('Say it');
      expect(today.ticks.n).toBe(0);
      expect(today.kept).toEqual([]);
      await today.leave();
    });

  it('holds the button until Say it is ready, and while a recital finishes', () => {
    expect(screenOf(Option.none())).toMatchObject({ button: 'Say it', pressable: false });
    const finishing: SayItView = {
      dictation: { status: 'finishing', engine: 'analyzer', verse: '', matcher: null, ended: null },
      startedAt: 0,
      choice: null,
      cue: 'none',
    };
    expect(screenOf(Option.some(finishing))).toMatchObject({
      button: 'Listening',
      pressable: false,
    });
    const cancelled: SayItView = {
      dictation: {
        status: 'idle',
        engine: 'analyzer',
        verse: '',
        matcher: null,
        ended: 'cancelled',
      },
      startedAt: 0,
      choice: null,
      cue: 'none',
    };
    expect(screenOf(Option.some(cancelled))).toMatchObject({
      button: 'Say it',
      pressable: true,
      marks: Option.none(),
      result: Option.none(),
      alert: Option.none(),
    });
  });
});
