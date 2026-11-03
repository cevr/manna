import { Data, Option, Predicate } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { isHymnPage } from '~/home/opening';

import { FIRST, held } from './drums';
import { Player, type Track, trackOf } from './player';
import { clock } from './time';

export const REST = 56;
export const SOUNDING = 88;
export const RISE = SOUNDING - REST;
export const BAR_SPRING = { damping: 13, stiffness: 190, mass: 0.9 } as const;

export const playerFor = (state: Player, track: Track): Player =>
  trackOf(state).pipe(
    Option.filter((held) => held.number === track.number),
    Option.match({ onNone: () => Player.Idle(), onSome: () => state }),
  );

export type Bar = Data.TaggedEnum<{
  Hidden: {};
  Shown: { readonly track: Track; readonly state: Player; readonly page: Option.Option<Track> };
}>;
export const Bar = Data.taggedEnum<Bar>();

export const sounding: (state: Player) => boolean = Predicate.or(
  Predicate.isTagged('Loading'),
  Predicate.or(Predicate.isTagged('Playing'), Predicate.isTagged('Buffering')),
);

export const heightOf = (state: Player): number => (sounding(state) && SOUNDING) || REST;

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

export const dockedBar = (state: Player, page: Option.Option<Track>): Bar =>
  Option.match(trackOf(state), {
    onNone: () => Bar.Hidden(),
    onSome: () => barFor(state, page),
  });

export const pageBar = (state: Player, track: Track): Bar =>
  Option.match(trackOf(state), {
    onNone: () => barFor(state, Option.some(track)),
    onSome: () => Bar.Hidden(),
  });

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

export const toldPlace = (state: Player): Option.Option<string> =>
  placeOf(state).pipe(
    Option.flatMap(({ at, length }) =>
      Option.map(length, (whole) => `${clock(at)} of ${clock(whole)}`),
    ),
  );

export const FIND_LABEL = 'Find a hymn by number';

export type Find = Data.TaggedEnum<{
  Closed: {};
  Open: { readonly number: number };
}>;
export const Find = Data.taggedEnum<Find>();

export const openAt = (bar: Bar): number =>
  Bar.$match(bar, {
    Hidden: () => FIRST,
    Shown: ({ track }) => held(track.number),
  });

export const toggleFind = (find: Find, bar: Bar): Find =>
  Find.$match(find, {
    Closed: () => Find.Open({ number: openAt(bar) }),
    Open: () => Find.Closed(),
  });

export const dialFind = (find: Find, number: number): Find =>
  Find.$match(find, {
    Closed: () => find,
    Open: () => Find.Open({ number: held(number) }),
  });

export const find = Atom.make<Find>(Find.Closed()).pipe(Atom.keepAlive);

export type FindPress = Data.TaggedEnum<{
  Hash: {};
  Dial: { readonly number: number };
  Open: {};
  Swipe: {};
  Outside: {};
}>;
export const FindPress = Data.taggedEnum<FindPress>();

export type FindAct = Data.TaggedEnum<{
  Stay: {};
  Open: { readonly number: number };
}>;
export const FindAct = Data.taggedEnum<FindAct>();

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

export const swipedDown = (translationY: number, velocityY: number): boolean =>
  translationY >= 24 || velocityY >= 400;

export const HASH = 44;
export const HASH_GAP = 8;

export type FindAt = Data.TaggedEnum<{
  Nowhere: {};
  OverBar: { readonly state: Player };
  Docked: {};
  Yielded: {};
}>;
export const FindAt = Data.taggedEnum<FindAt>();

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

const SHEETS: ReadonlySet<string> = new Set(['/settings', '/player', '/chord', '/about', '/tuner']);

const routeOf = (path: string): string => path.replace(/[?#][\s\S]*$/, '').replace(/(.)\/+$/, '$1');

const hymnSegmentOf = (route: string): Option.Option<string> =>
  Option.liftPredicate(route, isHymnPage).pipe(
    Option.flatMap((page) => Option.fromNullishOr(page.split('/').at(-1))),
  );

export interface FindInput {
  readonly path: string;
  readonly holds: (segment: string) => boolean;
  readonly shown: Option.Option<Track>;
  readonly state: Player;
  readonly raised: boolean;
}

export const findPlace = ({ path, holds, shown, state, raised }: FindInput): FindAt => {
  const route = routeOf(path);
  const drawn = pageDraws(route, { holds, shown }) || Option.isSome(trackOf(state));
  return placed(
    Option.liftPredicate(state, () => drawn),
    { home: route === '/', raised },
  );
};

const pageDraws = (
  route: string,
  { holds, shown }: Pick<FindInput, 'holds' | 'shown'>,
): boolean => {
  if (SHEETS.has(route)) return Option.isSome(shown);
  return Option.exists(hymnSegmentOf(route), holds);
};

export type Glide = 'glide' | 'bar' | 'none';

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

export const raised = Atom.make(0).pipe(Atom.keepAlive);

export interface FindPlace {
  readonly path: string;
  readonly at: FindAt;
}

export const hashStands: (at: FindAt) => boolean = Predicate.or(
  FindAt.$is('OverBar'),
  FindAt.$is('Docked'),
);

export const findMoved = (find: Find, before: FindPlace, after: FindPlace): Find => {
  if (before.path === after.path && hashStands(after.at)) return find;
  return Find.Closed();
};

export const DOCKED_LIFT = (REST - HASH) / 2;

export const findRoom = (at: FindAt, inset: number): number =>
  FindAt.$match(at, {
    Nowhere: () => 0,
    OverBar: () => HASH_GAP + HASH,
    Yielded: () => HASH_GAP + HASH,
    Docked: () => Math.max(0, inset) + DOCKED_LIFT + HASH,
  });

export const stackBottom = (bar: Bar, inset: number): number =>
  Bar.$match(bar, {
    Hidden: () => Math.max(0, inset),
    Shown: () => 0,
  });
