// What milk is, drawn to its kept panels (`milk.newborn.5`, `milk.word.5`,
// `milk.shame.6`) on the parchment page matched from the cup on the
// courtyard table in `cold` (`PAGE`). The grown villager stands right of
// centre with his cup raised at picture left (his kept single-15 view, whose
// sides are kept, so the shot mirrors the panel), swaying a little as he
// stands, and on `peter` the camera pushes in on him and his cup.
//
// A shot's camera is a centre and a zoom on the page's frame px; each move
// runs from where the last one left it (`MOVES`). The page covers frame x
// 0..1920 and y -100..1180, so every framing keeps 960/k <= x <= 1920 - 960/k
// and 540/k - 100 <= y <= 1180 - 540/k, and a straight move in (x, y, k)
// between two framings that keep them keeps them all the way.

import { drawing } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { PUPPETS as VILLAGER } from '../cast/idea-villagers/cutout/puppets.ts';
import { PAGE } from '../plates/milk.ts';

/** A camera on the page, frame px: the point at the frame's centre and the zoom. */
type Camera = { readonly x: number; readonly y: number; readonly k: number };

/** The frame's centre, frame px. */
const CENTRE = [960, 540] as const;

/** The whole page, as the scene opens. */
const WIDE: Camera = { x: 960, y: 540, k: 1 };

/** Shot A's framings, each a cue and where it leaves the camera: `push` closes in on the villager and his cup. */
const MOVES = [['push', { x: 1060, y: 380, k: 1.35 }]] as const satisfies ReadonlyArray<
  readonly [string, Camera]
>;

/**
 * The grown villager, frame px: his root (the hip) and his scale, so he
 * stands about 950 px from crown to feet as the panel's villager does. As he
 * stands he leans `lean` degrees each way every `leanPeriod` s and turns his
 * head `head` degrees every `headPeriod` s, the two out of step.
 */
const MAN = {
  root: [1200, 630],
  scale: 0.83,
  lean: 1,
  leanPeriod: 4,
  head: 1.5,
  headPeriod: 3.3,
} as const;

const between = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  k: lerp(a.k, b.k, t),
});

export const milk = drawing({
  timeline: {
    push: { mark: 'peter', dur: 1.4, ease: 'inOutCubic' },
  },
  puppets: {
    villager: VILLAGER['single-15'],
  },
  paintings: {
    page: PAGE,
  },
  draw: (f) => {
    const { ctx, w } = f;
    // The page's frame px under the camera.
    const view = (camera: Camera, draw: () => void) => {
      ctx.save();
      ctx.scale(w / 1920, w / 1920);
      ctx.translate(CENTRE[0], CENTRE[1]);
      ctx.scale(camera.k, camera.k);
      ctx.translate(-camera.x, -camera.y);
      draw();
      ctx.restore();
    };
    const sway = (degrees: number, period: number, phase: number) =>
      degrees * Math.sin((2 * Math.PI * f.t) / period + phase);

    const camera = MOVES.reduce<Camera>((cam, [cue, to]) => between(cam, to, f.at(cue)), WIDE);
    view(camera, () => {
      f.painting('page');
      f.puppet('villager', {
        numbers: {
          lean: sway(MAN.lean, MAN.leanPeriod, 0),
          head: sway(MAN.head, MAN.headPeriod, 1.3),
        },
        root: MAN.root,
        scale: MAN.scale,
      });
    });
  },
});
