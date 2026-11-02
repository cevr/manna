// The cold open, drawn to its kept panels (`cold.baby.3`, `cold.letter.4`,
// `cold.what.3`), one shot to each of the script's marks. `baby`: close on
// the mother with her baby at the cup, on the close plate painted to
// `cold.baby.3` (`BABY_BACK`) with the feast's table in front of her
// (`FRONT`), the camera pushing in on the baby's face.
// `grown` cuts to the feast's courtyard plates on a guest at the long table
// and trucks down it to the lead, who sits between two guests (`GUESTS`, a
// man picture-left and a woman picture-right), the bottle on his lap, and on
// `bottle` raises it (`raise`, his seated raise's frames on twos); at the
// word "bottle" the guests turn to him and stare (`turn`). `smile` pulls
// back to the three at the table, and the guests smile at him. On
// `letter` a rolled scroll drops onto the table in front of the lead and
// unrolls over its edge (`SCROLL`). On `ouch` he winces (`WINCE`).
// `what` cuts to the last close plate (`WHAT`), the cup of milk and the
// bread, and the camera lifts to them.
//
// A shot's camera is a centre and a zoom on its plates' frame px, each plane
// moved by its share (`PLANES`), so a far plane drifts and grows less than a
// near one. Each courtyard move runs from where the last one left it
// (`MOVES`).

import { drawing, ground, type PuppetLook, type PuppetPose } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { SEATED as MAN } from '../../../library/cast/feast-guest-man/cutout/seated.ts';
import { SEATED as WOMAN } from '../../../library/cast/feast-guest-woman/cutout/seated.ts';
import { PUPPETS as LEAD } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import { RAISE_SEATED } from '../../../library/cast/lead-feast/cutout/raise-seated.ts';
import winceHead from '../../../library/cast/lead-feast/cutout/sheets/single-5/head.png' with { type: 'file' };
import type { Pt } from '../../../library/cutout/rules.ts';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';
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

/**
 * The feast's table in front of her in the baby close, as `cold.baby.3` has
 * it: the courtyard's table plate (`TABLE`) drawn `s` times its size on a
 * plane `z` in front of her, its point `on` (the back edge of its top, under
 * the empty bowl between the two bowls of figs, on the courtyard's frame px)
 * at `at`, so at the push's end its top runs across the frame at y 970, the
 * panel's table edge under the baby's swaddle, and she sits at the table.
 */
const FRONT = { on: [1450, 965], at: [960, 908], s: 2.75, z: 0.8 } as const;

/** Where the seated figures' feet rest behind the table, panel px: the title's guests stand there. */
const FLOOR = 925;

/**
 * The lead behind the table, panel px: where he sits (his head's centre),
 * and his single-9 view's head box, root and box height (sheet px, his
 * `puppets.ts`), sized so his head is as wide as the head of the front view
 * the title stands, `head` panel px (the front's head box width times the
 * title's scale), his box's foot on `FLOOR`.
 */
const LEAD_SEAT = { x: 768, head: 80, box: [138, 0, 497, 433], root: [304, 663], h: 1115 } as const;

/** His face's width, panel px: the skin of his face is 206 px across on his raise's frames (measured), at his scale. */
const FACE = (206 * LEAD_SEAT.head) / (LEAD_SEAT.box[2] - LEAD_SEAT.box[0]);

/**
 * The three behind the table, panel px, each placed as `seat` places it:
 * the lead (`LEAD_SEAT`) and a guest either side, each a whole figure on its
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

/**
 * The courtyard's framings, on the frame px the title ends on: from `grown`
 * the camera starts close on the woman at the table (`START`), trucks down
 * the table to the lead, pushes in on his bottle, pulls back to the three
 * waist up (`smile`), pushes in chest up on him and the letter as it
 * falls (`read`, the panel's `cold.letter.4`), closer on the letter's gold
 * seal under his face (`quote`) and tilts up to his face as he winces
 * (`ouch`), each a cue and where it leaves the camera.
 *
 * The plates cover frame x 0..1920 and y -100..1180, and the table, the
 * nearest plane, binds: every framing keeps 960/k <= x <= 1920 - 960/k and
 * 540/k - 100 <= y <= 1180 - 540/k, so no plate's edge shows. A move is a
 * straight line in (x, y, k) and each bound curves away from that line, so a
 * move whose two ends keep the bounds keeps them all the way. The close
 * plates are painted on the same grid, so the same bounds hold on them.
 */
const START: Camera = { x: 1188, y: 846, k: 2.6 };
const MOVES = [
  ['truck', { x: 956, y: 846, k: 2.6 }],
  ['bottle', { x: 915, y: 836, k: 3 }],
  ['smile', { x: 950, y: 790, k: 1.9 }],
  ['read', { x: 956, y: 860, k: 2.8 }],
  ['quote', { x: 977, y: 881, k: 3.4 }],
  ['ouch', { x: 956, y: 820, k: 3.2 }],
] as const satisfies ReadonlyArray<readonly [string, Camera]>;

/** The film's frames a second, its `film.ts`'s `fps` (the film imports this scene, so the scene names the rate it swaps the raise's frames on). */
const FPS = 30;

/**
 * His seated cut-out (single-9) with no line: the wince's head is laid whole
 * with its own line, so the look draws no line again near it (with a line,
 * the look inks round the head and over the bottle hand by it).
 */
const { line: _line, ...SEATED } = LEAD['single-9'];

/**
 * The lead's wince (`ouch`): his kept wince's head (single-5) laid in place
 * of his single-9 head, drawing px to his sheet px, sized so the two heads'
 * hair is as wide (350 sheet px to 253) with its crown and centre on his,
 * the boil off as on every other frame he holds.
 */
const WINCE: PuppetLook = {
  boil: 0,
  amp: 0,
  swap: {
    part: 'head',
    drawing: 'wince',
    place: { s: 1.39, dx: 104, dy: 0 },
    pivot: [308, 385],
    theta: 0,
  },
};

/**
 * The letter (`cold.letter.4`), on the table's plane px: the rolled scroll
 * falls from above the frame (its foot at `from`) onto the table in front of
 * the lead (its foot's centre at `x`, `land`), hops `hop` px once, and
 * unrolls toward us flat on the table, its top roller held where the rolled
 * scroll's lay and its lower roller riding down the open scroll's rows
 * `roll[0]` to `roll[1]`, where `SCROLL_ROLLER` lies on it. `s` is plane px
 * a scroll px, about as wide beside him as the panel's scroll (four fifths
 * of his shoulders); the open scroll lies back on the table, so its rows are
 * drawn `lie` as tall as they are wide, and it stands a third of his torso
 * high, as the panel's does.
 */
const SCROLL = {
  x: 960,
  from: 280,
  land: 978,
  hop: 5,
  s: 0.17,
  lie: 0.5,
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
    raise: { mark: 'bottle', dur: RAISE_SEATED.frames / FPS, ease: 'linear' },
    turn: { mark: 'bottle', word: 'bottle', dur: 0 },
    smile: { mark: 'smile', dur: 1.6, ease: 'inOutCubic' },
    read: { mark: 'letter', dur: 1.6, ease: 'inOutCubic' },
    drop: { mark: 'letter', dur: 0.4, ease: 'inQuad' },
    hop: { after: 'drop', dur: 0.24, ease: 'linear' },
    unfurl: { after: 'hop', dur: 0.15, ease: 'linear' },
    unroll: { after: 'unfurl', dur: 1, ease: 'inOutCubic' },
    quote: { mark: 'quote', dur: 2.6, ease: 'inOutSine' },
    ouch: { mark: 'ouch', dur: 0.6, ease: 'inOutCubic' },
    what: { mark: 'what', until: { at: 'end' }, ease: 'inOutSine' },
  },
  puppets: {
    lead: { ...SEATED, drawings: [{ name: 'wince', png: winceHead }] },
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
    ...RAISE_SEATED.paintings,
    'man-neutral': MAN.paintings.neutral,
    'man-turn': MAN.paintings.turn,
    'man-smile': MAN.paintings.smile,
    'woman-neutral': WOMAN.paintings.neutral,
    'woman-turn': WOMAN.paintings.turn,
    'woman-smile': WOMAN.paintings.smile,
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
    // A figure's pose at the table: its head box centred on its seat, its box's foot on the floor.
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
    // Draws `draw`'s px where a cut-out posed at `pose` lays its view's px:
    // the view's top-left is the cut-out's `origin` on its sheet and `root`
    // its root there, sheet px. `drawPuppet` scales the sheet about its root
    // to the pose, then moves it by minus the origin in scene px, unscaled. A
    // whole frame with no cut-out is its own view, origin [0, 0].
    const posed = (pose: PuppetPose, root: Pt, origin: Pt, draw: () => void) => {
      ctx.save();
      ctx.translate(pose.root[0] - origin[0], pose.root[1] - origin[1]);
      ctx.scale(pose.scale, pose.scale);
      ctx.translate(origin[0] - root[0], origin[1] - root[1]);
      draw();
      ctx.restore();
    };
    // The lead on his seat: the contact shadow under him, then his raise's
    // frame (rest, on twos from `raise` to k6, k6 kept), or from `ouch` his
    // single-9 cut-out, which is k6, with the wince's head in place of its
    // own. The frames and the shadow lie on his view's px and are drawn where
    // his cut-out lays those px (`posed`). The raise's film frame is its
    // linear cue's share of its frames, rounded: `bottle` lies on the frame
    // grid, where a floor would drop a frame to float noise.
    const lead = () => {
      const pose = seat('lead');
      const wince = f.t >= f.cue('ouch').start;
      posed(pose, GUESTS.lead.root, SEATED.origin, () => {
        ground(ctx, RAISE_SEATED.ground.at[0], RAISE_SEATED.ground.at[1], RAISE_SEATED.ground.w);
        if (!wince) f.painting(RAISE_SEATED.frame(Math.round(f.at('raise') * RAISE_SEATED.frames)));
      });
      if (wince) f.puppet('lead', pose, WINCE);
    };
    // A guest on its stool: the contact shadow under it, then its key, whole,
    // on its frames' px (`posed`, origin [0, 0]): neutral, from the word
    // "bottle" turned to the lead, from `smile` smiling at him. A key swaps
    // with no tween and holds seconds, far past the record's two frames.
    const guest = (name: keyof typeof KEYS) => {
      const { ground: shadow } = KEYS[name];
      const key =
        f.t >= f.cue('smile').start ? 'smile' : f.t >= f.cue('turn').start ? 'turn' : 'neutral';
      posed(seat(name), shadow.at, [0, 0], () => {
        ground(ctx, shadow.at[0], shadow.at[1], shadow.w);
        f.painting(`${name}-${key}`);
      });
    };

    // The letter on the table's plane: the rolled scroll falling and hopping,
    // then fading off the open scroll laid under it, which unrolls top down
    // toward us: its rows above the lower roller, the roller on them.
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
        ctx.scale(1, SCROLL.lie);
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
      plane(camera, FRONT.z, () => {
        ctx.translate(FRONT.at[0], FRONT.at[1]);
        ctx.scale(FRONT.s, FRONT.s);
        ctx.translate(-FRONT.on[0], -FRONT.on[1]);
        f.painting('table');
      });
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
        guest('man');
        lead();
        guest('woman');
      }),
    );
    plane(camera, PLANES.table, () => {
      f.painting('table');
      if (f.t >= f.cue('drop').start) scroll();
    });
  },
});
