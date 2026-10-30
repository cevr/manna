/**
 * Where the phones' list pins its topic row, from the scroll offset alone.
 *
 * Every row has a fixed height, so each topic row's place in the list's
 * content is known before the list draws (`topicStarts`). The pinned row
 * then follows the scroll offset on the UI thread (`pinnedAt`, a worklet):
 * no state of the JS thread is read in the frame, so a fast drag cannot
 * show the row at a place the list has not caught up with. A layer over
 * the list's top (`cover`, the home list's search field) moves the pin's
 * line down under it, in the same frame.
 */

import { Option } from 'effect';

import type { Row } from './rows';

/** Each topic row's top in the list's content: `top` (the list's header) plus every row above it. */
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

/**
 * The top of the first topic row named `name` in the list's content, as
 * `topicStarts` places it: the scroll offset that puts that row at the
 * list's top. None when no topic row has the name.
 */
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

/** The pinned topic at a scroll offset: which one, and how far the next topic pushes it up. */
export interface Pinned {
  /** The topic's place among the topics; -1 while the first topic is still below the list's top. */
  readonly index: number;
  /** How far above the pin's line the pinned row sits: 0 at rest, down to -`height` as the next pushes it. */
  readonly y: number;
}

/**
 * The topic pinned at scroll offset `scroll`, its rows `height` tall, over
 * the topics' `starts` (ascending), under a layer `cover` points tall over
 * the list's top: the pin's line is the layer's bottom, and the pinned row
 * is drawn that far down.
 */
export const pinnedAt = (
  starts: ReadonlyArray<number>,
  scroll: number,
  height: number,
  cover = 0,
): Pinned => {
  'worklet';
  const line = scroll + cover;
  // The last topic whose top has reached the pin's line.
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? Infinity) <= line) low = middle + 1;
    else high = middle;
  }
  const index = low - 1;
  // The last topic has no next to push it.
  const next = starts[index + 1] ?? Infinity;
  if (index < 0) return { index, y: 0 };
  return { index, y: Math.min(0, next - line - height) };
};
