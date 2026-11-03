import {
  Arm,
  Beard,
  Hands,
  Head,
  Headcloth,
  KitA,
  type Pt,
  Robe,
  Sandals,
  Stance,
  Stature,
  figure,
  armHand,
  tracedKit,
} from '@manna/film/style';
import {
  ARM_PIVOT,
  BAND,
  BAND_LIT,
  BEARD,
  CHEEK_SHADE,
  CHEEK_SOFT,
  CLOTH,
  CLOTH_BROW,
  CLOTH_EDGE,
  CLOTH_EDGE_BROWN,
  CLOTH_EDGE_DUSK,
  FACE,
  FAR_CUFF,
  FAR_SLEEVE,
  FAR_SLEEVE_LIT,
  HANDS,
  LIP,
  MARKS,
  NEAR_SLEEVE,
  NECK,
  NOSE,
  PANEL,
  TUNIC,
  TUNIC_FOLD,
  VEST_FAR,
  VEST_NEAR,
} from './farmer-traced.ts';
import { PAPERS } from './papers.ts';

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

const HEAD = { x: fromFeet(PANEL.head)[0], y: fromFeet(PANEL.head)[1] } as const;
const NECK_Y = fromFeet([0, 540])[1];

const BREATH = { period: 5, trunk: 1.008, neck: -2.5 } as const;

const WALNUT = '#714b38';
const WALNUT_SHADE = '#7a4d3f';
const BAND_TAN = '#d4965b';
const CLOTH_EDGE_UPPER = '#553a26';
const CLOTH_EDGE_MID = '#46301f';
const NOSE_SHADE = '#db8b59';
const CHEEK_SKIN = '#e39964';
const CHEEK_HALF = '#eca66b';
const NEAR_SLEEVE_TAN = '#cb9f74';
const CUFF_SHADE = '#946f56';
const NECK_SKIN = '#e29662';

const EYE_LEAN = -0.175;

const KIT = tracedKit(MARKS, PANEL, 1.5);

const BROW_HALF = (() => {
  const [[x0, y0], [x1, y1]] = MARKS.brows[1];
  return +((Math.hypot(x1 - x0, y1 - y0) / 2) * PANEL.scale).toFixed(2);
})();

const SOLE = '#43291c';

const SANDALS = Sandals({
  paper: PAPERS.farmerSkin,
  near: {
    corners: [
      [-88, -1],
      [-88, -8],
      [-76, -17],
      [-40, -18],
      [-39, -1],
    ],
    radii: [3, 5, 10, 2, 2],
    tones: [
      {
        pts: [
          [-70, -18],
          [-59, -18],
          [-48, -6],
          [-56, -6],
        ],
        color: '#6b4430',
      },
    ],
  },
  far: {
    corners: [
      [30, -1],
      [30, -18],
      [64, -17],
      [94, -6],
      [94, -1],
    ],
    radii: [2, 2, 12, 5, 3],
  },
  sole: SOLE,
});

const TUNIC_OUTLINE = bodyParts(TUNIC);

const HEM = Math.max(...TUNIC_OUTLINE.map(([, y]) => y));

export const FARMER_HANDS = {
  near: fromFeet(HANDS.near),
  far: fromFeet(HANDS.far),
  raised: fromFeet(HANDS.raised),
} as const;

const PIVOT = fromFeet(ARM_PIVOT);
const RAISED = FARMER_HANDS.raised;

const REST = (() => {
  const angle = ([x, y]: Pt) => Math.atan2(y - PIVOT[1], x - PIVOT[0]);
  return +(angle(FARMER_HANDS.far) - angle(RAISED)).toFixed(4);
})();

const FAR_ARM = Arm({
  pivot: PIVOT,
  rest: REST,
  outline: bodyParts(FAR_SLEEVE),
  hand: RAISED,
  paper: PAPERS.farmerSleeve,
  tones: [
    { pts: bodyParts(FAR_SLEEVE_LIT), color: PAPERS.linen.light },
    { pts: bodyParts(FAR_CUFF), color: CUFF_SHADE },
  ],
});

export const farmer = figure({
  art: { width: 360, height: 520, feet: [160, 495] },
  concept: {
    image: { set: 'rbf-v3-cast-2026-10-18', file: 'aids/farmer-head-closed.png' },
    box: [190, 280, 720, 760],
  },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  head: Head.Traced({
    view: 'threeQuarter',
    outline: headParts(FACE),
    y: HEAD.y,
    neck: NECK_Y,
    set: { x: HEAD.x },
    paper: PAPERS.farmerFace,
    tones: [
      { pts: headParts(CLOTH_BROW), color: PAPERS.headcloth.shade },
      { pts: headParts(NOSE), color: NOSE_SHADE },
      { pts: headParts(CHEEK_SOFT), color: CHEEK_HALF },
      { pts: headParts(CHEEK_SHADE), color: CHEEK_SKIN },
    ],
  }),
  beard: Beard({
    outline: headParts(BEARD),
    paper: PAPERS.farmerBeard,
    lip: { outline: headParts(LIP), paper: PAPERS.farmerLip },
  }),
  headcloth: Headcloth({
    outline: headParts(CLOTH),
    paper: PAPERS.headcloth,
    band: {
      outline: headParts(BAND),
      paper: PAPERS.headclothBand,
      tones: [{ pts: headParts(BAND_LIT), color: BAND_TAN }],
    },
    edge: {
      outline: headParts(CLOTH_EDGE),
      paper: PAPERS.headclothEdge,
      tones: [
        { pts: headParts(CLOTH_EDGE_BROWN), color: CLOTH_EDGE_UPPER },
        { pts: headParts(CLOTH_EDGE_DUSK), color: CLOTH_EDGE_MID },
      ],
    },
  }),
  face: KitA({
    ...KIT,
    shape: { ...KIT.shape, browHalf: BROW_HALF },
    eyeLean: EYE_LEAN,
    rest: { mouth: 2.5, browTilt: 0.25 },
    gaze: [260, -160],
  }),
  body: Robe.Traced({
    outline: TUNIC_OUTLINE,
    hem: HEM,
    paper: PAPERS.linen,
    tones: [
      { pts: bodyParts(NEAR_SLEEVE), color: NEAR_SLEEVE_TAN },
      { pts: bodyParts(TUNIC_FOLD), color: PAPERS.linen.shade },
      { pts: bodyParts(VEST_NEAR), color: WALNUT },
      { pts: bodyParts(VEST_FAR), color: WALNUT_SHADE },
      { pts: bodyParts(NECK), color: NECK_SKIN, skin: true },
    ],
  }),
  arms: {
    far: FAR_ARM,
  },
  feet: SANDALS,
  hands: Hands({ paper: PAPERS.farmerHand, share: 0.4 }),
});

export const FARMER_ARM = {
  rest: REST,
  hand: (turn: number): Pt => armHand(FAR_ARM, turn),
} as const;

export const FARMER_KNOBS = farmer.knobs;

export const FARMER_FACE_CHECK = (() => {
  const ys = headParts(FACE).map(([, y]) => y);
  return { node: 'face', height: Math.max(...ys) - Math.min(...ys) } as const;
})();
