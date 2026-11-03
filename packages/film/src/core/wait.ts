import { Effect, Schema, SchemaTransformation } from 'effect';

export const LONGEST_WAIT = 60;

export const WaitTimeout = Schema.Finite.pipe(
  Schema.decodeTo(
    Schema.Finite,
    SchemaTransformation.transform({
      decode: (seconds) => Math.min(Math.max(seconds, 0), LONGEST_WAIT),
      encode: (seconds) => seconds,
    }),
  ),
  Schema.withDecodingDefaultKey(Effect.succeed(LONGEST_WAIT)),
);
