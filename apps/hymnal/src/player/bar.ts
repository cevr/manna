/**
 * Which hymn the bottom bar acts on. On a hymn page the bar is the page's
 * player: it acts on the page's hymn, unless another hymn is sounding
 * (loading, playing or buffering). Then it shows the sounding hymn with its
 * own buttons, and a compact Play for the page's hymn beside them. A held
 * hymn that is not sounding (paused, ended, stopped, failed) gives way to the
 * page's hymn. Off a hymn page the bar shows only while the player holds a
 * hymn.
 *
 * Where it is drawn: while the player holds a hymn, docked under the stack
 * (`dockedBar`); while it holds none, in the hymn page itself (`pageBar`), so
 * a back moves it out with the page.
 *
 * The bar holds a `#` (`FIND_LABEL`) that opens the find drums over it on
 * the bar's hymn's number (`Find`); a second press, a swipe down or a tap
 * outside them closes them, and their `Open` opens the dialled hymn's page
 * (`pressFind`).
 * With no bar drawn, the home list alone shows the `#`, where the bar docks.
 * The `#` follows the page the route draws (`findPlace`).
 */

import { Data, Option, Predicate } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { isHymnPage } from '~/home/opening';

import { FIRST, held } from './drums';
import { Player, type Track, trackOf } from './player';
import { clock } from './time';

/** The bar's height at rest and while a hymn sounds, over the home indicator, in points. */
export const REST = 56;
export const SOUNDING = 88;
/**
 * How far the sounding bar stands over the page's foot: a screen reserves
 * the resting bar's height alone, so the taller bar lies over the page.
 */
export const RISE = SOUNDING - REST;
/** The spring the bar rises and falls on between its two heights: it overshoots a little and settles, as the owner's prototype does. */
export const BAR_SPRING = { damping: 13, stiffness: 190, mass: 0.9 } as const;

/** The player as `track` sees it: its own state, or idle when it holds another hymn. */
export const playerFor = (state: Player, track: Track): Player =>
  trackOf(state).pipe(
    Option.filter((held) => held.number === track.number),
    Option.match({ onNone: () => Player.Idle(), onSome: () => state }),
  );

export type Bar = Data.TaggedEnum<{
  /** Nothing to show: no hymn page, and the player holds no hymn. */
  Hidden: {};
  /**
   * The bar shows `track` in `state` (the player as that hymn sees it);
   * `page` is the page's own hymn when another hymn sounds over it.
   */
  Shown: { readonly track: Track; readonly state: Player; readonly page: Option.Option<Track> };
}>;
export const Bar = Data.taggedEnum<Bar>();

/** Whether the player is making, or about to make, sound. */
export const sounding: (state: Player) => boolean = Predicate.or(
  Predicate.isTagged('Loading'),
  Predicate.or(Predicate.isTagged('Playing'), Predicate.isTagged('Buffering')),
);

/** The bar's one height rule: its height over the home indicator while it shows `state`, tall while the player sounds. */
export const heightOf = (state: Player): number => (sounding(state) && SOUNDING) || REST;

/** The bar for the player's `state`, over the hymn page shown, if any. */
export const barFor = (state: Player, page: Option.Option<Track>): Bar =>
  Option.match(page, {
    onNone: () =>
      Option.match(trackOf(state), {
        onNone: () => Bar.Hidden(),
        onSome: (track) => Bar.Shown({ track, state, page: Option.none() }),
      }),
    onSome: (shown) =>
      trackOf(state).pipe(
        Option.filter((held) => held.number !== shown.number && sounding(state)),
        Option.match({
          onNone: () =>
            Bar.Shown({ track: shown, state: playerFor(state, shown), page: Option.none() }),
          onSome: (held) => Bar.Shown({ track: held, state, page: Option.some(shown) }),
        }),
      ),
  });

/**
 * The bar docked under the stack: `barFor`'s bar while the player holds a
 * hymn, which plays on across screens, and nothing while it holds none.
 */
export const dockedBar = (state: Player, page: Option.Option<Track>): Bar =>
  Option.match(trackOf(state), {
    onNone: () => Bar.Hidden(),
    onSome: () => barFor(state, page),
  });

/**
 * The bar a hymn page draws as its own, while the player holds no hymn: it
 * lies in the page, so it comes in and goes out with the page's push and pop.
 * While the player holds a hymn the docked bar shows instead.
 */
export const pageBar = (state: Player, track: Track): Bar =>
  Option.match(trackOf(state), {
    onNone: () => barFor(state, Option.some(track)),
    onSome: () => Bar.Hidden(),
  });

/** The reader's place in the recording and its length, in seconds, while the player has a place. */
export const placeOf: (
  state: Player,
) => Option.Option<{ at: number; length: Option.Option<number> }> = Player.$match({
  Idle: () => Option.none(),
  Loading: () => Option.none(),
  Playing: ({ at, length }) => Option.some({ at, length }),
  Buffering: ({ at, length }) => Option.some({ at, length }),
  Paused: ({ at, length }) => Option.some({ at, length }),
  Ended: ({ length }) => Option.some({ at: Option.getOrElse(length, () => 0), length }),
  Stopped: ({ at }) => Option.map(at, (place) => ({ at: place, length: Option.none() })),
  Failed: ({ at }) => Option.map(at, (place) => ({ at: place, length: Option.none() })),
});

/** The share of the recording played, from 0 to 1: the seek line's filled part. 0 while no length is known. */
export const playedShare = (state: Player): number =>
  placeOf(state).pipe(
    Option.flatMap(({ at, length }) =>
      Option.map(
        Option.filter(length, (whole) => whole > 0),
        (whole) => Math.min(Math.max(at / whole, 0), 1),
      ),
    ),
    Option.getOrElse(() => 0),
  );

/** The time gone and the length as the bar says them (`0:30 of 2:00`), while both are known. */
export const toldPlace = (state: Player): Option.Option<string> =>
  placeOf(state).pipe(
    Option.flatMap(({ at, length }) =>
      Option.map(length, (whole) => `${clock(at)} of ${clock(whole)}`),
    ),
  );

/** What VoiceOver names the bar's `#` by, and a test finds it by. */
export const FIND_LABEL = 'Find a hymn by number';

/** The find drums over the bar: closed, or open on the number they dial (`drums.ts`). */
export type Find = Data.TaggedEnum<{
  Closed: {};
  Open: { readonly number: number };
}>;
export const Find = Data.taggedEnum<Find>();

/** The number the drums open on: the bar's hymn while the bar shows one, else the book's first. */
export const openAt = (bar: Bar): number =>
  Bar.$match(bar, {
    Hidden: () => FIRST,
    Shown: ({ track }) => held(track.number),
  });

/** The `#` pressed: closed drums open on `openAt(bar)`, open ones close. */
export const toggleFind = (find: Find, bar: Bar): Find =>
  Find.$match(find, {
    Closed: () => Find.Open({ number: openAt(bar) }),
    Open: () => Find.Closed(),
  });

/** A drum turned to dial `number`: open drums hold it, held to the book; closed ones stay closed. */
export const dialFind = (find: Find, number: number): Find =>
  Find.$match(find, {
    Closed: () => find,
    Open: () => Find.Open({ number: held(number) }),
  });

/** The find drums, app-wide: the `#` sets them and the home list follows their number. */
export const find = Atom.make<Find>(Find.Closed()).pipe(Atom.keepAlive);

/**
 * What the reader does to the find drums: the `#`, a drum's detent, `Open`,
 * a swipe down, or a tap anywhere outside the drums' panel and the `#`.
 */
export type FindPress = Data.TaggedEnum<{
  Hash: {};
  Dial: { readonly number: number };
  Open: {};
  Swipe: {};
  Outside: {};
}>;
export const FindPress = Data.taggedEnum<FindPress>();

/** What a press asks of the app besides the drums: nothing, or the dialled hymn's page. */
export type FindAct = Data.TaggedEnum<{
  Stay: {};
  Open: { readonly number: number };
}>;
export const FindAct = Data.taggedEnum<FindAct>();

/**
 * The drums after `press`, and what it asks of the app. `#` opens or closes
 * them; a detent dials and asks nothing, so no detent ever starts a hymn;
 * `Open` asks for the dialled number's page and closes the drums; a swipe
 * down, or a tap outside them, closes them and asks nothing, so the tap
 * never reaches what lies behind. With the drums closed, `Open` asks
 * nothing.
 */
export const pressFind = (find: Find, bar: Bar, press: FindPress): readonly [Find, FindAct] =>
  FindPress.$match(press, {
    Hash: () => [toggleFind(find, bar), FindAct.Stay()] as const,
    Dial: ({ number }) => [dialFind(find, number), FindAct.Stay()] as const,
    Open: () =>
      Find.$match(find, {
        Closed: () => [find, FindAct.Stay()] as const,
        Open: ({ number }) => [Find.Closed(), FindAct.Open({ number })] as const,
      }),
    Swipe: () => [Find.Closed(), FindAct.Stay()] as const,
    Outside: () => [Find.Closed(), FindAct.Stay()] as const,
  });

/** A drag let go on the drums is a swipe down past 24 pt, or flung down faster than 400 pt/s: the bar's swipe, turned over. */
export const swipedDown = (translationY: number, velocityY: number): boolean =>
  translationY >= 24 || velocityY >= 400;

/** The `#`'s side, in points. */
export const HASH = 44;
/** The space between the bar's top and the `#` over it, in points. */
export const HASH_GAP = 8;

/**
 * Where the `#` stands: over the bar while the bar shows; alone where the
 * bar docks while it is hidden on the home list, so the number path never
 * waits on a hymn; nowhere on any other screen with no bar, so no bar comes
 * back there. While a control rises over the bar (the key, capo and
 * placement dials' popover) the `#` gives way (`Yielded`): it would lie over
 * the popover's lowest row and take its touches.
 */
export type FindAt = Data.TaggedEnum<{
  Nowhere: {};
  OverBar: { readonly state: Player };
  Docked: {};
  Yielded: {};
}>;
export const FindAt = Data.taggedEnum<FindAt>();

/**
 * Where the `#` stands for the player's state in a bar drawn (`drawn`), or
 * for no bar: over the bar unless a control over it is open (`raised`); with
 * no bar, docked on the home list (`home`) and nowhere elsewhere. Only a
 * drawn bar has controls to raise.
 */
const placed = (
  drawn: Option.Option<Player>,
  { home, raised }: { readonly home: boolean; readonly raised: boolean },
): FindAt =>
  Option.match(drawn, {
    onNone: () => {
      if (home) return FindAt.Docked();
      return FindAt.Nowhere();
    },
    onSome: (state) => {
      if (raised) return FindAt.Yielded();
      return FindAt.OverBar({ state });
    },
  });

/** Where the `#` stands for `bar`, on the home list (`home`) or another screen, raised or not. */
export const findAt = (
  bar: Bar,
  where: { readonly home: boolean; readonly raised: boolean },
): FindAt =>
  placed(
    Bar.$match(bar, {
      Hidden: () => Option.none(),
      Shown: ({ state }) => Option.some(state),
    }),
    where,
  );

/** The sheets' paths: a sheet lies over the screen under it, whose bar it leaves drawn. */
const SHEETS: ReadonlySet<string> = new Set(['/settings', '/player', '/chord', '/about', '/tuner']);

/** `path` read as a route: its path alone, past a query, a hash and a trailing slash. */
const routeOf = (path: string): string => path.replace(/[?#][\s\S]*$/, '').replace(/(.)\/+$/, '$1');

/** A hymn page's number segment (`/hymns/<n>`), when `route` (`routeOf`) is a hymn page. */
const hymnSegmentOf = (route: string): Option.Option<string> =>
  Option.liftPredicate(route, isHymnPage).pipe(
    Option.flatMap((page) => Option.fromNullishOr(page.split('/').at(-1))),
  );

/** What the find bar's place reads: the route, the hymns the book holds, the hymn page that says it shows, the player and whether a control over the bar is open. */
export interface FindInput {
  readonly path: string;
  /** Whether the book holds the hymn a route's number segment names (`hymnAt`). */
  readonly holds: (segment: string) => boolean;
  readonly shown: Option.Option<Track>;
  readonly state: Player;
  readonly raised: boolean;
}

/**
 * Where the `#` stands on the page the route draws, not on the last hymn
 * page that said it shows. A sheet leaves the screen under it as it was, so
 * there the bar is drawn as `barFor` draws it: while a page shows under the
 * sheet or the player holds a hymn. A held hymn's page always draws its bar,
 * from the render the path moves to it, before the page says it shows
 * (`useShowsPage`), so the `#` never leaves on its way up. Every other path,
 * the home list, Recent, an unknown path and a number the book does not hold
 * (the route's `NoHymn`), draws the bar only while the player holds a hymn.
 */
export const findPlace = ({ path, holds, shown, state, raised }: FindInput): FindAt => {
  const route = routeOf(path);
  const drawn = pageDraws(route, { holds, shown }) || Option.isSome(trackOf(state));
  return placed(
    Option.liftPredicate(state, () => drawn),
    { home: route === '/', raised },
  );
};

/** Whether the screen at `route` draws a bar with the player holding no hymn: a sheet while a page shows under it, a held hymn's page always. */
const pageDraws = (
  route: string,
  { holds, shown }: Pick<FindInput, 'holds' | 'shown'>,
): boolean => {
  if (SHEETS.has(route)) return Option.isSome(shown);
  return Option.exists(hymnSegmentOf(route), holds);
};

/** How the find bar moves between two places: on the glide's spring, on the bar's own spring (`BAR_SPRING`), or not at all. */
export type Glide = 'glide' | 'bar' | 'none';

/**
 * How the find bar moves as its place goes from `before` to `after`: it
 * glides between over the bar (a hymn page) and docked (the home list); over
 * the bar it rides the bar's own spring as the bar rises or falls; and every
 * other move, a hymn page put in another's place among them, moves nothing,
 * so the bar is set where it stands.
 */
export const glideOf = (before: FindAt, after: FindAt): Glide => {
  if (FindAt.$is('OverBar')(before) && FindAt.$is('OverBar')(after)) {
    if (heightOf(before.state) !== heightOf(after.state)) return 'bar';
    return 'none';
  }
  const between = (one: FindAt, other: FindAt) =>
    FindAt.$is('OverBar')(one) && FindAt.$is('Docked')(other);
  if (between(before, after) || between(after, before)) return 'glide';
  return 'none';
};

/**
 * How many controls over the bar are open (`useRaised`): the key dials'
 * popover of each bar drawn. While any is, the `#` gives way (`findAt`).
 */
export const raised = Atom.make(0).pipe(Atom.keepAlive);

/**
 * Whether the key button's wheel is open over the bar (`useWheelOpen`):
 * while it is, the find bar fades with the wheel's backdrop and takes no
 * touch, and stays where it stands.
 */
export const wheelOpen = Atom.make(false).pipe(Atom.keepAlive);

/** Where the reader is, for the find drums: the route shown, and where the `#` stands on it. */
export interface FindPlace {
  readonly path: string;
  readonly at: FindAt;
}

/** Whether a `#` stands at `at`, to press and to open the drums over. */
export const hashStands: (at: FindAt) => boolean = Predicate.or(
  FindAt.$is('OverBar'),
  FindAt.$is('Docked'),
);

/**
 * The drums after the reader moved from `before` to `after`: they stay open
 * only on the same route while a `#` still stands there. They close on a
 * move to another screen, and where the `#` gives way or stands nowhere, so
 * they never come back open on a later screen.
 */
export const findMoved = (find: Find, before: FindPlace, after: FindPlace): Find => {
  if (before.path === after.path && hashStands(after.at)) return find;
  return Find.Closed();
};

/** The docked `#`'s bottom over the device's bottom inset: centred in the resting bar's height. */
export const DOCKED_LIFT = (REST - HASH) / 2;

/**
 * How far the `#`'s top stands over the bottom edge of a list's screen, for
 * a device's bottom inset of `inset` points: the list's end clears it
 * (`ListEnd`). Over the docked bar the screen ends on the bar's top; with
 * the bar hidden it ends on the window's bottom edge.
 */
export const findRoom = (at: FindAt, inset: number): number =>
  FindAt.$match(at, {
    Nowhere: () => 0,
    OverBar: () => HASH_GAP + HASH,
    Yielded: () => HASH_GAP + HASH,
    Docked: () => Math.max(0, inset) + DOCKED_LIFT + HASH,
  });

/**
 * The bottom inset the stack's screens meet, for a device's bottom inset of
 * `inset` points. The layout docks the bar under the stack, so while it shows
 * it holds the home indicator and the screens end on its top edge: none is
 * left. While it is hidden the screens reach the window's bottom edge.
 */
export const stackBottom = (bar: Bar, inset: number): number =>
  Bar.$match(bar, {
    Hidden: () => Math.max(0, inset),
    Shown: () => 0,
  });
