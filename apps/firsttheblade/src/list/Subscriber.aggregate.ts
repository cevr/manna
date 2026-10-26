/**
 * One subscriber: every rule about one address holds here, in one writer, so
 * two requests at once cannot both pass a check (two sign-ups both issuing a
 * link, two batches both sending a film).
 *
 * - `None`: never signed up, or forgotten when a sign-up ran out.
 * - `Pending`: signed up, waiting to confirm with its newest link (`link`).
 *   `leftAt` is when it last left, if it ever did: a link issued then or
 *   before never confirms.
 * - `Confirmed`: on the list.
 * - `Left`: off the list. Its letters are kept, so coming back never sends a
 *   film twice.
 *
 * `Import` brought a subscriber over from the D1 list the model replaced, as
 * it stood there; it ran once, and stays for the `Imported` events it wrote
 * (`./Import.command.ts`).
 */
import * as Domain from '@alchemy.run/domain';
import { Array as Arr, DateTime, Duration, Match, Option, Predicate, Schema } from 'effect';

import {
  Confirm,
  Confirmed,
  ConfirmLinkReleased,
  ReleaseConfirmLink,
  StaleLink,
} from './ConfirmLink.command.ts';
import {
  ClaimFilmLetter,
  FilmLetterClaimed,
  FilmLetterRefused,
  FilmLetterReleased,
  FilmLetterSent,
  ReleaseFilmLetter,
  SettleFilmLetter,
} from './FilmLetter.command.ts';
import { Import, Imported } from './Import.command.ts';
import { ExpireSignUp, Leave, Left, SignUpExpired, SignUpLapsed } from './Leave.command.ts';
import { ConfirmLinkIssued, SignedUp, SignUp } from './SignUp.command.ts';
import { type Letter, Letters, Millis, SubscriberId } from './Subscriber.id.ts';
import { CONFIRM_FOR, RESEND_AFTER } from './timing.ts';

/** When the newest confirm link was issued, if one stands. */
const Link = Schema.OptionFromNullOr(Millis);

const NoneState = Schema.TaggedStruct('None', {});
const PendingState = Schema.TaggedStruct('Pending', {
  signedUpAt: Millis,
  link: Link,
  leftAt: Schema.OptionFromNullOr(Millis),
  letters: Letters,
});
const ConfirmedState = Schema.TaggedStruct('Confirmed', {
  confirmedAt: Millis,
  link: Link,
  letters: Letters,
});
const LeftState = Schema.TaggedStruct('Left', { leftAt: Millis, link: Link, letters: Letters });

export const SubscriberState = Schema.Union([NoneState, PendingState, ConfirmedState, LeftState]);
export type SubscriberState = typeof SubscriberState.Type;

const NONE: SubscriberState = { _tag: 'None' };

/** Never signed up, forgotten, or off the list. */
const isOffList = Predicate.or(Predicate.isTagged('None'), Predicate.isTagged('Left'));

const lettersOf = (s: SubscriberState): Letters => {
  if (s._tag === 'None') return {};
  return s.letters;
};

const linkOf = (s: SubscriberState): Option.Option<number> => {
  if (s._tag === 'None') return Option.none();
  return s.link;
};

const leftAtOf = (s: SubscriberState): Option.Option<number> => {
  if (s._tag === 'Pending') return s.leftAt;
  if (s._tag === 'Left') return Option.some(s.leftAt);
  return Option.none();
};

/** Whether a link may be issued `now`: none within `RESEND_AFTER` of the last, nor at or before leaving. */
const mayIssue = (s: SubscriberState, now: number) => {
  const rested = Option.match(linkOf(s), {
    onNone: () => true,
    onSome: (link) => link <= now - Duration.toMillis(RESEND_AFTER),
  });
  const afterLeaving = Option.match(leftAtOf(s), {
    onNone: () => true,
    onSome: (leftAt) => leftAt < now,
  });
  return rested && afterLeaving;
};

const withLetters = (s: SubscriberState, letters: (all: Letters) => Letters): SubscriberState => {
  if (s._tag === 'None') return s;
  return { ...s, letters: letters(s.letters) };
};

const withLink = (s: SubscriberState, link: Option.Option<number>): SubscriberState => {
  if (s._tag === 'None') return s;
  return { ...s, link };
};

const setLetter = (film: string, letter: Letter) => (all: Letters) => ({
  ...all,
  [film]: letter,
});

const dropLetter = (film: string) => (all: Letters) => {
  const { [film]: _dropped, ...rest } = all;
  return rest;
};

const isSending = (s: SubscriberState, film: string) => lettersOf(s)[film] === 'sending';

export class Subscriber extends Domain.Aggregate('Subscriber', {
  id: SubscriberId,
  state: SubscriberState,
  initial: NONE,
  commands: [
    SignUp,
    ReleaseConfirmLink,
    Confirm,
    Leave,
    ExpireSignUp,
    ClaimFilmLetter,
    ReleaseFilmLetter,
    SettleFilmLetter,
    Import,
  ],
  decide: {
    SignUp: (s, cmd, { now }) => {
      if (s._tag === 'Confirmed') return [];
      const at = DateTime.toEpochMillis(now);
      if (!mayIssue(s, at)) return [SignedUp.make({ at })];
      return [SignedUp.make({ at }), ConfirmLinkIssued.make({ issued: at, origin: cmd.origin })];
    },
    ReleaseConfirmLink: (s, cmd) => {
      if (!Option.contains(linkOf(s), cmd.issued)) return [];
      return [ConfirmLinkReleased.make({ issued: cmd.issued })];
    },
    Confirm: (s, cmd, { now }) => {
      if (s._tag === 'Confirmed') return [];
      const at = DateTime.toEpochMillis(now);
      const fresh = at <= cmd.issued + Duration.toMillis(CONFIRM_FOR);
      const newest = Option.contains(linkOf(s), cmd.issued);
      const afterLeaving = Option.match(leftAtOf(s), {
        onNone: () => true,
        onSome: (leftAt) => leftAt < cmd.issued,
      });
      if (s._tag !== 'Pending' || !fresh || !newest || !afterLeaving) {
        // decide takes the rejection's class instance; `.make` answers its schema's base type.
        // @effect-diagnostics-next-line newSchemaClass:off
        return new StaleLink();
      }
      return [Confirmed.make({ at })];
    },
    Leave: (s, _cmd, { now }) => {
      if (isOffList(s)) return [];
      return [Left.make({ at: DateTime.toEpochMillis(now) })];
    },
    ExpireSignUp: (s, cmd) => {
      if (s._tag !== 'Pending' || s.signedUpAt !== cmd.signedUpAt) return [];
      return Option.match(s.leftAt, {
        onNone: () => [SignUpExpired.make({ signedUpAt: s.signedUpAt })],
        onSome: (leftAt) => [SignUpLapsed.make({ leftAt })],
      });
    },
    ClaimFilmLetter: (s, cmd) => {
      if (s._tag !== 'Confirmed' || cmd.film in s.letters) return [];
      return [FilmLetterClaimed.make({ film: cmd.film })];
    },
    ReleaseFilmLetter: (s, cmd) => {
      if (!isSending(s, cmd.film)) return [];
      return [FilmLetterReleased.make({ film: cmd.film })];
    },
    SettleFilmLetter: (s, cmd) => {
      if (!isSending(s, cmd.film)) return [];
      if (cmd.outcome === 'sent') return [FilmLetterSent.make({ film: cmd.film })];
      return [FilmLetterRefused.make({ film: cmd.film })];
    },
    Import: (s, { signedUpAt, link, standing, letters }) => {
      if (s._tag !== 'None') return [];
      return [Imported.make({ signedUpAt, link, standing, letters })];
    },
  },
  evolve: {
    SignedUp: (s, e) => ({
      _tag: 'Pending' as const,
      signedUpAt: e.at,
      link: linkOf(s),
      leftAt: leftAtOf(s),
      letters: lettersOf(s),
    }),
    ConfirmLinkIssued: (s, e) => withLink(s, Option.some(e.issued)),
    ConfirmLinkReleased: (s) => withLink(s, Option.none()),
    Confirmed: (s, e) => ({
      _tag: 'Confirmed' as const,
      confirmedAt: e.at,
      link: linkOf(s),
      letters: lettersOf(s),
    }),
    Left: (s, e) => ({
      _tag: 'Left' as const,
      leftAt: e.at,
      link: linkOf(s),
      letters: lettersOf(s),
    }),
    SignUpExpired: () => NONE,
    SignUpLapsed: (s, e) => ({
      _tag: 'Left' as const,
      leftAt: e.leftAt,
      link: linkOf(s),
      letters: lettersOf(s),
    }),
    FilmLetterClaimed: (s, e) => withLetters(s, setLetter(e.film, 'sending')),
    FilmLetterReleased: (s, e) => withLetters(s, dropLetter(e.film)),
    FilmLetterSent: (s, e) => withLetters(s, setLetter(e.film, 'sent')),
    FilmLetterRefused: (s, e) => withLetters(s, setLetter(e.film, 'refused')),
    Imported: (_s, { signedUpAt, link, standing, letters }) =>
      Match.value(standing).pipe(
        Match.tagsExhaustive({
          Pending: ({ leftAt }): SubscriberState => ({
            _tag: 'Pending',
            signedUpAt,
            link,
            leftAt,
            letters,
          }),
          Confirmed: ({ at }): SubscriberState => ({
            _tag: 'Confirmed',
            confirmedAt: at,
            link,
            letters,
          }),
          Left: ({ at }): SubscriberState => ({ _tag: 'Left', leftAt: at, link, letters }),
        }),
      ),
  },
  reply: {
    SignUp: (_s, events) => ({
      issued: Option.map(
        Arr.findFirst(events, (e): e is ConfirmLinkIssued => e._tag === 'ConfirmLinkIssued'),
        (issued) => issued.issued,
      ),
    }),
    ClaimFilmLetter: (_s, events) => ({ claimed: events.length > 0 }),
  },
}) {}
