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
 *
 * The rail lies in a gutter `GUTTER` wide at the list's right edge. Its top
 * follows the header, `rest` below the list's top, as the list scrolls or is
 * pulled past its top (`railShift`), and each label sits at its band's
 * middle, as a percent of the rail's height (`labelAt`).
 */

import type { Row } from './rows';

/** The rail's gutter at the list's right edge, in pt: the room its labels take and the width its touch takes. */
export const GUTTER = 44;

/** The rail's top on the list's view: the header's bottom, `rest` at a scroll of 0, lower while the list is pulled past its top and never above the view's top. */
export const railShift = (rest: number, scroll: number): number => {
  'worklet';
  return Math.max(0, rest - scroll);
};

/** The top of label `index` of `count`, as a percent of the rail's height: the middle of its band. */
export const labelAt = (index: number, count: number): number => {
  if (count <= 0) return 0;
  return ((index + 0.5) / count) * 100;
};

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
  'worklet';
  if (count <= 0 || length <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((y / length) * count)));
};

/** The topics a drag passes going from topic place `before` to `now`: one tick each. */
export const crossings = (before: number, now: number): number => {
  'worklet';
  return Math.abs(now - before);
};

/**
 * The rail's strip on the list's view, as a gesture's hit slop: `width` in
 * from the right edge, and `top` and `bottom` in from the view's ends. A
 * negative slop shrinks the view's own area to the strip.
 */
export const railStrip = (width: number, top: number, bottom: number) => ({
  right: 0,
  width,
  top: -top,
  bottom: -bottom,
});

/** `shown` places spread evenly from the first to the last of `count`, both ends included: the rail's labels. */
export const labelsOf = (count: number, shown: number): ReadonlyArray<number> => {
  if (count <= 0 || shown <= 0) return [];
  if (count <= shown || shown === 1)
    return Array.from({ length: Math.min(count, shown) }, (_, i) => i);
  return Array.from({ length: shown }, (_, i) => Math.round((i * (count - 1)) / (shown - 1)));
};
