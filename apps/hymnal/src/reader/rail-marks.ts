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
 * middle, as a percent of the rail's height (`labelAt`), in a box as tall as
 * its line at the reader's text size (`labelHeight`).
 */

import type { Row } from './rows';

/** The rail's gutter at the list's right edge, in pt: the room its labels take and the width its touch takes. */
export const GUTTER = 44;

/**
 * How far the rail's top lies below the gutter's top, which the list places
 * at the header's top at rest (`railTop`): `rest` at a scroll of 0, so the
 * rail starts at the header's bottom; more while the list is pulled past its
 * top; never less than 0, so the rail never rises above the gutter's top.
 */
export const railShift = (rest: number, scroll: number): number => {
  'worklet';
  return Math.max(0, rest - scroll);
};

/** The top of label `index` of `count`, as a percent of the rail's height: the middle of its band. */
export const labelAt = (index: number, count: number): number => {
  if (count <= 0) return 0;
  return ((index + 0.5) / count) * 100;
};

/** A label's type size at a text size of 1, in pt. */
export const LABEL_SIZE = 10;

/** A label's line height at a text size of 1, in pt. */
export const LABEL_LINE = 12;

/**
 * The most a label's type grows with the reader's text size: at this scale
 * the widest label, three tabular digits, still fits the gutter's width.
 */
export const LABEL_SCALE = 2;

/**
 * A label's box height at the reader's text size (`fontScale`), in pt: its
 * line as the text scales, up to `LABEL_SCALE`, rounded up so the scaled
 * glyphs never overflow the box and are never cut. The label's top margin is
 * minus half of it, so the label stays centred on its band (`labelAt`).
 */
export const labelHeight = (fontScale: number): number =>
  Math.ceil(LABEL_LINE * Math.min(fontScale, LABEL_SCALE));

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

/** `shown` places spread evenly from the first to the last of `count`, both ends included: the rail's labels. */
export const labelsOf = (count: number, shown: number): ReadonlyArray<number> => {
  if (count <= 0 || shown <= 0) return [];
  if (count <= shown || shown === 1)
    return Array.from({ length: Math.min(count, shown) }, (_, i) => i);
  return Array.from({ length: shown }, (_, i) => Math.round((i * (count - 1)) / (shown - 1)));
};
