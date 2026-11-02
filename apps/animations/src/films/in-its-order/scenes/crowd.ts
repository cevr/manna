// The feast's crowd: the filler bases' busts (`crowdOf`, the story crowd kit)
// seated at a far table behind the long table, as `cold.letter.4` has them
// between the guests' heads. Placements are in the kept panel's px on the
// crowd's own plane (`PANEL`); `cold` draws the plane between the near plate
// and the guests, and the far table over the busts' lower half.

import {
  type CrowdFrame,
  crowdOf,
  drawBust,
} from '../../../library/cast/filler-bases/cutout/crowd.ts';
import { PANEL } from '../plates/plates.ts';

/**
 * The far table's crowd in `cold`'s courtyard, panel px on its plane:
 * `count` busts of one seed's mix, left to right in the mix's order, the
 * first's neck at `x`, one every `dx`, each at `scale` panel px a sheet px
 * (its crown to chin about 44 panel px, so the far heads read about half a
 * guest's), the far table's top crossing them at `top`. `half` is a bust's
 * half width, the margin a bust is culled by. The plane stands `z` back, as
 * a camera's divisor, between the near plate (2) and the guests (1.15), and
 * is drawn through one `blur` of screen px at 1920, as `cold.letter.4`'s far
 * crowd is soft.
 */
export const FEAST_CROWD = {
  seed: 7,
  count: 14,
  x: 356,
  dx: 58,
  top: 702,
  scale: 0.2,
  half: 34,
  z: 1.5,
  blur: 2,
} as const;

/**
 * The far table: the courtyard's table plate (`TABLE`) drawn `s` times its
 * frame size (its own plate, `FAR_TABLE` in `plates.ts`, cut from it), its
 * point `on` (the back edge of its top at the plate's middle, drawing px) on
 * the crowd's table row at panel x `x`.
 */
export const FAR_TABLE = {
  s: 0.65,
  x: 762,
  on: [960, 968],
} as const;

/** The feast's crowd, one seeded mix: the figures in their left-to-right order. */
export const FEAST_ROW = crowdOf(FEAST_CROWD.seed, FEAST_CROWD.count);

/** The `i`th feast bust's neck x, panel px. */
export const feastX = (i: number) => FEAST_CROWD.x + i * FEAST_CROWD.dx;

/**
 * Draw the feast's crowd in the panel's px of its plane: each bust whose
 * span (`x` +- `half`) `shown` keeps, in its idle, then the far table over
 * their lower halves (`table` draws the table plate at its own frame px).
 * A bust's size is the canvas's scale, its pose at scale 1: the puppet's
 * line and its reach are sheet px times the canvas's scale alone
 * (`passOf` in `packages/film/src/canvas/puppet.ts`), so at a pose's scale of
 * 0.2 the line would be drawn five times too wide, over the hair and robe.
 */
export const drawFeastCrowd = (
  f: CrowdFrame,
  shown: (left: number, right: number) => boolean,
  table: () => void,
): void => {
  const { scale, top, half } = FEAST_CROWD;
  const { ctx } = f;
  FEAST_ROW.forEach((figure, i) => {
    const x = feastX(i);
    if (!shown(x - half, x + half)) return;
    ctx.save();
    ctx.translate(x, top);
    ctx.scale(scale, scale);
    drawBust(f, figure, { x: 0, top: 0, scale: 1 });
    ctx.restore();
  });
  ctx.save();
  ctx.translate(FAR_TABLE.x, top);
  ctx.scale(FAR_TABLE.s / PANEL.scale, FAR_TABLE.s / PANEL.scale);
  ctx.translate(-FAR_TABLE.on[0], -FAR_TABLE.on[1]);
  table();
  ctx.restore();
};
