// The title, painted to its kept panel (`title.start.2`): the feast's
// courtyard under the teal sky (`courtyard.ts`), a small dawn light on the
// green hill and the thin gold path drawing on up to it. Three guests stand
// behind the long table: a villager, the lead and his mother, fewer than the
// panel's ten. The camera pulls back from a near framing to the panel's own,
// each plane by its distance (`PLANES`), while the film's name settles on a
// torn strip of the film's dark paper over the sky: the only text (`CARDS`).

import { drawing, piece, probePlate, rounded, write } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { PUPPETS as LEAD } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';
import { PUPPETS as VILLAGER } from '../cast/idea-villagers/cutout/puppets.ts';
import { fonts, palette as P } from '../palette.ts';
import { TITLE } from '../script.ts';
import {
  PANEL,
  PLANES,
  courtyardDistance,
  courtyardNear,
  courtyardSky,
  courtyardTable,
} from './courtyard.ts';

/**
 * The guests, panel px: each one's centre, the kept box's size and root
 * (sheet px, its `puppets.ts`). Every grown figure is one height, so each
 * scale is `GUEST.h` over its kept height.
 */
const GUEST = { h: 290, crown: 635 } as const;
const GUESTS = [
  { name: 'villager', x: 560, box: [207, 512], root: [106, 303] },
  { name: 'lead', x: 768, box: [247, 663], root: [126, 363] },
  { name: 'mother', x: 960, box: [219, 600], root: [112, 333] },
] as const;

/** The film's name: its strip's centre and size over the sky (panel px), and its type. */
const NAME = {
  x: 768,
  y: 170,
  w: 780,
  h: 130,
  style: { family: fonts.display, size: 76, weight: 700, color: P.cream, align: 'center' },
} as const;

/** Where the pull centres, panel px: the table's middle. */
const PIVOT = [768, 640] as const;

export const title = drawing({
  timeline: {
    // The title has no words and no music yet; S5's score replaces this silence.
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
  puppets: { lead: LEAD.front, mother: MOTHER.front, villager: VILLAGER['poses-6'] },
  draw: (f) => {
    const { ctx, w } = f;
    const zoom = lerp(f.knob('near'), 1, f.at('pull'));
    const hand = (key: string) => f.hand(key);
    // One plane: the panel's pixels on the frame, pulled about the pivot by its share of the zoom.
    const plane = (z: number, draw: () => void) => {
      const k = 1 + (zoom - 1) / z;
      ctx.save();
      ctx.scale(w / 1920, w / 1920);
      ctx.scale(PANEL.scale, PANEL.scale);
      ctx.translate(0, -PANEL.y);
      ctx.translate(PIVOT[0], PIVOT[1]);
      ctx.scale(k, k);
      ctx.translate(-PIVOT[0], -PIVOT[1]);
      draw();
      ctx.restore();
    };
    plane(PLANES.sky, () => courtyardSky(ctx));
    plane(PLANES.distance, () => courtyardDistance(ctx, hand, f.at('path')));
    plane(PLANES.near, () => courtyardNear(ctx, hand));
    plane(PLANES.guests, () => {
      for (const g of GUESTS) {
        const scale = GUEST.h / g.box[1];
        f.puppet(g.name, {
          numbers: {},
          root: [g.x + scale * (g.root[0] - g.box[0] / 2), GUEST.crown + scale * g.root[1]],
          scale,
        });
      }
    });
    plane(PLANES.table, () => courtyardTable(ctx, hand));
    // The name, on a torn strip of the film's dark paper, settling over the sky.
    plane(PLANES.sky, () => {
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
        write(ctx, TITLE, NAME.x, y + 26, NAME.style, f.hand('title'), { alpha: settle, boil: 0 });
      });
    });
  },
});
