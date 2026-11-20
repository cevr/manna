/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a place past a list's end is a plain `undefined`, and a call branches plainly. */

/**
 * The home list's number rail, as the current app's (`reader/Rail.tsx`
 * over `reader/rail-marks.ts`): one equal band per hymn of the Sections
 * list, top to bottom in the list's order, the band under the touch its
 * hymn (`markAt`), the topics passed between two hymns its ticks
 * (`crossings`), and six numbers spread from the first hymn to the last at
 * their bands' middles (`labelsOf`, `labelAt`). The Recent shelf's hymns
 * are not on it, as they are not on the current app's.
 *
 * The rules are the current app's, imported; what the port adds is its
 * marks read from its own sections (`marksOf`, held to the current app's
 * `marksOf` over its `rowsOf` by `rail.test.ts`) and the measures the
 * Contract draws by (`placesOf`), each the current app's.
 */

import {
  crossings,
  GUTTER,
  LABEL_LINE,
  LABEL_SCALE,
  LABEL_SIZE,
  labelAt,
  labelsOf,
  markAt,
} from '@manna/hymnal-app/reader/rail-marks';

import type { RowSection } from '../list/rows.ts';

/** How many numbers the rail shows (`LABELS`, Rail.tsx). */
export const LABELS = 6;

/** The thumb's side, in points (`THUMB`, Rail.tsx). */
export const THUMB = 10;

/** The bubble's least height, in points (`BUBBLE`, Rail.tsx). */
export const BUBBLE = 56;

/** The bubble's corner, widest line and room from the gutter, in points (Rail.tsx's `bubble` style). */
export const BUBBLE_RADIUS = 14;
export const BUBBLE_WIDTH = 220;
export const BUBBLE_GAP = 12;

/** The size a `rem` stands for at a text size of 1, in points: the body's (`type.body`). */
const REM = 17;

/** A hymn on the rail: its number, and its topic's place among the topics and name. */
export interface Mark {
  readonly number: number;
  readonly section: number;
  readonly name: string;
}

/** Each hymn of the Sections list's topics, in the list's order. */
export const marksOf = (sections: ReadonlyArray<RowSection>): ReadonlyArray<Mark> =>
  sections.flatMap((section, place) =>
    section.rows.map((row) => ({ number: row.number, section: place, name: section.name })),
  );

/** A label: its hymn's number and its top as a percent of the rail. */
export interface Label {
  readonly number: number;
  readonly top: number;
}

/** The rail's measures and labels, as the Contract draws them. */
export interface Places {
  readonly gutter: number;
  readonly thumb: number;
  readonly bubble: number;
  readonly radius: number;
  readonly width: number;
  readonly gap: number;
  /** A label's type and line in `rem`, so they grow with the text, and the most each grows to, in points. */
  readonly label: number;
  readonly line: number;
  readonly labelMost: number;
  readonly lineMost: number;
  readonly labels: Array<Label>;
}

export const placesOf = (marks: ReadonlyArray<Mark>): Places => ({
  gutter: GUTTER,
  thumb: THUMB,
  bubble: BUBBLE,
  radius: BUBBLE_RADIUS,
  width: BUBBLE_WIDTH,
  gap: BUBBLE_GAP,
  label: LABEL_SIZE / REM,
  line: LABEL_LINE / REM,
  labelMost: LABEL_SIZE * LABEL_SCALE,
  lineMost: LABEL_LINE * LABEL_SCALE,
  labels: labelsOf(marks.length, LABELS).flatMap((index) => {
    const mark = marks[index];
    if (mark === undefined) return [];
    return [{ number: mark.number, top: labelAt(index, marks.length) }];
  }),
});

/** Where a touch on the rail is: its hymn's place (-1 with none), number, topic, the thumb's height and the ticks since `before`. */
export interface At {
  readonly at: number;
  readonly number: number;
  readonly section: string;
  readonly y: number;
  readonly ticks: number;
}

/**
 * The hymn under a touch at `y` on a rail `length` tall, as the current
 * app's `useRail` takes it: the thumb held to the rail, and one tick for
 * each topic passed since the hymn at place `before` (none for a touch's
 * first hymn, `before` -1).
 */
export const touchAt = (
  marks: ReadonlyArray<Mark>,
  before: number,
  y: number,
  length: number,
): At => {
  const reach = Math.max(0, length);
  const at = markAt(y, reach, marks.length);
  const mark = marks[at];
  const thumb = Math.min(reach, Math.max(0, y));
  if (mark === undefined) return { at: -1, number: 0, section: '', y: thumb, ticks: 0 };
  const was = marks[before];
  return {
    at,
    number: mark.number,
    section: mark.name,
    y: thumb,
    ticks: was === undefined ? 0 : crossings(was.section, mark.section),
  };
};
