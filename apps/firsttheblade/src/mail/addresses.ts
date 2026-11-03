/**
 * Each subscriber's address, over the database's port (`./sql.ts`), in the
 * `addresses` table: the one place an address is kept. A sign-up writes its
 * address here before the model hears of it (`./routes.ts`); a letter reads
 * it (`./postman.ts`, `./deliver.ts`); and a sign-up that ran out deletes
 * it, through the model's port (`layerBook`, `../list/AddressBook.ts`).
 */
import { Context, Effect, Layer, Option, Schema } from 'effect';

import { AddressBook, type Forget } from '../list/AddressBook.ts';
import type { SubscriberId } from '../list/Subscriber.id.ts';
import { Address } from './address.ts';
import { Sql, SqlError, type Statement } from './sql.ts';

export interface AddressesService {
  /** Keeps a subscriber's address, written `now`. */
  readonly keep: (
    subscriber: SubscriberId,
    address: Address,
    now: number,
  ) => Effect.Effect<void, SqlError>;
  readonly find: (subscriber: SubscriberId) => Effect.Effect<Option.Option<Address>, SqlError>;
  /** Deletes each address kept at or before its `before`, in one transaction. */
  readonly forget: (entries: ReadonlyArray<Forget>) => Effect.Effect<void, SqlError>;
}

export class Addresses extends Context.Service<Addresses, AddressesService>()(
  'firsttheblade/Addresses',
) {}

const statement = (name: string, text: string): Statement => ({ name, text });

const KEEP = statement(
  'addresses.keep',
  `INSERT INTO addresses (subscriber, address, kept_at) VALUES (?, ?, ?)
   ON CONFLICT (subscriber) DO UPDATE SET address = excluded.address, kept_at = excluded.kept_at`,
);

const FIND = statement('addresses.find', `SELECT address FROM addresses WHERE subscriber = ?`);

const FORGET = statement(
  'addresses.forget',
  `DELETE FROM addresses WHERE subscriber = ? AND kept_at <= ?`,
);

const AddressRow = Schema.Struct({ address: Address });
const readRows = Schema.decodeUnknownEffect(Schema.Array(AddressRow));

export const layer = Layer.effect(
  Addresses,
  Effect.gen(function* () {
    const sql = yield* Sql;
    const keep = Effect.fn('Addresses.keep')(function* (
      subscriber: SubscriberId,
      address: Address,
      now: number,
    ) {
      yield* sql.run(KEEP, [subscriber, address, now]);
    });
    const find = Effect.fn('Addresses.find')(function* (subscriber: SubscriberId) {
      const rows = yield* sql.all(FIND, [subscriber]).pipe(
        Effect.flatMap(readRows),
        Effect.mapError(() =>
          SqlError.make({ statement: FIND.name, reason: 'a row of an unexpected shape' }),
        ),
      );
      return Option.map(Option.fromNullishOr(rows[0]), (row) => row.address);
    });
    const forget = Effect.fn('Addresses.forget')(function* (entries: ReadonlyArray<Forget>) {
      if (entries.length === 0) return;
      yield* sql.batch(
        entries.map((entry) => ({ statement: FORGET, values: [entry.subscriber, entry.before] })),
      );
    });
    return Addresses.of({ keep, find, forget });
  }),
);

/**
 * The model's address book over these addresses. A delete that fails is a
 * defect: the platform delivers the batch again.
 */
export const layerBook = Layer.effect(
  AddressBook,
  Effect.gen(function* () {
    const addresses = yield* Addresses;
    return AddressBook.of({ forget: (entries) => addresses.forget(entries).pipe(Effect.orDie) });
  }),
);
