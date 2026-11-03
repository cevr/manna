import { Schema } from 'effect';
import { PART, type PartName } from '../figure.ts';
import type { ViewName } from '../render.ts';
import type { Box } from './measures.ts';

const PART_NAMES = Object.keys(PART).filter(
  (name): name is PartName => name !== 'paper' && name !== 'shadow',
);

/** A figure part, by its name in `PART`. */
export const ProbePart = Schema.Literals(PART_NAMES);

/** Which of a part's two paints a probe reads: its lit base or its shade. */
export const ProbePaint = Schema.Literals(['base', 'shade']);

/** A probe's box in the kept view's pixels: its left, top, width and height. */
export const ProbeBox = Schema.Tuple([Schema.Int, Schema.Int, Schema.Int, Schema.Int]);

/** A probe's name, unique within its view, by which the coverage inventory names it. */
export const ProbeId = Schema.NonEmptyString;

/** One authored colour probe: a small box inside a flat area of one part's paint in a kept view. */
export const ColourProbe = Schema.Struct({
  id: ProbeId,
  part: ProbePart,
  paint: ProbePaint,
  box: ProbeBox,
});

/** One authored colour probe: a small box inside a flat area of one part's paint in a kept view. */
export interface ColourProbe extends Schema.Schema.Type<typeof ColourProbe> {}

/** A member's colour probes, `cast/<member>/cast-sheet/colour-probes.json`: each of the six kept views' probes, where the colour check reads. */
export const ColourProbes = Schema.Struct({
  member: Schema.String,
  views: Schema.Struct({
    front: Schema.Array(ColourProbe),
    threeQuarterLeft: Schema.Array(ColourProbe),
    profileLeft: Schema.Array(ColourProbe),
    back: Schema.Array(ColourProbe),
    profileRight: Schema.Array(ColourProbe),
    threeQuarterRight: Schema.Array(ColourProbe),
  } satisfies Record<ViewName, Schema.Top>),
});

/** A member's colour probes. */
export interface ColourProbes extends Schema.Schema.Type<typeof ColourProbes> {}

/** The probes file's text decoded. */
export const ColourProbesJson = Schema.fromJsonString(ColourProbes);

/** A shown paint the kept view reads at the named probes, each of that part and paint. */
export const ProbedPaint = Schema.Struct({
  part: ProbePart,
  paint: ProbePaint,
  probes: Schema.NonEmptyArray(ProbeId),
});

/** A shown paint the kept view reads at the named probes, each of that part and paint. */
export interface ProbedPaint extends Schema.Schema.Type<typeof ProbedPaint> {}

/** A shown paint the kept view has no flat box for, with the specific reason. */
export const UnavailablePaint = Schema.Struct({
  part: ProbePart,
  paint: ProbePaint,
  unavailable: Schema.NonEmptyString,
});

/** One shown (part, paint) of a kept view: probed, or unavailable with its reason. */
export const ShownPaint = Schema.Union([ProbedPaint, UnavailablePaint]);

/** One shown (part, paint) of a kept view: probed, or unavailable with its reason. */
export type ShownPaint = Schema.Schema.Type<typeof ShownPaint>;

/** A member's reviewed colour coverage, `cast/<member>/cast-sheet/colour-coverage.json`: every (part, paint) each kept view shows, read off the view at 1:1, so a paint left without a probe is seen. */
export const ColourCoverage = Schema.Struct({
  member: Schema.String,
  views: Schema.Struct({
    front: Schema.Array(ShownPaint),
    threeQuarterLeft: Schema.Array(ShownPaint),
    profileLeft: Schema.Array(ShownPaint),
    back: Schema.Array(ShownPaint),
    profileRight: Schema.Array(ShownPaint),
    threeQuarterRight: Schema.Array(ShownPaint),
  } satisfies Record<ViewName, Schema.Top>),
});

/** A member's reviewed colour coverage. */
export interface ColourCoverage extends Schema.Schema.Type<typeof ColourCoverage> {}

/** The coverage file's text decoded. */
export const ColourCoverageJson = Schema.fromJsonString(ColourCoverage);

/** A probe's box as the measures' inclusive box. */
export const probeBox = (probe: ColourProbe): Box => {
  const [x, y, w, h] = probe.box;
  return { x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 };
};

/** Where a probe sits, for a verdict: its view, part, paint and its index among the view's probes. */
export const probeAt = (view: ViewName, probe: ColourProbe, index: number): string =>
  `${view} ${probe.part} ${probe.paint} #${index}`;
