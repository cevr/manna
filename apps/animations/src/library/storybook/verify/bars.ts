import { Data } from 'effect';

/** A fixed bar: at most, at least, or within a share of a target. */
export type Bar = Data.TaggedEnum<{
  AtMost: { readonly max: number };
  AtLeast: { readonly min: number };
  Near: { readonly target: number; readonly share: number };
}>;

export const Bar = Data.taggedEnum<Bar>();

/** Each check the verdict judges, in the bars table's order. */
export const CHECKS = [
  'palette',
  'pockets',
  'colour-step',
  'proportions',
  'scale',
  'one-sheet',
  'light',
  'render-height',
  'determinism',
] as const;

export type CheckId = (typeof CHECKS)[number];

/** Who set a bar: the owner, or the orchestrator's proposal the owner may change. */
export type BarSource = 'owner' | 'orchestrator-proposed';

/** One line of the table: the check, what it reads, its bar, who set the bar and on what day. */
export interface BarRow {
  readonly id: CheckId;
  readonly check: string;
  readonly bar: Bar;
  readonly source: BarSource;
  readonly set: string;
}

/** A bar the orchestrator proposed on 2026-11-03 (storybook-b spec, Bars), standing until the owner OKs or changes it. */
const proposed = (id: CheckId, check: string, bar: Bar): BarRow => ({
  id,
  check,
  bar,
  source: 'orchestrator-proposed',
  set: '2026-11-03',
});

/**
 * The bars a storybook shot must meet, fixed in one table (storybook-b spec,
 * Bars), in the verdict's order. Lines and heights are read in a figure's
 * head and centre columns, so a raised arm never moves one.
 */
export const BARS: ReadonlyArray<BarRow> = [
  proposed(
    'palette',
    'each stored cell the shot uses: share of its opaque pixels exactly a palette paint or the ink, worst cell',
    Bar.AtLeast({ min: 0.98 }),
  ),
  proposed(
    'pockets',
    "each stored cell the shot uses: opaque pixels within a channel sum of 30 of its sheet's ground, summed",
    Bar.AtMost({ max: 0 }),
  ),
  proposed(
    'colour-step',
    'figure-alone renders, lit: ΔE76 between the per-paint medians of the frames either side of each change of drawn cell (paints of 150 px or more in both), worst step',
    Bar.AtMost({ max: 1 }),
  ),
  proposed(
    'proportions',
    "each sheet's stored cells: per line (soles, hem, sash top, head), max − min over the cells as a share of the median crown-to-soles height, worst line",
    Bar.AtMost({ max: 0.04 }),
  ),
  proposed(
    'scale',
    "figure-alone renders, whole and with no squash: each figure's head over its plane zoom times its depth, over the lead's median head read so, farthest from 1",
    Bar.Near({ target: 1, share: 0.05 }),
  ),
  proposed(
    'one-sheet',
    'the plan and the stores: figures drawing a cell not of their one sheet, or whose stored cells do not re-split from it byte for byte',
    Bar.AtMost({ max: 0 }),
  ),
  proposed(
    'light',
    "figure-alone renders: share of interior pixels within ΔE 1 of the one light's colour of a palette paint, worst figure and frame",
    Bar.AtLeast({ min: 0.98 }),
  ),
  proposed(
    'render-height',
    'figure-alone renders with no squash: (max − min) of crown-to-soles over plane zoom, over the median, worst figure',
    Bar.AtMost({ max: 0.02 }),
  ),
  proposed(
    'determinism',
    'every render, colour and figure alone, in two page launches: renders whose sha256 differ',
    Bar.AtMost({ max: 0 }),
  ),
];

/** Whether `value` meets `bar`. */
export const meets = (bar: Bar, value: number): boolean =>
  Bar.$match(bar, {
    AtMost: ({ max }) => value <= max,
    AtLeast: ({ min }) => value >= min,
    Near: ({ target, share }) => Math.abs(value - target) <= target * share,
  });

/** A bar as the verdict prints it. */
export const barText = (bar: Bar): string =>
  Bar.$match(bar, {
    AtMost: ({ max }) => `<= ${max}`,
    AtLeast: ({ min }) => `>= ${min}`,
    Near: ({ target, share }) => `${target} ±${Math.round(share * 100)}%`,
  });
