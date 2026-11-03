import p1Band from './sheets/poses-1/band.png' with { type: 'file' };
import p1Beard from './sheets/poses-1/beard.png' with { type: 'file' };
import p1Head from './sheets/poses-1/head.png' with { type: 'file' };
import p1HeadCovered from './sheets/poses-1/head-covered.png' with { type: 'file' };
import p1Headwear from './sheets/poses-1/headwear.png' with { type: 'file' };
import p1Mantle from './sheets/poses-1/mantle.png' with { type: 'file' };
import p1Torso from './sheets/poses-1/torso.png' with { type: 'file' };
import p2Head from './sheets/poses-2/head.png' with { type: 'file' };
import p2Mantle from './sheets/poses-2/mantle.png' with { type: 'file' };
import p2Torso from './sheets/poses-2/torso.png' with { type: 'file' };
import p3Beard from './sheets/poses-3/beard.png' with { type: 'file' };
import p3Head from './sheets/poses-3/head.png' with { type: 'file' };
import p3HeadCovered from './sheets/poses-3/head-covered.png' with { type: 'file' };
import p3Headwear from './sheets/poses-3/headwear.png' with { type: 'file' };
import p3Mantle from './sheets/poses-3/mantle.png' with { type: 'file' };
import p3Torso from './sheets/poses-3/torso.png' with { type: 'file' };
import p4Head from './sheets/poses-4/head.png' with { type: 'file' };
import p4Mantle from './sheets/poses-4/mantle.png' with { type: 'file' };
import p4Torso from './sheets/poses-4/torso.png' with { type: 'file' };
import type { Ramp } from '@manna/film/canvas';
import { Option, Record as Records } from 'effect';
import { type CutPuppet, puppetsOf } from '../../../cutout/puppets.ts';
import { CUTS } from './cut.ts';
import { FRAMES } from './frames.ts';
import { RAMPS } from './sheets/ramps.ts';
import { SKELETONS } from './skeleton.ts';

/**
 * Their sheet's line, which a look draws again near what moved: about 11 px
 * across their outer outline, as the feast's guest man's, laid half a pixel
 * wider, in the sheet's outline ink (about 16,4,0, `cut.ts`).
 */
export const LINE = { width: 11.5, ink: [16, 4, 0] } as const;

/**
 * Each cut view's paper, the sheet's ground (about 249,232,208 in every
 * view), which its rim is un-matted from (`core/unmatte.ts`). The grown
 * pair's cream robe is painted in nearly that colour, but each robe lies
 * inside its ink, where the un-matte's paper does not reach, and their cutter
 * dyes it linen.
 */
export const PAPERS = {
  'poses-1': [249, 232, 208],
  'poses-2': [249, 232, 208],
  'poses-3': [249, 232, 208],
  'poses-4': [249, 232, 208],
} as const satisfies Readonly<Record<keyof typeof SKELETONS, readonly [number, number, number]>>;

/**
 * Each cut view's bust, by the view's name in their sheet's views: its parts
 * front to back, its house parts (`parts-cut.ts`) before its head and torso,
 * its part sheet the kept box padded (`frames.ts`), the origin at the kept
 * box's top-left corner, held to the kept box (`library/cutout/puppets.ts`).
 */
const BUSTS = puppetsOf({
  cast: 'filler-bases',
  cuts: CUTS,
  frames: FRAMES,
  skeletons: SKELETONS,
  papers: PAPERS,
  underlap: { head: 12 },
  line: LINE,
  parts: {
    'poses-1': [
      ['beard', p1Beard],
      ['band', p1Band],
      ['headwear', p1Headwear],
      ['mantle', p1Mantle],
      ['head', p1Head],
      ['torso', p1Torso],
    ],
    'poses-2': [
      ['mantle', p2Mantle],
      ['head', p2Head],
      ['torso', p2Torso],
    ],
    'poses-3': [
      ['beard', p3Beard],
      ['headwear', p3Headwear],
      ['mantle', p3Mantle],
      ['head', p3Head],
      ['torso', p3Torso],
    ],
    'poses-4': [
      ['mantle', p4Mantle],
      ['head', p4Head],
      ['torso', p4Torso],
    ],
  },
});

/** A view's bust with each part a dress dyes declaring the ramp it is drawn in (`sheets/ramps.ts`). */
const ramped = (puppet: CutPuppet, ramps: Readonly<Record<string, Ramp>>): CutPuppet => ({
  ...puppet,
  parts: puppet.parts.map((part) =>
    Option.match(Option.fromUndefinedOr(ramps[part.name]), {
      onNone: () => part,
      onSome: (ramp) => ({ ...part, ramp }),
    }),
  ),
});

/** The drawing a crowd lays in place of a view's head when the figure wears its headwear (`crowd.ts`). */
export const HEAD_COVERED = 'head-covered';

/**
 * Each headwear view's covered head (`parts-cut.ts`): its head with the hair
 * the headwear hides read from the dressed view, on the head's own canvas,
 * un-matted as the head is.
 */
const COVERED: Partial<Record<keyof typeof BUSTS, string>> = {
  'poses-1': p1HeadCovered,
  'poses-3': p3HeadCovered,
};

/** A view's bust with its covered head among its drawings, when it has one. */
const covered = (puppet: CutPuppet, png: Option.Option<string>): CutPuppet =>
  Option.match(png, {
    onNone: () => puppet,
    onSome: (p) => ({ ...puppet, drawings: [{ name: HEAD_COVERED, png: p, part: 'head' }] }),
  });

/**
 * Each cut view's puppet, by the view's name in their sheet's views: its
 * bust, its dyed parts (`mantle`, `band`) declaring their drawn ramps, and
 * a headwear view's covered head as a drawing.
 */
export const PUPPETS = Records.map(BUSTS, (puppet, view) =>
  covered(ramped(puppet, RAMPS[view]), Option.fromUndefinedOr(COVERED[view])),
);
