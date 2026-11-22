/* oxlint-disable effect/noGlobals -- a Bun test writing the current app's store as the JSON text its `Atom.kvs` keeps. */

/**
 * Reading is the current hymnal's: for generated kept texts, the step,
 * font and spacing the port reads (`readingOf`) are what the current app's
 * own `reading.*` atoms give over a store holding the same texts under its
 * keys; every size, font and spacing the port offers is the current app's,
 * in its order and words; and the page's text the port writes in `rem`, at
 * every step and spacing and at each system text size, is the current
 * app's `readingStyle` under Dynamic Type (`fontSize` and `lineHeight` times
 * the text's scale, as React Native draws them on iOS). The declarations
 * Exact's type check reads (`decl/*.d.ts`) are held to the sources.
 */

import { describe, expect, it } from 'bun:test';
import type * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import * as reading from '@manna/hymnal-app/reader/reading';
import * as choices from '@manna/hymnal-app/reader/reading-choices';

import { oneFile } from '../look/design.testing.ts';
import { currentSettings } from '../test/kept.testing.ts';
import { pick, seeded } from '../test/random.ts';
import type * as ChoicesDecl from './decl/reading-choices';
import type * as ReadingDecl from './decl/reading';
import { BODY, MARK_MOST, MOST_SCALE, readingOf } from './reading.ts';

/** A module's declaration with each function's parameters compared both ways. */
type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  reading: {
    SIZES: reading.SIZES,
    DEFAULT_SIZE: reading.DEFAULT_SIZE,
    Font: reading.Font,
    Spacing: reading.Spacing,
    defaultReading: reading.defaultReading,
    readingStyle: reading.readingStyle,
  } satisfies Held<typeof ReadingDecl>,
  choices: {
    fontChoices: choices.fontChoices,
    spacingChoices: choices.spacingChoices,
    shareOf: choices.shareOf,
    serifFamilies: choices.serifFamilies,
  } satisfies Held<typeof ChoicesDecl>,
};

/** The part of the current app's settings this test runs. */
interface Settings {
  readonly reading: {
    readonly size: Atom.Atom<number>;
    readonly font: Atom.Atom<string>;
    readonly spacing: Atom.Atom<string>;
  };
}

const SIZE_TEXTS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '-1', '2.5', 'x', ''] as const;
const FONT_TEXTS = ['system', 'serif', 'mono', 'Serif', ''] as const;
const SPACING_TEXTS = ['compact', 'normal', 'roomy', 'loose', ''] as const;

/** A length the port writes in `rem`, in points at the system's text scale `scale`. */
const points = (rem: string, scale: number) =>
  Number(/^(-?\d+(?:\.\d+)?)rem$/u.exec(rem)?.[1] ?? 'NaN') * BODY * scale;

describe('Reading is the current app’s', () => {
  it('every declared export is there at run time', () => {
    for (const module of Object.values(held))
      for (const value of Object.values(module)) expect(value).toBeDefined();
  });

  it('for generated kept texts, the port reads what the current atoms give', () => {
    const random = seeded(31);
    for (let run = 0; run < 150; run++) {
      const size = pick(random, SIZE_TEXTS);
      const font = pick(random, FONT_TEXTS);
      const spacing = pick(random, SPACING_TEXTS);
      const device = new Map<string, string>();
      if (size !== '') device.set('reading.size', size);
      if (font !== '') device.set('reading.font', JSON.stringify(font));
      if (spacing !== '') device.set('reading.spacing', JSON.stringify(spacing));
      const settings = currentSettings<Settings>(device);
      const registry = AtomRegistry.make();
      const ours = readingOf(size, font, spacing);
      expect(ours.step).toBe(registry.get(settings.reading.size));
      expect(ours.font).toBe(registry.get(settings.reading.font));
      expect(ours.spacing).toBe(registry.get(settings.reading.spacing));
      registry.dispose();
    }
  });

  it('offers the current sizes, fonts and spacings, in order and words, and says the share', () => {
    const view = readingOf('', '', '');
    expect(view.stops.map((stop) => stop.step)).toEqual(reading.SIZES.map((_, step) => step));
    expect(view.fonts.map(({ value, label }) => ({ value, label }))).toEqual([
      ...choices.fontChoices,
    ]);
    expect(view.fonts.map((row) => row.value)).toEqual([...reading.Font.literals]);
    expect(view.spacings.map(({ value, label }) => ({ value, label }))).toEqual([
      ...choices.spacingChoices,
    ]);
    expect(view.spacings.map((row) => row.value)).toEqual([...reading.Spacing.literals]);
    for (const [step] of reading.SIZES.entries())
      expect(readingOf(`${step}`, '', '').said).toBe(choices.shareOf(step));
    expect(view.said).toBe('100%');
  });

  it('sets the page in the current app’s points at every step, spacing and text size', () => {
    for (const [step] of reading.SIZES.entries())
      for (const spacing of reading.Spacing.literals)
        for (const scale of [1, 1.5, 3.12]) {
          const theirs = reading.readingStyle(
            { ...reading.defaultReading, size: step, spacing },
            1,
          );
          const ours = readingOf(`${step}`, '', spacing);
          const near = (rem: string, pt: number) =>
            expect(Math.abs(points(rem, scale) - pt * scale)).toBeLessThan(0.01);
          near(ours.words, theirs.words.fontSize);
          near(ours.line, theirs.words.lineHeight);
          near(ours.chords, theirs.chords.fontSize);
          near(ours.chordLine, theirs.chords.lineHeight);
          near(ours.indent, theirs.indent);
        }
  });

  it('draws Serif in the face the current page names on iOS, before the web’s stack', () => {
    expect(readingOf('', 'serif', '').family).toBe(
      `"${choices.serifFamilies.ios}", ${choices.serifFamilies.default}`,
    );
    expect(readingOf('', 'system', '').family).toBe('inherit');
    expect(readingOf('', 'serif', '').fonts.map((row) => row.family)).toEqual([
      'inherit',
      readingOf('', 'serif', '').family,
    ]);
  });

  it('draws each step’s "A" as the current `SizeMark`: no larger than 26 points, at most 1.3 times it', () => {
    expect(oneFile('src/reader/ReadingSheet.tsx')).toContain(
      `fontSize: Math.min(points, ${MARK_MOST})`,
    );
    expect(oneFile('src/player/DialView.tsx')).toContain(
      `export const MOST_SCALE = ${MOST_SCALE};`,
    );
    for (const stop of readingOf('', '', '').stops) {
      const most = Math.min(reading.SIZES[stop.step] ?? 0, MARK_MOST);
      expect(points(stop.mark, 1)).toBeCloseTo(most, 2);
      expect(stop.most).toBe(`${most * MOST_SCALE}px`);
    }
  });
});
