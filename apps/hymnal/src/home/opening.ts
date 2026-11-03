import { Option } from 'effect';

export type Opening = 'push' | 'replace' | 'stay';

const HYMN_PAGE = /^(?:[^?#]*\/)?hymns\/+([^/?#]+)\/*(?:[?#][\s\S]*)?$/;

const hymnSegment = (path: string): Option.Option<string> =>
  Option.fromNullishOr(HYMN_PAGE.exec(path)?.[1]);

export const isHymnPage = (path: string): boolean => Option.isSome(hymnSegment(path));

export const openingAt = (path: string, number: number): Opening =>
  Option.match(hymnSegment(path), {
    onNone: () => 'push',
    onSome: (segment) => {
      if (segment === String(number)) return 'stay';
      return 'replace';
    },
  });
