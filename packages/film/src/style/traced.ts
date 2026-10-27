// A figure composed from a traced sheet (`film concept trace`'s tables, in
// the sheet's own pixels): each part taken to the cast's canon by one scale
// a sheet (`scale`, units a pixel), the head's parts about the head's centre
// and the body's about the feet, and composed of the house's parts
// (`figure`). Each arm, traced whole as it hangs, is cut at its elbow into
// its upper sleeve and its forearm, the elbow on the line from its shoulder
// to its hand (so it hangs straight at rest and `armReach` bends it from
// there), the two overlapping round the elbow so the joint stays covered;
// the upper sleeve ends at its shoulder in a ball about its pivot, its half
// width across, so it turns onto itself as the arm swings (RIVE.md, "Cut a
// traced mass by what lies in front of it"). Every traced figure takes the
// same numbers (its face's, its stance's, both arms' and their elbows', and
// an open mouth's when it has one), so a pose names them on any view. Pure.

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

/** A colour laid on a part, clipped to it: its pieces in sheet pixels and its colour; `skin` on a garment marks the figure's skin. */
export interface TracedTone {
  readonly pts: ReadonlyArray<ReadonlyArray<Pt>>;
  readonly color: `#${string}`;
  readonly skin?: true;
}

/** A traced arm: its sleeve whole as it hangs, its hand's circle, its paper and what lies on it. */
interface TracedArmSpec {
  readonly outline: ReadonlyArray<Pt>;
  readonly hand: { readonly at: Pt; readonly r: number };
  readonly paper: Paper;
  readonly tones?: ReadonlyArray<TracedTone>;
  /** Where its elbow lies between its shoulder and its hand, a share of the way down (0.45 unless given). */
  readonly elbow?: number;
  /**
   * Where it turns, sheet pixels, when the sheet draws it raised (a forearm
   * up from an elbow on his knee to his hand at his chin, its upper sleeve
   * hidden): it is cut as though turned about here till its hand hangs below
   * it. Unless given, it hangs: its pivot the middle of its sleeve below its top.
   */
  readonly pivot?: Pt;
  /**
   * Where its upper sleeve ends at its shoulder: a ball about its pivot (the
   * hanging default, so it turns with no gap), or `traced`, the sleeve's own
   * traced end, for a sleeve the sheet draws raised clear of its side whose
   * root runs on under its garment there (a ball would show past its edges).
   */
  readonly root?: 'ball' | 'traced';
  /**
   * The shade along its sleeve's edges (`sleeveEdges`), in this colour: what
   * shows the sleeve where it lies on its garment, since no line runs there.
   */
  readonly edge?: `#${string}`;
}

/** What a traced figure is composed of, every point in its sheet's pixels. */
export interface TracedFigureSpec {
  readonly concept: ConceptRef;
  /** Canon units a sheet pixel: one for every view of a sheet. */
  readonly scale: number;
  /** The head's centre and the feet's middle at the soles, the figure's origin. */
  readonly headAt: Pt;
  readonly feet: Pt;
  readonly head: {
    readonly view: 'front' | 'threeQuarter' | 'side' | 'back';
    readonly outline: ReadonlyArray<Pt>;
    readonly paper: Paper;
    readonly tones?: ReadonlyArray<TracedTone>;
    /** `open` where the sheet draws no line under the chin: the head is traced down into the garment's neck, its ink running behind the garment. */
    readonly chin?: 'open';
  };
  readonly hair?: {
    readonly outline: ReadonlyArray<Pt>;
    readonly paper: Paper;
    readonly tones?: ReadonlyArray<TracedTone>;
    /** Its curls (`Hair.Curls`): each a disc, its centre and radius in sheet pixels; the dark of a curl's far side, and the crescent's share of its radius. */
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
  };
  /** The face's marks as the sheet draws them (`tracedKit`), the features' slide after the gaze, the face at rest and where its eyes look. */
  readonly face: {
    readonly marks: Parameters<typeof tracedKit>[0];
    readonly turn: number;
    readonly rest?: Parameters<typeof KitA>[0]['rest'];
    readonly gaze: Pt;
    /** The marks past the kit's it draws (`EXTRA_FACE`): a wince, a glad shut-eyed smile. */
    readonly extra?: ReadonlyArray<ExtraFaceKnob>;
    /** The kit laid over what is cut in his head (`KitA.layer`), so a brow turned into his hairline shows. */
    readonly layer?: 'over';
  };
  /** A mouth thrown open where the kit's mouth sits: its width and height, units, and its paper. */
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
  };
  readonly hands: Paper;
  /** The figure's breath: seconds, the trunk's height at its top against its own, the neck's rise. */
  readonly breath?: { readonly period: number; readonly trunk: number; readonly neck: number };
  /**
   * How its tables write its head's, hair's, ears', body's and arms'
   * outlines and the tones on them: `cubic`, chains of cubics fitted to the
   * sheet (`film concept trace`, a part's `path`); points when left out. Its
   * feet are points either way.
   */
  readonly path?: 'cubic';
}

/** Every traced figure's numbers: its face's, its stance's, both arms' and their elbows'. */
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

/** Two decimals: how a traced point is written into the print. */
const hundredth = (v: number) => +v.toFixed(2);

/** `pts` cut to the side of the row `y` that `keep` names: what lies above it (`above`) or below. */
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

/** The span of `pts` across the row `y`: its leftmost and rightmost crossing. */
const spanAt = (pts: ReadonlyArray<Pt>, y: number): readonly [number, number] => {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[(i + 1) % pts.length] ?? [0, 0];
    if (a[1] <= y !== b[1] <= y) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
  }
  return xs.length === 0 ? [0, 0] : [Math.min(...xs), Math.max(...xs)];
};

/** The point at height `y` on the line from `a` to `b`. */
const onLine = (a: Pt, b: Pt, y: number): Pt => [
  a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
  y,
];

/** The shade's width along a sleeve's inner edge (toward the body) and its outer edge, a share of the sleeve's width. */
const EDGE = { inner: 0.26, outer: 0.12 } as const;

/** The rows a sleeve's edge shade is laid on: enough that its band follows the sleeve's curve. */
const EDGE_ROWS = 24;

/**
 * A sleeve's edge shades as it hangs, sheet pixels: a band down its inner
 * edge (the side toward `centre`, the body's middle) and a thinner one down
 * its outer edge, each from its shoulder's row to its cuff, each its share
 * (`EDGE`) of the sleeve's width at each row. Laid on the sleeve and clipped
 * to it, they turn with it, so a sleeve that lies on its garment shows its
 * edges there (the house draws no line where an arm crosses its garment).
 */
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

/** How far the upper sleeve and the forearm run past the elbow into each other, sheet pixels. */
const ELBOW_OVERLAP = 10;

/** The points round a shoulder's ball, over its top. */
const BALL_POINTS = 9;

/**
 * A traced arm cut at its elbow, in sheet pixels: its pivot (the middle of
 * the sleeve its half width below its top), its elbow on the line from the
 * pivot to its hand, its upper sleeve (to past the elbow, its top a ball
 * about the pivot, or its traced end, `root`) and its forearm (from before
 * the elbow to its cuff).
 */
const cutArm = (arm: TracedArmSpec, outline: ReadonlyArray<Pt>) => {
  if (arm.pivot === undefined) return cutHanging(arm.hand.at, arm.elbow, outline, arm.root);
  // Turned about its pivot till its hand hangs straight below it, cut as a hanging arm, and turned back.
  const [px, py] = arm.pivot;
  const by = Math.PI / 2 - Math.atan2(arm.hand.at[1] - py, arm.hand.at[0] - px);
  const turn =
    (a: number) =>
    ([x, y]: Pt): Pt => [
      px + (x - px) * Math.cos(a) - (y - py) * Math.sin(a),
      py + (x - px) * Math.sin(a) + (y - py) * Math.cos(a),
    ];
  const [to, back] = [turn(by), turn(-by)];
  // Begun at its new top, as a traced outline is begun at its top: its cut sleeve's ends are then the corners at its pivot's row.
  const turned = outline.map(to);
  const first = turned.reduce(
    (best, p, i) => (p[1] < (turned[best]?.[1] ?? Infinity) ? i : best),
    0,
  );
  const begun = [...turned.slice(first), ...turned.slice(0, first)];
  const cut = cutHanging(to(arm.hand.at), arm.elbow, begun, arm.root);
  return {
    pivot: back(cut.pivot),
    elbow: back(cut.elbow),
    upper: cut.upper.map(back),
    forearm: cut.forearm.map(back),
  };
};

/** A hanging arm, its hand below its shoulder, cut at its elbow (`cutArm`). */
const cutHanging = (
  hand: Pt,
  share: number | undefined,
  outline: ReadonlyArray<Pt>,
  root: TracedArmSpec['root'],
) => {
  const top = Math.min(...outline.map(([, y]) => y));
  const [l0, r0] = spanAt(outline, top + 12);
  const half = (r0 - l0) / 2;
  const pivot: Pt = [l0 + half, top + half];
  const elbowY = pivot[1] + (hand[1] - pivot[1]) * (share ?? 0.45);
  const elbow = onLine(pivot, hand, elbowY);
  const below = cutAt(cutAt(outline, elbowY + ELBOW_OVERLAP, 'above'), pivot[1], 'below');
  const [bl, br] = spanAt(outline, pivot[1] + 1);
  const r = Math.max(half, (br - bl) / 2);
  const ball: Pt[] = Array.from({ length: BALL_POINTS }, (_, i) => {
    const a = Math.PI + (i / (BALL_POINTS - 1)) * Math.PI;
    return [pivot[0] + r * Math.cos(a), pivot[1] + r * Math.sin(a)];
  });
  // A ball: the cut sleeve runs clockwise on screen, its top's two corners at the pivot's row its ends. Traced: the sleeve down from its own end.
  const upper =
    root === 'traced'
      ? cutAt(outline, elbowY + ELBOW_OVERLAP, 'above')
      : [...ball, ...below.filter(([, y]) => y > pivot[1] + 0.5)];
  const forearm = cutAt(outline, elbowY - ELBOW_OVERLAP, 'below');
  return { pivot, elbow, upper, forearm };
};

/** How finely a chain is laid as points to be cut or read (`flattened`), sheet pixels. */
const FLAT_STEP = 1;

/** `p` turned `by` radians about the figure's feet, its origin. */
const leanedBy = ([x, y]: Pt, by: number): Pt => {
  const [c, sn] = [Math.cos(by), Math.sin(by)];
  return [x * c - y * sn, x * sn + y * c];
};

/**
 * Where a traced figure's hands lie with its numbers at `n` (any left out at
 * rest), units from its feet: each arm's hand turned and bent by its numbers
 * (`armHand`), then leaned with the body about the feet. The host draws its
 * circle hands there, each at its cuff.
 */
export const tracedHands = (
  arms: { readonly near: JointedArm; readonly far: JointedArm },
  n: Readonly<Partial<Record<TracedKnob, number>>>,
) => ({
  near: leanedBy(armHand(arms.near, n.nearArm ?? 0, n.nearElbow ?? 0), n.lean ?? 0),
  far: leanedBy(armHand(arms.far, n.farArm ?? 0, n.farElbow ?? 0), n.lean ?? 0),
});

/**
 * A figure composed from `spec`'s traced parts, standing on its feet: each
 * part in the cast's canon, its head about its centre, its body about its
 * feet; its arms cut at their elbows (`cutArm`), its circle hands at their
 * cuffs. Its numbers are every traced figure's (`TracedKnob`), and an open
 * mouth's (`shout`) when it has one.
 */
export const tracedFigure = (spec: TracedFigureSpec) => {
  const s = spec.scale;
  const cubic = spec.path === 'cubic';
  // A chain's points are its anchors and handles: what is read off its line is read off the line laid as points.
  const line = (pts: ReadonlyArray<Pt>) => (cubic ? flattened(pts, FLAT_STEP * s) : pts);
  // A polygon the house would draw smooth through its points, as a chain when the figure's outlines are chains.
  const asPath = (pts: ReadonlyArray<Pt>) => (cubic ? chainThrough(pts) : [...pts]);
  // A cut sheet outline fitted again as a chain, when the figure's outlines are chains.
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
  // The house reads a head's width off its outline's points (`figure`, its hands' size): so is it read here.
  const headWidth =
    Math.max(...headOutline.map(([x]) => x)) - Math.min(...headOutline.map(([x]) => x));
  // The sheet draws both hands one size; the larger traced circle is that size, so each touches its cuff.
  const handR = Math.max(spec.arms.near.hand.r, spec.arms.far.hand.r);
  const handShare = hundredth((2 * handR * s) / headWidth);
  // Room round him for his head's tilt, his arms' reach and his outline; his feet are the rig's origin.
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
    ear:
      ears === undefined
        ? undefined
        : ears.near !== undefined && ears.far !== undefined
          ? Ear.Both({ near: head(ears.near), far: head(ears.far), paper: ears.paper })
          : Ear.Traced({ outline: head(ears.near ?? ears.far ?? []), paper: ears.paper }),
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
    }),
    hands: Hands({ paper: spec.hands, share: handShare }),
    path: spec.path,
  });
  // Every traced figure's numbers, and the extra marks' where its face opts into them.
  const knobs: Readonly<Record<Exclude<TracedKnob, ExtraFaceKnob>, number>> &
    Readonly<Partial<Record<ExtraFaceKnob, number>>> = f.knobs;
  return {
    figure: f,
    /** Its view model's numbers, every traced figure's (`TracedKnob`). */
    knobs,
    /** Its view model's numbers by name, as a rig declares them (`RivePropSpec.source.numbers`). */
    numbers: Object.keys(knobs).filter((k): k is TracedKnob => k in f.knobs),
    /** Its arms, for the host that draws its hands: each reaches its hand to a point (`armReach`), its hand at rest, its shoulder. */
    arms: { near, far },
    /** Its hands' circle across, units. */
    hand: hundredth(2 * handR * s),
    /** The face `check` reads (`RivePropSpec.face`): its node, and its head's height, units. */
    face: { node: 'face', height: hundredth(chin - Math.min(...ys)) } as const,
  };
};
