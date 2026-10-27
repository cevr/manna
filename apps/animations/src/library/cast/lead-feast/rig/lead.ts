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
import * as DRINKING from './drinking-traced.ts';
import * as RAISED from './raised-traced.ts';
import * as REACHING from './reaching-traced.ts';
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
  /** The brown band round an ear, laid on his head (a front's): present when the spec that wrote the table reads an `earBand` part. */
  readonly EAR_BAND?: Pieces;
  /** The light on his ears, their lit rim (traced with `EAR_BAND`). */
  readonly EAR_LIGHT?: Pieces;
  /** An ear turned to the light, lit as his face but for its hollow (traced where the view reads `earLit`). */
  readonly EAR_LIT?: Pieces;
  /** The hollow of an ear in shade (traced with `EAR_BAND`). */
  readonly EAR_HOLLOW?: Pieces;
  /** An ear where it turns from the light (traced with `EAR_BAND`). */
  readonly EAR_SHADE?: Pieces;
  /** The rose shade under his jaw's line, on his head and his neck (traced with `EAR_BAND`). */
  readonly JAW_SHADE?: Pieces;
  /** The soft rose round that shade (traced with `EAR_BAND`). */
  readonly JAW_SOFT?: Pieces;
  /** His jaw's line where it lightens toward his ear (traced with `EAR_BAND`). */
  readonly JAW_FADE?: Pieces;
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
  /** The colour of the line his jaw lays under his chin (`JAW`): the sheet's brown where it paints one (`TONES.chinLine`), else his deep neck shade. */
  readonly jaw?: `#${string}`;
  /** The colour of his neck where it shows as a tone on his garment (`NECK`, from behind): his skin where the sheet paints it lit under the shade his hair lays on it, else his neck's shade. */
  readonly neck?: `#${string}`;
  /** The ears that show, as the view's table traces them. */
  readonly ears: { readonly near: ReadonlyArray<Pt>; readonly far?: ReadonlyArray<Pt> };
  /** His face's marks; from behind, the front's laid where his hair covers them. */
  readonly face: Omit<TracedFigureSpec['face'], 'gaze'>;
  /** Which sleeve each arm is in: his right arm's is cream (`creamAcross` where it crosses his cream tunic whole, seated), his left's teal. */
  readonly sleeves: { readonly near: keyof typeof SLEEVE; readonly far: keyof typeof SLEEVE };
  /** His near arm as the view draws it: where it turns when raised, sheet pixels (`TracedArmSpec.pivot`; seated, his elbow on his knee), and what lies on its sleeve (in profile, its cuff). */
  readonly nearArm?: ArmOf;
  /** His far arm as the view draws it, as his near arm's. */
  readonly farArm?: ArmOf;
}

/** An arm as a view draws it: where it turns when raised, sheet pixels (`TracedArmSpec.pivot`), its elbow's share, where its upper sleeve ends (`root`), and what lies on its sleeve. */
interface ArmOf {
  readonly pivot?: Pt;
  readonly elbow?: number;
  readonly root?: 'ball' | 'traced';
  readonly tones?: ReadonlyArray<TracedTone>;
}

/** A tone of `color` on `pts` (none drawn where it has no pieces). */
const tone = (pts: Pieces, color: `#${string}`): TracedTone => ({ pts, color });

/** The paper of each sleeve by its cloth. */
const SLEEVE = {
  cream: PAPERS.sleeve,
  creamAcross: PAPERS.sleeveAcross,
  teal: PAPERS.mantleSleeve,
  raised: PAPERS.sleeveRaised,
  tealRaised: PAPERS.mantleSleeve,
} as const;

/** The shade along each sleeve's edges, by its cloth: what shows it where it lies on his garment; none on a sleeve raised clear of it, or across his tunic whole (its shading its own tones, `RAISED_SLEEVE`, `SEATED_SLEEVE`). */
const SLEEVE_EDGE: Readonly<Record<keyof typeof SLEEVE, { readonly edge?: `#${string}` }>> = {
  cream: { edge: TONES.creamEdge },
  creamAcross: {},
  teal: { edge: TONES.tealEdge },
  raised: {},
  tealRaised: {},
};

/** How deep the band across a sleeve's cuff runs, sheet pixels: the line the sheet draws where a sleeve lying on his garment ends over his hand. */
const CUFF = 6;

/** A polygon as the straight sides of a cubic chain: each corner, its two handles on its own side. */
const straight = (corners: ReadonlyArray<Pt>): Pt[] =>
  corners.flatMap((p, i) => [p, p, corners[(i + 1) % corners.length] ?? p]);

/** The band across the cuff of the sleeve traced as `outline`, in `color`, a chain of four straight sides past its edges (laid on the sleeve, it is clipped to it). */
const cuffOf = (outline: ReadonlyArray<Pt>, color: `#${string}`): TracedTone => {
  const xs = outline.map(([x]) => x);
  const bottom = Math.max(...outline.map(([, y]) => y));
  const [x0, x1] = [Math.min(...xs) - 4, Math.max(...xs) + 4];
  const corners: Pt[] = [
    [x0, bottom - CUFF],
    [x1, bottom - CUFF],
    [x1, bottom + 4],
    [x0, bottom + 4],
  ];
  return { pts: [straight(corners)], color };
};

/** How far each curl's lit disc lies toward the light, a share of its radius: the dark crescent under it, as the sheet paints his curls. */
const CURL_CRESCENT = 0.35;

/** Where his eyes rest: ahead, a little down. */
const GAZE: Pt = [0, 40];

/** How far above the ground his soles run, units: his sheets paint each sole into the line under his foot (front x 50: skin to row 844, then 10 rows of dark), so the house's 6.5 laid a 9-row band of leather over his skin there. */
const SOLE_DEPTH = 3.5;

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
      tones: [
        tone(t.JAW_SOFT ?? [], TONES.jawSoft),
        tone(t.JAW_SHADE ?? [], TONES.jawShade),
        tone(t.JAW, v.jaw ?? TONES.jaw),
        tone(t.JAW_FADE ?? [], TONES.chinFade),
        tone(t.EAR_BAND ?? [], TONES.earBand),
      ],
    },
    hair: {
      outline: t.HAIR,
      paper: PAPERS.hair,
      tones: [tone(t.HAIR_LIGHT, TONES.hairLight), tone(t.HAIR_DARK, TONES.hairShade)],
      curls: { discs: t.CURLS, shade: TONES.hairShade, crescent: CURL_CRESCENT },
    },
    ears: {
      ...v.ears,
      paper: PAPERS.ear,
      tones: [
        tone(t.EAR_LIT ?? [], TONES.earLit),
        tone(t.EAR_LIGHT ?? [], TONES.earLight),
        tone(t.EAR_SHADE ?? [], TONES.earShade),
        tone(t.EAR_HOLLOW ?? [], TONES.earHollow),
      ],
    },
    face: { ...v.face, gaze: GAZE },
    body: {
      outline: t.BODY,
      paper: PAPERS.tunic,
      tones: [
        { ...tone(t.SKIN, PAPERS.skin.color), skin: true },
        { ...tone(t.NECK_SHADE, TONES.neck), skin: true },
        { ...tone(t.NECK, v.neck ?? TONES.neck), skin: true },
        { ...tone(t.JAW_SOFT ?? [], TONES.jawSoft), skin: true },
        { ...tone(t.JAW_SHADE ?? [], TONES.jawShade), skin: true },
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
        ...SLEEVE_EDGE[v.sleeves.near],
        ...v.nearArm,
      },
      far: {
        outline: t.ARM_FAR,
        hand: t.HAND_FAR,
        paper: SLEEVE[v.sleeves.far],
        ...SLEEVE_EDGE[v.sleeves.far],
        ...v.farArm,
      },
    },
    feet_: {
      near: { outline: t.FOOT_NEAR, tones: [tone(t.STRAP_NEAR, TONES.strap)] },
      far: { outline: t.FOOT_FAR, tones: [tone(t.STRAP_FAR, TONES.strap)] },
      paper: PAPERS.foot,
      sole: TONES.sole,
      soleDepth: SOLE_DEPTH,
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
 * sheet): a wince and a glad shut-eyed smile; and the slides his busts take
 * where the heads sheet draws his marks elsewhere on his head than his rig
 * lays them (his face turned up, his frown low). A profile's one eye takes
 * none.
 */
const WITH_EXTRA = ['wince', 'glad', 'marksY', 'mouthY', 'mouthW'] as const;

/** His face at rest: the features slid half after his gaze, a small smile; laid over his hair, so a brow knit up into his hairline shows. */
const AT_REST = { turn: 0.5, rest: { mouth: 2.5 }, layer: 'over' } as const;

/** His front view: turned to us, a small smile; his cream right sleeve on screen left, his teal left on screen right. */
export const leadFeastFront = leadView(FRONT, {
  sheet: 'turnaround',
  head: { view: 'front', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: FRONT.EAR_NEAR, far: FRONT.EAR_FAR },
  face: { ...AT_REST, marks: FRONT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

/** Three-quarters to screen left: his face slid toward it, his ear behind; his cream right sleeve near us, his teal left far. */
export const leadFeastThreeQuarterLeft = leadView(THREE_QUARTER_LEFT, {
  sheet: 'turnaround',
  head: { view: 'threeQuarter', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: THREE_QUARTER_LEFT.EAR_NEAR },
  face: { ...AT_REST, marks: THREE_QUARTER_LEFT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

/** In profile to screen left: one eye, his ear behind his cheek, his teal left sleeve hanging over his side, his cream right sleeve beyond him (it shows raised, poses-2). */
export const leadFeastProfileLeft = leadView(PROFILE_LEFT, {
  sheet: 'turnaround',
  head: { view: 'side', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: PROFILE_LEFT.EAR_NEAR },
  face: { ...AT_REST, marks: PROFILE_LEFT.MARKS },
  sleeves: { near: 'teal', far: 'cream' },
  nearArm: { tones: [cuffOf(PROFILE_LEFT.ARM_NEAR, TONES.tealEdge)] },
});

/** From behind: his curls over his whole head, his ears either side; his teal left sleeve on screen left, his cream right on screen right; his face, under his hair, is the front's. */
export const leadFeastBack = leadView(BACK, {
  sheet: 'turnaround',
  head: { view: 'back', chin: 'open' },
  neck: PAPERS.skin.color,
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
  head: { view: 'side', chin: 'open' },
  ears: { near: PROFILE_RIGHT.EAR_NEAR },
  face: { ...AT_REST, marks: PROFILE_RIGHT.MARKS },
  sleeves: { near: 'cream', far: 'cream' },
  nearArm: { tones: [cuffOf(PROFILE_RIGHT.ARM_NEAR, TONES.creamEdge)] },
});

/** Three-quarters to screen right: his face slid toward it, his ear behind; his cream right sleeve on screen left, his teal left on screen right. */
export const leadFeastThreeQuarterRight = leadView(THREE_QUARTER_RIGHT, {
  sheet: 'turnaround',
  head: { view: 'threeQuarter', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: THREE_QUARTER_RIGHT.EAR_NEAR },
  face: { ...AT_REST, marks: THREE_QUARTER_RIGHT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

/**
 * His near hand round the bottle on his raised view, sheet pixels: the
 * sheet's fist, mostly behind the bottle, shows only its ring's left and
 * lower edges (its inner edge at x 30 and row 422), so the traced circle
 * (its visible crescent's) is too small and too far left. His hand is the
 * house's one size, his far hand's, laid inside that ring and down onto his
 * cuff (row 426), as a hand touches its sleeve.
 */
const RAISED_HAND_NEAR = {
  at: [52, 410],
  r: RAISED.HAND_FAR.r,
} as const satisfies { readonly at: Pt; readonly r: number };

/**
 * The sheet's shading of his raised sleeve, sheet pixels, laid on its flat
 * paper (each clipped to the sleeve): the shade under its upper arm and round
 * its elbow; the fold down from the notch at its elbow.
 */
const RAISED_SLEEVE: ReadonlyArray<TracedTone> = [
  tone(
    [
      straight([
        [40, 476],
        [66, 492],
        [139, 488],
        [139, 540],
        [30, 540],
      ]),
    ],
    TONES.raisedUnder,
  ),
  tone(
    [
      straight([
        [102, 440],
        [109, 440],
        [115, 478],
        [110, 479],
      ]),
    ],
    TONES.raisedFold,
  ),
];

/** Raised (poses-1): three-quarters to screen left, his head rolled toward the bottle in his raised near hand; his near sleeve bent at its elbow as the sheet draws it, turning about his shoulder; his teal far sleeve hanging. */
export const leadFeastRaised = leadView(
  { ...RAISED, HAND_NEAR: RAISED_HAND_NEAR },
  {
    sheet: 'poses',
    head: { view: 'threeQuarter', chin: 'open' },
    jaw: TONES.jawRose,
    ears: { near: RAISED.EAR_NEAR },
    face: { ...AT_REST, marks: RAISED.MARKS, extra: WITH_EXTRA },
    sleeves: { near: 'raised', far: 'teal' },
    // Turned about a point on the line from his hand through his elbow's fold (the notch at 105,443 and the elbow's corner at 55,505 lie square across it), so its cut at his elbow runs through both.
    // Its upper sleeve ends where the sheet ends it, its root under his tunic: a ball would show past its edges.
    nearArm: { pivot: [144, 476], elbow: 0.35, root: 'traced', tones: RAISED_SLEEVE },
  },
);

/** The shade lines the sheet paints along his raised teal upper arm where it lies across his mantle (poses-2): its top edge and its underside, sheet pixels. */
const DRINKING_SLEEVE: ReadonlyArray<TracedTone> = [
  tone(
    [
      straight([
        [440, 436],
        [522, 405],
        [536, 412],
        [536, 422],
        [456, 448],
      ]),
      straight([
        [400, 500],
        [470, 494],
        [536, 486],
        [536, 520],
        [400, 520],
      ]),
    ],
    TONES.tealEdge,
  ),
];

/**
 * Drinking (poses-2): in profile to screen left, his head tipped back, the
 * plate at his lips. His teal near sleeve raised before him, its upper arm
 * across his chest, turning about his shoulder there; his cream far sleeve
 * beyond his teal forearm, its upper arm hidden, turning about its elbow's
 * end (his garment keeps it there, under his teal elbow). Both end at their
 * own traced roots. His hands the house's one size, his far hand's.
 */
export const leadFeastDrinking = leadView(
  {
    ...DRINKING,
    HAND_NEAR: { at: [397, 381] satisfies Pt, r: DRINKING.HAND_FAR.r },
    HAND_FAR: { at: [355, 380] satisfies Pt, r: DRINKING.HAND_FAR.r },
  },
  {
    sheet: 'poses',
    head: { view: 'side', chin: 'open' },
    jaw: TONES.jawRose,
    ears: { near: DRINKING.EAR_NEAR },
    face: { ...AT_REST, marks: DRINKING.MARKS },
    sleeves: { near: 'tealRaised', far: 'cream' },
    nearArm: { pivot: [515, 455], elbow: 0.2, root: 'traced', tones: DRINKING_SLEEVE },
    farArm: { pivot: [374, 460], root: 'traced' },
  },
);

/** Reaching (poses-4): three-quarters to screen left, leaning to the low table, his near sleeve down from his shoulder against his side to his hand on the bottle there, as the sheet draws it; his teal far sleeve hanging. */
export const leadFeastReaching = leadView(REACHING, {
  sheet: 'poses',
  head: { view: 'threeQuarter', chin: 'open' },
  jaw: TONES.jawRose,
  ears: { near: REACHING.EAR_NEAR },
  face: { ...AT_REST, marks: REACHING.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

/** How far his seated hand at his chin is laid down onto his raised sleeve's top, sheet pixels. */
const SEATED_WRIST = 4;

/**
 * His arms on his seated view. His far arm is his three-quarter-left one,
 * its outline and hand taken from the turnaround's pixels to the poses
 * sheet's (one scale each, the same units) about his head's centre, so it
 * hangs from his shoulder as it does standing and, posed by its numbers,
 * reaches his lap (`rigs/cast.ts`). His near arm is the raised sleeve the
 * seated sheet draws, from his elbow on his knee up to his hand at his chin,
 * its upper sleeve hidden behind it: traced in place and turned about his
 * elbow (`nearArm`), so it is drawn as the sheet draws it and never
 * reaches (a standing arm folded up to his chin is half the length the
 * sheet's is).
 */
const seatedArms = () => {
  const k = SHEETS.turnaround.scale / SHEETS.poses.scale;
  const [fx, fy] = THREE_QUARTER_LEFT.HEAD_AT.at;
  const [tx, ty] = SEATED.HEAD_AT.at;
  const moved = ([x, y]: Pt): Pt => [tx + (x - fx) * k, ty + (y - fy) * k];
  const hand = (h: { readonly at: Pt; readonly r: number }) => ({ at: moved(h.at), r: h.r * k });
  return {
    ARM_NEAR: SEATED.ARM_NEAR,
    ARM_FAR: THREE_QUARTER_LEFT.ARM_FAR.map(moved),
    // His hand at his chin 4 px down onto his wrist: the sheet's hand hides the sleeve's top, so the traced sleeve stops short of it.
    HAND_NEAR: {
      ...SEATED.HAND_NEAR,
      at: [SEATED.HAND_NEAR.at[0], SEATED.HAND_NEAR.at[1] + SEATED_WRIST] satisfies Pt,
    },
    HAND_FAR: hand(THREE_QUARTER_LEFT.HAND_FAR),
  };
};

/**
 * The sheet's shading of his raised sleeve, seated, sheet pixels, laid on
 * its lit paper (each clipped to the sleeve): its inner half a step darker
 * (#ecc9a8 at 709,576), its inner edge a fold that parts it from his tunic
 * with no line: a mauve stroke (#a17d71 at 720,576) on its near side, a
 * softer one on its far side to row 604 (where the sheet's lap hand begins),
 * and from below his wrist (row 581) a mid-tone between them that opens at
 * the bottom, so the near stroke ends in a point (x 708, row 618) with
 * nothing across it.
 */
const SEATED_SLEEVE: ReadonlyArray<TracedTone> = [
  tone(
    [
      straight([
        [698, 557],
        [705, 566],
        [703, 576],
        [701, 586],
        [698, 596],
        [696, 606],
        [693, 616],
        [689, 623],
        [688, 631],
        [764, 631],
        [764, 557],
      ]),
    ],
    TONES.creamAcrossInner,
  ),
  tone(
    [
      straight([
        [712, 557],
        [720, 566],
        [719, 571],
        [718, 576],
        [717, 581],
        [716, 586],
        [715, 591],
        [714, 596],
        [713, 601],
        [712, 606],
        [711, 611],
        [709, 616],
        [709, 621],
        [764, 621],
        [764, 557],
      ]),
    ],
    TONES.creamAcross,
  ),
  tone(
    [
      straight([
        [726, 557],
        [764, 557],
        [764, 604],
        [722, 604],
        [721.5, 581],
        [724.5, 571],
        [725, 566],
      ]),
    ],
    TONES.creamAcrossFar,
  ),
  tone(
    [
      straight([
        [722, 581],
        [723, 586],
        [724, 591],
        [725, 596],
        [726, 601],
        [727, 604],
        [764, 604],
        [764, 626],
        [708, 626],
        [708, 618],
        [710.5, 615],
        [713.5, 612],
        [715.5, 606],
        [716.5, 601],
        [718, 596],
        [719.5, 591],
        [720.5, 586],
        [721.5, 581],
      ]),
    ],
    TONES.creamAcrossFold,
  ),
];

/**
 * His teal sleeve on his lap, seated, as it hangs before it reaches there
 * (`seatedArms`, sheet pixels: his forearm from about row 640 to its cuff at
 * 723, his hand's top at 713): lit whole (the sheet's #7fa194 at 764,621,
 * lightest by his hand), so it lies off the mantle under it; shaded along
 * its right side from above his elbow, the side that turns under as it
 * reaches, one width (12 px inside its edge) on his upper arm and his
 * forearm, so the shade runs round his elbow with no step where the two
 * meet (the sheet's #476c7b at 792,651); and a cuff, a band across it just
 * above his hand (rows 698-706), so his hand ends a sleeve.
 */
const LAP_SLEEVE: ReadonlyArray<TracedTone> = [
  tone(
    [
      straight([
        [800, 540],
        [890, 540],
        [890, 740],
        [800, 740],
      ]),
    ],
    TONES.lapSleeve,
  ),
  tone(
    [
      straight([
        [847, 620],
        [890, 620],
        [890, 740],
        [860, 740],
        [859, 700],
        [856, 680],
        [854, 660],
        [851, 640],
      ]),
    ],
    TONES.lapSleeveUnder,
  ),
  tone(
    [
      straight([
        [800, 698],
        [890, 698],
        [890, 706],
        [800, 706],
      ]),
    ],
    TONES.tealEdge,
  ),
];

/** Seated on a low stool, three-quarters to screen left (poses-3): his robe over his knees, his sandals under its hem; his near sleeve raised to his chin as the sheet draws it, his far arm his standing one. */
export const leadFeastSeated = leadView(
  { ...SEATED, ...seatedArms() },
  {
    sheet: 'poses',
    head: { view: 'threeQuarter', chin: 'open' },
    jaw: TONES.jawRose,
    ears: { near: SEATED.EAR_NEAR },
    face: { ...AT_REST, marks: SEATED.MARKS, extra: WITH_EXTRA },
    sleeves: { near: 'creamAcross', far: 'teal' },
    // His elbow on his knee, the raised sleeve's lowest middle.
    nearArm: { pivot: [692, 622], tones: SEATED_SLEEVE },
    farArm: { tones: LAP_SLEEVE },
  },
);
