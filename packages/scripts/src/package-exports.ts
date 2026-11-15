import { Predicate, Schema, SchemaGetter } from 'effect';

/** One `exports` target, read as the file a runtime loads: a path, or conditions whose `default` is that path (their `types` is for a type check alone, such as Exact's, `@manna/exact-kit/effect`). */
const Target = Schema.Union([
  Schema.String,
  Schema.Struct({ types: Schema.optionalKey(Schema.String), default: Schema.String }),
]).pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((target) => {
      if (Predicate.isString(target)) return target;
      return target.default;
    }),
    encode: SchemaGetter.passthroughSupertype(),
  }),
);

/** A `package.json`'s `exports`: each subpath to the file a runtime loads for it. */
export const Exports = Schema.Record(Schema.String, Target);
