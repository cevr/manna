import { Option } from 'effect';
import { PART } from '../figure.ts';
import type { ViewName } from '../render.ts';
import {
  Bar,
  barText,
  meets,
  type BarRow,
  type BarSource,
  type MeasureName,
  type Stage,
} from './bars.ts';
import { worstDrift, type Flatness, type PartDelta } from './measures.ts';

/** One view at rest against its kept view. */
export interface ViewMeasured {
  readonly view: ViewName;
  readonly iou: number;
  readonly parts: ReadonlyArray<PartDelta>;
  readonly flatness: ReadonlyArray<Flatness>;
  readonly keptHairBlobs: number;
  readonly inkWidth: number;
  readonly keptInkWidth: number;
  readonly inkDeltaE: Option.Option<number>;
}

/** One motion frame: its ink width, doubled px, tear px and the sleeve's width across each bone. */
export interface FrameMeasured {
  readonly frame: number;
  readonly ink: number;
  readonly doubled: number;
  readonly tears: number;
  readonly upper: Option.Option<number>;
  readonly fore: Option.Option<number>;
}

/** The front's proportion rows against the kept front. */
export interface RowsMeasured {
  readonly flagged: number;
  readonly compared: number;
  readonly names: ReadonlyArray<string>;
}

/** Everything one run measured, the verdict's only input. */
export interface Measured {
  readonly renders: { readonly compared: number; readonly differing: ReadonlyArray<string> };
  readonly views: ReadonlyArray<ViewMeasured>;
  readonly frontRows: Option.Option<RowsMeasured>;
  readonly face: Option.Option<number>;
  readonly bend: ReadonlyArray<FrameMeasured>;
  readonly turn: ReadonlyArray<FrameMeasured>;
}

/** A measure's readings: each value with where it was read; empty when it could not be read. */
export type Samples = ReadonlyArray<{ readonly at: string; readonly value: number }>;

const partName = (id: number): string =>
  Option.getOrElse(
    Option.fromUndefinedOr(Object.entries(PART).find(([, v]) => v === id)?.[0]),
    () => `part ${id}`,
  );

const one = (at: string, value: number): Samples => [{ at, value }];

const fromOption = (at: string, o: Option.Option<number>): Samples =>
  Option.match(o, { onNone: () => [], onSome: (value) => one(at, value) });

const series = (
  frames: ReadonlyArray<FrameMeasured>,
  pick: (f: FrameMeasured) => number,
): Samples => frames.map((f) => ({ at: `frame ${f.frame}`, value: pick(f) }));

/** A series' drift from its first frame; none when that frame was not read. */
const drift = (
  frames: ReadonlyArray<FrameMeasured>,
  pick: (f: FrameMeasured) => Option.Option<number>,
): Option.Option<number> =>
  Option.flatMap(Option.fromUndefinedOr(frames[0]), (first) =>
    Option.map(pick(first), () => worstDrift(frames.flatMap((f) => Option.toArray(pick(f))))),
  );

/** Each measure's readings from a run: the verdict reduces them against the check's bar. */
export const READERS: Record<MeasureName, (m: Measured) => Samples> = {
  differingRenders: (m) => one(`${m.renders.compared} renders`, m.renders.differing.length),
  iou: (m) => m.views.map((v) => ({ at: v.view, value: v.iou })),
  frontFlaggedRows: (m) =>
    fromOption(
      'front',
      Option.map(m.frontRows, (r) => r.flagged),
    ),
  partDeltaE: (m) =>
    m.views.flatMap((v) =>
      v.parts.map((p) => ({ at: `${v.view} ${partName(p.part)}`, value: p.deltaE })),
    ),
  flatShare: (m) =>
    m.views.flatMap((v) =>
      v.flatness.map((f) => ({ at: `${v.view} ${partName(f.part)}`, value: f.share })),
    ),
  shadeBlobs: (m) =>
    m.views.flatMap((v) =>
      v.flatness
        .filter((f) => f.part !== PART.hair)
        .map((f) => ({ at: `${v.view} ${partName(f.part)}`, value: f.blobs })),
    ),
  hairBlobsOverKept: (m) =>
    m.views.flatMap((v) =>
      v.flatness
        .filter((f) => f.part === PART.hair)
        .map((f) => ({
          at: `${v.view} hair ${f.blobs} (kept ${v.keptHairBlobs})`,
          value: f.blobs - v.keptHairBlobs,
        })),
    ),
  inkWidth: (m) =>
    m.views.map((v) => ({ at: `${v.view} (kept ${v.keptInkWidth})`, value: v.inkWidth })),
  inkDeltaE: (m) => m.views.flatMap((v) => fromOption(v.view, v.inkDeltaE)),
  faceOffset: (m) => fromOption('front', m.face),
  bendTears: (m) => series(m.bend, (f) => f.tears),
  bendOutlineDrift: (m) => one('bend', worstDrift(m.bend.map((f) => f.ink))),
  bendSleeveDrift: (m) => [
    ...fromOption(
      'upper arm',
      drift(m.bend, (f) => f.upper),
    ),
    ...fromOption(
      'forearm',
      drift(m.bend, (f) => f.fore),
    ),
  ],
  bendDoubled: (m) => series(m.bend, (f) => f.doubled - (m.bend[0]?.doubled ?? 0)),
  turnTears: (m) => series(m.turn, (f) => f.tears),
  turnOutlineDrift: (m) => one('turn', worstDrift(m.turn.map((f) => f.ink))),
};

/** The reading a bar judges: the largest for at-most, the smallest for at-least, the farthest from the target for near. */
export const worstFor = (bar: Bar, samples: Samples): Option.Option<Samples[number]> => {
  const score = (value: number): number =>
    Bar.$match(bar, {
      AtMost: () => value,
      AtLeast: () => -value,
      Near: ({ target }) => Math.abs(value - target),
    });
  return Option.fromUndefinedOr([...samples].sort((a, b) => score(b.value) - score(a.value))[0]);
};

/** One check's verdict. */
export interface CheckVerdict {
  readonly id: string;
  readonly stage: Stage;
  readonly pass: boolean;
  readonly value: string;
  readonly at: string;
  readonly bar: string;
  readonly source: BarSource;
}

/** The whole verdict: how many checks pass of how many, and each check. */
export interface Verdict {
  readonly passed: number;
  readonly total: number;
  readonly checks: ReadonlyArray<CheckVerdict>;
}

const shown = (value: number): string => String(Number(value.toFixed(3)));

/** Each bar against its measure's worst reading; a measure with no reading fails. */
export const verdictOf = (bars: ReadonlyArray<BarRow>, measured: Measured): Verdict => {
  const checks = bars.map((row): CheckVerdict => {
    const base = { id: row.id, stage: row.stage, bar: barText(row.bar), source: row.source };
    return Option.match(worstFor(row.bar, READERS[row.measure](measured)), {
      onNone: () => ({ ...base, pass: false, value: 'unread', at: 'no reading' }),
      onSome: (s) => ({ ...base, pass: meets(row.bar, s.value), value: shown(s.value), at: s.at }),
    });
  });
  return { passed: checks.filter((c) => c.pass).length, total: checks.length, checks };
};

/** verdict.md: `PASS n/n` or `FAIL k/n` (k the checks that pass), then `PASS|FAIL id stage value bar` per check, with where the value was read. */
export const verdictText = (v: Verdict): string => {
  const word = (pass: boolean): string => {
    if (pass) return 'PASS';
    return 'FAIL';
  };
  const head = `${word(v.passed === v.total)} ${v.passed}/${v.total}`;
  const lines = v.checks.map(
    (c) => `${word(c.pass)} ${c.id} ${c.stage} ${c.value} ${c.bar} (${c.at}; ${c.source})`,
  );
  return [head, '', ...lines, ''].join('\n');
};
