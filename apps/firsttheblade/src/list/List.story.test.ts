/**
 * The list's rules as stories: given a subscriber's history, a command
 * records these events, replies this, or is refused. The same rules the D1
 * list holds (`../mail/list.test.ts`), over the model in memory, with its
 * policies and projections running for real. The Postman's letters wait
 * until a story answers them, and a clock the story moves stamps each command.
 */
import { Story } from '@alchemy.run/domain/Story';
import { DateTime, Duration, Effect, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as AddressBook from './AddressBook.ts';
import { Confirm, Confirmed, ConfirmLinkReleased, StaleLink } from './ConfirmLink.command.ts';
import {
  ClaimFilmLetter,
  FilmLetterClaimed,
  FilmLetterReleased,
  FilmLetterSent,
  ReleaseFilmLetter,
  SettleFilmLetter,
} from './FilmLetter.command.ts';
import { Leave, Left, SignUpExpired, SignUpLapsed } from './Leave.command.ts';
import { List, ListHandlers } from './List.model.ts';
import { LetterNotSent, Postman } from './Postman.external.ts';
import * as RosterStore from './RosterStore.ts';
import { ConfirmLinkIssued, SignedUp, SignUp } from './SignUp.command.ts';
import { Subscriber } from './Subscriber.aggregate.ts';
import { SubscriberId } from './Subscriber.id.ts';
import { CONFIRM_FOR, PENDING_FOR } from './timing.ts';

/** The stories' clock starts here. */
const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const after = (from: number, wait: Duration.Input) => from + Duration.toMillis(wait);
const at = (millis: number) => DateTime.formatIso(DateTime.makeUnsafe(millis));

const sam = Subscriber.ref(SubscriberId.make('sam'));
const ari = Subscriber.ref(SubscriberId.make('ari'));
const FILM = 'path/01';

/** The model with a memory address book and roster, the Postman's letters left to the story. */
const world = Effect.gen(function* () {
  const book = yield* AddressBook.memory;
  const roster = yield* RosterStore.memory;
  const ports = Layer.mergeAll(
    Layer.succeed(AddressBook.AddressBook, book.book),
    Layer.succeed(RosterStore.RosterStore, roster),
  );
  const story = Story.make(List, {
    layer: ListHandlers.pipe(Layer.provide(ports)),
    externalSystems: [Postman],
  });
  /** The same model, with a Postman whose letters never go. */
  const storyUnmailed = Story.make(List, {
    layer: ListHandlers.pipe(
      Layer.provide(ports),
      Layer.provide(
        Postman.toLayer(
          Effect.succeed({
            confirmLetter: () => Effect.fail(LetterNotSent.make({ reason: 'mailer down' })),
          }),
        ),
      ),
    ),
  });
  return { story, storyUnmailed, forgotten: book.forgotten, roster };
});

/** A sign-up whose link `issued` went out. */
const signedUp = (issued: number) => [
  SignedUp.make({ at: issued }),
  ConfirmLinkIssued.make({ issued }),
];

/** On the list since T0. */
const confirmed = [...signedUp(T0), Confirmed.make({ at: T0 })];

/** The confirm letter the Postman was asked for, sent. */
const mailed = (subscriber: typeof sam, issued: number) => [
  Story.expectCall(Postman.confirmLetter, { subscriber: subscriber.id, issued }),
  Story.resolve(Postman.confirmLetter, {}),
];

describe('signing up', () => {
  it.effect('a new address is sent one confirm link, and no second within the hour', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      yield* story(
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(T0)),
        Story.replied({ issued: Option.some(T0) }),
        ...mailed(sam, T0),
        Story.clock(at(after(T0, '30 minutes'))),
        Story.when(sam, SignUp.make({})),
        Story.then(sam, SignedUp.make({ at: after(T0, '30 minutes') })),
        Story.replied({ issued: Option.none() }),
        Story.clock(at(after(T0, '1 hour'))),
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(after(T0, '1 hour'))),
        ...mailed(sam, after(T0, '1 hour')),
      );
    }),
  );

  it.effect('a confirmed address is sent no link and stays confirmed', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      yield* story(
        Story.given(sam, ...confirmed),
        Story.when(sam, SignUp.make({})),
        Story.then(sam),
        Story.replied({ issued: Option.none() }),
        Story.state(sam, (state) => expect(state._tag).toBe('Confirmed')),
      );
    }),
  );

  it.effect(
    'a link whose letter did not go is given back, so the next sign-up sends one at once',
    () =>
      Effect.gen(function* () {
        const { storyUnmailed } = yield* world;
        yield* storyUnmailed(
          Story.when(sam, SignUp.make({})),
          Story.then(sam, ...signedUp(T0), ConfirmLinkReleased.make({ issued: T0 })),
          Story.clock(at(after(T0, '1 minute'))),
          Story.when(sam, SignUp.make({})),
          Story.replied({ issued: Option.some(after(T0, '1 minute')) }),
        );
      }),
  );
});

describe('confirming', () => {
  it.effect('only the newest link confirms, and confirming twice changes nothing', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      const newer = after(T0, '2 hours');
      yield* story(
        Story.given(sam, ...signedUp(T0), ...signedUp(newer)),
        Story.clock(at(after(newer, '1 minute'))),
        Story.when(sam, Confirm.make({ issued: T0 })),
        Story.rejected(StaleLink.make({})),
        Story.when(sam, Confirm.make({ issued: newer })),
        Story.then(sam, Confirmed.make({ at: after(newer, '1 minute') })),
        Story.when(sam, Confirm.make({ issued: newer })),
        Story.then(sam),
      );
    }),
  );

  it.effect('a link stops working seven days after it was sent', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      yield* story(
        Story.given(sam, ...signedUp(T0)),
        Story.clock(at(after(T0, CONFIRM_FOR) + 1)),
        Story.when(sam, Confirm.make({ issued: T0 })),
        Story.rejected(StaleLink.make({})),
      );
    }),
  );
});

describe('leaving', () => {
  it.effect('an address that left can sign up again, and its old link no longer works', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      const back = after(T0, '2 days');
      yield* story(
        Story.given(sam, ...confirmed, Left.make({ at: after(T0, '1 day') })),
        Story.clock(at(back)),
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(back)),
        ...mailed(sam, back),
        Story.when(sam, Confirm.make({ issued: T0 })),
        Story.rejected(StaleLink.make({})),
        Story.when(sam, Confirm.make({ issued: back })),
        Story.then(sam, Confirmed.make({ at: back })),
      );
    }),
  );

  it.effect('leaving and coming back does not start the hour between links again', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      yield* story(
        Story.given(sam, ...confirmed, Left.make({ at: after(T0, '2 minutes') })),
        Story.clock(at(after(T0, '10 minutes'))),
        Story.when(sam, SignUp.make({})),
        Story.then(sam, SignedUp.make({ at: after(T0, '10 minutes') })),
        Story.replied({ issued: Option.none() }),
      );
    }),
  );

  it.effect('leaving twice is leaving', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      yield* story(
        Story.given(sam, ...confirmed),
        Story.when(sam, Leave.make({})),
        Story.then(sam, Left.make({ at: T0 })),
        Story.when(sam, Leave.make({})),
        Story.then(sam),
      );
    }),
  );
});

describe('a sign-up that is never confirmed', () => {
  it.effect('is forgotten thirty days after it, its address with it, and not before', () =>
    Effect.gen(function* () {
      const { story, forgotten } = yield* world;
      yield* story(
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(T0)),
        ...mailed(sam, T0),
        Story.clock(at(after(T0, PENDING_FOR) - 1)),
        Story.then(sam),
        Story.clock(at(after(T0, PENDING_FOR))),
        Story.then(sam, SignUpExpired.make({})),
        Story.state(sam, (state) => expect(state._tag).toBe('None')),
      );
      expect(yield* forgotten).toEqual([sam.id]);
    }),
  );

  it.effect('starts its thirty days again when the address signs up again', () =>
    Effect.gen(function* () {
      const { story, forgotten } = yield* world;
      const again = after(T0, '20 days');
      yield* story(
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(T0)),
        ...mailed(sam, T0),
        Story.clock(at(again)),
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(again)),
        ...mailed(sam, again),
        Story.clock(at(after(T0, PENDING_FOR))),
        Story.then(sam),
        Story.clock(at(after(again, PENDING_FOR))),
        Story.then(sam, SignUpExpired.make({})),
      );
      expect(yield* forgotten).toEqual([sam.id]);
    }),
  );

  it.effect('after leaving, puts the address off the list again, as it was, and keeps it', () =>
    Effect.gen(function* () {
      const { story, forgotten } = yield* world;
      const back = after(T0, '2 days');
      yield* story(
        Story.given(sam, ...confirmed, Left.make({ at: after(T0, '1 day') })),
        Story.clock(at(back)),
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(back)),
        ...mailed(sam, back),
        Story.clock(at(after(back, PENDING_FOR))),
        Story.then(sam, SignUpLapsed.make({ leftAt: after(T0, '1 day') })),
        Story.state(sam, (state) => expect(state._tag).toBe('Left')),
      );
      expect(yield* forgotten).toEqual([]);
    }),
  );

  it.effect('a confirmed address is never expired', () =>
    Effect.gen(function* () {
      const { story } = yield* world;
      yield* story(
        Story.when(sam, SignUp.make({})),
        Story.then(sam, ...signedUp(T0)),
        ...mailed(sam, T0),
        Story.when(sam, Confirm.make({ issued: T0 })),
        Story.then(sam, Confirmed.make({ at: T0 })),
        Story.clock(at(after(T0, PENDING_FOR))),
        Story.then(sam),
      );
    }),
  );
});

describe("a film's letter", () => {
  it.effect('is claimed once for each confirmed subscriber, and never again once sent', () =>
    Effect.gen(function* () {
      const { story, roster } = yield* world;
      yield* story(
        Story.given(sam, ...confirmed),
        Story.given(ari, ...confirmed),
        Story.when(sam, ClaimFilmLetter.make({ film: FILM })),
        Story.then(sam, FilmLetterClaimed.make({ film: FILM })),
        Story.replied({ claimed: true }),
        Story.when(sam, ClaimFilmLetter.make({ film: FILM })),
        Story.then(sam),
        Story.replied({ claimed: false }),
        Story.when(sam, SettleFilmLetter.make({ film: FILM, outcome: 'sent' })),
        Story.then(sam, FilmLetterSent.make({ film: FILM })),
        Story.when(sam, ClaimFilmLetter.make({ film: FILM })),
        Story.replied({ claimed: false }),
      );
      // History reaches the projections (not the policies), so both are on the roster.
      expect(yield* roster.counts(FILM)).toEqual({
        confirmed: 2,
        sent: 1,
        refused: 0,
        waiting: 1,
        unsure: 0,
      });
      expect(yield* roster.waiting(FILM)).toEqual([ari.id]);
    }),
  );

  it.effect('given back waits again; one never settled is unsure and waits no more', () =>
    Effect.gen(function* () {
      const { story, roster } = yield* world;
      yield* story(
        Story.when(sam, SignUp.make({})),
        ...mailed(sam, T0),
        Story.when(sam, Confirm.make({ issued: T0 })),
        Story.when(ari, SignUp.make({})),
        ...mailed(ari, T0),
        Story.when(ari, Confirm.make({ issued: T0 })),
        Story.when(sam, ClaimFilmLetter.make({ film: FILM })),
        Story.when(sam, ReleaseFilmLetter.make({ film: FILM })),
        Story.when(ari, ClaimFilmLetter.make({ film: FILM })),
        Story.then(
          sam,
          ...signedUp(T0),
          Confirmed.make({ at: T0 }),
          FilmLetterClaimed.make({ film: FILM }),
          FilmLetterReleased.make({ film: FILM }),
        ),
      );
      expect(yield* roster.waiting(FILM)).toEqual([sam.id]);
      expect(yield* roster.counts(FILM)).toEqual({
        confirmed: 2,
        sent: 0,
        refused: 0,
        waiting: 1,
        unsure: 1,
      });
    }),
  );

  it.effect('is not claimed for a subscriber who left, who waits for no film', () =>
    Effect.gen(function* () {
      const { story, roster } = yield* world;
      yield* story(
        Story.when(sam, SignUp.make({})),
        ...mailed(sam, T0),
        Story.when(sam, Confirm.make({ issued: T0 })),
        Story.when(sam, Leave.make({})),
        Story.when(sam, ClaimFilmLetter.make({ film: FILM })),
        Story.replied({ claimed: false }),
      );
      expect(yield* roster.waiting(FILM)).toEqual([]);
    }),
  );
});
