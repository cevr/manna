import { Effect, Schema } from 'effect';

import type { compile } from '../src/compile.js';
import { Order } from '../src/hymn.js';

type Source = Parameters<typeof compile>[0];

export const HELD: ReadonlyMap<number, string> = new Map(
  [225, 262, 403, 453, 580].map((n) => [n, 'verse split misplaced, spot check 2026-10-17']),
);

const Refrains = Schema.fromJsonString(
  Schema.Struct({
    print: Schema.String,
    hymns: Schema.Array(Schema.Struct({ number: Schema.Int, order: Order, from: Schema.String })),
  }),
);

export const decodeOrders = (text: string) =>
  Schema.decodeEffect(Refrains)(text).pipe(
    Effect.map(({ hymns }) => new Map(hymns.map((hymn) => [hymn.number, hymn.order]))),
  );

class RefrainPlaceError extends Schema.TaggedError<RefrainPlaceError>()('RefrainPlaceError', {
  number: Schema.Int,
  reason: Schema.Literals(['a refrain with no place', 'a place with no refrain']),
}) {}

export const sourceOf = (
  row: {
    readonly number: number;
    readonly name: string;
    readonly verses: Source['verses'];
  },
  midi: Uint8Array,
  orders: ReadonlyMap<number, Order>,
): Effect.Effect<Source, RefrainPlaceError> => {
  const order = orders.get(row.number);
  const refrain = row.verses.some((verse) => verse.id < 0);
  if (refrain && order === undefined)
    return Effect.fail(
      RefrainPlaceError.make({ number: row.number, reason: 'a refrain with no place' }),
    );
  if (!refrain && order !== undefined)
    return Effect.fail(
      RefrainPlaceError.make({ number: row.number, reason: 'a place with no refrain' }),
    );
  return Effect.succeed({
    book: 'sdah-1985',
    number: row.number,
    title: row.name,
    verses: row.verses,
    midi,
    held: HELD.get(row.number),
    order,
  });
};
