/**
 * A wrapped line hangs by the current app's indent at every text size: the
 * brand's `space.hang` is a multiple of `rem`, the words' size at the
 * reader's text size, so at the default size and at twice it the port's
 * indent is the current app's `readingStyle(…).indent`, which grows with
 * the system's text size, give or take its rounding to a whole point. Both
 * pages set their lines in by that token and pull the first word back out
 * by it, with no fixed length beside it.
 */

import { describe, expect, test } from 'bun:test';

import { defaultReading, readingStyle } from '@manna/hymnal-app/reader/reading';

import { appFile, brandOf } from '../look/design.testing.ts';

/** The words' size a `rem` is on iOS at the default text size, in points: `type.line` is `1rem`. */
const BODY = 17;

const hang = brandOf(appFile('app.forma')).measures.get('space.hang') ?? '';

/** The port's indent at text size `scale`, in points, from the brand's `rem` multiple. */
const portIndent = (written: string, scale: number) =>
  Number(/^(\d+(?:\.\d+)?)rem$/u.exec(written)?.[1] ?? 'NaN') * BODY * scale;

describe('the hanging indent follows the text size', () => {
  test('at the default text size and at twice it, it is the current app’s', () => {
    for (const scale of [1, 2]) {
      const theirs = readingStyle(defaultReading, scale).indent;
      expect(Math.abs(portIndent(hang, scale) - theirs)).toBeLessThanOrEqual(0.5);
    }
  });

  test('a fixed length is no indent here', () => {
    expect(portIndent('21px', 2)).toBeNaN();
  });

  for (const file of ['features/hymn.contract', 'features/chords.contract'])
    test(`${file} sets each line in by space.hang and draws its first word back by it`, () => {
      const text = appFile(file);
      expect(text).toContain('padding-left="space.hang"');
      expect(text).toContain('margin-left="calc(0px - space.hang)"');
      expect(text).not.toMatch(/(?:padding|margin)-left="calc\([^"]*\d\.\d/u);
    });
});
