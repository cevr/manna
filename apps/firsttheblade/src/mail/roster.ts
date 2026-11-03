/**
 * The roster, over the database's port (`./sql.ts`), in the `roster` and
 * `roster_letters` tables: who is on the list and which film letters each was
 * sent. The model's `Roster` projection writes it through `layerStore`
 * (`../list/RosterStore.ts`); a film's send reads it (`./routes.ts`). It
 * follows the model a moment behind, so a count may miss a change just made;
 * each letter is still claimed in the model before it goes (`./deliver.ts`).
 */
import { Context, Effect, Layer, Match, Schema } from 'effect';

import { type RosterChange, RosterStore } from '../list/RosterStore.ts';
import { SubscriberId } from '../list/Subscriber.id.ts';
import { Sql, SqlError, type SqlValue, type Statement } from './sql.ts';

/** What a film's send has reached. */
export interface FilmCounts {
  readonly confirmed: number;
  readonly sent: number;
  readonly refused: number;
  /** Confirmed, and neither sent the film, refused it, nor being sent it. */
  readonly waiting: number;
  /**
   * Started and never finished: the send stopped before its outcome was
   * kept. The letter may have gone, so it is never sent again.
   */
  readonly unsure: number;
}

export interface RosterTableService {
  /** Applies changes in order, in one transaction. */
  readonly record: (changes: ReadonlyArray<RosterChange>) => Effect.Effect<void, SqlError>;
  readonly counts: (film: string) => Effect.Effect<FilmCounts, SqlError>;
  /** The next confirmed subscribers after `after` (by id) still waiting for the film. */
  readonly waiting: (
    film: string,
    after: string,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<SubscriberId>, SqlError>;
}

export class RosterTable extends Context.Service<RosterTable, RosterTableService>()(
  'firsttheblade/RosterTable',
) {}

const statement = (name: string, text: string): Statement => ({ name, text });

const STANDING = statement(
  'roster.standing',
  `INSERT INTO roster (subscriber, confirmed) VALUES (?, ?)
   ON CONFLICT (subscriber) DO UPDATE SET confirmed = excluded.confirmed`,
);

const LETTER = statement(
  'roster.letter',
  `INSERT INTO roster_letters (film, subscriber, letter) VALUES (?, ?, ?)
   ON CONFLICT (film, subscriber) DO UPDATE SET letter = excluded.letter`,
);

const RETURNED = statement(
  'roster.returned',
  `DELETE FROM roster_letters WHERE film = ? AND subscriber = ? AND letter = 'sending'`,
);

/** Not sent the film, refused it, nor being sent it. */
const NO_LETTER =
  'NOT EXISTS (SELECT 1 FROM roster_letters l WHERE l.film = ? AND l.subscriber = r.subscriber)';

const COUNTS = statement(
  'roster.counts',
  `SELECT
     (SELECT count(*) FROM roster WHERE confirmed = 1) AS confirmed,
     (SELECT count(*) FROM roster_letters WHERE film = ? AND letter = 'sent') AS sent,
     (SELECT count(*) FROM roster_letters WHERE film = ? AND letter = 'refused') AS refused,
     (SELECT count(*) FROM roster r WHERE r.confirmed = 1 AND ${NO_LETTER}) AS waiting,
     (SELECT count(*) FROM roster_letters WHERE film = ? AND letter = 'sending') AS unsure`,
);

const WAITING = statement(
  'roster.waiting',
  `SELECT subscriber FROM roster r
   WHERE r.confirmed = 1 AND r.subscriber > ? AND ${NO_LETTER}
   ORDER BY r.subscriber LIMIT ?`,
);

const CountsRow = Schema.Struct({
  confirmed: Schema.Int,
  sent: Schema.Int,
  refused: Schema.Int,
  waiting: Schema.Int,
  unsure: Schema.Int,
});
const SubscriberRow = Schema.Struct({ subscriber: SubscriberId });

/** The statement a change runs, with its values. */
const stepOf = (change: RosterChange) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      Joined: ({ subscriber }) => ({ statement: STANDING, values: [subscriber, 1] }),
      Left: ({ subscriber }) => ({ statement: STANDING, values: [subscriber, 0] }),
      Letter: ({ subscriber, film, letter }) => ({
        statement: LETTER,
        values: [film, subscriber, letter],
      }),
      LetterReturned: ({ subscriber, film }) => ({
        statement: RETURNED,
        values: [film, subscriber],
      }),
    }),
  );

export const layer = Layer.effect(
  RosterTable,
  Effect.gen(function* () {
    const sql = yield* Sql;

    /** The rows a statement answers, each read as `row`. */
    const rows = <A, I>(
      row: Schema.Codec<A, I>,
      query: Statement,
      values: ReadonlyArray<SqlValue>,
    ) =>
      sql
        .all(query, values)
        .pipe(
          Effect.flatMap((found) =>
            Schema.decodeUnknownEffect(Schema.Array(row))(found).pipe(
              Effect.mapError(() =>
                SqlError.make({ statement: query.name, reason: 'a row of an unexpected shape' }),
              ),
            ),
          ),
        );

    const record = Effect.fn('RosterTable.record')(function* (
      changes: ReadonlyArray<RosterChange>,
    ) {
      if (changes.length === 0) return;
      yield* sql.batch(changes.map(stepOf));
    });

    const counts = Effect.fn('RosterTable.counts')(function* (film: string) {
      const [row] = yield* rows(CountsRow, COUNTS, [film, film, film, film]);
      return row ?? { confirmed: 0, sent: 0, refused: 0, waiting: 0, unsure: 0 };
    });

    const waiting = Effect.fn('RosterTable.waiting')(function* (
      film: string,
      after: string,
      limit: number,
    ) {
      const found = yield* rows(SubscriberRow, WAITING, [after, film, limit]);
      return found.map((row) => row.subscriber);
    });

    return RosterTable.of({ record, counts, waiting });
  }),
);

/**
 * The model's roster store over this table. A write that fails is a defect:
 * the platform delivers the batch again.
 */
export const layerStore = Layer.effect(
  RosterStore,
  Effect.gen(function* () {
    const table = yield* RosterTable;
    return RosterStore.of({ record: (changes) => table.record(changes).pipe(Effect.orDie) });
  }),
);
