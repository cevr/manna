import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { modeAt, searchAt, type SearchMode, type Searching } from './place';

const paths = ['/', '/hymns/8', '/hymns/100', '/recent'];
const opens: ReadonlyArray<Option.Option<Searching>> = [
  Option.none(),
  ...paths.flatMap((path) => [searchAt(path, 'field'), searchAt(path, 'about')]),
];

describe('the search keyed by the path it opened on', () => {
  test('off everywhere while no search is open', () => {
    expect(paths.map((path) => modeAt(Option.none(), path))).toEqual(paths.map(() => 'off'));
  });

  test('a search opened on a hymn page is open there alone, with its mode', () => {
    expect(paths.map((path) => modeAt(searchAt('/hymns/8', 'field'), path))).toEqual([
      'off',
      'field',
      'off',
      'off',
    ]);
    expect(modeAt(searchAt('/', 'about'), '/')).toBe('about');
  });

  test('over every open search and screen, at most one screen is in search mode, the one it opened on', () => {
    for (const open of opens) {
      const modes: ReadonlyArray<SearchMode> = paths.map((path) => modeAt(open, path));
      const on = paths.filter((_, at) => modes[at] !== 'off');
      expect(on).toEqual(Option.toArray(Option.map(open, ({ path }) => path)));
    }
  });
});
