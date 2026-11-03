import {
  Bands,
  Ear,
  Hair,
  Hands,
  Head,
  KitA,
  Robe,
  Stance,
  Stature,
  ellipse,
  figure,
  shifted,
} from '@manna/film/style';
import JUDGE_LOCK from './judge.lock.json' with { type: 'json' };
import { PAPERS } from './papers.ts';
import { JUDGE_HAIR, JUDGE_HEAD } from './traced.ts';

const JUDGE = {
  head: { rx: 58.5, ry: 70 },
  neck: 52,
  foot: 300,
} as const;

const HEAD_X = 3.5;

const BREATH = { period: 5, width: 1.008, neck: -2 } as const;

const LUMPS = [
  { pts: ellipse(-40, -58, 20, 12, 14), color: '#c9bdbc', soft: true },
  { pts: ellipse(-10, -75, 20, 10, 14), color: '#c4b7b8', soft: true },
  { pts: ellipse(45, -40, 18, 22, 14), color: '#8b7c96', soft: true },
  { pts: ellipse(30, -66, 14, 12, 14), color: '#9a8ba2', soft: true },
] as const;

const SKIN_TONES = [
  { pts: shifted(JUDGE_HAIR, 0, 2.5), color: '#ec9a77', alpha: 0.7 },
  { pts: shifted(JUDGE_HAIR, 0, 5), color: '#ec9a77', alpha: 0.35 },
  { pts: ellipse(42, 20, 11, 8, 14), color: '#ec9672', alpha: 0.7, soft: true },
] as const;

const BANDS_FROM = JUDGE.neck + 10;

export const judge = figure({
  lock: {
    ...JUDGE_LOCK,
    override: {
      rule: 'FigureLock',
      place: 'judge',
      reason: 'his ink binds to the shot, about 25% thinner in a close shot',
      quote: "For the RBF, that's okay.",
      frees: 'aa08efaef4ab8786975f2daaa68e7897a00dc9ea4be4162709356f6cba689c98',
    },
  },
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/1-cold-34.png' },
    box: [1110, 95, 1510, 410],
  },
  art: { width: 460, height: 520, head: [230, 140] },
  stature: Stature.Canon(),
  stance: Stance.Seated({ breath: BREATH }),
  head: Head.Traced({
    view: 'threeQuarter',
    outline: JUDGE_HEAD,
    y: 0,
    neck: JUDGE.neck,
    set: { x: HEAD_X, cant: 0.15 },
    paper: PAPERS.judgeSkin,
    tones: SKIN_TONES,
  }),
  hair: Hair.Traced({ outline: JUDGE_HAIR, paper: PAPERS.greyHair, tones: LUMPS }),
  ear: Ear.Round({ at: [61, 6], r: [11, 16], paper: PAPERS.ear }),
  face: KitA({
    x: -9.9,
    y: 8.6,
    scale: 1.3,
    shape: {
      eye: [8.65, 13.5],
      eyes: [-11.8, 11.8],
      brows: [-14.9, 11.8],
      browY: -22.6,
      browHalf: 5.8,
      brow: 4.2,
      mouth: [-3, 23],
      mouthHalf: 8.2,
    },
    rest: { browTilt: -0.24, browY: 1.5, mouth: -1.4 },
    gaze: [-900, 160],
  }),
  body: Robe.Cut({
    corners: [
      [-40, 28],
      [40, 28],
      [72, 31],
      [95, 38],
      [117, 48],
      [140, 69],
      [160, 106],
      [178, 156],
      [197, 206],
      [206, JUDGE.foot],
      [-202, JUDGE.foot],
      [-192, 206],
      [-174, 158],
      [-153, 113],
      [-132, 76],
      [-110, 49],
      [-88, 39],
      [-68, 34],
    ],
    radii: [10],
    hem: JUDGE.foot,
    paper: PAPERS.judgeRobe,
  }),
  over: Bands({
    x: HEAD_X,
    gap: 3.25,
    top: 17,
    bottom: 25,
    splay: 4,
    from: BANDS_FROM,
    to: JUDGE.neck + 74,
    paper: PAPERS.bands,
    tones: [{ pts: ellipse(0, BANDS_FROM, 40, 22, 16), color: '#dbd0d5', soft: true }],
  }),
  hands: Hands({ paper: PAPERS.skinHand, share: 0.45 }),
});

export const JUDGE_KNOBS = judge.knobs;

export const JUDGE_FACE_CHECK = { node: 'face', height: 2 * JUDGE.head.ry } as const;
