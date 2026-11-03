import {
  Beard,
  Ear,
  Hair,
  Hands,
  Head,
  KitA,
  type Pt,
  Robe,
  Sandals,
  Stance,
  Stature,
  ellipse,
  figure,
  roundedPolygon,
  tracedKit,
} from '@manna/film/style';
import {
  FRONT_BEARD,
  FRONT_BEARD_LIT,
  FRONT_BEARD_SHADOW,
  FRONT_EARS,
  FRONT_HAIR,
  FRONT_LIP,
  FRONT_LIT,
  FRONT_LOCKS,
  FRONT_MARKS,
  FRONT_NECK,
  FRONT_NECK_SHADE,
  FRONT_PANEL,
  FRONT_REGION,
  FRONT_ROBE_SIDES,
  FRONT_SASH,
  FRONT_SHEEN,
} from './christ-front-traced.ts';
import {
  CHRIST_BEARD,
  CHRIST_BEARD_SHADOW,
  CHRIST_EAR,
  CHRIST_HAIR,
  CHRIST_LIT,
  CHRIST_REGION,
} from './christ-traced.ts';
import { PAPERS } from './papers.ts';

const HEAD = { x: -2, y: -390.5 } as const;
const NECK = -322;

const BREATH = { period: 5, trunk: 1.008, neck: -2.5 } as const;

const LIP = roundedPolygon(
  [
    [-38, 39.5],
    [-27.5, 42.5],
    [-17, 39.5],
    [-18, 45.5],
    [-27.5, 48],
    [-37, 45.5],
  ],
  2,
);

const BEARD_SHADOW = '#29190f';

const HAIR_TONES = [
  { pts: ellipse(-30, -52, 16, 7, 14), color: '#8f5c3a', soft: true },
  { pts: CHRIST_LIT, color: '#a86640' },
  { pts: CHRIST_BEARD_SHADOW, color: BEARD_SHADOW },
] as const;

const ROBE_CUT: Pt[] = [
  [-32.4, -334],
  [31, -334],
  [51.5, -312],
  [57.1, -299.4],
  [64.9, -274.1],
  [71.2, -248.8],
  [75.4, -223.6],
  [79.7, -198.3],
  [80.4, -188.2],
  [60.6, -154.1],
  [62.7, -122.5],
  [65.6, -97.3],
  [67.7, -72],
  [70.5, -46.7],
  [71.9, -24],
  [0, -19],
  [-79.7, -24],
  [-77.6, -46.7],
  [-74.7, -72],
  [-71.9, -97.3],
  [-69.1, -122.5],
  [-66.3, -154.1],
  [-83.9, -188.2],
  [-82.5, -198.3],
  [-76.8, -223.6],
  [-71.2, -248.8],
  [-64.2, -274.1],
  [-56.4, -299.4],
  [-49.4, -312],
];
const ROBE_RADII = [
  20, 20, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 60, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6,
];

const hemOf = (corners: ReadonlyArray<Pt>, radii: ReadonlyArray<number>) =>
  Math.max(...roundedPolygon(corners, radii).map(([, y]) => y));

const SASH_RIGHT: Pt[] = [
  [40, -345],
  [38, -322],
  [48, -306],
  [45, -282],
  [42, -266],
  [37, -250],
  [31, -226],
  [23, -202],
  [16, -186],
  [8, -170],
  [0, -154],
  [-9, -138],
  [-21, -122],
  [-38, -104],
  [-55, -86],
  [-66, -74],
  [-78, -62],
];
const SASH_LEFT: Pt[] = [
  [24, -345],
  [22, -322],
  [15, -306],
  [5, -282],
  [-7, -258],
  [-20, -234],
  [-35, -210],
  [-47, -194],
  [-55, -178],
  [-64, -162],
  [-73, -148],
  [-95, -140],
  [-95, -60],
];

const sashShade = (right: ReadonlyArray<Pt>): Pt[] => [
  ...right,
  ...right.map(([x, y]): Pt => [x - 7, y]).reverse(),
];
const SASH_SHADE = sashShade(SASH_RIGHT);

const NECKLINE = roundedPolygon(
  [
    [-25, -330],
    [13, -330],
    [-10, -285],
  ],
  4,
);
const NECK_SHADE: Pt[] = [
  [-25, -330],
  [13, -330],
  [6, -312],
  [-17, -312],
];

const ROBE_SHADE: Pt[] = [...SASH_RIGHT, [140, -62], [140, -345]];

const ROBE_SHADING = { pts: ROBE_SHADE, color: '#cdbecb' } as const;
const SASH_TONES = [
  { pts: [...SASH_LEFT, ...[...SASH_RIGHT].reverse()], color: '#dca561' },
  { pts: SASH_SHADE, color: '#b8875a' },
] as const;
const NECK_SKIN = '#fbbb87';
const NECK_SKIN_SHADE = '#e59a76';

const ROBE_TONES = [
  ROBE_SHADING,
  ...SASH_TONES,
  { pts: NECKLINE, color: NECK_SKIN, skin: true },
  { pts: NECK_SHADE, color: NECK_SKIN_SHADE, skin: true },
] as const;

const SOLE = '#43291c';

const SANDALS = Sandals({
  paper: PAPERS.christSkin,
  near: {
    corners: [
      [-97, -1],
      [-97, -7],
      [-80, -16.5],
      [-31, -18],
      [-30, -1],
    ],
    radii: [3, 5, 12, 2, 2],
    tones: [
      {
        pts: [
          [-75, -19],
          [-63, -19],
          [-49, -6],
          [-57, -6],
        ],
        color: '#6b4430',
      },
    ],
  },
  far: {
    corners: [
      [22, -1],
      [22, -17],
      [52, -16.5],
      [70, -5],
      [70, -1],
    ],
    radii: [2, 2, 12, 5, 3],
  },
  sole: SOLE,
});

const HIM = {
  art: { width: 300, height: 520, feet: [150, 495] },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  feet: SANDALS,
  hands: Hands({ paper: PAPERS.christHand, share: 0.35 }),
} as const;

const ROBE = {
  corners: ROBE_CUT,
  radii: ROBE_RADII,
  hem: hemOf(ROBE_CUT, ROBE_RADII),
  paper: PAPERS.whiteRobe,
};

const lipOf = (outline: ReadonlyArray<Pt>) => ({ outline, paper: PAPERS.christLip });

export const christ = figure({
  ...HIM,
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/5-court-12.png' },
    box: [370, 270, 575, 760],
  },
  head: Head.Traced({
    view: 'threeQuarter',
    outline: CHRIST_REGION,
    y: HEAD.y,
    neck: NECK,
    set: { x: HEAD.x },
    paper: PAPERS.christSkin,
  }),
  beard: Beard({ outline: CHRIST_BEARD, paper: PAPERS.beard, lip: lipOf(LIP) }),
  ear: Ear.Traced({ outline: CHRIST_EAR, paper: PAPERS.christEar }),
  hair: Hair.Traced({ outline: CHRIST_HAIR, paper: PAPERS.brownHair, tones: HAIR_TONES }),
  face: KitA({
    x: 0,
    y: 0,
    scale: 1,
    shape: {
      eyes: [-41, -12.4],
      eyeY: 0.9,
      eye: [9.5, 17.5],
      turn: 0.5,
      brows: [-39.8, -7.3],
      browY: -19,
      browHalf: 7.6,
      brow: 5,
      mouth: [-27.5, 39.5],
      mouthHalf: 10.5,
      mouthLine: 3.5,
    },
    rest: { mouth: 3 },
    gaze: [-300, 0],
  }),
  body: Robe.Cut({ ...ROBE, tones: ROBE_TONES }),
});

export const CHRIST_KNOBS = christ.knobs;

const fromFront = ([x, y]: Pt): Pt => [
  +((x - FRONT_PANEL.head[0]) * FRONT_PANEL.scale).toFixed(2),
  +((y - FRONT_PANEL.head[1]) * FRONT_PANEL.scale).toFixed(2),
];
const front = (pts: ReadonlyArray<Pt>) => pts.map(fromFront);
const frontBody = (pts: ReadonlyArray<Pt>) =>
  front(pts).map(([x, y]): Pt => [+(x + HEAD.x).toFixed(2), +(y + HEAD.y).toFixed(2)]);

const FRONT_ROBE_CUT: Pt[] = [
  [-32.4, -334],
  [44, -334],
  ...frontBody(FRONT_ROBE_SIDES.far),
  [100.5, -240],
  [101.5, -222],
  [101, -205],
  [100, -190],
  ...ROBE_CUT.slice(9, 26),
  ...frontBody(FRONT_ROBE_SIDES.near),
];
const FRONT_ROBE_RADII = [
  20,
  20,
  ...FRONT_ROBE_SIDES.far.map(() => 4),
  4,
  4,
  4,
  4,
  ...ROBE_RADII.slice(9, 26),
  ...FRONT_ROBE_SIDES.near.map(() => 4),
];
const FRONT_ROBE = {
  corners: FRONT_ROBE_CUT,
  radii: FRONT_ROBE_RADII,
  hem: hemOf(FRONT_ROBE_CUT, FRONT_ROBE_RADII),
  paper: PAPERS.whiteRobe,
};

const FRONT_SASH_RIGHT: Pt[] = [
  [80, -345],
  ...frontBody(FRONT_SASH.right),
  [-55, -86],
  [-66, -74],
  [-78, -62],
];
const FRONT_SASH_LEFT: Pt[] = [[40, -345], ...frontBody(FRONT_SASH.left), [-95, -130], [-95, -60]];

const FRONT_ROBE_TONES = [
  { pts: [...FRONT_SASH_RIGHT, [140, -62], [140, -345]] satisfies Pt[], color: ROBE_SHADING.color },
  { pts: frontBody(FRONT_NECK), color: NECK_SKIN, skin: true },
  { pts: frontBody(FRONT_NECK_SHADE), color: NECK_SKIN_SHADE, soft: true, skin: true },
  { pts: [...FRONT_SASH_LEFT, ...[...FRONT_SASH_RIGHT].reverse()], color: SASH_TONES[0].color },
  { pts: sashShade(FRONT_SASH_RIGHT), color: SASH_TONES[1].color },
] as const;
const FRONT_HEAD = front(FRONT_REGION);
const LOCK = { near: '#4c2e1e', far: '#3a241c' } as const;

export const christFront = figure({
  ...HIM,
  concept: {
    image: { set: 'rbf-v3-cast-2026-10-18', file: 'aids/court-you-2.png' },
    box: [700, 70, 1080, 760],
  },
  head: Head.Traced({
    view: 'front',
    outline: FRONT_HEAD,
    y: HEAD.y,
    neck: NECK,
    set: { x: HEAD.x },
    paper: PAPERS.christSkin,
  }),
  beard: Beard({
    outline: front(FRONT_BEARD),
    paper: PAPERS.beard,
    tones: [{ pts: front(FRONT_BEARD_LIT), color: PAPERS.beard.light, soft: true }],
    lip: lipOf(front(FRONT_LIP)),
  }),
  ear: Ear.Both({
    near: front(FRONT_EARS.near),
    far: front(FRONT_EARS.far),
    paper: PAPERS.christEar,
  }),
  hair: Hair.Traced({
    outline: front(FRONT_HAIR),
    paper: PAPERS.brownHair,
    tones: [
      { pts: front(FRONT_SHEEN), color: '#8d4f29', soft: true },
      { pts: front(FRONT_LIT), color: '#d08445' },
      { pts: front(FRONT_LOCKS.near), color: LOCK.near },
      { pts: front(FRONT_LOCKS.far), color: LOCK.far },
      { pts: front(FRONT_BEARD_SHADOW.near), color: BEARD_SHADOW },
      { pts: front(FRONT_BEARD_SHADOW.far), color: BEARD_SHADOW },
    ],
  }),
  face: KitA({ ...tracedKit(FRONT_MARKS, FRONT_PANEL, 0.5), rest: { mouth: 3 }, gaze: [0, 40] }),
  body: Robe.Cut({ ...FRONT_ROBE, tones: FRONT_ROBE_TONES }),
});

export const CHRIST_FRONT_KNOBS = christFront.knobs;

const faceCheckOf = (outline: ReadonlyArray<Pt>) => {
  const ys = outline.map(([, y]) => y);
  return { node: 'face', height: Math.max(...ys) - Math.min(...ys) } as const;
};
export const CHRIST_FACE_CHECK = faceCheckOf(CHRIST_REGION);
export const CHRIST_FRONT_FACE_CHECK = faceCheckOf(FRONT_HEAD);
