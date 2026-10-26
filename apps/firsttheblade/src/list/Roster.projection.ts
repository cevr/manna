/** Keeps the roster (`./RosterStore.ts`) as the subscribers' events say. */
import * as Domain from '@alchemy.run/domain';
import { Effect, Match } from 'effect';

import { Confirmed } from './ConfirmLink.command.ts';
import {
  FilmLetterClaimed,
  FilmLetterRefused,
  FilmLetterReleased,
  FilmLetterSent,
} from './FilmLetter.command.ts';
import { Left } from './Leave.command.ts';
import { type RosterChange, RosterStore } from './RosterStore.ts';
import { Subscriber } from './Subscriber.aggregate.ts';

export class Roster extends Domain.Projection('Roster', {
  from: [Subscriber],
  key: Subscriber,
  on: [Confirmed, Left, FilmLetterClaimed, FilmLetterReleased, FilmLetterSent, FilmLetterRefused],
}) {}

export const RosterLive = Roster.toLayer(
  Effect.gen(function* () {
    const store = yield* RosterStore;
    return Effect.fn('Roster.record')(function* (batch) {
      yield* store.record(
        batch.map(({ key, event }) => {
          const subscriber = key.id;
          return Match.value(event).pipe(
            Match.tagsExhaustive({
              Confirmed: (): RosterChange => ({ _tag: 'Joined', subscriber }),
              Left: (): RosterChange => ({ _tag: 'Left', subscriber }),
              FilmLetterClaimed: ({ film }): RosterChange => ({
                _tag: 'Letter',
                subscriber,
                film,
                letter: 'sending',
              }),
              FilmLetterReleased: ({ film }): RosterChange => ({
                _tag: 'LetterReturned',
                subscriber,
                film,
              }),
              FilmLetterSent: ({ film }): RosterChange => ({
                _tag: 'Letter',
                subscriber,
                film,
                letter: 'sent',
              }),
              FilmLetterRefused: ({ film }): RosterChange => ({
                _tag: 'Letter',
                subscriber,
                film,
                letter: 'refused',
              }),
            }),
          );
        }),
      );
    });
  }),
);
