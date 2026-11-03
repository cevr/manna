import { Schema } from 'effect';

export const SendRequest = Schema.Struct({
  film: Schema.String,
  dryRun: Schema.optionalKey(Schema.Boolean),
});
export type SendRequest = typeof SendRequest.Type;

export const SendCounts = Schema.Struct({
  film: Schema.String,
  confirmed: Schema.Int,
  sent: Schema.Int,
  refused: Schema.Int,
  waiting: Schema.Int,
  unsure: Schema.Int,
  queued: Schema.Int,
});

export const SendRefusal = Schema.Struct({ error: Schema.String });

export const SendAnswer = Schema.Union([SendCounts, SendRefusal]);
export type SendAnswer = typeof SendAnswer.Type;
