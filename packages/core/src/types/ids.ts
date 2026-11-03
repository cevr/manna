import { Schema } from 'effect';

export const HymnId = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 920 })),
  Schema.brand('HymnId'),
);
export type HymnId = typeof HymnId.Type;

export const CategoryId = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('CategoryId'),
);
export type CategoryId = typeof CategoryId.Type;

export const VerseId = Schema.Finite.pipe(Schema.check(Schema.isInt()), Schema.brand('VerseId'));
export type VerseId = typeof VerseId.Type;
