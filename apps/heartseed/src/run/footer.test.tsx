/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- a React screen test: it mounts the root in happy-dom through React's promise-based `act` and waits on the host's clock for each frame; a recall is written to the disk as the garden writes it, as JSON text. */

/**
 * Today's footer: the action button and the `Grade` group sit under the
 * scroll view, outside it, in every frame of a recital (before it, while it
 * listens, at its result, after a grade and after the field and back), so
 * however much the verse and the result fill, the reader reaches them
 * without a scroll; the only control the scroll view holds is a missed
 * word's mark. The rig faults any other control in a scroll view, over the
 * whole tree, and any frame with two action buttons.
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import { DAY, keyOf } from '../test/garden-model';
import { deviceOf, launch, scrolled } from '../test/run-rig';

const T0 = Date.UTC(2026, 3, 1, 9);

/** A Good recall of `reference` at `startedAt`, of `words` words. */
const recordOf = (reference: string, startedAt: number, words: number) =>
  [
    keyOf({ reference, startedAt }),
    JSON.stringify({
      reference,
      startedAt,
      offset: 0,
      grade: 3,
      suggested: 3,
      words,
      missed: 0,
      peeked: 0,
      extra: 0,
    }),
  ] as const;

describe('Today’s footer', () => {
  it('keeps Say it, Listening and the grades outside the scroll view in every frame of a recital, a missed word’s mark the one control inside', async () => {
    const words = sourceWords(passage.text).length;
    const device = deviceOf([recordOf(passage.reference, T0 - 30 * DAY, words)]);
    const app = await launch(device, { unread: false, refuse: false }, { now: T0 });
    expect(await app.until(() => app.has('Say it'))).toBe(true);
    MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [2] });
    expect(await app.tap('Say it')).toBe(true);
    expect(await app.until(() => app.has('Listening'))).toBe(true);
    expect(await app.tap('Listening')).toBe(true);
    expect(await app.until(() => app.grades().length === 1)).toBe(true);
    const marks = [...app.host.querySelectorAll('[role="button"]')].filter((node) =>
      /^Missed word \d+$/.test(node.getAttribute('aria-label') ?? ''),
    );
    expect({
      grades: app.grades().some(scrolled),
      marks: marks.length,
      marksScrolled: marks.every(scrolled),
    }).toEqual({ grades: false, marks: 1, marksScrolled: true });
    expect(await app.tap('Again', 'radio')).toBe(true);
    expect(await app.tap('Your field')).toBe(true);
    expect(await app.until(() => app.headings().includes('Your field'))).toBe(true);
    expect(await app.tap('Today')).toBe(true);
    expect(await app.until(() => app.grades().length === 1)).toBe(true);
    expect(app.frames.listening).toBeGreaterThan(0);
    expect(await app.leave()).toEqual([]);
  });
});
