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

const LEAD_FEAST_HEIGHT = 440;

export const SHEETS = {
  turnaround: { scale: LEAD_FEAST_HEIGHT / (FRONT.FEET[1] - FRONT.HEAD_AT.top) },
  poses: { scale: LEAD_FEAST_HEIGHT / (829 - 225) },
} as const;

type Pieces = ReadonlyArray<ReadonlyArray<Pt>>;

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
  readonly EAR_BAND?: Pieces;
  readonly EAR_LIGHT?: Pieces;
  readonly EAR_LIT?: Pieces;
  readonly EAR_HOLLOW?: Pieces;
  readonly EAR_SHADE?: Pieces;
  readonly JAW_SHADE?: Pieces;
  readonly JAW_SOFT?: Pieces;
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

interface LeadViewSpec {
  readonly sheet: keyof typeof SHEETS;
  readonly head: Pick<TracedFigureSpec['head'], 'view' | 'chin'>;
  readonly jaw?: `#${string}`;
  readonly neck?: `#${string}`;
  readonly ears: { readonly near: ReadonlyArray<Pt>; readonly far?: ReadonlyArray<Pt> };
  readonly face: Omit<TracedFigureSpec['face'], 'gaze'>;
  readonly sleeves: { readonly near: keyof typeof SLEEVE; readonly far: keyof typeof SLEEVE };
  readonly nearArm?: ArmOf;
  readonly farArm?: ArmOf;
}

interface ArmOf {
  readonly pivot?: Pt;
  readonly elbow?: number;
  readonly root?: 'ball' | 'traced';
  readonly tones?: ReadonlyArray<TracedTone>;
}

const tone = (pts: Pieces, color: `#${string}`): TracedTone => ({ pts, color });

const SLEEVE = {
  cream: PAPERS.sleeve,
  creamAcross: PAPERS.sleeveAcross,
  teal: PAPERS.mantleSleeve,
  raised: PAPERS.sleeveRaised,
  tealRaised: PAPERS.mantleSleeve,
} as const;

const SLEEVE_EDGE: Readonly<Record<keyof typeof SLEEVE, { readonly edge?: `#${string}` }>> = {
  cream: { edge: TONES.creamEdge },
  creamAcross: {},
  teal: { edge: TONES.tealEdge },
  raised: {},
  tealRaised: {},
};

const CUFF = 6;

const straight = (corners: ReadonlyArray<Pt>): Pt[] =>
  corners.flatMap((p, i) => [p, p, corners[(i + 1) % corners.length] ?? p]);

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

const CURL_CRESCENT = 0.35;

const GAZE: Pt = [0, 40];

const SOLE_DEPTH = 3.5;

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

const WITH_EXTRA = ['wince', 'glad', 'marksY', 'mouthY', 'mouthW'] as const;

const AT_REST = { turn: 0.5, rest: { mouth: 2.5 }, layer: 'over' } as const;

export const leadFeastFront = leadView(FRONT, {
  sheet: 'turnaround',
  head: { view: 'front', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: FRONT.EAR_NEAR, far: FRONT.EAR_FAR },
  face: { ...AT_REST, marks: FRONT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

export const leadFeastThreeQuarterLeft = leadView(THREE_QUARTER_LEFT, {
  sheet: 'turnaround',
  head: { view: 'threeQuarter', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: THREE_QUARTER_LEFT.EAR_NEAR },
  face: { ...AT_REST, marks: THREE_QUARTER_LEFT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

export const leadFeastProfileLeft = leadView(PROFILE_LEFT, {
  sheet: 'turnaround',
  head: { view: 'side', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: PROFILE_LEFT.EAR_NEAR },
  face: { ...AT_REST, marks: PROFILE_LEFT.MARKS },
  sleeves: { near: 'teal', far: 'cream' },
  nearArm: { tones: [cuffOf(PROFILE_LEFT.ARM_NEAR, TONES.tealEdge)] },
});

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

export const leadFeastProfileRight = leadView(PROFILE_RIGHT, {
  sheet: 'turnaround',
  head: { view: 'side', chin: 'open' },
  ears: { near: PROFILE_RIGHT.EAR_NEAR },
  face: { ...AT_REST, marks: PROFILE_RIGHT.MARKS },
  sleeves: { near: 'cream', far: 'cream' },
  nearArm: { tones: [cuffOf(PROFILE_RIGHT.ARM_NEAR, TONES.creamEdge)] },
});

export const leadFeastThreeQuarterRight = leadView(THREE_QUARTER_RIGHT, {
  sheet: 'turnaround',
  head: { view: 'threeQuarter', chin: 'open' },
  jaw: TONES.chinLine,
  ears: { near: THREE_QUARTER_RIGHT.EAR_NEAR },
  face: { ...AT_REST, marks: THREE_QUARTER_RIGHT.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

const RAISED_HAND_NEAR = {
  at: [52, 410],
  r: RAISED.HAND_FAR.r,
} as const satisfies { readonly at: Pt; readonly r: number };

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

export const leadFeastRaised = leadView(
  { ...RAISED, HAND_NEAR: RAISED_HAND_NEAR },
  {
    sheet: 'poses',
    head: { view: 'threeQuarter', chin: 'open' },
    jaw: TONES.jawRose,
    ears: { near: RAISED.EAR_NEAR },
    face: { ...AT_REST, marks: RAISED.MARKS, extra: WITH_EXTRA },
    sleeves: { near: 'raised', far: 'teal' },
    nearArm: { pivot: [144, 476], elbow: 0.35, root: 'traced', tones: RAISED_SLEEVE },
  },
);

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

export const leadFeastReaching = leadView(REACHING, {
  sheet: 'poses',
  head: { view: 'threeQuarter', chin: 'open' },
  jaw: TONES.jawRose,
  ears: { near: REACHING.EAR_NEAR },
  face: { ...AT_REST, marks: REACHING.MARKS, extra: WITH_EXTRA },
  sleeves: { near: 'cream', far: 'teal' },
});

const SEATED_WRIST = 4;

const seatedArms = () => {
  const k = SHEETS.turnaround.scale / SHEETS.poses.scale;
  const [fx, fy] = THREE_QUARTER_LEFT.HEAD_AT.at;
  const [tx, ty] = SEATED.HEAD_AT.at;
  const moved = ([x, y]: Pt): Pt => [tx + (x - fx) * k, ty + (y - fy) * k];
  const hand = (h: { readonly at: Pt; readonly r: number }) => ({ at: moved(h.at), r: h.r * k });
  return {
    ARM_NEAR: SEATED.ARM_NEAR,
    ARM_FAR: THREE_QUARTER_LEFT.ARM_FAR.map(moved),
    HAND_NEAR: {
      ...SEATED.HAND_NEAR,
      at: [SEATED.HAND_NEAR.at[0], SEATED.HAND_NEAR.at[1] + SEATED_WRIST] satisfies Pt,
    },
    HAND_FAR: hand(THREE_QUARTER_LEFT.HAND_FAR),
  };
};

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

export const leadFeastSeated = leadView(
  { ...SEATED, ...seatedArms() },
  {
    sheet: 'poses',
    head: { view: 'threeQuarter', chin: 'open' },
    jaw: TONES.jawRose,
    ears: { near: SEATED.EAR_NEAR },
    face: { ...AT_REST, marks: SEATED.MARKS, extra: WITH_EXTRA },
    sleeves: { near: 'creamAcross', far: 'teal' },
    nearArm: { pivot: [692, 622], tones: SEATED_SLEEVE },
    farArm: { tones: LAP_SLEEVE },
  },
);
