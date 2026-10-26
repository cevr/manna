/**
 * The list as a film's send reads it: who is confirmed, and which letters
 * each was sent. `Roster` writes it from the model's events; the server asks
 * it who still waits for a film and how far the film has gone. On Cloudflare
 * it is D1 (`../mail/roster.ts`); the stories keep it in memory.
 */
import { Context, Effect, Match, Option, Ref } from 'effect';

import type { Letter, SubscriberId } from './Subscriber.id.ts';

/** One change to one subscriber's row. */
export type RosterChange =
  | { readonly _tag: 'Joined'; readonly subscriber: SubscriberId }
  | { readonly _tag: 'Left'; readonly subscriber: SubscriberId }
  | {
      readonly _tag: 'Letter';
      readonly subscriber: SubscriberId;
      readonly film: string;
      readonly letter: Letter;
    }
  /** A claim given back: the subscriber waits for the film again. */
  | { readonly _tag: 'LetterReturned'; readonly subscriber: SubscriberId; readonly film: string };

export class RosterStore extends Context.Service<
  RosterStore,
  {
    /** Applies changes in order. Applying one twice leaves the row as once. */
    readonly record: (changes: ReadonlyArray<RosterChange>) => Effect.Effect<void>;
  }
>()('firsttheblade/RosterStore') {}

interface Row {
  readonly confirmed: boolean;
  readonly letters: ReadonlyMap<string, Letter>;
}

const EMPTY: Row = { confirmed: false, letters: new Map() };

const apply = (rows: ReadonlyMap<SubscriberId, Row>, change: RosterChange) => {
  const row = Option.getOrElse(Option.fromNullishOr(rows.get(change.subscriber)), () => EMPTY);
  const letters = new Map(row.letters);
  const next: Row = Match.value(change).pipe(
    Match.tagsExhaustive({
      Joined: () => ({ ...row, confirmed: true }),
      Left: () => ({ ...row, confirmed: false }),
      Letter: ({ film, letter }) => ({ ...row, letters: letters.set(film, letter) }),
      LetterReturned: ({ film }) => {
        letters.delete(film);
        return { ...row, letters };
      },
    }),
  );
  return new Map(rows).set(change.subscriber, next);
};

/**
 * A roster kept in memory, for the stories: the store, and what the server
 * would ask of it (who waits for a film, and how far the film has gone).
 */
export const memory = Effect.gen(function* () {
  const rows = yield* Ref.make<ReadonlyMap<SubscriberId, Row>>(new Map());
  const record = (changes: ReadonlyArray<RosterChange>) =>
    Ref.update(rows, (all) => changes.reduce(apply, all));
  const waiting = (film: string) =>
    Ref.get(rows).pipe(
      Effect.map((all) =>
        [...all]
          .filter(([, row]) => row.confirmed && !row.letters.has(film))
          .map(([id]) => id)
          .toSorted(),
      ),
    );
  const counts = (film: string) =>
    Effect.gen(function* () {
      const all = [...(yield* Ref.get(rows)).values()];
      const count = (letter: Letter) =>
        all.filter((row) => row.letters.get(film) === letter).length;
      return {
        confirmed: all.filter((row) => row.confirmed).length,
        sent: count('sent'),
        refused: count('refused'),
        waiting: (yield* waiting(film)).length,
        unsure: count('sending'),
      };
    });
  return { store: RosterStore.of({ record }), counts, waiting };
});
