import {
  Ear,
  GivenRobe,
  Hands,
  Head,
  HAND_ART,
  Hair,
  JointedArm,
  KitA,
  type Pt,
  Robe,
  Stain,
  Stance,
  Stature,
  Trousers,
  armReach,
  figure,
  tracedKit,
} from '@manna/film/style';
import LEAD_LOCK from './lead.lock.json' with { type: 'json' };
import {
  CHIN,
  EAR_FAR,
  EAR_NEAR,
  FACE_LIT,
  FAR_ARM,
  FAR_CREASE,
  HAIR,
  HAIR_LIT,
  HAIR_SHADE,
  HANDS,
  HEAD,
  LEG_FAR,
  LEG_LIT,
  LEG_NEAR,
  MARKS,
  NEAR_ARM,
  NEAR_CREASE,
  NEAR_LIT,
  NECK,
  NECK_SHADE,
  PANEL,
  SHOE_FAR,
  SHOE_LIT,
  SHOE_NEAR,
  TOP,
  TOP_SHADE,
  WAIST_FAR,
  WAIST_NEAR,
  YOKE,
} from './lead-traced.ts';
import { PAPERS, STAIN } from './papers.ts';

const canon =
  (origin: Pt) =>
  ([x, y]: Pt): Pt => [
    +((x - origin[0]) * PANEL.scale).toFixed(2),
    +((y - origin[1]) * PANEL.scale).toFixed(2),
  ];
const fromHead = canon(PANEL.head);
const fromFeet = canon(PANEL.feet);
const headParts = (pts: ReadonlyArray<Pt>) => pts.map(fromHead);
const bodyParts = (pts: ReadonlyArray<Pt>) => pts.map(fromFeet);
type SheetTones = ReadonlyArray<{ readonly pts: ReadonlyArray<Pt>; readonly color: `#${string}` }>;
const headTones = (ts: SheetTones) => ts.map((t) => ({ pts: headParts(t.pts), color: t.color }));
const bodyTones = (ts: SheetTones) => ts.map((t) => ({ pts: bodyParts(t.pts), color: t.color }));

const HEAD_OUTLINE = headParts(HEAD);

const TOP_OUTLINE = bodyParts(TOP);
const HEM = Math.max(...TOP_OUTLINE.map(([, y]) => y));

export const LEAD = {
  height: 440,
  head: {
    y: fromFeet(PANEL.head)[1],
    height:
      Math.max(...HEAD_OUTLINE.map(([, y]) => y)) - Math.min(...HEAD_OUTLINE.map(([, y]) => y)),
  },
  neck: fromFeet([0, CHIN])[1],
  hem: HEM,
  stain: { x: -4, y: -232, rx: 22, ry: 29 },
} as const;

const SOAK = [
  [1.03, 0.5],
  [1.06, 0.3],
  [1.09, 0.15],
] as const;

const BREATH = { period: 4, trunk: 1.01, neck: -2 } as const;

export const TUNIC = TOP_OUTLINE;

const onLine = (a: Pt, b: Pt, y: number): Pt => [
  a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
  y,
];

const armOf = (
  traced: typeof NEAR_ARM,
  hand: Pt,
  paper: typeof PAPERS.leadSleeve | typeof PAPERS.leadFarSleeve,
  tones: SheetTones,
) =>
  JointedArm({
    pivot: fromFeet(traced.pivot),
    rest: 0,
    outline: bodyParts(traced.upper),
    elbow: fromFeet(onLine(traced.pivot, hand, traced.elbow[1])),
    bend: 0,
    forearm: bodyParts(traced.forearm),
    hand: fromFeet(hand),
    paper,
    tones: bodyTones(tones),
    forearmTones: bodyTones(tones),
  });

const NEAR = armOf(NEAR_ARM, HANDS.near, PAPERS.leadSleeve, [...NEAR_LIT, ...NEAR_CREASE]);
const FAR = armOf(FAR_ARM, HANDS.far, PAPERS.leadFarSleeve, FAR_CREASE);

const HEAD_WIDTH =
  Math.max(...HEAD_OUTLINE.map(([x]) => x)) - Math.min(...HEAD_OUTLINE.map(([x]) => x));

const HAND_SHARE = +((2 * HANDS.r * PANEL.scale) / HEAD_WIDTH).toFixed(3);

const WAIST = PAPERS.leadWaist.color;

export const lead = figure({
  lock: {
    ...LEAD_LOCK,
    override: {
      rule: 'FigureLock',
      place: 'lead',
      reason: "traced from candidate 9's cast sheets, which the owner kept as the lead",
      answer: { ask: 'a8fb2170353', question: 'keep', value: 'keep' },
      frees: '55c5cc12ed69f14fef1899ab4f76e574b2fc8dcdd1b440aee09518ac7318a724',
    },
  },
  concept: {
    image: { set: 'rbf-lead-sheets-2026-10-19', file: 'images/1-turnaround.png' },
    box: [44, 195, 259, 834],
  },
  art: { width: 360, height: 560, feet: [180, 530] },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  head: Head.Traced({
    view: 'front',
    outline: HEAD_OUTLINE,
    y: LEAD.head.y,
    neck: LEAD.neck,
    set: { x: fromFeet(PANEL.head)[0] },
    paper: PAPERS.leadSkin,
    tones: headTones(FACE_LIT),
    chin: 'open',
  }),
  hair: Hair.Traced({
    outline: headParts(HAIR),
    paper: PAPERS.leadHair,
    tones: [...headTones(HAIR_SHADE), ...headTones(HAIR_LIT)],
  }),
  ear: Ear.Both({ near: headParts(EAR_NEAR), far: headParts(EAR_FAR), paper: PAPERS.leadEar }),
  face: KitA({ ...tracedKit(MARKS, PANEL, 0.5), rest: { mouth: 2.5 }, gaze: [0, 40] }),
  body: Robe.Traced({
    outline: TOP_OUTLINE,
    hem: HEM,
    paper: PAPERS.leadTop,
    tones: [
      ...bodyTones(TOP_SHADE),
      ...bodyTones(YOKE),
      { pts: bodyParts(NECK), color: PAPERS.leadSkin.color, skin: true },
      { pts: bodyParts(NECK_SHADE), color: PAPERS.leadNeckShade.color, skin: true },
    ],
  }),
  arms: { near: NEAR, far: FAR },
  states: [
    GivenRobe(PAPERS.robe),
    Stain({
      at: [LEAD.stain.x, LEAD.stain.y],
      r: [LEAD.stain.rx, LEAD.stain.ry],
      soak: SOAK,
      seed: 11,
      paper: STAIN,
    }),
  ],
  feet: Trousers({
    paper: PAPERS.leadTrousers,
    near: {
      outline: bodyParts(LEG_NEAR),
      tones: [{ pts: bodyParts(WAIST_NEAR), color: WAIST }, ...bodyTones(LEG_LIT)],
    },
    far: { outline: bodyParts(LEG_FAR), tones: [{ pts: bodyParts(WAIST_FAR), color: WAIST }] },
    shoes: {
      paper: PAPERS.leadShoe,
      near: { outline: bodyParts(SHOE_NEAR), tones: bodyTones(SHOE_LIT.slice(0, 1)) },
      far: { outline: bodyParts(SHOE_FAR), tones: bodyTones(SHOE_LIT.slice(1)) },
    },
  }),
  hands: Hands({ paper: PAPERS.leadHand, share: HAND_SHARE }),
});

export const LEAD_KNOBS = lead.knobs;

export const LEAD_ARMS = {
  left: { reach: (target: Pt) => armReach(NEAR, target), rest: NEAR.hand, shoulder: NEAR.pivot },
  right: { reach: (target: Pt) => armReach(FAR, target), rest: FAR.hand, shoulder: FAR.pivot },
  hand: +(2 * HANDS.r * PANEL.scale).toFixed(2),
} as const;

export const LEAD_HAND_SIZE = +(LEAD_ARMS.hand / (2 * HAND_ART.r)).toFixed(3);

type ArmNumbers = {
  readonly lean: number;
  nearArm: number;
  nearElbow: number;
  farArm: number;
  farElbow: number;
};

type HandsAt = { readonly left: Pt; readonly right: Pt };

const leaned = ([x, y]: Pt, by: number): Pt => {
  const [c, s] = [Math.cos(by), Math.sin(by)];
  return [x * c - y * s, x * s + y * c];
};

export const reachHands = (numbers: ArmNumbers, left: Pt, right: Pt): HandsAt => {
  const near = LEAD_ARMS.left.reach(leaned(left, -numbers.lean));
  const far = LEAD_ARMS.right.reach(leaned(right, -numbers.lean));
  numbers.nearArm = near.turn;
  numbers.nearElbow = near.bend;
  numbers.farArm = far.turn;
  numbers.farElbow = far.bend;
  return { left: leaned(near.hand, numbers.lean), right: leaned(far.hand, numbers.lean) };
};

export const LEAD_FACE_CHECK = { node: 'face', height: LEAD.head.height } as const;
