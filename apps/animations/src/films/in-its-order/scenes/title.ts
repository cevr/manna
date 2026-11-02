// The title, painted to its kept panel (`title.start.2`): the feast's
// courtyard under the teal sky as the painter's plates (`plates/plates.ts`),
// a small dawn light on the green hill and the gold path drawing on up to it.
// The cold open's people sit behind the long table (`seatTable`): a man
// guest, the lead at rest, a woman guest, each guest in its neutral key, and
// the mother with her baby behind the woman, fewer than the panel's ten, so
// the cut to the cold open keeps one table. The camera pulls back from a near
// framing to the panel's own, each plane by its distance (`PLANES`), while
// the film's name settles on a torn strip of the film's dark paper over the
// sky: the only text (`CARDS`).

import { drawing, piece, probePlate, rounded, write } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { fonts, palette as P } from '../palette.ts';
import { DISTANCE, NEAR, PANEL, PATH, PATH_BRUSH, PLANES, SKY, TABLE } from '../plates/plates.ts';
import { TITLE } from '../script.ts';
import { TABLE_PAINTINGS, TABLE_PUPPETS, seatTable, seatedLead } from './table.ts';

/** The film's name: its strip's centre and size over the sky (panel px), and its type. */
const NAME = {
  x: 768,
  y: 170,
  w: 780,
  h: 130,
  style: { family: fonts.display, size: 76, weight: 700, color: P.cream, align: 'center' },
} as const;

/** Where the pull centres, frame px: the table's middle (the panel's [768, 640]). */
const PIVOT = [960, 700] as const;

/** One step of the path's brush, frame px: its centre, its radius and how far it lies from the foot. */
type Step = readonly [x: number, y: number, r: number, from: number];

/**
 * The path's brush walked from the foot to the top in steps of 1 px, moved
 * from the distance plate's px to the frame's, the radius running straight
 * between two points as the centre does.
 */
const walk = (): ReadonlyArray<Step> => {
  const [dx, dy] = DISTANCE.at;
  const steps: Array<Step> = [];
  let last: Step | undefined;
  for (const [bx, by, r] of PATH_BRUSH) {
    const [x, y] = [bx + dx, by + dy];
    if (last === undefined) {
      last = [x, y, r, 0];
      steps.push(last);
      continue;
    }
    const [x0, y0, r0, from] = last;
    const length = Math.hypot(x - x0, y - y0);
    const n = Math.max(1, Math.ceil(length));
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      steps.push([lerp(x0, x, t), lerp(y0, y, t), lerp(r0, r, t), from + length * t]);
    }
    last = [x, y, r, from + length];
  }
  return steps;
};
const STEPS = walk();
const PATH_LENGTH = STEPS.at(-1)?.[3] ?? 0;

/** Clip to the brush's circles from the foot up to `progress` (0..1) of the path's length. */
const clipPath = (ctx: CanvasRenderingContext2D, progress: number) => {
  const reach = progress * PATH_LENGTH;
  ctx.beginPath();
  for (const [x, y, r, from] of STEPS) {
    if (from > reach) break;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.clip();
};

export const title = drawing({
  timeline: {
    // The title has no words and no score; only the courtyard bed plays under it. The score replaces this cue.
    hush: { at: 'start', until: { at: 'end' }, silence: true },
    // The camera keeps pulling back over the whole title.
    pull: { at: 'start', until: { at: 'end' }, ease: 'outCubic' },
    settle: { at: 'start', offset: 0.25, dur: 0.8, ease: 'outCubic' },
    path: { at: 'start', offset: 0.6, dur: 1.4, ease: 'inOutCubic' },
  },
  knobs: {
    // How close the pull starts on the nearest plane; it ends on the panel's own framing.
    near: 1.12,
  },
  puppets: TABLE_PUPPETS,
  paintings: {
    sky: SKY,
    distance: DISTANCE,
    path: PATH,
    near: NEAR,
    table: TABLE,
    ...TABLE_PAINTINGS,
  },
  draw: (f) => {
    const { ctx, w } = f;
    const zoom = lerp(f.knob('near'), 1, f.at('pull'));
    // One plane: frame px, pulled about the pivot by its share of the zoom.
    const plane = (z: number, draw: () => void) => {
      const k = 1 + (zoom - 1) / z;
      ctx.save();
      ctx.scale(w / 1920, w / 1920);
      ctx.translate(PIVOT[0], PIVOT[1]);
      ctx.scale(k, k);
      ctx.translate(-PIVOT[0], -PIVOT[1]);
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
    plane(PLANES.sky, () => f.painting('sky'));
    plane(PLANES.distance, () => {
      f.painting('distance');
      // The painter's gold path, revealed along its length from the foot.
      const path = f.at('path');
      if (path <= 0) return;
      ctx.save();
      clipPath(ctx, path);
      f.painting('path');
      ctx.restore();
    });
    plane(PLANES.near, () => f.painting('near'));
    plane(PLANES.guests, () =>
      panel(() => seatTable(f, 'neutral', () => seatedLead(f, 'raise-rest'))),
    );
    plane(PLANES.table, () => f.painting('table'));
    // The name, on a torn strip of the film's dark paper, settling over the sky.
    plane(PLANES.sky, () =>
      panel(() => {
        const settle = f.at('settle');
        const y = lerp(NAME.y + 22, NAME.y, settle);
        const shape = rounded(NAME.x, y, NAME.w, NAME.h, 0);
        probePlate(ctx, shape, () => {
          piece(
            ctx,
            shape,
            {
              role: 'scenery',
              kind: 'torn',
              torn: 5,
              shadow: 0.3,
              alpha: settle,
              color: P.ink,
              outline: P.outline,
            },
            f.hand('strip'),
          );
          write(ctx, TITLE, NAME.x, y + 26, NAME.style, f.hand('title'), {
            alpha: settle,
            boil: 0,
          });
        });
      }),
    );
  },
});
