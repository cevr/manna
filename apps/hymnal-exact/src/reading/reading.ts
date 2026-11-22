/**
 * The player sheet's Reading group and the page's text it sets, as the
 * current hymnal's (`reader/reading.ts`, `ReadingSheet.tsx`, `pageText.ts`):
 * the words' size on a dial of steps, their font, the space between lines.
 * The view keeps each as the text tapped (`persist`); `sizeOf`, `fontOf` and
 * `spacingOf` read it back as the current hymnal's store does, the text when
 * it is exactly a choice and else the default (step 2, System, Normal).
 *
 * Every length is in `rem`, its points over the words' first size
 * (`SIZES[DEFAULT_SIZE]`, 17, the body `type.line` is drawn at), so it grows
 * with the system's text size as the current app's `fontSize` does under
 * Dynamic Type: the words, their line, the chords over them and their row,
 * and the hanging indent (`readingStyle` at a text size of 1).
 */

import { DEFAULT_SIZE, Font, readingStyle, SIZES, Spacing } from '@manna/hymnal-app/reader/reading';
import {
  fontChoices,
  serifFamilies,
  shareOf,
  spacingChoices,
} from '@manna/hymnal-app/reader/reading-choices';

/** The points a `rem` stands for at the default text size: the words' first size. */
export const BODY = SIZES[DEFAULT_SIZE];

/** The largest an "A" of the size dial is drawn, in points (`SizeMark`, `ReadingSheet.tsx`). */
export const MARK_MOST = 26;

/** The most a dial's texts grow with the system's text size (`MOST_SCALE`, `DialView.tsx`). */
export const MOST_SCALE = 1.3;

/** A length of `points` at the default text size, in `rem`. */
export const remOf = (points: number): string => `${Number((points / BODY).toFixed(4))}rem`;

/** The step kept text names, else the default. */
export const sizeOf = (kept: string): number =>
  SIZES.map((_, step) => step).find((step) => `${step}` === kept) ?? DEFAULT_SIZE;

/** The font kept text names, else System. */
export const fontOf = (kept: string): Font =>
  Font.literals.find((font) => font === kept) ?? 'system';

/** The line spacing kept text names, else Normal. */
export const spacingOf = (kept: string): Spacing =>
  Spacing.literals.find((spacing) => spacing === kept) ?? 'normal';

/** A family stack the page draws a font in: none of its own for System (`inherit`), Georgia for Serif with the web's stack after it. */
export const familyOf = (font: Font): string =>
  ({ system: 'inherit', serif: `"${serifFamilies.ios}", ${serifFamilies.default}` })[font];

/** One row of a Reading radio group: its choice, its words, whether chosen, whether a hairline divides it from the row above, and the family its words are drawn in. */
export interface ReadingRow {
  readonly value: string;
  readonly label: string;
  readonly chosen: boolean;
  readonly divided: boolean;
  readonly family: string;
}

/** One stop of the text-size dial: its step and its "A", in `rem` and, at the accessibility sizes, its most in px. */
export interface SizeStop {
  readonly step: number;
  readonly mark: string;
  readonly most: string;
}

/** The Reading group and the page's text, under the kept texts. */
export interface ReadingView {
  readonly step: number;
  readonly said: string;
  readonly font: string;
  readonly spacing: string;
  readonly words: string;
  readonly line: string;
  readonly chords: string;
  readonly chordLine: string;
  readonly indent: string;
  readonly family: string;
  readonly stops: Array<SizeStop>;
  readonly fonts: Array<ReadingRow>;
  readonly spacings: Array<ReadingRow>;
}

export const readingOf = (size: string, font: string, spacing: string): ReadingView => {
  const reading = { size: sizeOf(size), font: fontOf(font), spacing: spacingOf(spacing) };
  const style = readingStyle(reading, 1);
  return {
    step: reading.size,
    said: shareOf(reading.size),
    font: reading.font,
    spacing: reading.spacing,
    words: remOf(style.words.fontSize),
    line: remOf(style.words.lineHeight),
    chords: remOf(style.chords.fontSize),
    chordLine: remOf(style.chords.lineHeight),
    indent: remOf(style.indent),
    family: familyOf(reading.font),
    stops: SIZES.map((points, step) => ({
      step,
      mark: remOf(Math.min(points, MARK_MOST)),
      most: `${Math.min(points, MARK_MOST) * MOST_SCALE}px`,
    })),
    fonts: fontChoices.map((choice, k) => ({
      value: choice.value,
      label: choice.label,
      chosen: choice.value === reading.font,
      divided: k > 0,
      family: familyOf(choice.value),
    })),
    spacings: spacingChoices.map((choice, k) => ({
      value: choice.value,
      label: choice.label,
      chosen: choice.value === reading.spacing,
      divided: k > 0,
      family: 'inherit',
    })),
  };
};
