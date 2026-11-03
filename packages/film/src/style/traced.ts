import { SHEET_FIT, chainThrough, fitClosed, flattened } from '../core/fit.ts';
import type { ConceptRef } from '../core/match.ts';
import { figure } from './figure.ts';
import type { Paper } from './paper.ts';
import { Ear } from './parts/ear.ts';
import { Hair } from './parts/hair.ts';
import { Hands } from './parts/hands.ts';
import { Headcloth } from './parts/headcloth.ts';
import { Head } from './parts/head.ts';
import { JointedArm, armHand } from './parts/arm.ts';
import { KitA, tracedKit } from './parts/kit.ts';
import { OpenMouth } from './parts/mouth.ts';
import { Robe } from './parts/body.ts';
import { Sandals } from './parts/feet.ts';
import { Stance } from './parts/stance.ts';
import { Stature } from './parts/stature.ts';
import type { ExtraFaceKnob, FaceKnob, Pt } from './rig/parts.ts';

export interface TracedTone {
  readonly pts: ReadonlyArray<ReadonlyArray<Pt>>;
  readonly color: `#${string}`;
  readonly skin?: true;
}

interface TracedArmSpec {
  readonly outline: ReadonlyArray<Pt>;
  readonly hand: { readonly at: Pt; readonly r: number };
  readonly paper: Paper;
  readonly tones?: ReadonlyArray<TracedTone>;
  readonly elbow?: number;
  readonly pivot?: Pt;
  readonly root?: 'ball' | 'traced';
  readonly edge?: `#${string}`;
}

export interface TracedFigureSpec {
  readonly concept: ConceptRef;
  readonly scale: number;
  readonly headAt: Pt;
  readonly feet: Pt;
  readonly head: {
    readonly view: 'front' | 'threeQuarter' | 'side' | 'back';
    readonly outline: ReadonlyArray<Pt>;
    readonly paper: Paper;
    readonly tones?: ReadonlyArray<TracedTone>;
    readonly chin?: 'open';
  };
  readonly hair?: {
    readonly outline: ReadonlyArray<Pt>;
    readonly paper: Paper;
    readonly tones?: ReadonlyArray<TracedTone>;
    readonly curls?: {
      readonly discs: ReadonlyArray<{ readonly at: Pt; readonly r: number }>;
      readonly shade: `#${string}`;
      readonly crescent: number;
    };
  };
  readonly headcloth?: { readonly outline: ReadonlyArray<Pt>; readonly paper: Paper };
  readonly ears?: {
    readonly near?: ReadonlyArray<Pt>;
    readonly far?: ReadonlyArray<Pt>;
    readonly paper: Paper;
    readonly tones?: ReadonlyArray<TracedTone>;
  };
  readonly face: {
    readonly marks: Parameters<typeof tracedKit>[0];
    readonly turn: number;
    readonly rest?: Parameters<typeof KitA>[0]['rest'];
    readonly gaze: Pt;
    readonly extra?: ReadonlyArray<ExtraFaceKnob>;
    readonly layer?: 'over';
  };
  readonly mouth?: { readonly w: number; readonly h: number; readonly paper: `#${string}` };
  readonly body: {
    readonly outline: ReadonlyArray<Pt>;
    readonly paper: Paper;
    readonly tones?: ReadonlyArray<TracedTone>;
  };
  readonly arms: { readonly near: TracedArmSpec; readonly far: TracedArmSpec };
  readonly feet_: {
    readonly near: {
      readonly outline: ReadonlyArray<Pt>;
      readonly tones?: ReadonlyArray<TracedTone>;
    };
    readonly far: {
      readonly outline: ReadonlyArray<Pt>;
      readonly tones?: ReadonlyArray<TracedTone>;
    };
    readonly paper: Paper;
    readonly sole: `#${string}`;
    readonly soleDepth?: number;
  };
  readonly hands: Paper;
  readonly breath?: { readonly period: number; readonly trunk: number; readonly neck: number };
  readonly path?: 'cubic';
}

export type TracedKnob =
  | FaceKnob
  | ExtraFaceKnob
  | 'lean'
  | 'tilt'
  | 'nod'
  | 'nearArm'
  | 'nearElbow'
  | 'farArm'
  | 'farElbow';

const hundredth = (v: number) => +v.toFixed(2);

const cutAt = (pts: ReadonlyArray<Pt>, y: number, keep: 'above' | 'below'): Pt[] => {
  const inside = (p: Pt) => (keep === 'above' ? p[1] <= y : p[1] >= y);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[(i + 1) % pts.length] ?? [0, 0];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, y]);
    }
  }
  return out;
};

const spanAt = (pts: ReadonlyArray<Pt>, y: number): readonly [number, number] => {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[(i + 1) % pts.length] ?? [0, 0];
    if (a[1] <= y !== b[1] <= y) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
  }
  return xs.length === 0 ? [0, 0] : [Math.min(...xs), Math.max(...xs)];
};

const onLine = (a: Pt, b: Pt, y: number): Pt => [
  a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
  y,
];

const EDGE = { inner: 0.26, outer: 0.12 } as const;

const EDGE_ROWS = 24;

const sleeveEdges = (
  outline: ReadonlyArray<Pt>,
  centre: number,
): ReadonlyArray<ReadonlyArray<Pt>> => {
  const ys = outline.map(([, y]) => y);
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  const rows = Array.from(
    { length: EDGE_ROWS + 1 },
    (_, i) => top + 2 + ((bottom - top - 4) * i) / EDGE_ROWS,
  );
  const spans = rows.map((y) => ({ y, span: spanAt(outline, y) }));
  const [l0, r0] = spanAt(outline, (top + bottom) / 2);
  const innerLeft = (l0 + r0) / 2 > centre;
  const band = (left: boolean, share: number): Pt[] => {
    const edge = spans.map(({ y, span: [l, r] }): Pt => [left ? l - 2 : r + 2, y]);
    const inside = spans.map(({ y, span: [l, r] }): Pt => [
      left ? l + (r - l) * share : r - (r - l) * share,
      y,
    ]);
    return [...edge, ...inside.reverse()];
  };
  return [band(innerLeft, EDGE.inner), band(!innerLeft, EDGE.outer)];
};

const ELBOW_OVERLAP = 10;

const BALL_POINTS = 9;

const cutArm = (arm: TracedArmSpec, outline: ReadonlyArray<Pt>) => {
  if (arm.pivot === undefined) return cutHanging(arm.hand.at, arm.elbow, outline, arm.root);
  const [px, py] = arm.pivot;
  const by = Math.PI / 2 - Math.atan2(arm.hand.at[1] - py, arm.hand.at[0] - px);
  const turn =
    (a: number) =>
    ([x, y]: Pt): Pt => [
      px + (x - px) * Math.cos(a) - (y - py) * Math.sin(a),
      py + (x - px) * Math.sin(a) + (y - py) * Math.cos(a),
    ];
  const [to, back] = [turn(by), turn(-by)];
  const turned = outline.map(to);
  const first = turned.reduce(
    (best, p, i) => (p[1] < (turned[best]?.[1] ?? Infinity) ? i : best),
    0,
  );
  const begun = [...turned.slice(first), ...turned.slice(0, first)];
  const cut = cutHanging(to(arm.hand.at), arm.elbow, begun, arm.root, arm.pivot);
  return {
    pivot: arm.pivot,
    elbow: back(cut.elbow),
    upper: cut.upper.map(back),
    forearm: cut.forearm.map(back),
  };
};

const cutHanging = (
  hand: Pt,
  share: number | undefined,
  outline: ReadonlyArray<Pt>,
  root: TracedArmSpec['root'],
  given?: Pt,
) => {
  const top = Math.min(...outline.map(([, y]) => y));
  const [l0, r0] = spanAt(outline, top + 12);
  const half = (r0 - l0) / 2;
  const pivot: Pt = given ?? [l0 + half, top + half];
  const elbowY = pivot[1] + (hand[1] - pivot[1]) * (share ?? 0.45);
  const elbow = onLine(pivot, hand, elbowY);
  const below = cutAt(cutAt(outline, elbowY + ELBOW_OVERLAP, 'above'), pivot[1], 'below');
  const [bl, br] = spanAt(outline, pivot[1] + 1);
  const r = Math.max(half, (br - bl) / 2);
  const ball: Pt[] = Array.from({ length: BALL_POINTS }, (_, i) => {
    const a = Math.PI + (i / (BALL_POINTS - 1)) * Math.PI;
    return [pivot[0] + r * Math.cos(a), pivot[1] + r * Math.sin(a)];
  });
  const upper =
    root === 'traced'
      ? cutAt(outline, elbowY + ELBOW_OVERLAP, 'above')
      : [...ball, ...below.filter(([, y]) => y > pivot[1] + 0.5)];
  const forearm = cutAt(outline, elbowY - ELBOW_OVERLAP, 'below');
  return { pivot, elbow, upper, forearm };
};

const FLAT_STEP = 1;

const leanedBy = ([x, y]: Pt, by: number): Pt => {
  const [c, sn] = [Math.cos(by), Math.sin(by)];
  return [x * c - y * sn, x * sn + y * c];
};

export const tracedHands = (
  arms: { readonly near: JointedArm; readonly far: JointedArm },
  n: Readonly<Partial<Record<TracedKnob, number>>>,
) => ({
  near: leanedBy(armHand(arms.near, n.nearArm ?? 0, n.nearElbow ?? 0), n.lean ?? 0),
  far: leanedBy(armHand(arms.far, n.farArm ?? 0, n.farElbow ?? 0), n.lean ?? 0),
});

export const tracedFigure = (spec: TracedFigureSpec) => {
  const s = spec.scale;
  const cubic = spec.path === 'cubic';
  const line = (pts: ReadonlyArray<Pt>) => (cubic ? flattened(pts, FLAT_STEP * s) : pts);
  const asPath = (pts: ReadonlyArray<Pt>) => (cubic ? chainThrough(pts) : [...pts]);
  const refit = (pts: ReadonlyArray<Pt>) => (cubic ? fitClosed(pts, SHEET_FIT) : [...pts]);
  const fromHead = ([x, y]: Pt): Pt => [
    hundredth((x - spec.headAt[0]) * s),
    hundredth((y - spec.headAt[1]) * s),
  ];
  const fromFeet = ([x, y]: Pt): Pt => [
    hundredth((x - spec.feet[0]) * s),
    hundredth((y - spec.feet[1]) * s),
  ];
  const head = (pts: ReadonlyArray<Pt>) => pts.map(fromHead);
  const body = (pts: ReadonlyArray<Pt>) => pts.map(fromFeet);
  const toned = (to: (pts: ReadonlyArray<Pt>) => Pt[], tones: ReadonlyArray<TracedTone> = []) =>
    tones.flatMap((t) =>
      t.pts.map((pts) =>
        t.skin === true
          ? { pts: to(pts), color: t.color, skin: true as const }
          : { pts: to(pts), color: t.color },
      ),
    );
  const headOutline = head(spec.head.outline);
  const ys = line(headOutline).map(([, y]) => y);
  const headY = hundredth((spec.headAt[1] - spec.feet[1]) * s);
  const chin = Math.max(...ys);
  const armOf = (arm: TracedArmSpec) => {
    const outline = cubic ? flattened(arm.outline, FLAT_STEP) : arm.outline;
    const cut = cutArm(arm, outline);
    const edges: ReadonlyArray<TracedTone> =
      arm.edge === undefined
        ? []
        : [{ pts: sleeveEdges(outline, spec.headAt[0]).map(asPath), color: arm.edge }];
    const tones = [...edges, ...(arm.tones ?? [])];
    return JointedArm({
      pivot: fromFeet(cut.pivot),
      rest: 0,
      outline: body(refit(cut.upper)),
      elbow: fromFeet(cut.elbow),
      bend: 0,
      forearm: body(refit(cut.forearm)),
      hand: fromFeet(arm.hand.at),
      paper: arm.paper,
      tones: toned(body, tones),
      forearmTones: toned(body, tones),
    });
  };
  const near = armOf(spec.arms.near);
  const far = armOf(spec.arms.far);
  const bodyOutline = body(spec.body.outline);
  const hem = Math.max(...line(bodyOutline).map(([, y]) => y));
  const headWidth =
    Math.max(...headOutline.map(([x]) => x)) - Math.min(...headOutline.map(([x]) => x));
  const handR = Math.max(spec.arms.near.hand.r, spec.arms.far.hand.r);
  const handShare = hundredth((2 * handR * s) / headWidth);
  const all = [...line(bodyOutline), ...line(headOutline).map(([x, y]): Pt => [x, y + headY])];
  const reach = Math.max(...all.map(([x]) => Math.abs(x))) + 120;
  const top = Math.min(...all.map(([, y]) => y)) - 60;
  const feet: Pt = [Math.ceil(reach), Math.ceil(-top)];
  const art = { width: Math.ceil(2 * reach), height: Math.ceil(-top + 30), feet };
  const kit = tracedKit(spec.face.marks, { scale: s, head: spec.headAt }, spec.face.turn);
  const ears = spec.ears;
  const gazed =
    spec.face.rest === undefined
      ? { ...kit, gaze: spec.face.gaze }
      : { ...kit, rest: spec.face.rest, gaze: spec.face.gaze };
  const rested = spec.face.layer === undefined ? gazed : { ...gazed, layer: spec.face.layer };
  const hairOf = (hair: TracedFigureSpec['hair']) => {
    if (hair === undefined) return undefined;
    const traced = {
      outline: head(hair.outline),
      paper: hair.paper,
      tones: toned(head, hair.tones),
    };
    return hair.curls === undefined
      ? Hair.Traced(traced)
      : Hair.Curls({
          ...traced,
          curls: hair.curls.discs.map((c) => ({ at: fromHead(c.at), r: hundredth(c.r * s) })),
          shade: hair.curls.shade,
          crescent: hair.curls.crescent,
        });
  };
  const earOf = (e: NonNullable<TracedFigureSpec['ears']>) => {
    const tones = e.tones === undefined ? undefined : toned(head, e.tones);
    if (e.near !== undefined && e.far !== undefined) {
      const both = { near: head(e.near), far: head(e.far), paper: e.paper };
      return tones === undefined ? Ear.Both(both) : Ear.Both({ ...both, tones });
    }
    const one = { outline: head(e.near ?? e.far ?? []), paper: e.paper };
    return tones === undefined ? Ear.Traced(one) : Ear.Traced({ ...one, tones });
  };
  const tracedHead = {
    view: spec.head.view,
    outline: headOutline,
    y: headY,
    neck: hundredth(headY + chin),
    set: { x: hundredth((spec.headAt[0] - spec.feet[0]) * s) },
    paper: spec.head.paper,
    tones: toned(head, spec.head.tones),
  };
  const f = figure({
    concept: spec.concept,
    art,
    stature: Stature.Canon(),
    stance: Stance.Standing({ breath: spec.breath ?? { period: 4, trunk: 1.01, neck: -2 } }),
    head: Head.Traced(
      spec.head.chin === undefined ? tracedHead : { ...tracedHead, chin: spec.head.chin },
    ),
    hair: hairOf(spec.hair),
    headcloth:
      spec.headcloth === undefined
        ? undefined
        : Headcloth({ outline: head(spec.headcloth.outline), paper: spec.headcloth.paper }),
    ear: ears === undefined ? undefined : earOf(ears),
    face: KitA(spec.face.extra === undefined ? rested : { ...rested, extra: spec.face.extra }),
    mouth: spec.mouth === undefined ? undefined : OpenMouth(spec.mouth),
    body: Robe.Traced({
      outline: bodyOutline,
      hem,
      paper: spec.body.paper,
      tones: toned(body, spec.body.tones),
    }),
    arms: { near, far },
    feet: Sandals({
      paper: spec.feet_.paper,
      near: {
        corners: body(spec.feet_.near.outline),
        radii: [1],
        tones: toned(body, spec.feet_.near.tones),
      },
      far: {
        corners: body(spec.feet_.far.outline),
        radii: [1],
        tones: toned(body, spec.feet_.far.tones),
      },
      sole: spec.feet_.sole,
      soleDepth: spec.feet_.soleDepth,
    }),
    hands: Hands({ paper: spec.hands, share: handShare }),
    path: spec.path,
  });
  const knobs: Readonly<Record<Exclude<TracedKnob, ExtraFaceKnob>, number>> &
    Readonly<Partial<Record<ExtraFaceKnob, number>>> = f.knobs;
  return {
    figure: f,
    knobs,
    numbers: Object.keys(knobs).filter((k): k is TracedKnob => k in f.knobs),
    arms: { near, far },
    hand: hundredth(2 * handR * s),
    face: { node: 'face', height: hundredth(chin - Math.min(...ys)) } as const,
  };
};
