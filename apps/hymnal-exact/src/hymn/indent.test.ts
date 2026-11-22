/**
 * A wrapped line hangs by the current app's indent at every reading size
 * and text size: the page's indent (`readingShown.indent`, src/reading/
 * reading.ts) is a multiple of `rem`, the words' size at the reader's text
 * size, so at every step, at the default text size and at twice it, the
 * port's indent is the current app's `readingStyle(…).indent`, which grows
 * with the system's text size, give or take its rounding to a whole point.
 * Both pages set their lines in by it and pull the first word back out by
 * it, with no fixed length beside it.
 */

import { describe, expect, test } from 'bun:test';

import { defaultReading, readingStyle, SIZES } from '@manna/hymnal-app/reader/reading';

import { appFile } from '../look/design.testing.ts';
import { BODY, readingOf } from '../reading/reading.ts';

/** The port's indent at text size `scale`, in points, from its `rem` multiple. */
const portIndent = (written: string, scale: number) =>
  Number(/^(\d+(?:\.\d+)?)rem$/u.exec(written)?.[1] ?? 'NaN') * BODY * scale;

describe('the hanging indent follows the reading size and the text size', () => {
  test('at every step, at the default text size and at twice it, it is the current app’s', () => {
    for (const [step] of SIZES.entries())
      for (const scale of [1, 2]) {
        const theirs = readingStyle({ ...defaultReading, size: step }, scale).indent;
        const ours = portIndent(readingOf(`${step}`, '', '').indent, scale);
        expect(Math.abs(ours - theirs)).toBeLessThanOrEqual(0.5 * scale + 0.5);
      }
  });

  test('a fixed length is no indent here', () => {
    expect(portIndent('21px', 2)).toBeNaN();
  });

  for (const file of ['features/hymn.contract', 'features/chords.contract'])
    test(`${file} sets each line in by the reading's indent and draws its first word back by it`, () => {
      const text = appFile(file);
      expect(text).toContain('padding-left=readingShown.indent');
      expect(text).toContain('margin-left=`calc(0px - ${readingShown.indent})`');
      expect(text).not.toMatch(/(?:padding|margin)-left="calc\([^"]*\d\.\d/u);
    });
});
