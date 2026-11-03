import { compareFigures, measureFigure } from '@manna/film/core';
import { Effect, Option, Result, Schema } from 'effect';
import sharp from 'sharp';
import { PART } from '../figure.ts';
import type { ArmJoints } from '../mesh/rig.ts';
import type { RenderRequest } from '../page.ts';
import { HEAD_PX, toon3dPage, YAWS, type RenderPng, type ViewName } from '../render.ts';
import type { BuiltFigure } from '../source.ts';
import { REST, REST_ARM, type MemberSpec, type PaintName, type Pose, type Vec3 } from '../spec.ts';
import {
  boxOf,
  deltaLab,
  doubledInk,
  faceMarks,
  faceOffset,
  figureMask,
  flatness,
  idAt,
  inkColour,
  inkWidth,
  strokeWidth,
  iou,
  keptBlobs,
  partDeltas,
  rgbOf,
  tears,
  wholeBox,
  widthAcross,
  type Box,
  type PartPaints,
  type Point,
  type Raster,
} from './measures.ts';
import type { FrameMeasured, Measured, RowsMeasured, ViewMeasured } from './verdict.ts';

/** A verify step failed outside the figure's page: decoding a picture or reading a kept view. */
export class VerifyFailed extends Schema.TaggedError<VerifyFailed>()('VerifyFailed', {
  reason: Schema.String,
}) {}

const failed = (cause: unknown) => VerifyFailed.make({ reason: String(cause) });

/** How much a run renders: which kept views, and how many bend and turn frames. */
export interface Plan {
  readonly views: ReadonlyArray<ViewName>;
  readonly bendFrames: number;
  readonly turnFrames: number;
}

/** The six kept views, in the sheet's order. */
export const VIEWS: ReadonlyArray<ViewName> = [
  'front',
  'threeQuarterLeft',
  'profileLeft',
  'back',
  'profileRight',
  'threeQuarterRight',
];

/** The full run the bars are set for: six views, a 96-frame bend and a 72-frame turn. */
export const FULL_PLAN: Plan = { views: VIEWS, bendFrames: 96, turnFrames: 72 };

/** A run to iterate with, not a verdict: the front, an 8-frame bend and a 2-frame turn. */
export const QUICK_PLAN: Plan = { views: ['front'], bendFrames: 8, turnFrames: 2 };

/** `n + 1` values easing from 0 to `to` along half a cosine. */
const eased = (n: number, to: number): ReadonlyArray<number> =>
  Array.from({ length: n + 1 }, (_, k) => (to * (1 - Math.cos((Math.PI * k) / n))) / 2);

/** The bend's elbow angles (degrees): 0 -> 110 over half the frames and back, `frames` in all. */
export const bendAngles = (frames: number): ReadonlyArray<number> => {
  const there = eased(Math.floor(frames / 2), 110);
  return [...there, ...there.slice(1, -1).reverse()];
};

/** The turn's yaws: 0 -> -pi/2 over `frames` frames. */
export const turnYaws = (frames: number): ReadonlyArray<number> =>
  eased(frames - 1, 1).map((t) => t * YAWS.profileLeft);

/**
 * The bend's pose at elbow angle `degrees`: the right arm raises 0.7 rad at
 * full bend and its hinge turns -0.6 rad so the forearm comes forward and
 * in toward the chest, as the cut-out's bend clip does; the wrist bends
 * back 0.85 of the elbow.
 */
export const bendPose = (degrees: number): Pose => {
  const elbow = (degrees * Math.PI) / 180;
  return {
    right: { raise: 0.7 * (degrees / 110), abduct: 0, elbow, wrist: -0.85 * elbow, twist: -0.6 },
    left: REST_ARM,
  };
};

/** The bend's frame: the right arm close up, 300 px a head. */
const BEND_FRAME = { width: 340, height: 640, ox: 335, oy: 1035, scale: 300 };

/** The view the sleeve's width is read in: profileRight, where the bent right forearm lies across the camera, not pointing at it as in the front. */
export const SLEEVE_VIEW: ViewName = 'profileRight';

/** The bend's ids from `SLEEVE_VIEW`: the same close-up, the arm's bones 0 to 182 px right of `ox`. */
const BEND_SIDE_FRAME = { ...BEND_FRAME, ox: 90, yaw: YAWS[SLEEVE_VIEW] };

/** The turn's frame: the whole figure at the kept views' scale. */
const TURN_FRAME = { width: 260, height: 680, ox: 130, oy: 668, scale: HEAD_PX };

/** One render the run makes: its file name under `renders/` and its request. */
export interface RenderJob {
  readonly name: string;
  readonly request: RenderRequest;
}

const frameName = (k: number): string => `f${String(k).padStart(4, '0')}.png`;

/** A frame's colour and ids renders. */
const pair = (
  dir: string,
  k: number,
  request: Omit<RenderRequest, 'output'>,
): ReadonlyArray<RenderJob> => [
  { name: `${dir}/${frameName(k)}`, request: { ...request, output: 'colour' } },
  { name: `${dir}-ids/${frameName(k)}`, request: { ...request, output: 'ids' } },
];

/** Where a view sits in its kept picture: the soles' centre, found by placing the render's box over the kept's. */
export interface Placement {
  readonly width: number;
  readonly height: number;
  readonly ox: number;
  readonly oy: number;
}

/** A PNG's pixels. */
export const decode = (png: Uint8Array | string): Effect.Effect<Raster, VerifyFailed> =>
  Effect.tryPromise({
    try: () => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    catch: failed,
  }).pipe(
    Effect.map(({ data, info }) => ({
      width: info.width,
      height: info.height,
      rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    })),
  );

const boxOrWhole = (mask: Uint8Array, r: Raster): Box =>
  Option.getOrElse(boxOf(mask, r.width), () => wholeBox(r));

const viewRequest = (
  view: ViewName,
  place: Placement,
  output: RenderRequest['output'],
): RenderRequest => ({
  ...place,
  scale: HEAD_PX,
  yaw: YAWS[view],
  pose: REST,
  output,
  palette: 'kept',
});

/**
 * A view placed over its kept picture at one scale (`HEAD_PX`): twice, the
 * render's box centre is moved onto the kept box's centre and its lowest
 * pixel onto the kept's.
 */
export const placeView = Effect.fn('Toon3dVerify.placeView')(function* (
  render: RenderPng,
  view: ViewName,
  kept: Raster,
) {
  const kb = boxOrWhole(figureMask(kept), kept);
  let place: Placement = {
    width: kept.width,
    height: kept.height,
    ox: kept.width / 2,
    oy: kept.height - 8,
  };
  for (let k = 0; k < 2; k++) {
    const shot = yield* decode(yield* render(viewRequest(view, place, 'colour')));
    const b = boxOrWhole(figureMask(shot), shot);
    place = {
      ...place,
      ox: place.ox + (kb.x0 + kb.x1) / 2 - (b.x0 + b.x1) / 2,
      oy: place.oy + kb.y1 - b.y1,
    };
  }
  return place;
});

/** Every render of a run, in a fixed order: each view's colour and ids at its placement, then the bend's and the turn's frames. */
export const jobsOf = (
  plan: Plan,
  places: ReadonlyMap<ViewName, Placement>,
): ReadonlyArray<RenderJob> => [
  ...plan.views.flatMap((view) =>
    Option.match(Option.fromUndefinedOr(places.get(view)), {
      onNone: () => [],
      onSome: (place) => [
        { name: `views/${view}.png`, request: viewRequest(view, place, 'colour') },
        { name: `views-ids/${view}.png`, request: viewRequest(view, place, 'ids') },
      ],
    }),
  ),
  ...bendAngles(plan.bendFrames).flatMap((deg, k) =>
    pair('bend', k, { ...BEND_FRAME, yaw: 0, pose: bendPose(deg), palette: 'kept' }),
  ),
  ...bendAngles(plan.bendFrames).map((deg, k) => ({
    name: `bend-side-ids/${frameName(k)}`,
    request: {
      ...BEND_SIDE_FRAME,
      pose: bendPose(deg),
      palette: 'kept' as const,
      output: 'ids' as const,
    },
  })),
  ...turnYaws(plan.turnFrames).flatMap((yaw, k) =>
    pair('turn', k, { ...TURN_FRAME, yaw, pose: REST, palette: 'kept' }),
  ),
];

/** The page's size: a render sets its own canvas size, so this only bounds the window. */
const PAGE_SIZE = { width: 400, height: 700 };

/** The run's first launch: each view placed over its kept picture, then every job rendered. */
export const firstLaunch = Effect.fn('Toon3dVerify.firstLaunch')(function* (
  figure: BuiltFigure,
  plan: Plan,
  kept: ReadonlyMap<ViewName, Raster>,
) {
  const render = yield* toon3dPage(PAGE_SIZE, figure.page);
  const places = new Map<ViewName, Placement>();
  for (const view of plan.views) {
    const keptView = kept.get(view);
    if (!keptView) return yield* VerifyFailed.make({ reason: `no kept picture for ${view}` });
    places.set(view, yield* placeView(render, view, keptView));
  }
  const jobs = jobsOf(plan, places);
  const pngs = yield* Effect.forEach(jobs, (job) => render(job.request));
  return { jobs, pngs };
}, Effect.scoped);

/** A second, separate launch of the page rendering the same jobs, for the determinism check. */
export const secondLaunch = Effect.fn('Toon3dVerify.secondLaunch')(function* (
  figure: BuiltFigure,
  jobs: ReadonlyArray<RenderJob>,
) {
  const render = yield* toon3dPage(PAGE_SIZE, figure.page);
  return yield* Effect.forEach(jobs, (job) => render(job.request));
}, Effect.scoped);

/** Each figure part's paints, for the flatness and colour measures: base, shade, and the sandal's on a foot. */
export const partPaints = (spec: MemberSpec): PartPaints => {
  const paint = (name: PaintName) => [
    rgbOf(spec.paints[name].base),
    rgbOf(spec.paints[name].shade),
  ];
  return new Map([
    [PART.hair, paint('hair')],
    [PART.head, paint('skin')],
    [PART.ear, paint('skin')],
    [PART.neck, paint('skin')],
    [PART.body, paint('tunic')],
    [PART.mantle, paint('mantle')],
    [PART.sash, paint('sash')],
    [PART.knot, paint('sash')],
    [PART.endR, paint('sash')],
    [PART.endL, paint('sash')],
    [PART.sleeveR, paint(spec.arms.right.paint)],
    [PART.sleeveL, paint(spec.arms.left.paint)],
    [PART.handR, paint('skin')],
    [PART.handL, paint('skin')],
    [PART.foot, [...paint('skin'), ...paint('sandal')]],
  ]);
};

const isGround = (id: number): boolean => id === PART.paper || id === PART.shadow;

/** An arm's two bones on screen. */
export interface ArmOnScreen {
  readonly upper: readonly [Point, Point];
  readonly fore: readonly [Point, Point];
}

/** The posed right arm's two bones on screen: shoulder to elbow and elbow to wrist, in a request's pixels. */
export const rightArmOnScreen = (arm: ArmJoints, request: RenderRequest): ArmOnScreen => {
  const c = Math.cos(request.yaw);
  const s = Math.sin(request.yaw);
  const screen = (v: Vec3): Point => [
    request.ox + (v[0] * c + v[2] * s) * request.scale,
    request.oy - v[1] * request.scale,
  ];
  const elbow = screen(arm.elbow);
  return { upper: [screen(arm.shoulder), elbow], fore: [elbow, screen(arm.wrist)] };
};

/** Where along a bone the sleeve's width is read: its middle, clear of the shoulder ball, the elbow's arc and the cuff. */
const ALONG = [0.3, 0.4, 0.5, 0.6, 0.7];

/** The box round the right sleeve and hand, 14 px out: where the bend's ink is read. */
const armBox = (ids: Raster): Box => {
  const mask = new Uint8Array(ids.width * ids.height).map((_, i) => {
    const id = idAt(ids, i);
    return Number(id === PART.sleeveR || id === PART.handR);
  });
  const b = boxOrWhole(mask, ids);
  return {
    x0: Math.max(0, b.x0 - 14),
    y0: Math.max(0, b.y0 - 14),
    x1: Math.min(ids.width - 1, b.x1 + 14),
    y1: Math.min(ids.height - 1, b.y1 + 14),
  };
};

/** The right sleeve's width across each bone, read from one ids render of the posed arm. */
export type SleeveWidths = Pick<FrameMeasured, 'upper' | 'fore'>;

/** The right sleeve's width across its upper arm and its forearm in an ids render made by `request`. */
export const sleeveAcross = (arm: ArmJoints, request: RenderRequest, ids: Raster): SleeveWidths => {
  const bones = rightArmOnScreen(arm, request);
  return {
    upper: widthAcross(ids, PART.sleeveR, bones.upper, ALONG, [bones.fore]),
    fore: widthAcross(ids, PART.sleeveR, bones.fore, ALONG, [bones.upper]),
  };
};

/** A frame whose sleeve is not read: the turn's. */
const NO_SLEEVE: SleeveWidths = { upper: Option.none(), fore: Option.none() };

/** One motion frame's measures: ink, doubled px and tears from its colour and ids, and the sleeve as read elsewhere. */
export const measureFrame = (
  frame: number,
  colour: Raster,
  ids: Raster,
  box: Box,
  sleeve: SleeveWidths,
): FrameMeasured => ({
  frame,
  ink: strokeWidth(colour, box),
  doubled: doubledInk(colour, box),
  tears: tears(ids, colour, isGround),
  ...sleeve,
});

/** One view's measures against its kept picture. */
export const measureView = (
  spec: MemberSpec,
  view: ViewName,
  kept: Raster,
  colour: Raster,
  ids: Raster,
): ViewMeasured => ({
  view,
  iou: iou(figureMask(kept), figureMask(colour)),
  parts: partDeltas(kept, colour, ids, partPaints(spec)),
  flatness: flatness(colour, ids, partPaints(spec)),
  keptHairBlobs: keptBlobs(kept, ids, partPaints(spec), PART.hair),
  inkWidth: inkWidth(colour, wholeBox(colour)),
  keptInkWidth: inkWidth(kept, wholeBox(kept)),
  inkDeltaE: Option.map(Option.all([inkColour(colour), inkColour(kept)]), ([a, b]) =>
    deltaLab(a, b),
  ),
});

/** The front's proportion rows (the film's figure measure on both pictures); none when either cannot be read. */
export const frontRows = (kept: Raster, colour: Raster): Option.Option<RowsMeasured> => {
  const k = measureFigure(kept);
  const s = measureFigure(colour);
  if (Result.isFailure(k) || Result.isFailure(s)) return Option.none();
  const rows = compareFigures(k.success, s.success);
  return Option.some({
    flagged: rows.filter((r) => r.flagged).length,
    compared: rows.length,
    names: rows.filter((r) => r.flagged).map((r) => r.name),
  });
};

/** The front's face marks against the kept front's, inside the render's head; none when either face does not read as five marks. */
export const frontFace = (kept: Raster, colour: Raster, ids: Raster): Option.Option<number> => {
  const head = new Uint8Array(ids.width * ids.height).map((_, i) =>
    Number(idAt(ids, i) === PART.head),
  );
  return Option.flatMap(boxOf(head, ids.width), (box) =>
    Option.map(Option.all([faceMarks(kept, box), faceMarks(colour, box)]), ([a, b]) =>
      faceOffset(a, b),
    ),
  );
};

/** A run's renders by name. */
export type Renders = ReadonlyMap<string, Uint8Array>;

/** Every measure of a run, from its renders and the kept views. */
export const measureRun = Effect.fn('Toon3dVerify.measureRun')(function* (
  figure: BuiltFigure,
  plan: Plan,
  kept: ReadonlyMap<ViewName, Raster>,
  jobs: ReadonlyArray<RenderJob>,
  renders: Renders,
  differing: ReadonlyArray<string>,
) {
  const requests = new Map(jobs.map((j) => [j.name, j.request]));
  const raster = (name: string) =>
    Option.match(Option.fromUndefinedOr(renders.get(name)), {
      onNone: () => Effect.fail(VerifyFailed.make({ reason: `no render ${name}` })),
      onSome: decode,
    });
  const views: Array<ViewMeasured> = [];
  let rows: Option.Option<RowsMeasured> = Option.none();
  let face: Option.Option<number> = Option.none();
  for (const view of plan.views) {
    const keptView = kept.get(view);
    if (!keptView) return yield* VerifyFailed.make({ reason: `no kept picture for ${view}` });
    const colour = yield* raster(`views/${view}.png`);
    const ids = yield* raster(`views-ids/${view}.png`);
    views.push(measureView(figure.spec, view, keptView, colour, ids));
    if (view === 'front') {
      rows = frontRows(keptView, colour);
      face = frontFace(keptView, colour, ids);
    }
  }
  const sideSleeve = (k: number) =>
    Effect.gen(function* () {
      const name = `bend-side-ids/${frameName(k)}`;
      const request = requests.get(name);
      if (!request) return yield* VerifyFailed.make({ reason: `no request for ${name}` });
      return sleeveAcross(figure.rightArm(request.pose), request, yield* raster(name));
    });
  const frames = (
    dir: string,
    count: number,
    boxFor: (ids: Raster, colour: Raster) => Box,
    sleeveOf: (k: number) => Effect.Effect<SleeveWidths, VerifyFailed>,
  ) =>
    Effect.forEach(
      Array.from({ length: count }, (_, k) => k),
      (k) =>
        Effect.gen(function* () {
          const colour = yield* raster(`${dir}/${frameName(k)}`);
          const ids = yield* raster(`${dir}-ids/${frameName(k)}`);
          return measureFrame(k, colour, ids, boxFor(ids, colour), yield* sleeveOf(k));
        }),
    );
  const bend = yield* frames(
    'bend',
    bendAngles(plan.bendFrames).length,
    (ids) => armBox(ids),
    sideSleeve,
  );
  const turn = yield* frames(
    'turn',
    turnYaws(plan.turnFrames).length,
    (_, colour) => wholeBox(colour),
    () => Effect.succeed(NO_SLEEVE),
  );
  const measured: Measured = {
    renders: { compared: renders.size, differing },
    views,
    frontRows: rows,
    face,
    bend,
    turn,
  };
  return measured;
});
