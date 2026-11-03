/**
 * The sticky check's frame classifier: where the home list's pinned topic
 * row sits in one recorded frame, and whether that place is one the list
 * may show.
 *
 * The check reads a narrow column of the screen left of the hymn rows'
 * separators (they start 64 pt in), where the only full-width lines are the
 * topic rows' bottom hairlines. Each frame's column is averaged across its
 * width into one grey value per pixel row (`linesIn` takes those values); a
 * run of rows that differ from the ground and is at most 2 pt thick is a
 * line.
 *
 * A frame is valid when its first line under the list's top is the pinned
 * row's hairline at rest (± 1 pt), or when the next topic row pushes it: a
 * line within one topic row under rest, and the first line one topic row
 * above that line (± 1 pt).
 *
 * Deep in the list the search field can show over the list's top, and the
 * pinned row then rests flush under it: its rest place is that much lower.
 * `coverIn` reads how far the field reaches from a third column, through
 * the field's soft box right of its placeholder, where the box is one even
 * band of grey: its bottom is the field's margin above the layer's. While
 * the field slides its first or last few points, its box is gone above the
 * list's top though the layer still covers that much: a frame with no box
 * within `SLIDE` frames of one with a box (`coversOf`) rests anywhere from
 * the bare rest down by that margin; any other frame with no box rests bare.
 *
 * A frame where a hymn page covers the list (the `push` pass) is not the
 * list's to judge. `listShows` finds the list by a second column, right of
 * the hymn titles, where the list draws only its rows' separators and topic
 * hairlines: lines that keep the rows' pitch.
 */
import { Array as Arr, Option } from 'effect';

/** The layout the check judges against, in points. */
export interface Layout {
  /** The pixels per point of the recording. */
  readonly scale: number;
  /** The list's top: the safe-area inset. */
  readonly top: number;
  /** A topic row's height: `ceil(20 × fontScale) + 16`. */
  readonly topic: number;
  /** A hymn row's height: `ceil(22 × fontScale) + 22`. */
  readonly hymn: number;
  /** The search field shown over the list's top: its layer's height, `ceil(22 × fontScale) + 30`. */
  readonly field: number;
}

/** No line under the list's top: the pinned row is not in the column. */
export interface Missing {
  readonly _tag: 'Missing';
}

/** The pinned hairline and its distance from where it belongs. */
export interface Seen {
  readonly _tag: 'Seen';
  readonly pinned: number;
  readonly pushed: boolean;
  readonly expected: number;
  readonly deviation: number;
}

/** The list does not stand in the frame: a hymn page covers it, or slides over it. */
export interface Covered {
  readonly _tag: 'Covered';
}

/** What one frame shows. */
export type Verdict = Missing | Seen | Covered;

/** How many row pitches in a row make a column the list's. */
export const PITCHES = 3;

/** How far a line may sit from its place and still be in it, in points. */
export const TOLERANCE = 1;

/** The middle of `values` (the upper middle of an even count). */
const median = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The centres of the thin lines in one frame's column, in points from the
 * screen's top. `rows` holds one grey value per pixel row; a row is off the
 * ground when it differs from the column's median by more than `threshold`.
 */
export const linesIn = (
  rows: ReadonlyArray<number>,
  scale: number,
  threshold = 5,
): ReadonlyArray<number> => {
  const ground = median(rows);
  const lines: Array<number> = [];
  let start = -1;
  for (let y = 0; y <= rows.length; y++) {
    const off = y < rows.length && Math.abs((rows[y] ?? ground) - ground) > threshold;
    if (off && start === -1) start = y;
    if (!off && start !== -1) {
      if (y - start <= 2 * scale) lines.push(round2((start + y - 1) / 2 / scale));
      start = -1;
    }
  }
  return lines;
};

/**
 * The pinned hairline's rest place under `cover` points of the shown field:
 * the last pixel row of the topic row that ends at the list's top plus the
 * cover and one topic row, as a line centre.
 */
export const restOf = (layout: Layout, cover = 0) =>
  round2((Math.round((layout.top + cover + layout.topic) * layout.scale) - 1) / layout.scale);

/** The space between the shown field's box and its layer's bottom, in points. */
export const FIELD_MARGIN = 8;

/**
 * How many points of the list's top the shown field covers in one frame,
 * from the field column's grey values (one per pixel row, as `linesIn`
 * takes them): the first even band off the ground, thicker than a line,
 * that begins at the list's top or within the field's margin under it, is
 * the field's box, and the layer ends a margin under the box. None when the
 * column shows no box.
 */
export const coverIn = (
  rows: ReadonlyArray<number>,
  layout: Layout,
  threshold = 5,
): Option.Option<number> => {
  const ground = median(rows);
  const from = Math.max(0, Math.floor(layout.top * layout.scale) - 1);
  const latest = Math.ceil((layout.top + FIELD_MARGIN + TOLERANCE) * layout.scale);
  const off = (y: number) => Math.abs((rows[y] ?? ground) - ground) > threshold;
  let start = from;
  while (start < rows.length && start <= latest && !off(start)) start++;
  if (start > latest || start >= rows.length) return Option.none();
  const band = rows[start] ?? ground;
  let end = start;
  while (
    end + 1 < rows.length &&
    off(end + 1) &&
    Math.abs((rows[end + 1] ?? ground) - band) <= threshold
  )
    end++;
  if (end - start + 1 <= 2 * layout.scale) return Option.none();
  const bottom = (end + 1) / layout.scale;
  return Option.some(
    round2(Math.min(layout.field, Math.max(0, bottom - layout.top + FIELD_MARGIN))),
  );
};

/** How many frames on either side of a frame with the field's box the field may still be sliding: its 200 ms slide at 60 frames a second. */
export const SLIDE = 12;

/**
 * Each frame's cover for `judge`, from each frame's box (`coverIn`): the
 * box's cover where one shows; none (somewhere in the field's margin) in a
 * frame within `SLIDE` frames of a box; else 0.
 */
export const coversOf = (
  boxes: ReadonlyArray<Option.Option<number>>,
): ReadonlyArray<Option.Option<number>> =>
  boxes.map((box, frame) => {
    if (Option.isSome(box)) return box;
    const near = boxes
      .slice(Math.max(0, frame - SLIDE), frame + SLIDE + 1)
      .some((other) => Option.isSome(other));
    if (near) return Option.none();
    return Option.some(0);
  });

/**
 * Judge one frame's lines, under the field's `cover` (`coversOf`).
 * The first line at or under the list's top is the pinned row's hairline.
 * When a later line lies within one topic row under rest, the next topic
 * row is pushing: the pinned hairline belongs one topic row above the line
 * that fits it best. Lines between the two (a hymn separator crossing the
 * column) are passed over. A cover of none (a slide's last points, the
 * header above) is the one within the field's margin that fits the hairline
 * best.
 */
export const judge = (
  lines: ReadonlyArray<number>,
  layout: Layout,
  cover: Option.Option<number> = Option.some(0),
): Verdict => {
  const [first, ...later] = lines.filter((line) => line >= layout.top);
  return Option.match(Option.fromUndefinedOr(first), {
    onNone: (): Verdict => ({ _tag: 'Missing' }),
    onSome: (pinned): Verdict => {
      const bare = restOf(layout);
      const rest = restOf(
        layout,
        Option.getOrElse(cover, () => Math.min(FIELD_MARGIN, Math.max(0, pinned - bare))),
      );
      const pushedPlace = Arr.head(
        later
          .filter((line) => line < rest + layout.topic + TOLERANCE)
          .map((line) => line - layout.topic)
          .toSorted((a, b) => Math.abs(a - pinned) - Math.abs(b - pinned)),
      );
      const atRest = Math.abs(pinned - rest) <= TOLERANCE;
      const pushed = Option.filter(
        pushedPlace,
        (place) => !atRest && Math.abs(pinned - place) <= TOLERANCE,
      );
      const expected = Option.getOrElse(pushed, () => rest);
      return {
        _tag: 'Seen',
        pinned,
        pushed: Option.isSome(pushed),
        expected,
        deviation: round2(pinned - expected),
      };
    },
  });
};

/**
 * Whether the list stands in a frame, from the lines of a column right of
 * the hymn titles (`linesIn`): at least `PITCHES` gaps in a row under the
 * list's top, each a hymn row's or a topic row's height (± 1 pt).
 */
export const listShows = (lines: ReadonlyArray<number>, layout: Layout) => {
  const under = lines.filter((line) => line >= layout.top);
  const pitch = (gap: number) =>
    Math.abs(gap - layout.hymn) <= TOLERANCE || Math.abs(gap - layout.topic) <= TOLERANCE;
  let run = 0;
  let longest = 0;
  for (let i = 1; i < under.length; i++) {
    if (pitch((under[i] ?? 0) - (under[i - 1] ?? 0))) run += 1;
    else run = 0;
    longest = Math.max(longest, run);
  }
  return longest >= PITCHES;
};

/** One pass's numbers: the line the check prints. */
export interface Summary {
  readonly frames: number;
  /** The frames where the list stands: every frame but the covered ones. */
  readonly shown: number;
  readonly judged: number;
  readonly missing: number;
  readonly off: number;
  readonly worst: number;
}

/** The summary of a pass's verdicts. */
export const summarize = (verdicts: ReadonlyArray<Verdict>): Summary => {
  const deviations = verdicts
    .filter((verdict): verdict is Seen => verdict._tag === 'Seen')
    .map((verdict) => Math.abs(verdict.deviation));
  const shown = verdicts.filter((verdict) => verdict._tag !== 'Covered').length;
  return {
    frames: verdicts.length,
    shown,
    judged: deviations.length,
    missing: shown - deviations.length,
    off: deviations.filter((deviation) => deviation > TOLERANCE).length,
    worst: round2(Math.max(0, ...deviations)),
  };
};

/**
 * A pass holds when no frame is off, the worst is within 1 pt, at least 95%
 * of the frames that show the list were judged, and the list shows in at
 * least `least` of all frames (every frame unless a pass covers the list).
 */
export const holds = (summary: Summary, least = 1) =>
  summary.off === 0 &&
  summary.worst <= TOLERANCE &&
  summary.shown >= least * summary.frames &&
  summary.judged >= 0.95 * summary.shown;
