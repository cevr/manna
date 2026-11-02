// The cold open, drawn to its kept panels (`cold.baby.3`, `cold.letter.4`,
// `cold.what.3`) on the feast's courtyard plates (`plates/plates.ts`), one
// beat to each of the script's marks. `baby`: the mother holds her baby at
// the cup behind the long table, framed close. `grown`: the camera trucks
// down the table to the lead, seated between the villager and the mother
// where the title stands them, his bottle raised (`bottle`).
//
// The camera is one framing of the frame px the title ends on: a centre and
// a zoom, each plane moved by its share (`PLANES`), so a far plane drifts and
// grows less than the table. Each move runs from where the last one left it
// (`MOVES`).

import { drawing } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { PUPPETS as LEAD } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';
import { PUPPETS as VILLAGER } from '../cast/idea-villagers/cutout/puppets.ts';
import { DISTANCE, NEAR, PANEL, PLANES, SKY, TABLE } from '../plates/plates.ts';

/** A camera on the title's end framing, frame px: the point at the frame's centre and the zoom. */
type Camera = { readonly x: number; readonly y: number; readonly k: number };

/** The frame's centre, frame px. */
const CENTRE = [960, 540] as const;

/** Where the guests' feet stand behind the table, panel px: the title's guests stand there. */
const FLOOR = 925;

/**
 * The guests behind the table, panel px: where each sits (the head's
 * centre), and its kept view's head box, root and box height (sheet px, its
 * `puppets.ts`). Each view is sized so its head is as wide as the head of
 * the front view the title stands, `head` panel px (the front's head box
 * width times the title's scale), and its feet stand on `FLOOR`.
 */
const GUESTS = {
  villager: { x: 560, head: 103.1, box: [13, 0, 195, 152], root: [106, 303], h: 512 },
  lead: { x: 768, head: 80, box: [138, 0, 497, 433], root: [304, 663], h: 1115 },
  mother: { x: 960, head: 97.6, box: [78, 0, 365, 240], root: [193, 448], h: 824 },
} as const;

/**
 * The cold open's framings, each a cue and where it leaves the camera:
 * close on the mother at the cup, trucked down the table to the lead, pushed
 * in on his bottle. TODO(close plate): `baby` frames the courtyard plates at
 * 1.5x; it moves to the painter's `cold-baby-back` plate once that plate is
 * committed.
 *
 * The plates cover frame x 0..1920 and y -100..1180, and the table, the
 * nearest plane, binds: every framing keeps 960/k <= x <= 1920 - 960/k and
 * 540/k - 100 <= y <= 1180 - 540/k, so no plate's edge shows. A move is a
 * straight line in (x, y, k) and each bound curves away from that line, so a
 * move whose two ends keep the bounds keeps them all the way.
 */
const START: Camera = { x: 1200, y: 800, k: 1.44 };
const MOVES = [
  ['baby', { x: 1200, y: 820, k: 1.5 }],
  ['truck', { x: 960, y: 796, k: 1.42 }],
  ['bottle', { x: 952, y: 812, k: 1.5 }],
] as const satisfies ReadonlyArray<readonly [string, Camera]>;

const between = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  k: lerp(a.k, b.k, t),
});

export const cold = drawing({
  timeline: {
    baby: { mark: 'baby', until: 'grown', ease: 'inOutSine' },
    truck: { mark: 'grown', until: 'bottle', ease: 'inOutCubic' },
    bottle: { mark: 'bottle', dur: 0.7, ease: 'outCubic' },
  },
  puppets: {
    villager: VILLAGER['poses-6'],
    lead: LEAD['single-9'],
    mother: MOTHER['poses-1'],
  },
  paintings: { sky: SKY, distance: DISTANCE, near: NEAR, table: TABLE },
  draw: (f) => {
    const { ctx, w } = f;
    const camera = MOVES.reduce<Camera>((cam, [cue, to]) => between(cam, to, f.at(cue)), START);
    // One plane, frame px: its share of the camera's zoom and of its move off the centre.
    const plane = (z: number, draw: () => void) => {
      const k = 1 + (camera.k - 1) / z;
      const x = CENTRE[0] + (camera.x - CENTRE[0]) / z;
      const y = CENTRE[1] + (camera.y - CENTRE[1]) / z;
      ctx.save();
      ctx.scale(w / 1920, w / 1920);
      ctx.translate(CENTRE[0], CENTRE[1]);
      ctx.scale(k, k);
      ctx.translate(-x, -y);
      draw();
      ctx.restore();
    };
    // Inside a plane, the kept panel's px.
    const panel = (draw: () => void) => {
      ctx.save();
      ctx.scale(PANEL.scale, PANEL.scale);
      ctx.translate(0, -PANEL.y);
      draw();
      ctx.restore();
    };
    // A guest: its head centred on its seat, its feet on the floor.
    const guest = (name: keyof typeof GUESTS) => {
      const g = GUESTS[name];
      const scale = g.head / (g.box[2] - g.box[0]);
      const headX = (g.box[0] + g.box[2]) / 2;
      f.puppet(name, {
        numbers: {},
        root: [g.x + scale * (g.root[0] - headX), FLOOR - scale * (g.h - g.root[1])],
        scale,
      });
    };
    plane(PLANES.sky, () => f.painting('sky'));
    plane(PLANES.distance, () => f.painting('distance'));
    plane(PLANES.near, () => f.painting('near'));
    plane(PLANES.guests, () =>
      panel(() => {
        guest('villager');
        guest('lead');
        guest('mother');
      }),
    );
    plane(PLANES.table, () => f.painting('table'));
  },
});
