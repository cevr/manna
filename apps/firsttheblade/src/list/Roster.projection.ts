/** Keeps the roster (`./RosterStore.ts`) as the subscribers' events say. */
import * as Domain from '@alchemy.run/domain';
import { Effect, Match, Record } from 'effect';

import { Confirmed } from './ConfirmLink.command.ts';
import {
  FilmLetterClaimed,
  FilmLetterRefused,
  FilmLetterReleased,
  FilmLetterSent,
} from './FilmLetter.command.ts';
import { Imported } from './Import.command.ts';
import { Left } from './Leave.command.ts';
import { type RosterChange, RosterStore } from './RosterStore.ts';
import { Subscriber } from './Subscriber.aggregate.ts';
import type { SubscriberId } from './Subscriber.id.ts';

export class Roster extends Domain.Projection('Roster', {
  from: [Subscriber],
  key: Subscriber,
  on: [
    Confirmed,
    Left,
    FilmLetterClaimed,
    FilmLetterReleased,
    FilmLetterSent,
    FilmLetterRefused,
    Imported,
  ],
}) {}

/** An imported subscriber's row: on the list or not, and its letters. */
const importedRow = (subscriber: SubscriberId, imported: Imported): Array<RosterChange> => {
  const letters = Record.toEntries(imported.letters).map(([film, letter]): RosterChange => ({
    _tag: 'Letter',
    subscriber,
    film,
    letter,
  }));
  if (imported.standing._tag !== 'Confirmed') return letters;
  return [{ _tag: 'Joined', subscriber }, ...letters];
};

export const RosterLive = Roster.toLayer(
  Effect.gen(function* () {
    const store = yield* RosterStore;
    return Effect.fn('Roster.record')(function* (batch) {
      yield* store.record(
        batch.flatMap(({ key, event }) => {
          const subscriber = key.id;
          return Match.value(event).pipe(
            Match.tagsExhaustive({
              Confirmed: (): Array<RosterChange> => [{ _tag: 'Joined', subscriber }],
              Left: (): Array<RosterChange> => [{ _tag: 'Left', subscriber }],
              FilmLetterClaimed: ({ film }): Array<RosterChange> => [
                { _tag: 'Letter', subscriber, film, letter: 'sending' },
              ],
              FilmLetterReleased: ({ film }): Array<RosterChange> => [
                { _tag: 'LetterReturned', subscriber, film },
              ],
              FilmLetterSent: ({ film }): Array<RosterChange> => [
                { _tag: 'Letter', subscriber, film, letter: 'sent' },
              ],
              FilmLetterRefused: ({ film }): Array<RosterChange> => [
                { _tag: 'Letter', subscriber, film, letter: 'refused' },
              ],
              Imported: (imported) => importedRow(subscriber, imported),
            }),
          );
        }),
      );
    });
  }),
);
