import { drawing, piece, probePlate, rounded, write } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { fonts, palette as P } from '../palette.ts';
import { DISTANCE, NEAR, PANEL, PATH, PATH_BRUSH, PLANES, SKY, TABLE } from '../plates/plates.ts';
import { TITLE } from '../script.ts';
import { CROWD_PUPPETS } from '../../../library/cast/filler-bases/cutout/crowd.ts';
import { TITLE_SEATS, drawSeats } from './crowd.ts';
import { restingEyes, restingOf } from './lead.ts';
import { TABLE_PUPPETS, eyesLook, headMiddle, raising, seatTable, seatedLead } from './table.ts';

const leadEyes = eyesLook(headMiddle(TABLE_PUPPETS.lead.skeleton));

const atRest = (t: number) => raising(leadEyes(restingEyes(t)), 'raise-rest');

const NAME = {
  x: 768,
  y: 170,
  w: 780,
  h: 130,
  style: { family: fonts.display, size: 76, weight: 700, color: P.cream, align: 'center' },
} as const;

const PIVOT = [960, 700] as const;

type Step = readonly [x: number, y: number, r: number, from: number];

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
    pull: { at: 'start', until: { at: 'end' }, ease: 'outCubic' },
    settle: { at: 'start', offset: 0.25, dur: 0.8, ease: 'outCubic' },
    path: { at: 'start', offset: 0.6, dur: 1.4, ease: 'inOutCubic' },
  },
  knobs: {
    near: 1.12,
  },
  puppets: { ...TABLE_PUPPETS, ...CROWD_PUPPETS },
  paintings: {
    sky: SKY,
    distance: DISTANCE,
    path: PATH,
    near: NEAR,
    table: TABLE,
  },
  draw: (f) => {
    const { ctx, w } = f;
    const zoom = lerp(f.knob('near'), 1, f.at('pull'));
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
      const path = f.at('path');
      if (path <= 0) return;
      ctx.save();
      clipPath(ctx, path);
      f.painting('path');
      ctx.restore();
    });
    plane(PLANES.near, () => f.painting('near'));
    plane(PLANES.guests, () =>
      panel(() => {
        drawSeats(f, TITLE_SEATS);
        seatTable(f, 'neutral', [], () => seatedLead(f, restingOf(f.t), atRest(f.t)));
      }),
    );
    plane(PLANES.table, () => f.painting('table'));
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
