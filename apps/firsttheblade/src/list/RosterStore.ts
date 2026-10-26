/**
 * The list as a film's send reads it: who is confirmed, and which letters
 * each was sent. `Roster` writes it from the model's events; the send asks it
 * who still waits for a film and how far the film has gone. On Cloudflare it
 * is a D1 table; the stories keep it in memory.
 */
import type { RuntimeContext } from 'alchemy/RuntimeContext';
import { Context, Effect, Match, Option, Ref } from 'effect';

import type { SubscriberId } from './Subscriber.id.ts';

export type Letter = 'sending' | 'sent' | 'refused';

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

/** What a film's send has reached, as `List.counts` answers it (`../mail/list.ts`). */
export interface FilmCounts {
  readonly confirmed: number;
  readonly sent: number;
  readonly refused: number;
  /** Confirmed, and neither sent the film nor refused it nor being sent it. */
  readonly waiting: number;
  /** Claimed and never settled: the letter may have gone, so it is never sent again. */
  readonly unsure: number;
}

export class RosterStore extends Context.Service<
  RosterStore,
  {
    /** Applies changes in order. Applying one twice leaves the row as once. */
    readonly record: (
      changes: ReadonlyArray<RosterChange>,
    ) => Effect.Effect<void, never, RuntimeContext>;
    readonly counts: (film: string) => Effect.Effect<FilmCounts>;
    /** The confirmed subscribers still waiting for the film, by id. */
    readonly waiting: (film: string) => Effect.Effect<ReadonlyArray<SubscriberId>>;
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

/** A roster kept in memory, for the stories. */
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
  return RosterStore.of({ record, counts, waiting });
});
