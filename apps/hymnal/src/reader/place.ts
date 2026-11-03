import { Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

export const searchQuery = Atom.make('').pipe(Atom.keepAlive);

export type SearchMode = 'off' | 'field' | 'about';

export interface Searching {
  readonly path: string;
  readonly mode: Exclude<SearchMode, 'off'>;
}

export const searchOpen = Atom.make(Option.none<Searching>()).pipe(Atom.keepAlive);

export const searchAt = (path: string, mode: Searching['mode']): Option.Option<Searching> =>
  Option.some({ path, mode });

export const modeAt = (open: Option.Option<Searching>, path: string): SearchMode =>
  Option.match(
    Option.filter(open, (searching) => searching.path === path),
    { onNone: () => 'off', onSome: ({ mode }) => mode },
  );

export const hymnsOffset = Atom.make(0).pipe(Atom.keepAlive);

export const searchOffset = Atom.make(0).pipe(Atom.keepAlive);

export const recentOffset = Atom.make(0).pipe(Atom.keepAlive);

export const pagesFrom = Atom.make(Option.none<ReadonlyArray<number>>()).pipe(Atom.keepAlive);

export const openAtTopic = Atom.make(Option.none<string>()).pipe(Atom.keepAlive);
