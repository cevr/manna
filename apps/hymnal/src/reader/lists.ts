import { Array as Arr, Match, type Option, Schema } from 'effect';

export const Numbers = Schema.Array(Schema.Int);

export const RECENT = 50;

export const RECENT_SHOWN = 5;

export const toggleFavourite = (list: ReadonlyArray<number>, n: number): ReadonlyArray<number> =>
  Match.value(list.includes(n)).pipe(
    Match.when(true, () => list.filter((m) => m !== n)),
    Match.orElse(() => [...list, n].toSorted((a, b) => a - b)),
  );

export const visited = (recent: ReadonlyArray<number>, n: number): ReadonlyArray<number> =>
  [n, ...recent.filter((m) => m !== n)].slice(0, RECENT);

export interface Shelf<Hymn> {
  readonly name: string;
  readonly hymns: ReadonlyArray<Hymn>;
  readonly href: string;
}

export const recentOf = <Hymn>(
  recent: ReadonlyArray<number>,
  hymnOf: (n: number) => Option.Option<Hymn>,
): ReadonlyArray<Hymn> => Arr.getSomes(recent.map(hymnOf));

export const shelvesOf = <Hymn>(
  recent: ReadonlyArray<number>,
  hymnOf: (n: number) => Option.Option<Hymn>,
): ReadonlyArray<Shelf<Hymn>> => [
  { name: 'Recent', hymns: recentOf(recent, hymnOf).slice(0, RECENT_SHOWN), href: '/recent' },
];
