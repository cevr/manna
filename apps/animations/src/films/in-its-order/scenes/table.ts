// The people at the feast's long table, as the title ends on them and the
// cold open trucks down them: a man guest picture-left, the lead, a woman
// guest, and the mother with her baby at the cup behind the woman at
// picture-right, as `cold.letter.4` seats them. Both scenes draw them from
// here, on the courtyard's guests plane in the kept panel's px, so the cut
// from the title to the cold open keeps one table.

import { ground, type PuppetPose } from '@manna/film/canvas';
import { idle } from '@manna/film/core';
import { SEATED as MAN } from '../../../library/cast/feast-guest-man/cutout/seated.ts';
import { SEATED as WOMAN } from '../../../library/cast/feast-guest-woman/cutout/seated.ts';
import { PUPPETS as LEAD } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import { RAISE_SEATED } from '../../../library/cast/lead-feast/cutout/raise-seated.ts';
import type { Pt } from '../../../library/cutout/rules.ts';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';

/** Where the seated figures' feet rest behind the table, panel px. */
const FLOOR = 925;

/**
 * The lead behind the table, panel px: where he sits (his head's centre),
 * and his single-9 view's head box, root and box height (sheet px, his
 * `puppets.ts`), sized so his head is `head` panel px wide, his box's foot
 * on `FLOOR`.
 */
const LEAD_SEAT = { x: 768, head: 80, box: [138, 0, 497, 433], root: [304, 663], h: 1115 } as const;

/** His face's width, panel px: the skin of his face is 206 px across on his raise's frames (measured), at his scale. */
const FACE = (206 * LEAD_SEAT.head) / (LEAD_SEAT.box[2] - LEAD_SEAT.box[0]);

/**
 * The three in the front row, panel px, each placed as `seat` places it: the
 * lead (`LEAD_SEAT`) and a guest either side, each a whole figure on its
 * stool (`MAN`, `WOMAN`, frame px): its box the skin of its neutral face
 * (measured), sized as wide as his (`FACE`), its root its contact shadow's
 * centre, its box's foot on `FLOOR`. They sit where `cold.letter.4` seats
 * its two, about 224 and 157 panel px either side of his head, so their eyes
 * sit about 35 and 45 panel px below his, as the panel's do.
 */
const GUESTS = {
  man: { x: 544, head: FACE, box: [136, 97, 297, 270], root: MAN.ground.at, h: MAN.size[1] },
  lead: LEAD_SEAT,
  woman: { x: 925, head: FACE, box: [115, 76, 277, 264], root: WOMAN.ground.at, h: WOMAN.size[1] },
} as const;

/** Each guest's seated keys: neutral, turned to the lead, smiling at him. */
const KEYS = { man: MAN, woman: WOMAN } as const;

/** A guest's key. */
export type GuestKey = keyof typeof MAN.paintings;

/**
 * Each guest's colour shift toward the lead's palette, a canvas filter on its
 * key alone. The man's skin is painted paler and yellower than the lead's
 * (CIE76 10.4 off it in the smile's wide, measured), so his key is saturated,
 * which warms his skin to the lead's (3.8 off) and leaves his black outline
 * black. The woman's skin lies 3.9 off the lead's (measured), so she draws as
 * painted.
 */
const TINT = { man: 'saturate(1.3)', woman: 'none' } as const;

/**
 * The mother with her baby at the cup (her poses-1 cut-out, as in the cold
 * open's close), picture-right behind the woman, where `cold.letter.4` has
 * her at a table further back: her eyes (`eyes`, on her part sheet, read off
 * the close) at `at`, panel px, about level with his, sized so her head box
 * (`box`, the veil, sheet px) is `head` panel px across, four fifths of the
 * woman's hood, as the panel draws her. `root` is her root on that sheet.
 */
export const MOTHER_SEAT = {
  at: [1012, 730],
  eyes: [180, 153],
  head: 70,
  box: [78, 0, 365, 240],
  root: [193, 448],
} as const;

/** The puppet the table poses: the mother. */
export const TABLE_PUPPETS = { mother: MOTHER['poses-1'] } as const;

/** The mother's idle, seed 2 (the lead's is seed 1). */
const MOTHER_IDLE = idle(2);

/**
 * The mother's bone numbers at scene time `t`, degrees, clockwise on screen:
 * her idle on the bones her poses-1 cut turns with no new art. Her lean
 * carries her sway, her breath and the slow drift of her weight, and the baby
 * and the cup ride it with her arms. Her head takes a little of the idle's
 * tilt, her neck less, as her veil rides her lean. Her arms keep their drawn
 * angles round the baby.
 */
export const motherNumbers = (t: number) => {
  const { sway, breath, drift, tilt } = MOTHER_IDLE(t);
  return { lean: sway + 0.35 * breath + 0.5 * drift, neck: 0.15 * tilt, head: 0.35 * tilt };
};

/** The paintings the table draws: the lead's raise frames and each guest's keys. */
export const TABLE_PAINTINGS = {
  ...RAISE_SEATED.paintings,
  'man-neutral': MAN.paintings.neutral,
  'man-turn': MAN.paintings.turn,
  'man-smile': MAN.paintings.smile,
  'woman-neutral': WOMAN.paintings.neutral,
  'woman-turn': WOMAN.paintings.turn,
  'woman-smile': WOMAN.paintings.smile,
} as const;

/** What the table needs of a scene's frame: its time, its canvas, the mother's puppet and the table's paintings. */
export interface TableFrame {
  readonly t: number;
  readonly ctx: CanvasRenderingContext2D;
  puppet(name: 'mother', pose: PuppetPose): void;
  painting(name: keyof typeof TABLE_PAINTINGS): void;
}

/** A figure's pose at the table: its head box centred on its seat, its box's foot on the floor. */
const seat = (name: keyof typeof GUESTS): PuppetPose => {
  const g = GUESTS[name];
  const scale = g.head / (g.box[2] - g.box[0]);
  const headX = (g.box[0] + g.box[2]) / 2;
  return {
    numbers: {},
    root: [g.x + scale * (g.root[0] - headX), FLOOR - scale * (g.h - g.root[1])],
    scale,
  };
};

/** The lead's pose on his seat: his single-9 cut-out's, on which his raise's frames lie. */
export const LEAD_POSE = seat('lead');

/**
 * Draws `draw`'s px where a cut-out posed at `pose` lays its view's px: the
 * view's top-left is the cut-out's `origin` on its sheet and `root` its root
 * there, sheet px. `drawPuppet` scales the sheet about its root to the pose,
 * then moves it by minus the origin in scene px, unscaled. A whole frame with
 * no cut-out is its own view, origin [0, 0].
 */
const posed = (
  ctx: CanvasRenderingContext2D,
  pose: PuppetPose,
  root: Pt,
  origin: Pt,
  draw: () => void,
) => {
  ctx.save();
  ctx.translate(pose.root[0] - origin[0], pose.root[1] - origin[1]);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(origin[0] - root[0], origin[1] - root[1]);
  draw();
  ctx.restore();
};

/**
 * The lead on his seat: the contact shadow under him, then his raise's frame
 * `frame` when one is given, turned `lean` degrees (clockwise on screen) about
 * his root, which is where his cut-out's lean bone turns him (his single-9
 * skeleton's `lean` pivot), so a frame sways as his cut-out does. The frames
 * and the shadow lie on his view's px and are drawn where his cut-out lays
 * those px (`posed`); with no frame, a scene poses his cut-out at `LEAD_POSE`
 * itself.
 */
export const seatedLead = (f: TableFrame, frame?: keyof typeof RAISE_SEATED.paintings, lean = 0) =>
  posed(f.ctx, LEAD_POSE, GUESTS.lead.root, LEAD['single-9'].origin, () => {
    ground(f.ctx, RAISE_SEATED.ground.at[0], RAISE_SEATED.ground.at[1], RAISE_SEATED.ground.w);
    if (frame === undefined) return;
    const x = GUESTS.lead.root[0] - LEAD['single-9'].origin[0];
    const y = GUESTS.lead.root[1] - LEAD['single-9'].origin[1];
    f.ctx.save();
    f.ctx.translate(x, y);
    f.ctx.rotate((lean * Math.PI) / 180);
    f.ctx.translate(-x, -y);
    f.painting(frame);
    f.ctx.restore();
  });

/** A guest on its stool: the contact shadow under it, then its key `key` through its tint (`TINT`), whole, on its frames' px (`posed`, origin [0, 0]). */
const guest = (f: TableFrame, name: keyof typeof KEYS, key: GuestKey) => {
  const { ground: shadow } = KEYS[name];
  posed(f.ctx, seat(name), shadow.at, [0, 0], () => {
    ground(f.ctx, shadow.at[0], shadow.at[1], shadow.w);
    f.ctx.save();
    f.ctx.filter = TINT[name];
    f.painting(`${name}-${key}`);
    f.ctx.restore();
  });
};

/** The mother behind the woman: her eyes on her seat's point, her veil its width, in her idle (`motherNumbers`). */
const mother = (f: TableFrame) => {
  const scale = MOTHER_SEAT.head / (MOTHER_SEAT.box[2] - MOTHER_SEAT.box[0]);
  f.puppet('mother', {
    numbers: motherNumbers(f.t),
    root: [
      MOTHER_SEAT.at[0] + scale * (MOTHER_SEAT.root[0] - MOTHER_SEAT.eyes[0]),
      MOTHER_SEAT.at[1] + scale * (MOTHER_SEAT.root[1] - MOTHER_SEAT.eyes[1]),
    ],
    scale,
  });
};

/**
 * The table's people in the kept panel's px, back to front: the mother, the
 * man in key `key`, the lead (`lead`, the scene's own draw of him on his
 * seat) and the woman in key `key`.
 */
export const seatTable = (f: TableFrame, key: GuestKey, lead: () => void) => {
  mother(f);
  guest(f, 'man', key);
  lead();
  guest(f, 'woman', key);
};
