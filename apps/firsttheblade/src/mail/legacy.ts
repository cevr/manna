/**
 * The D1 list the model replaced: its `subscribers` and `sends` tables
 * (`migrations/0001_mail.sql`, `0002_signed_up_at.sql`), read as one import a
 * subscriber (`../list/Import.command.ts`). `bun run mail:import` asks the
 * Worker to run them once, after the deploy that brings the model
 * (`./routes.ts`). Once prod has imported, this module, its route and its
 * script go, and a migration drops the two tables.
 */
import { Effect, Option, Schema } from 'effect';

import { Import, type Standing } from '../list/Import.command.ts';
import type { Letters } from '../list/Subscriber.id.ts';
import { Address } from './address.ts';
import { Sql, SqlError, type Statement } from './sql.ts';

/** One subscriber of the D1 list: its address, its row's id, and its import. */
export interface LegacySubscriber {
  readonly id: number;
  readonly address: Address;
  readonly command: Import;
}

const SUBSCRIBERS: Statement = {
  name: 'legacy.subscribers',
  text: `SELECT id, address, status, signed_up_at, confirm_sent_at, confirmed_at, unsubscribed_at
         FROM subscribers ORDER BY id`,
};

const SENDS: Statement = {
  name: 'legacy.sends',
  text: `SELECT film, subscriber_id, outcome FROM sends`,
};

const Millis = Schema.NullOr(Schema.Int);

const SubscriberRow = Schema.Struct({
  id: Schema.Int,
  address: Address,
  status: Schema.Literals(['pending', 'confirmed', 'unsubscribed']),
  signed_up_at: Schema.Int,
  confirm_sent_at: Millis,
  confirmed_at: Millis,
  unsubscribed_at: Millis,
});
type SubscriberRow = typeof SubscriberRow.Type;

const SendRow = Schema.Struct({
  film: Schema.String,
  subscriber_id: Schema.Int,
  outcome: Schema.Literals(['sending', 'sent', 'refused']),
});

/** Where a row stood. A time the old list never wrote falls back to its last sign-up. */
const standingOf = (row: SubscriberRow): Standing => {
  const left = Option.fromNullOr(row.unsubscribed_at);
  if (row.status === 'pending') return { _tag: 'Pending', leftAt: left };
  if (row.status === 'confirmed') {
    const at = Option.fromNullOr(row.confirmed_at);
    return { _tag: 'Confirmed', at: Option.getOrElse(at, () => row.signed_up_at) };
  }
  return { _tag: 'Left', at: Option.getOrElse(left, () => row.signed_up_at) };
};

/** Every subscriber of the D1 list, in the order of its rows. */
export const legacySubscribers = Effect.fn('Legacy.subscribers')(function* () {
  const sql = yield* Sql;
  const read = <A, I>(row: Schema.Codec<A, I>, statement: Statement) =>
    sql.all(statement, []).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(row))),
      Effect.mapError(() =>
        SqlError.make({ statement: statement.name, reason: 'a row of an unexpected shape' }),
      ),
    );
  const rows = yield* read(SubscriberRow, SUBSCRIBERS);
  const sends = yield* read(SendRow, SENDS);
  return rows.map((row): LegacySubscriber => {
    const letters: Letters = Object.fromEntries(
      sends
        .filter((send) => send.subscriber_id === row.id)
        .map((send) => [send.film, send.outcome]),
    );
    return {
      id: row.id,
      address: row.address,
      command: Import.make({
        signedUpAt: row.signed_up_at,
        link: Option.fromNullOr(row.confirm_sent_at),
        standing: standingOf(row),
        letters,
      }),
    };
  });
});
