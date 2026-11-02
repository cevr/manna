// The cold open, drawn to its kept panels (`cold.baby.3`, `cold.letter.4`,
// `cold.what.3`), one shot to each of the script's marks. `baby`: close on
// the mother with her baby at the cup, on the close plate painted to
// `cold.baby.3` (`BABY_BACK`), the camera pushing in on the baby's face.
// `grown` cuts to the feast's courtyard plates on the mother at the long
// table and trucks down it to the lead, who stands between the villager and
// the mother where the title stands them, his bottle raised (`bottle`).
// `smile` pulls back to the three guests at the table, who hold still. On
// `letter` a rolled scroll drops onto the table in front of the lead and
// unrolls over its edge (`SCROLL`).
// `what` cuts to the last close plate (`WHAT`), the cup of milk and the
// bread, and the camera lifts to them.
//
// A shot's camera is a centre and a zoom on its plates' frame px, each plane
// moved by its share (`PLANES`), so a far plane drifts and grows less than a
// near one. Each courtyard move runs from where the last one left it
// (`MOVES`).

import { drawing } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { PUPPETS as LEAD } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';
import { PUPPETS as VILLAGER } from '../cast/idea-villagers/cutout/puppets.ts';
import { BABY_BACK, DISTANCE, NEAR, PANEL, PLANES, SKY, TABLE, WHAT } from '../plates/plates.ts';
import { SCROLL_OPEN, SCROLL_ROLLED, SCROLL_ROLLER } from '../plates/props.ts';

/** A camera on a shot's plates, frame px: the point at the frame's centre and the zoom. */
type Camera = { readonly x: number; readonly y: number; readonly k: number };

/** The frame's centre, frame px. */
const CENTRE = [960, 540] as const;

/** The camera at zoom `k` that holds plane-1 point `p` at frame point `at`. */
const holding = (p: readonly [number, number], at: readonly [number, number], k: number) => ({
  x: p[0] - (at[0] - CENTRE[0]) / k,
  y: p[1] - (at[1] - CENTRE[1]) / k,
  k,
});

/**
 * The close on the mother at the cup (`cold.baby.3`), on `BABY_BACK`'s frame
 * px. The camera pushes in to `k` holding the baby's eyes where the panel
 * has them (`eyes`, the panel's (632, 478) on the frame), and she is sized
 * so that at the push's end she is the panel's size (`scale`, frame px a
 * sheet px: the baby's eyes are 65 panel px apart, 40 on her sheet). `on`
 * is the baby's eyes on her poses-1 part sheet and `root` her root there,
 * sheet px. The plate stands `back` behind her, as a camera's divisor.
 */
const BABY = {
  eyes: [790, 497],
  scale: 2,
  k: 1.12,
  on: [121, 238.5],
  root: [193, 448],
  back: 3,
} as const;

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
 * The courtyard's framings, on the frame px the title ends on: from `grown`
 * the camera starts on the mother at the table (`START`), trucks down the
 * table to the lead, pushes in on his bottle, pulls back to the three
 * guests (`smile`) and pushes in on the letter's gold seal under his face
 * (`quote`), each a cue and where it leaves the camera.
 *
 * The plates cover frame x 0..1920 and y -100..1180, and the table, the
 * nearest plane, binds: every framing keeps 960/k <= x <= 1920 - 960/k and
 * 540/k - 100 <= y <= 1180 - 540/k, so no plate's edge shows. A move is a
 * straight line in (x, y, k) and each bound curves away from that line, so a
 * move whose two ends keep the bounds keeps them all the way. The close
 * plates are painted on the same grid, so the same bounds hold on them.
 */
const START: Camera = { x: 1200, y: 816, k: 1.5 };
const MOVES = [
  ['truck', { x: 960, y: 796, k: 1.42 }],
  ['bottle', { x: 952, y: 812, k: 1.5 }],
  ['smile', { x: 955, y: 744, k: 1.25 }],
  ['quote', { x: 996, y: 818, k: 1.5 }],
] as const satisfies ReadonlyArray<readonly [string, Camera]>;

/**
 * The letter (`cold.letter.4`), on the table's plane px: the rolled scroll
 * falls from above the frame (its foot at `from`) onto the table in front of
 * the lead (its foot's centre at `x`, `land`), hops `hop` px once, and
 * unrolls down over the table's front edge, its top roller held where the
 * rolled scroll's lay and its lower roller riding down the open scroll's
 * rows `roll[0]` to `roll[1]`, where `SCROLL_ROLLER` lies on it. At
 * `roll[0]` the lower roller's foot is the rolled scroll's foot. `s` is plane
 * px a scroll px.
 */
const SCROLL = {
  x: 960,
  from: 280,
  land: 978,
  hop: 10,
  s: 0.36,
  roll: [114, 280],
} as const;

/** The last close (`cold.what.3`), on `WHAT`'s frame px: the camera lifts to the cup and the bread and pushes in a little. */
const LIFT = { from: { x: 960, y: 640, k: 1 }, to: { x: 960, y: 552, k: 1.03 } } as const;

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
    smile: { mark: 'smile', dur: 1.6, ease: 'inOutCubic' },
    drop: { mark: 'letter', dur: 0.4, ease: 'inQuad' },
    hop: { after: 'drop', dur: 0.24, ease: 'linear' },
    unfurl: { after: 'hop', dur: 0.15, ease: 'linear' },
    unroll: { after: 'unfurl', dur: 1, ease: 'inOutCubic' },
    quote: { mark: 'quote', dur: 2.6, ease: 'inOutSine' },
    what: { mark: 'what', until: { at: 'end' }, ease: 'inOutSine' },
  },
  puppets: {
    villager: VILLAGER['poses-6'],
    lead: LEAD['single-9'],
    mother: MOTHER['poses-1'],
  },
  paintings: {
    sky: SKY,
    distance: DISTANCE,
    near: NEAR,
    table: TABLE,
    back: BABY_BACK,
    what: WHAT,
    rolled: SCROLL_ROLLED,
    open: SCROLL_OPEN,
    roller: SCROLL_ROLLER,
  },
  draw: (f) => {
    const { ctx, w } = f;
    // One plane of a shot, frame px: its share of the camera's zoom and of its move off the centre.
    const plane = (camera: Camera, z: number, draw: () => void) => {
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
    // Inside a courtyard plane, the kept panel's px.
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

    // The letter on the table's plane: the rolled scroll falling and hopping,
    // then fading off the open scroll laid under it, which unrolls top down:
    // its rows above the lower roller, the roller on them.
    const scroll = () => {
      const hop = f.at('hop');
      const foot = lerp(SCROLL.from, SCROLL.land, f.at('drop')) - SCROLL.hop * 4 * hop * (1 - hop);
      const unfurl = f.at('unfurl');
      ctx.save();
      ctx.translate(SCROLL.x, foot);
      ctx.scale(SCROLL.s, SCROLL.s);
      if (unfurl > 0) {
        const unroll = f.at('unroll');
        ctx.save();
        ctx.translate(0, -SCROLL_ROLLED.size[1]);
        if (unroll < 1) {
          const row = lerp(SCROLL.roll[0], SCROLL.roll[1], unroll);
          ctx.save();
          ctx.beginPath();
          ctx.rect(SCROLL_OPEN.at[0], 0, SCROLL_OPEN.size[0], row + 4);
          ctx.clip();
          f.painting('open');
          ctx.restore();
          ctx.translate(0, row - SCROLL_ROLLER.at[1]);
          f.painting('roller');
        } else f.painting('open');
        ctx.restore();
      }
      if (unfurl < 1) {
        ctx.globalAlpha = 1 - unfurl;
        f.painting('rolled');
      }
      ctx.restore();
    };

    if (f.t < f.cue('truck').start) {
      const camera = holding(BABY.eyes, BABY.eyes, lerp(1, BABY.k, f.at('baby')));
      const scale = BABY.scale / BABY.k;
      plane(camera, BABY.back, () => f.painting('back'));
      plane(camera, 1, () =>
        f.puppet('mother', {
          numbers: {},
          root: [
            BABY.eyes[0] + scale * (BABY.root[0] - BABY.on[0]),
            BABY.eyes[1] + scale * (BABY.root[1] - BABY.on[1]),
          ],
          scale,
        }),
      );
      return;
    }
    if (f.t >= f.cue('what').start) {
      const camera = between(LIFT.from, LIFT.to, f.at('what'));
      plane(camera, 1, () => f.painting('what'));
      return;
    }
    const camera = MOVES.reduce<Camera>((cam, [cue, to]) => between(cam, to, f.at(cue)), START);
    plane(camera, PLANES.sky, () => f.painting('sky'));
    plane(camera, PLANES.distance, () => f.painting('distance'));
    plane(camera, PLANES.near, () => f.painting('near'));
    plane(camera, PLANES.guests, () =>
      panel(() => {
        guest('villager');
        guest('lead');
        guest('mother');
      }),
    );
    plane(camera, PLANES.table, () => {
      f.painting('table');
      if (f.t >= f.cue('drop').start) scroll();
    });
  },
});
