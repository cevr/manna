import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer } from 'effect';

import { SubscriberId } from '../list/Subscriber.id.ts';
import { layer, RosterTable } from './roster.ts';
import { layerSqlite } from './sql-sqlite.ts';

const test = it.effect.layer(
  layer.pipe(Layer.provide(layerSqlite), Layer.provide(BunServices.layer)),
);

const ANN = SubscriberId.make('ann');
const BEN = SubscriberId.make('ben');
const CAL = SubscriberId.make('cal');
const DOT = SubscriberId.make('dot');
const FILM = 'path/01';

describe('the roster', () => {
  test("counts a film's send, and lists who waits for it in pages, by id", () =>
    Effect.gen(function* () {
      const roster = yield* RosterTable;
      yield* roster.record([
        { _tag: 'Joined', subscriber: DOT },
        { _tag: 'Joined', subscriber: ANN },
        { _tag: 'Joined', subscriber: BEN },
        { _tag: 'Joined', subscriber: CAL },
        { _tag: 'Left', subscriber: CAL },
        { _tag: 'Letter', subscriber: BEN, film: FILM, letter: 'sending' },
        { _tag: 'Letter', subscriber: BEN, film: FILM, letter: 'sent' },
        { _tag: 'Letter', subscriber: ANN, film: 'path/02', letter: 'refused' },
      ]);
      expect(yield* roster.counts(FILM)).toEqual({
        confirmed: 3,
        sent: 1,
        refused: 0,
        waiting: 2,
        unsure: 0,
      });
      expect(yield* roster.waiting(FILM, '', 1)).toEqual([ANN]);
      expect(yield* roster.waiting(FILM, ANN, 10)).toEqual([DOT]);
      expect(yield* roster.waiting(FILM, DOT, 10)).toEqual([]);
    }));

  test('a letter given back waits again; one never settled is unsure and waits no more', () =>
    Effect.gen(function* () {
      const roster = yield* RosterTable;
      yield* roster.record([
        { _tag: 'Joined', subscriber: ANN },
        { _tag: 'Joined', subscriber: BEN },
        { _tag: 'Letter', subscriber: ANN, film: FILM, letter: 'sending' },
        { _tag: 'LetterReturned', subscriber: ANN, film: FILM },
        { _tag: 'Letter', subscriber: BEN, film: FILM, letter: 'sending' },
      ]);
      expect(yield* roster.waiting(FILM, '', 10)).toEqual([ANN]);
      expect((yield* roster.counts(FILM)).unsure).toBe(1);
    }));

  test('a returned letter that was already settled stays settled', () =>
    Effect.gen(function* () {
      const roster = yield* RosterTable;
      yield* roster.record([
        { _tag: 'Joined', subscriber: ANN },
        { _tag: 'Letter', subscriber: ANN, film: FILM, letter: 'sent' },
        { _tag: 'LetterReturned', subscriber: ANN, film: FILM },
      ]);
      expect(yield* roster.counts(FILM)).toEqual({
        confirmed: 1,
        sent: 1,
        refused: 0,
        waiting: 0,
        unsure: 0,
      });
    }));
});
