// The cold open, drawn to its kept panels (`cold.baby.3`, `cold.letter.4`,
// `cold.what.3`) on the feast's courtyard plates (`plates/plates.ts`), one
// beat to each of the script's marks. `baby`: the mother holds her baby at
// the cup behind the long table, framed close.
//
// The camera is one framing of the frame px the title ends on (`CAMERA`):
// a centre and a zoom, each plane moved by its share (`PLANES`), so a far
// plane drifts and grows less than the table.

import { drawing } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';
import { DISTANCE, NEAR, PANEL, PLANES, SKY, TABLE } from '../plates/plates.ts';

/** A camera on the title's end framing, frame px: the point at the frame's centre and the zoom. */
type Camera = { readonly x: number; readonly y: number; readonly k: number };

/** The frame's centre, frame px. */
const CENTRE = [960, 540] as const;

/**
 * The figures behind the table, panel px: the head's centre and its crown,
 * and each kept view's head box and root (sheet px, its `puppets.ts`). A
 * view's scale sets its head to `HEAD` panel px tall, the head the title's
 * front views wear (the mother's front head is 169 of her 600 px at 290).
 */
const HEAD = 290 * (169 / 600);
const SEATS = {
  mother: { x: 960, crown: 635, head: [78, 0, 365, 240], root: [193, 448] },
} as const;

/**
 * The cold open's framings: `baby` holds close on the mother at the cup.
 * TODO(close plate): `baby` frames the courtyard plates at 1.5x; it moves to
 * the painter's `cold-baby-back` plate once that plate is committed.
 */
const SHOTS = {
  baby: { from: { x: 1200, y: 800, k: 1.44 }, to: { x: 1196, y: 792, k: 1.5 } },
} as const satisfies Record<string, { from: Camera; to: Camera }>;

const between = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  k: lerp(a.k, b.k, t),
});

export const cold = drawing({
  timeline: {
    baby: { at: 'start', until: { at: 'end' }, ease: 'inOutCubic' },
  },
  puppets: { mother: MOTHER['poses-1'] },
  paintings: { sky: SKY, distance: DISTANCE, near: NEAR, table: TABLE },
  draw: (f) => {
    const { ctx, w } = f;
    const camera = between(SHOTS.baby.from, SHOTS.baby.to, f.at('baby'));
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
    // A seated figure: its head centred on the seat's x, its crown on the seat's crown.
    const seat = (name: keyof typeof SEATS) => {
      const s = SEATS[name];
      const scale = HEAD / (s.head[3] - s.head[1]);
      const headX = (s.head[0] + s.head[2]) / 2;
      f.puppet(name, {
        numbers: {},
        root: [s.x + scale * (s.root[0] - headX), s.crown + scale * (s.root[1] - s.head[1])],
        scale,
      });
    };
    plane(PLANES.sky, () => f.painting('sky'));
    plane(PLANES.distance, () => f.painting('distance'));
    plane(PLANES.near, () => f.painting('near'));
    plane(PLANES.guests, () => panel(() => seat('mother')));
    plane(PLANES.table, () => f.painting('table'));
  },
});
