/**
 * What `bun run mail:send` (`../../scripts/mail-send.ts`) and `bun run
 * mail:import` (`../../scripts/mail-import.ts`) and the Worker's admin
 * routes (`./routes.ts`) say to each other: one contract, read on both sides.
 */
import { Schema } from 'effect';

export const SendRequest = Schema.Struct({
  /** `<series id>/<no>` (`./films.ts`). */
  film: Schema.String,
  /** Count only: put nothing on the queue. */
  dryRun: Schema.optionalKey(Schema.Boolean),
});
export type SendRequest = typeof SendRequest.Type;

/** A film's send as it stands, and how many deliveries this call queued. */
export const SendCounts = Schema.Struct({
  film: Schema.String,
  confirmed: Schema.Int,
  sent: Schema.Int,
  refused: Schema.Int,
  waiting: Schema.Int,
  /** Sends that stopped before their outcome was kept: never sent again (`./list.ts`). */
  unsure: Schema.Int,
  queued: Schema.Int,
});

export const SendRefusal = Schema.Struct({ error: Schema.String });

export const SendAnswer = Schema.Union([SendCounts, SendRefusal]);
export type SendAnswer = typeof SendAnswer.Type;

/** What the import did: how many of the D1 list's subscribers it brought over (`./legacy.ts`). */
export const ImportCounts = Schema.Struct({ imported: Schema.Int });

export const ImportAnswer = Schema.Union([ImportCounts, SendRefusal]);
export type ImportAnswer = typeof ImportAnswer.Type;
