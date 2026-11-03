import {
  Ear,
  Hair,
  Hands,
  Head,
  KitA,
  OpenMouth,
  Robe,
  Shoes,
  Stance,
  Stature,
  ellipse,
  figure,
  shifted,
} from '@manna/film/style';
import PROSECUTOR_LOCK from './prosecutor.lock.json' with { type: 'json' };
import { PAPERS } from './papers.ts';
import { PROSECUTOR_HAIR, PROSECUTOR_HEAD } from './traced.ts';

const PROSECUTOR = {
  height: 540,
  head: { y: -463, rx: 59, ry: 76 },
  neck: -395,
  hem: -34,
} as const;

const BREATH = { period: 4.5, trunk: 1.008, neck: -2.5 } as const;

const SKIN_TONES = [
  { pts: shifted(PROSECUTOR_HAIR, 0, 2.5), color: '#ec9a77', alpha: 0.8 },
  { pts: shifted(PROSECUTOR_HAIR, 0, 5), color: '#ec9a77', alpha: 0.4 },
  { pts: ellipse(34, 18, 12, 9, 14), color: '#ec9672', alpha: 0.7, soft: true },
] as const;

const TUFT = [{ pts: ellipse(-46, -63, 12, 7, 14), color: '#5e4a47', soft: true }] as const;

export const PROSECUTOR_SPEC = {
  lock: {
    ...PROSECUTOR_LOCK,
    override: {
      rule: 'FigureLock',
      place: 'prosecutor',
      reason: 'his ink binds to the shot, about 25% thinner in a close shot',
      quote: "For the RBF, that's okay.",
      frees: '55449cb8729ff73d146a092fd13abf9b9add389ac3b1db60653b072527a760ee',
    },
  },
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/1-cold-34.png' },
    box: [560, 200, 900, 830],
  },
  art: { width: 360, height: 640, feet: [180, 610] },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  head: Head.Traced({
    view: 'threeQuarter',
    outline: PROSECUTOR_HEAD,
    y: PROSECUTOR.head.y,
    neck: PROSECUTOR.neck,
    set: { x: 8, cant: 0.22 },
    paper: PAPERS.prosecutorSkin,
    tones: SKIN_TONES,
  }),
  hair: Hair.Traced({ outline: PROSECUTOR_HAIR, paper: PAPERS.darkHair, tones: TUFT }),
  ear: Ear.Round({ at: [53, 17.5], r: [10, 16.5], paper: PAPERS.ear }),
  face: KitA({
    x: -10.5,
    y: 10.5,
    scale: 1.35,
    shape: {
      eye: [8.45, 14.1],
      eyes: [-10.9, 10.9],
      brows: [-14, 10.3],
      browY: -22.3,
      browHalf: 7.2,
      brow: 3.8,
      mouth: [0, 26.5],
    },
    rest: { browTilt: -0.22, browY: 1.5, mouth: -1.2 },
    gaze: [-400, 40],
  }),
  mouth: OpenMouth({ w: 36, h: 24, paper: '#3a2422' }),
  body: Robe.Cut({
    corners: [
      [-40, PROSECUTOR.neck],
      [40, PROSECUTOR.neck],
      [73, PROSECUTOR.neck + 162],
      [98, PROSECUTOR.hem],
      [0, PROSECUTOR.hem + 5],
      [-98, PROSECUTOR.hem],
      [-73, PROSECUTOR.neck + 162],
    ],
    radii: [22, 22, 30, 6, 90, 6, 30],
    hem: PROSECUTOR.hem,
    paper: PAPERS.olive,
  }),
  feet: Shoes({
    x: 60,
    w: 58,
    h: 28,
    near: { paper: PAPERS.shoe, light: { color: '#9d7559', from: 0, to: 7, depth: 6 } },
    far: { paper: PAPERS.farShoe, light: { color: '#6a4f44', from: 16, to: 11, depth: 5 } },
  }),
  hands: Hands({ paper: PAPERS.skinHand, share: 0.44 }),
} as const;

export const prosecutor = figure(PROSECUTOR_SPEC);

export const PROSECUTOR_KNOBS = prosecutor.knobs;

export const PROSECUTOR_FACE_CHECK = { node: 'face', height: 2 * PROSECUTOR.head.ry } as const;
