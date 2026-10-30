/**
 * Where the Sections list's number rail takes the list (`Rail.tsx`), from
 * the touch's height alone.
 *
 * Every row has a fixed height, so each hymn of the topics' part has a known
 * place in the list's content before the list draws (`marksOf`). The rail is
 * cut into one equal band per hymn, top to bottom in the list's order: the
 * band under the touch is its hymn (`markAt`), and the topics passed between
 * two hymns are the rail's ticks (`crossings`). The hymns of the reader's
 * lists above the topics (Recent) are not on the rail.
 */

import type { Row } from './rows';

/** A hymn on the rail: its number, its topic's place among the topics, and the scroll offset that shows it. */
export interface Mark {
  readonly number: number;
  readonly section: number;
  /**
   * The offset that puts the hymn's row just under the pinned topic row, so
   * it is the first hymn read; for a topic's first hymn, the topic's own row
   * at the list's top.
   */
  readonly offset: number;
}

/** Each hymn after the first topic row, in the list's order, as `topicStarts` places the rows: `top` is the list's header. */
export const marksOf = <Hymn extends { readonly number: number }>(
  rows: ReadonlyArray<Row<Hymn>>,
  top: number,
  heightOf: (kind: Row<Hymn>['kind']) => number,
): ReadonlyArray<Mark> => {
  const marks: Array<Mark> = [];
  const pin = heightOf('topic');
  let at = top;
  let section = -1;
  for (const row of rows) {
    if (row.kind === 'topic') section += 1;
    if (row.kind === 'hymn' && section >= 0)
      marks.push({ number: row.hymn.number, section, offset: at - pin });
    at += heightOf(row.kind);
  }
  return marks;
};

/** The band under a touch at `y` on a rail `length` tall, cut into `count` bands: held to the first and last band past the ends. */
export const markAt = (y: number, length: number, count: number): number => {
  if (count <= 0 || length <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((y / length) * count)));
};

/** The topics a drag passes going from topic place `before` to `now`: one tick each. */
export const crossings = (before: number, now: number): number => Math.abs(now - before);

/** `shown` places spread evenly from the first to the last of `count`, both ends included: the rail's labels. */
export const labelsOf = (count: number, shown: number): ReadonlyArray<number> => {
  if (count <= 0 || shown <= 0) return [];
  if (count <= shown || shown === 1)
    return Array.from({ length: Math.min(count, shown) }, (_, i) => i);
  return Array.from({ length: shown }, (_, i) => Math.round((i * (count - 1)) / (shown - 1)));
};
