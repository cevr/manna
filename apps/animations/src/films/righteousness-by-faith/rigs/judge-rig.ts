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

/** His measures from his head's centre, units: the head, his neck, his robe's foot behind the bench (where his lean turns). */
const JUDGE = {
  head: { rx: 58.5, ry: 70 },
  neck: 52,
  foot: 300,
} as const;

/** How far right of the robe's middle his head and his bands sit, units: cold-34 sets his face's near side in over his robe. */
const HEAD_X = 3.5;

/** His breath: 5 s in and out, his robe 0.8% wider at its top, his neck 2 units up with it. */
const BREATH = { period: 5, width: 1.008, neck: -2 } as const;

/** The lumps of his hair where cold-34 lights them: lighter over his brow and crown, violet-grey over the back, each fading into the grey. */
const LUMPS = [
  { pts: ellipse(-40, -58, 20, 12, 14), color: '#c9bdbc', soft: true },
  { pts: ellipse(-10, -75, 20, 10, 14), color: '#c4b7b8', soft: true },
  { pts: ellipse(45, -40, 18, 22, 14), color: '#8b7c96', soft: true },
  { pts: ellipse(30, -66, 14, 12, 14), color: '#9a8ba2', soft: true },
] as const;

/**
 * Over his skin: the shade his hair lays on his brow (its own outline a
 * little lower, twice, fading), and the warm blush on his far cheek beside
 * his ear (cold-34 #f0a07a).
 */
const SKIN_TONES = [
  { pts: shifted(JUDGE_HAIR, 0, 2.5), color: '#ec9a77', alpha: 0.7 },
  { pts: shifted(JUDGE_HAIR, 0, 5), color: '#ec9a77', alpha: 0.35 },
  { pts: ellipse(42, 20, 11, 8, 14), color: '#ec9672', alpha: 0.7, soft: true },
] as const;

/** His bands' top, under his chin, units from his head's centre. */
const BANDS_FROM = JUDGE.neck + 10;

/**
 * The judge. His head sits on his robe as cold-34 sets it: canted 0.15
 * radians, its crown toward screen right (the slope of his eyes and brows
 * there), and carried 3.5 units right of the robe's middle; his ear behind
 * his features on the far side, where cold-34 cuts it under his hair. His
 * face is Kit A's marks where cold-34 draws them once his eyes are on the
 * dock: dark oval eyes 0.07 across and 0.11 high, 0.19 apart; heavy brows
 * 0.12 above them, the far one nearer the middle; the mouth 0.23 below
 * them; at rest stern, his eyes on the dock. His robe is traced from
 * cold-34 (the concept's robe's edge, at his head's height there): the
 * shoulders risen to his jaw and sloping out to 2.2 head-heights across at
 * the bench, down behind it. His bands are two white tabs from under his
 * chin a narrow gap apart, each wider at its end and splaying a little
 * outward, the chin's lilac shade across their tops (cold-34 #dbd0d5). His
 * hands are 0.45 of his head across, as the concept draws them.
 */
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

/** The view model's numbers at rest: the face kit's, stern, his eyes on the dock, upright. */
export const JUDGE_KNOBS = judge.knobs;

/** The face `check` reads: its node, and his head's height. */
export const JUDGE_FACE_CHECK = { node: 'face', height: 2 * JUDGE.head.ry } as const;
