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

/** One reading of a measure: where it was read, and its value, none where that place could not be read. */
export interface Sample {
  readonly at: string;
  readonly value: Option.Option<number>;
}

/** A measure's readings, each place it should be read; a check fails as unread when any is none, or when there are none. */
export type Samples = ReadonlyArray<Sample>;

/** A reading that was read. */
export interface ReadSample {
  readonly at: string;
  readonly value: number;
}

const partName = (id: number): string =>
  Option.getOrElse(
    Option.fromUndefinedOr(Object.entries(PART).find(([, v]) => v === id)?.[0]),
    () => `part ${id}`,
  );

const one = (at: string, value: number): Sample => ({ at, value: Option.some(value) });

const series = (
  frames: ReadonlyArray<FrameMeasured>,
  pick: (f: FrameMeasured) => number,
): Samples => frames.map((f) => one(`frame ${f.frame}`, pick(f)));

/** A bone's drift over the bend from frame 0: unread at the first frame that bone is not read in, so every frame and the reference are judged. */
const boneDrift = (
  bone: string,
  frames: ReadonlyArray<FrameMeasured>,
  pick: (f: FrameMeasured) => Option.Option<number>,
): Sample =>
  Option.match(Option.fromUndefinedOr(frames.find((f) => Option.isNone(pick(f)))), {
    onSome: (f) => ({ at: `${bone} frame ${f.frame}`, value: Option.none() }),
    onNone: () => ({
      at: bone,
      value: worstDrift(frames.flatMap((f) => Option.toArray(pick(f)))),
    }),
  });

/** Each measure's readings from a run: the verdict reduces them against the check's bar. */
export const READERS: Record<MeasureName, (m: Measured) => Samples> = {
  differingRenders: (m) => [one(`${m.renders.compared} renders`, m.renders.differing.length)],
  iou: (m) => m.views.map((v) => one(v.view, v.iou)),
  frontFlaggedRows: (m) => [
    {
      at: 'front',
      value: Option.map(m.frontRows, (r) => r.flagged),
    },
  ],
  partDeltaE: (m) =>
    m.views.flatMap((v) => v.parts.map((p) => one(`${v.view} ${partName(p.part)}`, p.deltaE))),
  flatShare: (m) =>
    m.views.flatMap((v) => v.flatness.map((f) => one(`${v.view} ${partName(f.part)}`, f.share))),
  shadeBlobs: (m) =>
    m.views.flatMap((v) =>
      v.flatness
        .filter((f) => f.part !== PART.hair)
        .map((f) => one(`${v.view} ${partName(f.part)}`, f.blobs)),
    ),
  hairBlobsOverKept: (m) =>
    m.views.flatMap((v) =>
      v.flatness
        .filter((f) => f.part === PART.hair)
        .map((f) =>
          one(`${v.view} hair ${f.blobs} (kept ${v.keptHairBlobs})`, f.blobs - v.keptHairBlobs),
        ),
    ),
  inkWidth: (m) => m.views.map((v) => one(`${v.view} (kept ${v.keptInkWidth})`, v.inkWidth)),
  inkDeltaE: (m) => m.views.map((v) => ({ at: v.view, value: v.inkDeltaE })),
  faceOffset: (m) => [{ at: 'front', value: m.face }],
  bendTears: (m) => series(m.bend, (f) => f.tears),
  bendOutlineDrift: (m) => [{ at: 'bend', value: worstDrift(m.bend.map((f) => f.ink)) }],
  bendSleeveDrift: (m) => [
    boneDrift('upper arm', m.bend, (f) => f.upper),
    boneDrift('forearm', m.bend, (f) => f.fore),
  ],
  bendDoubled: (m) => series(m.bend, (f) => f.doubled - (m.bend[0]?.doubled ?? 0)),
  turnTears: (m) => series(m.turn, (f) => f.tears),
  turnOutlineDrift: (m) => [{ at: 'turn', value: worstDrift(m.turn.map((f) => f.ink)) }],
};

/** The reading a bar judges: the largest for at-most, the smallest for at-least, the farthest from the target for near. */
export const worstFor = (
  bar: Bar,
  samples: ReadonlyArray<ReadSample>,
): Option.Option<ReadSample> => {
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

/** Each bar against its measure's worst reading; a measure with no reading, or any place it could not read, fails as unread. */
export const verdictOf = (bars: ReadonlyArray<BarRow>, measured: Measured): Verdict => {
  const checks = bars.map((row): CheckVerdict => {
    const base = { id: row.id, stage: row.stage, bar: barText(row.bar), source: row.source };
    const samples = READERS[row.measure](measured);
    const unread = (at: string): CheckVerdict => ({ ...base, pass: false, value: 'unread', at });
    return Option.match(Option.fromUndefinedOr(samples.find((s) => Option.isNone(s.value))), {
      onSome: (s) => unread(s.at),
      onNone: () =>
        Option.match(
          worstFor(
            row.bar,
            samples.flatMap((s) =>
              Option.toArray(Option.map(s.value, (value) => ({ at: s.at, value }))),
            ),
          ),
          {
            onNone: () => unread('no reading'),
            onSome: (s) => ({
              ...base,
              pass: meets(row.bar, s.value),
              value: shown(s.value),
              at: s.at,
            }),
          },
        ),
    });
  });
  return { passed: checks.filter((c) => c.pass).length, total: checks.length, checks };
};

/** verdict.md: `PASS n/n pass` or `FAIL k/n pass` (k the checks that pass), then `PASS|FAIL id stage value bar` per check, with where the value was read. */
export const verdictText = (v: Verdict): string => {
  const word = (pass: boolean): string => {
    if (pass) return 'PASS';
    return 'FAIL';
  };
  const head = `${word(v.passed === v.total)} ${v.passed}/${v.total} pass`;
  const lines = v.checks.map(
    (c) => `${word(c.pass)} ${c.id} ${c.stage} ${c.value} ${c.bar} (${c.at}; ${c.source})`,
  );
  return [head, '', ...lines, ''].join('\n');
};
