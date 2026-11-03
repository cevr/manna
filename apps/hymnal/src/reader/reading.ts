import { Schema } from 'effect';

export const SIZES = [14, 15, 17, 19, 21, 24, 28, 32] as const;

export const DEFAULT_SIZE = 2;

export const Size = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: SIZES.length - 1 }));
export type Size = typeof Size.Type;

export const Font = Schema.Literals(['system', 'serif']);
export type Font = typeof Font.Type;

export const Spacing = Schema.Literals(['compact', 'normal', 'roomy']);
export type Spacing = typeof Spacing.Type;

export interface Reading {
  readonly size: Size;
  readonly font: Font;
  readonly spacing: Spacing;
}

export const defaultReading: Reading = { size: DEFAULT_SIZE, font: 'system', spacing: 'normal' };

export const larger = (size: Size): Size => Math.min(size + 1, SIZES.length - 1);

export const smaller = (size: Size): Size => Math.max(size - 1, 0);

export const pointsAt = (size: Size): number => SIZES[size] ?? SIZES[DEFAULT_SIZE];

const LEADING: Record<Spacing, number> = { compact: 21 / 17, normal: 24 / 17, roomy: 29 / 17 };

const INDENT = 1.25;

export interface ReadingStyle {
  readonly words: { readonly fontSize: number; readonly lineHeight: number };
  readonly chords: { readonly fontSize: number; readonly lineHeight: number };
  readonly font: Font;
  readonly indent: number;
}

export const readingStyle = (reading: Reading, fontScale: number): ReadingStyle => {
  const size = pointsAt(reading.size);
  const factor = size / SIZES[DEFAULT_SIZE];
  return {
    words: { fontSize: size, lineHeight: Math.round(size * LEADING[reading.spacing]) },
    chords: { fontSize: Math.round(15 * factor), lineHeight: Math.round(20 * factor) },
    font: reading.font,
    indent: Math.round(size * INDENT * fontScale),
  };
};
