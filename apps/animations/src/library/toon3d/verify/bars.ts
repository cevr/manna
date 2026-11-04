import { Data } from 'effect';

/** The pipeline's stages, in order: a check names the one stage whose output it reads, so a FAIL points at that stage. */
export const STAGES = ['geometry', 'palette', 'shader', 'ink', 'face', 'rig', 'render'] as const;

export type Stage = (typeof STAGES)[number];

/** A fixed bar: at most, at least, or within a share of a target. */
export type Bar = Data.TaggedEnum<{
  AtMost: { readonly max: number };
  AtLeast: { readonly min: number };
  Near: { readonly target: number; readonly share: number };
}>;

export const Bar = Data.taggedEnum<Bar>();

/** Each measure the verdict reads, named once. */
export const MEASURES = [
  'differingRenders',
  'iou',
  'frontFlaggedRows',
  'probeDeltaE',
  'flatShare',
  'shadeBlobs',
  'hairBlobsOverKept',
  'inkWidth',
  'inkDeltaE',
  'faceOffset',
  'bendTears',
  'bendOutlineDrift',
  'bendSleeveDrift',
  'bendDoubled',
  'turnTears',
  'turnOutlineDrift',
] as const;

export type MeasureName = (typeof MEASURES)[number];

/** Who set a bar: the owner, or the orchestrator's proposal the owner may change. */
export type BarSource = 'owner' | 'orchestrator-proposed';

/** One line of the table: the check, the stage that owns it, its measure, its bar, who set the bar and on what day. */
export interface BarRow {
  readonly id: string;
  readonly stage: Stage;
  readonly check: string;
  readonly measure: MeasureName;
  readonly bar: Bar;
  readonly source: BarSource;
  readonly set: string;
}

/** A bar the owner approved (2026-11-03: "I think the bars are okay"; the hair's blobs by ruling the same day). */
const approved = (
  id: string,
  stage: Stage,
  check: string,
  measure: MeasureName,
  bar: Bar,
): BarRow => ({ id, stage, check, measure, bar, source: 'owner', set: '2026-11-03' });

/**
 * The bars a figure must meet, fixed in one table (verify-spec, 2026-11-03),
 * each set by the owner.
 * Drifts are fractions of frame 0; `turn` is two lines, its tears and its
 * outline, so each line has one measure and one bar.
 */
export const BARS: ReadonlyArray<BarRow> = [
  approved(
    'determinism',
    'render',
    'each view and motion frame, colour and ids, rendered in two page launches: renders whose sha256 differ',
    'differingRenders',
    Bar.AtMost({ max: 0 }),
  ),
  approved(
    'silhouette',
    'geometry',
    'IoU vs the kept view, worst of the six views',
    'iou',
    Bar.AtLeast({ min: 0.95 }),
  ),
  approved(
    'proportions',
    'geometry',
    'flagged proportion rows, front',
    'frontFlaggedRows',
    Bar.AtMost({ max: 4 }),
  ),
  approved(
    'colour',
    'palette',
    "ΔE between the kept's and the render's median at each authored colour probe (part, paint), worst probe of any view; an unreadable probe fails",
    'probeDeltaE',
    Bar.AtMost({ max: 3 }),
  ),
  approved(
    'flat-share',
    'shader',
    "share of a part's interior px within ΔE 3 of its base or shade, worst part of any view",
    'flatShare',
    Bar.AtLeast({ min: 0.98 }),
  ),
  approved(
    'flat-blobs',
    'shader',
    'shade blobs per part but the hair, most of any part in any view',
    'shadeBlobs',
    Bar.AtMost({ max: 2 }),
  ),
  approved(
    'flat-blobs-hair',
    'shader',
    "the hair's shade blobs relative to kept: the render's less the kept view's hair by the same blob measure, most of any view (owner ruling 2026-11-03, option a)",
    'hairBlobsOverKept',
    Bar.AtMost({ max: 0 }),
  ),
  approved(
    'ink-width',
    'ink',
    'median ink width, the view farthest from 8 px',
    'inkWidth',
    Bar.Near({ target: 8, share: 0.15 }),
  ),
  approved(
    'ink-colour',
    'ink',
    "ΔE of the ink's colour to the kept ink's, worst view",
    'inkDeltaE',
    Bar.AtMost({ max: 6 }),
  ),
  approved(
    'face',
    'face',
    "front: the farthest brow, eye or mouth mark centre from the kept's, px",
    'faceOffset',
    Bar.AtMost({ max: 4 }),
  ),
  approved(
    'bend-tears',
    'rig',
    'elbow 0 -> 110 -> 0, wrist -0.85 x elbow: tear px, worst frame',
    'bendTears',
    Bar.AtMost({ max: 0 }),
  ),
  approved(
    'bend-outline',
    'rig',
    'outline width over the bend (sub-pixel stroke width), drift from frame 0',
    'bendOutlineDrift',
    Bar.AtMost({ max: 0.15 }),
  ),
  approved(
    'bend-sleeve',
    'rig',
    'sleeve width across the bone axis in the profileRight view (the right forearm across the camera), drift from frame 0, worse bone',
    'bendSleeveDrift',
    Bar.AtMost({ max: 0.1 }),
  ),
  approved(
    'bend-doubled',
    'ink',
    'doubled-outline px the bend adds over frame 0, worst frame',
    'bendDoubled',
    Bar.AtMost({ max: 20 }),
  ),
  approved(
    'turn-tears',
    'rig',
    'yaw 0 -> -pi/2: tear px, worst frame',
    'turnTears',
    Bar.AtMost({ max: 0 }),
  ),
  approved(
    'turn-outline',
    'rig',
    'outline width over the turn (sub-pixel stroke width), drift from frame 0',
    'turnOutlineDrift',
    Bar.AtMost({ max: 0.15 }),
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
