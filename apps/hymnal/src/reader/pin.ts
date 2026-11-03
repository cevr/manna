import { Option } from 'effect';

import type { Row } from './rows';

export const topicStarts = <Hymn>(
  rows: ReadonlyArray<Row<Hymn>>,
  top: number,
  heightOf: (kind: Row<Hymn>['kind']) => number,
): ReadonlyArray<number> => {
  const starts: Array<number> = [];
  let at = top;
  for (const row of rows) {
    if (row.kind === 'topic') starts.push(at);
    at += heightOf(row.kind);
  }
  return starts;
};

export const topicStart = <Hymn>(
  rows: ReadonlyArray<Row<Hymn>>,
  top: number,
  heightOf: (kind: Row<Hymn>['kind']) => number,
  name: string,
): Option.Option<number> => {
  let at = top;
  for (const row of rows) {
    if (row.kind === 'topic' && row.name === name) return Option.some(at);
    at += heightOf(row.kind);
  }
  return Option.none();
};

export const clampedStart = <Hymn>(
  start: number,
  rows: ReadonlyArray<Row<Hymn>>,
  top: number,
  heightOf: (kind: Row<Hymn>['kind']) => number,
  tail: number,
  viewport: number,
  rest: number,
): number => {
  let end = top + tail;
  for (const row of rows) end += heightOf(row.kind);
  return Math.max(Math.min(start, end - viewport), Math.min(start, rest));
};

export interface Pinned {
  readonly index: number;
  readonly y: number;
}

export const pinnedAt = (
  starts: ReadonlyArray<number>,
  scroll: number,
  height: number,
  cover = 0,
): Pinned => {
  'worklet';
  const line = scroll + cover;
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? Infinity) <= line) low = middle + 1;
    else high = middle;
  }
  const index = low - 1;
  const next = starts[index + 1] ?? Infinity;
  if (index < 0) return { index, y: 0 };
  return { index, y: Math.min(0, next - line - height) };
};
