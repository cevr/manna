/**
 * The native voice module's wire: it answers its voices and sends each
 * event as JSON text (the Swift package `native/voice`), so its declaration holds
 * plain types only. These schemas decode that text at the boundary.
 */

import { Schema } from 'effect';

export const VoiceInfoJson = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      id: Schema.String,
      language: Schema.String,
      name: Schema.String,
      quality: Schema.Int,
      novelty: Schema.Boolean,
      personal: Schema.Boolean,
    }),
  ),
);

export const VoiceEventJson = Schema.fromJsonString(
  Schema.Struct({
    utterance: Schema.Int,
    kind: Schema.Literals(['start', 'range', 'finish', 'cancel', 'interrupt']),
    location: Schema.Int,
    length: Schema.Int,
  }),
);
