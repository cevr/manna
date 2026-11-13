/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noGlobals, effect/noTernary, eslint/no-await-in-loop -- a React screen test: it drives Today through the rig's promise-based `act` turns, one recital after another, names each word's fault in one line, and reads nodes whose absent attributes are null. */

/**
 * Grading does not move with the lines (hspiece L4), through the rig
 * (`src/test/today-rig.tsx`) on its verse, `Isaiah 41:10`, which `linesOf`
 * cuts into five lines. Each generated recital (one to three words
 * skipped as misses, a final every 3 to 7 words, then a peek at the first
 * missed word) is held to what Say it's own view gives for the same words
 * heard, word number by word number: each `word-<i>` is what `wordOf`
 * draws for mark `i` (a missed word's mark named `Missed word <i + 1>`, a
 * said or peeked word's text, a hidden word hidden); the summary and the
 * suggestion are `screenOf`'s; the kept recall's misses are the marks
 * missed or peeked and its peeks the marks peeked; the four breaks stand among the marks; and
 * every listen hands Dictation the hints of the piece's own text, with no
 * line break in any.
 *
 * It catches a word number moved by a break counted as a word, a peek or a
 * mark at another word, a hint rebuilt from lines, and a break left out of
 * the recital's drawing. Listen's light and the hold over break rows are
 * `src/reading/lines.drawn.test.tsx`'s and `src/reading/today.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Layer, Option } from 'effect';
import passage from 'virtual:heartseed-passage';

import { DictationSource, hintsOf } from '../dictation';
import { recite, scriptedSource } from '../dictation/script';
import { linesOf } from '../reading/lines';
import { below, random } from '../test/garden-model';
import { mount, WORDS } from '../test/today-rig';
import { screenOf, wordOf } from './screen';

/** `steps` as Dictation hears them, each listen's hints kept in `hints`. */
const hearing = (steps: Parameters<typeof scriptedSource>[0], hints: string[][]) =>
  Layer.effect(
    DictationSource,
    Effect.map(Effect.service(DictationSource), (inner) =>
      DictationSource.of({
        ...inner,
        listen: (session, engine, locale, given) => {
          hints.push([...given]);
          return inner.listen(session, engine, locale, given);
        },
      }),
    ),
  ).pipe(Layer.provide(scriptedSource(steps)));

/** The fault of word element `node` against what `wordOf` draws for its mark, if any. */
const wordFault = (node: Element | null, shown: ReturnType<typeof wordOf>, index: number) => {
  if (node === null) return `word-${index} missing`;
  if (shown._tag === 'Mark')
    return node.getAttribute('role') === 'button' && node.getAttribute('aria-label') === shown.label
      ? null
      : `word-${index} not its mark`;
  const hidden = node.getAttribute('aria-hidden') === 'true';
  if (hidden !== shown.hidden) return `word-${index} hidden ${hidden}`;
  if (shown.ink !== 'unseen' && node.textContent !== shown.text)
    return `word-${index} text differs`;
  return null;
};

describe('grading under the lines', () => {
  it('draws each mark, the summary, the suggestion and the recall pending as Say it’s view gives them, word number by word number, with the verse lined', async () => {
    expect(linesOf(passage.text).length).toBe(5);
    const want = JSON.stringify(hintsOf(passage.text));
    for (let seed = 1; seed <= 3; seed += 1) {
      const next = random(seed * 6_151);
      const skip = [
        ...new Set(Array.from({ length: 1 + below(next, 3) }, () => below(next, WORDS.length))),
      ].toSorted((a, b) => a - b);
      const hints: string[][] = [];
      const today = await mount(
        hearing(recite(passage.text, { skip, every: 3 + below(next, 5), pace: 1 }), hints),
      );
      expect(await today.until(() => today.label() === 'Say it')).toBe(true);
      await today.click(today.button()[0]);
      expect(await today.until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
      await today.click(today.word(skip[0] ?? 0));
      expect(
        await today.until(() =>
          (today.one('[data-testid="summary"]')?.textContent ?? '').includes('peeked'),
        ),
      ).toBe(true);
      const screen = screenOf(today.sayIt());
      const marks = Option.getOrElse(screen.marks, () => []);
      const faults = WORDS.flatMap((word, index) => {
        const mark = marks[index];
        if (mark === undefined) return [`no mark ${index}`];
        const fault = wordFault(today.word(index), wordOf(mark, word), index);
        return fault === null ? [] : [fault];
      });
      const result = Option.getOrUndefined(screen.result);
      expect(await today.until(() => (today.pending()[0]?.peeked ?? 0) > 0)).toBe(true);
      const last = today.pending().at(-1);
      expect({
        seed,
        faults,
        marks: marks.length,
        summary: today.one('[data-testid="summary"]')?.textContent,
        suggested: today.host.textContent?.includes(result?.suggested ?? '-'),
        kept: [last?.missed, last?.peeked],
        breaks: today.all('[data-testid^="break-"]').length,
        hints: hints.every((each) => JSON.stringify(each) === want),
        lineBreak: hints.flat().some((hint) => /[\n\r]/u.test(hint)),
      }).toEqual({
        seed,
        faults: [],
        marks: WORDS.length,
        summary: result?.summary,
        suggested: true,
        kept: [
          marks.filter((mark) => mark.status === 'miss' || mark.status === 'peek').length,
          marks.filter((mark) => mark.status === 'peek').length,
        ],
        breaks: 4,
        hints: true,
        lineBreak: false,
      });
      expect(hints.length).toBeGreaterThanOrEqual(1);
      await today.leave();
    }
  });
});
