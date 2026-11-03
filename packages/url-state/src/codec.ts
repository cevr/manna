import { Schema, SchemaGetter, SchemaTransformation } from 'effect';

const isWellFormed = Schema.makeFilter((text: string) => text.isWellFormed() || 'well-formed text');

export const Text = Schema.String.check(isWellFormed);

export const Segment = Schema.NonEmptyString.check(
  isWellFormed,
  Schema.makeFilter((text: string) => (text !== '.' && text !== '..') || 'not . or ..'),
);

export const Finite = Schema.FiniteFromString;

export const Int = Schema.FiniteFromString.check(Schema.isInt());

export const Flag = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({
      decode: (text) => text === '1',
      encode: (on) => String(Number(on)),
    }),
  ),
);

export const literals = <const L extends ReadonlyArray<string>>(values: L) =>
  Schema.String.pipe(
    Schema.decodeTo(Schema.Literals(values), SchemaTransformation.passthroughSupertype()),
  );

const isWhole = Schema.makeFilter((n: number) => Number.isInteger(n), {
  expected: 'a whole number',
  arbitraryConstraint: { number: 'integer' },
});

export const truncate = <E>(self: Schema.Codec<number, E>) =>
  self.pipe(
    Schema.decodeTo(Schema.toType(self).check(isWhole), {
      decode: SchemaGetter.transform(Math.trunc),
      encode: SchemaGetter.passthrough(),
    }),
  );

export const clamp =
  (bounds: { readonly min?: number; readonly max?: number }) =>
  <E>(self: Schema.Codec<number, E>) => {
    const min = bounds.min ?? -Number.MAX_VALUE;
    const max = bounds.max ?? Number.MAX_VALUE;
    return self.pipe(
      Schema.decodeTo(
        Schema.toType(self).check(
          Schema.isGreaterThanOrEqualTo(min),
          Schema.isLessThanOrEqualTo(max),
        ),
        {
          decode: SchemaGetter.transform((n: number) => Math.min(Math.max(n, min), max)),
          encode: SchemaGetter.passthrough(),
        },
      ),
    );
  };
