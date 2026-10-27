// The series lead, the young man at the feast, composed from each view of
// his kept sheets (`<view>-traced.ts`, written by `film concept trace` from
// `trace.ts`): one composition a view, each its own trace (his mantle makes
// him asymmetric and the key light is upper left, so no view is a mirror of
// another), laid in each film's figures file. Every view is composed the one
// way (`leadView`): his traced head with his curls (their light and dark laid
// on them as tones), his ears cut inside it, and Kit A's marks where the
// sheet draws them; a head whose chin is open traced down into his garment's
// neck, the shade under his jaw a tone on it; his tunic and the mantle over
// it as one garment, the mantle and its far side, the sash, its knot and
// their rose edge and (from behind) his neck laid on it as tones; his two
// arms in their sleeves, each cut at its elbow, his right sleeve cream and
// his left teal; his feet in their sandals, each strap laid on its foot; his
// circle hands drawn by the host at his cuffs. Units are the cast's canon, one
// scale a sheet (`SHEETS`): he stands 440 from his hair to his soles, 3.36 of
// his heads, 0.94 of Christ's 468 (look.md). Pure.

import { type Pt, type TracedFigureSpec, type TracedTone, tracedFigure } from '@manna/film/style';
import * as BACK from './back-traced.ts';
import * as FRONT from './front-traced.ts';
import { PAPERS, TONES } from './papers.ts';
import * as PROFILE_LEFT from './profile-left-traced.ts';
import * as PROFILE_RIGHT from './profile-right-traced.ts';
import * as SEATED from './seated-traced.ts';
import * as THREE_QUARTER_LEFT from './three-quarter-left-traced.ts';
import * as THREE_QUARTER_RIGHT from './three-quarter-right-traced.ts';

/** His height in the cast's canon, from his hair to his soles. */
const LEAD_FEAST_HEIGHT = 440;

/**
 * Each sheet's scale, canon units a sheet pixel, from the sheet's anchor
 * view: the turnaround's front, his hair's top to his soles 440.
 */
export const SHEETS = {
  turnaround: { scale: LEAD_FEAST_HEIGHT / (FRONT.FEET[1] - FRONT.HEAD_AT.top) },
  // His poses: poses-5, his front at rest, his hair (row 225) to his soles (row 829).
  poses: { scale: LEAD_FEAST_HEIGHT / (829 - 225) },
} as const;

type Pieces = ReadonlyArray<ReadonlyArray<Pt>>;

/** A view's traced table, as `film concept trace` writes it from `trace.ts`: every view's parts, each tone with no pieces where the view shows none. */
interface LeadTable {
  readonly BOX: readonly [number, number, number, number];
  readonly HEAD_AT: { readonly at: Pt; readonly top: number; readonly height: number };
  readonly FEET: Pt;
  readonly HEAD: ReadonlyArray<Pt>;
  readonly HAIR: ReadonlyArray<Pt>;
  readonly HAIR_LIGHT: Pieces;
  readonly HAIR_DARK: Pieces;
  readonly CURLS: ReadonlyArray<{ readonly at: Pt; readonly r: number }>;
  readonly NECK_SHADE: Pieces;
  readonly JAW: Pieces;
  readonly BODY: ReadonlyArray<Pt>;
  readonly SKIN: Pieces;
  readonly NECK: Pieces;
  readonly MANTLE: Pieces;
  readonly MANTLE_SHADE: Pieces;
  readonly SASH_SHADE: Pieces;
  readonly SASH: Pieces;
  readonly KNOT_SHADE: Pieces;
  readonly KNOT: Pieces;
  readonly ARM_NEAR: ReadonlyArray<Pt>;
  readonly ARM_FAR: ReadonlyArray<Pt>;
  readonly HAND_NEAR: { readonly at: Pt; readonly r: number };
  readonly HAND_FAR: { readonly at: Pt; readonly r: number };
  readonly FOOT_NEAR: ReadonlyArray<Pt>;
  readonly FOOT_FAR: ReadonlyArray<Pt>;
  readonly STRAP_NEAR: Pieces;
  readonly STRAP_FAR: Pieces;
}

/** How a view of him differs: its sheet, his head (its side and chin), his ears, his face's marks, slide and rest, which sleeve is near. */
interface LeadViewSpec {
  readonly sheet: keyof typeof SHEETS;
  readonly head: Pick<TracedFigureSpec['head'], 'view' | 'chin'>;
  /** The ears that show, as the view's table traces them. */
  readonly ears: { readonly near: ReadonlyArray<Pt>; readonly far?: ReadonlyArray<Pt> };
  /** His face's marks; from behind, the front's laid where his hair covers them. */
  readonly face: Omit<TracedFigureSpec['face'], 'gaze'>;
  /** Which sleeve each arm is in: his right arm's is cream (`creamAcross` where it crosses his cream tunic whole, seated), his left's teal. */
  readonly sleeves: { readonly near: keyof typeof SLEEVE; readonly far: keyof typeof SLEEVE };
}

/** A tone of `color` on `pts` (none drawn where it has no pieces). */
const tone = (pts: Pieces, color: `#${string}`): TracedTone => ({ pts, color });

/** The paper of each sleeve by its cloth. */
const SLEEVE = {
  cream: PAPERS.sleeve,
  creamAcross: PAPERS.sleeveAcross,
  teal: PAPERS.mantleSleeve,
} as const;

/** The shade along each sleeve's edges, by its cloth: what shows it where it lies on his garment. */
const SLEEVE_EDGE = {
  cream: TONES.creamEdge,
  creamAcross: TONES.creamAcross,
  teal: TONES.tealEdge,
} as const;

/** How far each curl's lit disc lies toward the light, a share of its radius: the dark crescent under it, as the sheet paints his curls. */
const CURL_CRESCENT = 0.35;

/** Where his eyes rest: ahead, a little down. */
const GAZE: Pt = [0, 40];

/** One view of him, composed from its traced table `t` as `v` says. */
const leadView = (t: LeadTable, v: LeadViewSpec) =>
  tracedFigure({
    concept: { image: { cast: 'lead-feast', sheet: v.sheet }, box: t.BOX },
    scale: SHEETS[v.sheet].scale,
    headAt: t.HEAD_AT.at,
    feet: t.FEET,
    path: 'cubic',
    head: {
      ...v.head,
      outline: t.HEAD,
      paper: PAPERS.skin,
      tones: [tone(t.JAW, TONES.jaw)],
    },
    hair: {
      outline: t.HAIR,
      paper: PAPERS.hair,
      tones: [tone(t.HAIR_LIGHT, TONES.hairLight), tone(t.HAIR_DARK, TONES.hairShade)],
      curls: { discs: t.CURLS, shade: TONES.hairShade, crescent: CURL_CRESCENT },
    },
    ears: { ...v.ears, paper: PAPERS.ear },
    face: { ...v.face, gaze: GAZE },
    body: {
      outline: t.BODY,
      paper: PAPERS.tunic,
      tones: [
        { ...tone(t.SKIN, PAPERS.skin.color), skin: true },
        { ...tone(t.NECK_SHADE, TONES.neck), skin: true },
        { ...tone(t.NECK, TONES.neck), skin: true },
        tone(t.MANTLE, TONES.mantle),
        tone(t.MANTLE_SHADE, TONES.mantleShade),
        tone(t.SASH_SHADE, TONES.sashShade),
        tone(t.SASH, TONES.sash),
        tone(t.KNOT_SHADE, TONES.sashShade),
        tone(t.KNOT, TONES.sash),
      ],
    },
    arms: {
      near: {
        outline: t.ARM_NEAR,
        hand: t.HAND_NEAR,
        paper: SLEEVE[v.sleeves.near],
        edge: SLEEVE_EDGE[v.sleeves.near],
      },
      far: {
        outline: t.ARM_FAR,
        hand: t.HAND_FAR,
        paper: SLEEVE[v.sleeves.far],
        edge: SLEEVE_EDGE[v.sleeves.far],
      },
    },
    feet_: {
      near: { outline: t.FOOT_NEAR, tones: [tone(t.STRAP_NEAR, TONES.strap)] },
      far: { outline: t.FOOT_FAR, tones: [tone(t.STRAP_FAR, TONES.strap)] },
      paper: PAPERS.foot,
      sole: TONES.sole,
    },
    hands: PAPERS.hand,
  });

/** `m` moved by `d`, sheet pixels: a face's marks laid on another view's head. */
const shifted = (
  m: TracedFigureSpec['face']['marks'],
  [dx, dy]: Pt,
): TracedFigureSpec['face']['marks'] => {
  const by = ([x, y]: Pt): Pt => [x + dx, y + dy];
  return {
    ...m,
    eyes: [by(m.eyes[0]), by(m.eyes[1])],
    brows: [
      [by(m.brows[0][0]), by(m.brows[0][1])],
      [by(m.brows[1][0]), by(m.brows[1][1])],
    ],
    mouth: [by(m.mouth[0]), by(m.mouth[1])],
  };
};

/**
 * The marks past Kit A's his face draws where both eyes show (his heads
 * sheet): a wince and a glad shut-eyed smile. A profile's one eye takes
 * neither.
 */
const WITH_EXTRA = ['wince', 'glad'] as const;

/** His face at rest: the features slid half after his gaze, a small smile; laid over his hair, so a brow knit up into his hairline shows. */
const AT_REST = { turn: 0.5, rest: { mouth: 2.5 }, layer: 'over' } as const;

/** His front view: turned to us, a small smile; his cream right sleeve on screen left, his teal left on screen right. */
export const leadFeastFront = leadView(FRONT, {
  sheet: 'turnaround',
  head: { view: 'front' },
  ears: { near: FRONT.EAR_NEAR, far: FRONT.EAR_FAR },
  face: { ...AT_REST, marks: FRONT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

/** Three-quarters to screen left: his face slid toward it, his ear behind; his cream right sleeve near us, his teal left far. */
export const leadFeastThreeQuarterLeft = leadView(THREE_QUARTER_LEFT, {
  sheet: 'turnaround',
  head: { view: 'threeQuarter' },
  ears: { near: THREE_QUARTER_LEFT.EAR_NEAR },
  face: { ...AT_REST, marks: THREE_QUARTER_LEFT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

/** In profile to screen left: one eye, his ear behind his cheek, his teal left sleeve hanging over his side. */
export const leadFeastProfileLeft = leadView(PROFILE_LEFT, {
  sheet: 'turnaround',
  head: { view: 'side' },
  ears: { near: PROFILE_LEFT.EAR_NEAR },
  face: { ...AT_REST, marks: PROFILE_LEFT.MARKS },
  sleeves: { near: 'teal', far: 'teal' },
});

/** From behind: his curls over his whole head, his ears either side; his teal left sleeve on screen left, his cream right on screen right; his face, under his hair, is the front's. */
export const leadFeastBack = leadView(BACK, {
  sheet: 'turnaround',
  head: { view: 'back' },
  ears: { near: BACK.EAR_NEAR, far: BACK.EAR_FAR },
  face: {
    turn: AT_REST.turn,
    marks: shifted(FRONT.MARKS, [
      BACK.HEAD_AT.at[0] - FRONT.HEAD_AT.at[0],
      BACK.HEAD_AT.at[1] - FRONT.HEAD_AT.at[1],
    ]),
  },
  sleeves: { near: 'teal', far: 'cream' },
});

/** In profile to screen right: one eye, his ear behind his cheek, his cream right sleeve hanging over his side, the mantle a strip down his back. */
export const leadFeastProfileRight = leadView(PROFILE_RIGHT, {
  sheet: 'turnaround',
  head: { view: 'side' },
  ears: { near: PROFILE_RIGHT.EAR_NEAR },
  face: { ...AT_REST, marks: PROFILE_RIGHT.MARKS },
  sleeves: { near: 'cream', far: 'cream' },
});

/** Three-quarters to screen right: his face slid toward it, his ear behind; his cream right sleeve on screen left, his teal left on screen right. */
export const leadFeastThreeQuarterRight = leadView(THREE_QUARTER_RIGHT, {
  sheet: 'turnaround',
  head: { view: 'threeQuarter' },
  ears: { near: THREE_QUARTER_RIGHT.EAR_NEAR },
  face: { ...AT_REST, marks: THREE_QUARTER_RIGHT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

/**
 * His three-quarter-left arms laid on his seated view: each arm's outline and
 * hand taken from the turnaround's pixels to the poses sheet's (one scale
 * each, the same units) about his head's centre, so they hang from his
 * shoulders as they do standing. The seated sheet draws one sleeve raised to
 * his chin and the other on his lap, the upper sleeve hidden, so neither
 * traces as an arm cut at its elbow; his standing arms, posed by their
 * numbers, reach there (`rigs/cast.ts`).
 */
const seatedArms = () => {
  const k = SHEETS.turnaround.scale / SHEETS.poses.scale;
  const [fx, fy] = THREE_QUARTER_LEFT.HEAD_AT.at;
  const [tx, ty] = SEATED.HEAD_AT.at;
  const moved = ([x, y]: Pt): Pt => [tx + (x - fx) * k, ty + (y - fy) * k];
  const hand = (h: { readonly at: Pt; readonly r: number }) => ({ at: moved(h.at), r: h.r * k });
  return {
    ARM_NEAR: THREE_QUARTER_LEFT.ARM_NEAR.map(moved),
    ARM_FAR: THREE_QUARTER_LEFT.ARM_FAR.map(moved),
    HAND_NEAR: hand(THREE_QUARTER_LEFT.HAND_NEAR),
    HAND_FAR: hand(THREE_QUARTER_LEFT.HAND_FAR),
  };
};

/** Seated on a low stool, three-quarters to screen left (poses-3): his robe over his knees, his sandals under its hem; his arms his standing ones. */
export const leadFeastSeated = leadView(
  { ...SEATED, ...seatedArms() },
  {
    sheet: 'poses',
    head: { view: 'threeQuarter' },
    ears: { near: SEATED.EAR_NEAR },
    face: { ...AT_REST, marks: SEATED.MARKS, extra: WITH_EXTRA },
    sleeves: { near: 'creamAcross', far: 'teal' },
  },
);
