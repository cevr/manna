import { Array as Arr, Option } from 'effect';

export interface Layout {
  readonly scale: number;
  readonly top: number;
  readonly topic: number;
  readonly hymn: number;
  readonly field: number;
}

export interface Missing {
  readonly _tag: 'Missing';
}

export interface Seen {
  readonly _tag: 'Seen';
  readonly pinned: number;
  readonly pushed: boolean;
  readonly expected: number;
  readonly deviation: number;
}

export interface Covered {
  readonly _tag: 'Covered';
}

export type Verdict = Missing | Seen | Covered;

export const PITCHES = 3;

export const TOLERANCE = 1;

const median = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

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

export const restOf = (layout: Layout, cover = 0) =>
  round2((Math.round((layout.top + cover + layout.topic) * layout.scale) - 1) / layout.scale);

export const FIELD_MARGIN = 8;

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

export const SLIDE = 12;

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

export interface Summary {
  readonly frames: number;
  readonly shown: number;
  readonly judged: number;
  readonly missing: number;
  readonly off: number;
  readonly worst: number;
}

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

export const holds = (summary: Summary, least = 1) =>
  summary.off === 0 &&
  summary.worst <= TOLERANCE &&
  summary.shown >= least * summary.frames &&
  summary.judged >= 0.95 * summary.shown;
