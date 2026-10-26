import { Schema } from 'effect';

export const WebsterEntry = Schema.Struct({
  id: Schema.Int.check(Schema.isGreaterThan(0)),
  headword: Schema.NonEmptyString,
  definition: Schema.NonEmptyString,
});
export interface WebsterEntry extends Schema.Schema.Type<typeof WebsterEntry> {}

export const WebsterLookup = Schema.Struct({
  query: Schema.String,
  entries: Schema.Array(WebsterEntry),
  match: Schema.Literals(['exact', 'kjv-alias', 'kjv-inflection', 'none']),
  key: Schema.String,
});
export interface WebsterLookup extends Schema.Schema.Type<typeof WebsterLookup> {}

export class WebsterError extends Schema.TaggedError<WebsterError>()('WebsterError', {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
