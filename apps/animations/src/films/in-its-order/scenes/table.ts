// The people at the feast's long table, as the title ends on them and the
// cold open trucks down them: a man guest picture-left, the lead, a woman
// guest, and the mother with her baby at the cup behind the woman at
// picture-right, as `cold.letter.4` seats them. Both scenes draw them from
// here, on the courtyard's guests plane in the kept panel's px, so the cut
// from the title to the cold open keeps one table.

import { ground, type PuppetLook, type PuppetPose, type PuppetSpec } from '@manna/film/canvas';
import { act, blink, idle, lag } from '@manna/film/core';
import { Array as Arr, Option } from 'effect';
import { HEADED as MAN_HEADED } from '../../../library/cast/feast-guest-man/cutout/heads.ts';
import { SEATED as MAN } from '../../../library/cast/feast-guest-man/cutout/seated.ts';
import { SEATED as WOMAN } from '../../../library/cast/feast-guest-woman/cutout/seated.ts';
import { DRAWINGS, PUPPETS as LEAD } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import {
  RAISE_SEATED,
  type RaiseKey,
} from '../../../library/cast/lead-feast/cutout/raise-seated.ts';
import leadShut from '../../../library/cast/lead-feast/cutout/sheets/single-9/head-closed.png' with { type: 'file' };
import leadWince from '../../../library/cast/lead-feast/cutout/sheets/single-5/head.png' with { type: 'file' };
import type { Pt } from '../../../library/cutout/rules.ts';
import { PUPPETS as MOTHER } from '../cast/feast-mother/cutout/puppets.ts';
import motherShut from '../cast/feast-mother/cutout/sheets/poses-1/head-closed.png' with { type: 'file' };

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

/** The guests drawn as their seated keys (neutral, turned to the lead, smiling at him): the woman. */
const KEYS = { woman: WOMAN } as const;

/** A guest's key. */
export type GuestKey = keyof typeof MAN.paintings;

/**
 * Each guest's colour shift toward the lead's palette, a canvas filter on its
 * figure alone. The man's skin is painted paler and yellower than the lead's
 * (CIE76 10.4 off it in the smile's wide, measured), so his cut-out is saturated,
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

/**
 * Her poses-1 cut-out with no line: a look (her blinks, `motherLook`) inks a
 * cut-out's line again near what moved, and with no look none is inked, so
 * under her blinks' look she draws as she does with none.
 */
const { line: _line, ...MOTHER_POSES } = MOTHER['poses-1'];

/**
 * The lead's seated cut-out (single-9) with no line. Each drawing his scenes
 * lay in place of one of his parts (a raise key, his head drawn eyes shut, his
 * wince's head) is laid whole with its own line, so a look draws no line again
 * near it (with a line, the look inks round the part laid and over the bottle
 * hand by it).
 */
const { line: _leadLine, ...LEAD_SEATED } = LEAD['single-9'];

/**
 * The man's poses-1 cut-out with his head keys (`MAN_HEADED`) and no line:
 * each key is laid whole with its own line in place of his head, so a look
 * draws no line again round it.
 */
const { line: _manLine, ...MAN_POSES } = MAN_HEADED;

/**
 * The puppets the table poses: the mother, with her head drawn eyes shut
 * (`shut`, on her head's own sheet canvas), the man (`MAN_POSES`) with his
 * heads turned to the lead and smiling at him (`turn`, `smile`, on his head's
 * own sheet canvas), and the lead (`LEAD_SEATED`) with
 * the drawings his scenes lay in place of his parts: his head drawn eyes shut
 * (`shut`, on his head's own sheet canvas), his wince's head (`wince`,
 * single-5's, laid by a place) and his raise's keys (`DRAWINGS['single-9']`,
 * on his sheet's own canvas, `raising`). Both scenes pose these same three, so
 * the film loads each once.
 */
export const TABLE_PUPPETS = {
  mother: { ...MOTHER_POSES, drawings: [{ name: 'shut', png: motherShut, part: 'head' }] },
  man: MAN_POSES,
  lead: {
    ...LEAD_SEATED,
    drawings: [
      { name: 'shut', png: leadShut, part: 'head' },
      { name: 'wince', png: leadWince },
      ...DRAWINGS['single-9'],
    ],
  },
} as const;

/** A cut-out's bone `name` (a skeleton with no such bone fails here, at load). */
const boneOf = (skeleton: PuppetSpec['skeleton'], name: string) =>
  Option.getOrThrow(Arr.findFirst(skeleton.bones, (b) => b.name === name));

/** A cut-out's head bone's middle, between its chin and its crown, sheet px: a point inside its head part (a skeleton with no head bone fails here, at load). */
export const headMiddle = (skeleton: PuppetSpec['skeleton']): Pt => {
  const { pivot, tip } = boneOf(skeleton, 'head');
  return [(pivot[0] + tip[0]) / 2, (pivot[1] + tip[1]) / 2];
};

/** A drawing on its cut-out's own sheet canvas, laid where its part lies with every bone at 0. */
const ON_SHEET = { s: 1, dx: 0, dy: 0 } as const;

/** A blinking cut-out's look with its eyes open: no drawing laid, the boil off, as on every other frame it holds. */
const OPEN: PuppetLook = { boil: 0, amp: 0 };

/**
 * A cut-out's look as its eyes read `eyes` (0 open to 1 shut, `blink`):
 * `OPEN`, or past one half its head drawn eyes shut (its drawing `shut`, on
 * its head's own sheet canvas) in place of its head, riding its head part's
 * bones at `pivot`. A cut-out that blinks takes a look on every frame, open
 * or shut, so a blink changes nothing but its head.
 */
export const eyesLook = (pivot: Pt) => {
  const shut: PuppetLook = {
    ...OPEN,
    swaps: [{ part: 'head', drawing: 'shut', place: ON_SHEET, pivot }],
  };
  return (eyes: number): PuppetLook => {
    if (eyes > 0.5) return shut;
    return OPEN;
  };
};

/** The lead's shoulderRight bone's pivot, sheet px: where his raise's keys ride his arm part's bones. */
const SHOULDER = boneOf(LEAD_SEATED.skeleton, 'shoulderRight').pivot;

/**
 * The lead's look `look` with his raise's key `key` in place of his armRight
 * beside what it lays: drawn on his sheet's own canvas, riding his arm part's
 * bones at his shoulder (`SHOULDER`). A scene holds his arm's bones at 0
 * under it, so the key stays where it was drawn and turns with his lean.
 */
export const raising = (look: PuppetLook, key: RaiseKey): PuppetLook => ({
  ...look,
  swaps: [
    ...(look.swaps ?? []),
    { part: 'armRight', drawing: key, place: ON_SHEET, pivot: SHOULDER },
  ],
});

/** The mother's idle, seed 2 (the lead's is seed 1). */
const MOTHER_IDLE = idle(2);

/** Her eyes: her blinks, seed 2, all through the baby close and the table. */
const MOTHER_EYES = blink(2);

const motherEyes = eyesLook(headMiddle(MOTHER_POSES.skeleton));

/** The mother's look at scene time `t`: her blinks (`eyesLook`) about her head bone's middle. */
export const motherLook = (t: number) => motherEyes(MOTHER_EYES(t));

/**
 * The mother's bow to her baby: from `from` s and every `every` s, her head
 * turns `deg` in all toward the baby at her arm over `down` s, holds it
 * `hold` s and lifts it again over `up` s. `motherNumbers` splits the turn
 * along her lean (most of it, so she bows from her hip), her neck and her
 * head.
 * `every` lies apart from her breath's period (3.7 s), so the bow drifts
 * across her breaths.
 */
const BOW = { deg: -2.5, from: 0.9, every: 8.4, down: 1.1, hold: 2.6, up: 1.3 } as const;

/** One bow, 0 up to 1 bowed, over its cycle's own seconds. */
const BOWING = act(0, [
  { at: 0, dur: BOW.down, to: 1 },
  { at: BOW.down + BOW.hold, dur: BOW.up, to: 0 },
]);

/** The mother's bow at scene time `t`, degrees: her cycle's bow, repeated every `BOW.every` s from `BOW.from`. */
const bow = (t: number) => {
  const into = t - BOW.from;
  return BOW.deg * BOWING(into - BOW.every * Math.floor(into / BOW.every));
};

/** Her head follows her neck into the bow 0.1 s behind. */
const headBow = lag(bow, 0.1);

/**
 * The mother's bone numbers at scene time `t`, degrees, clockwise on screen:
 * her idle on the bones her poses-1 cut turns with no new art. Her lean
 * carries her sway, her breath (deep enough to read as her rocking the baby)
 * and the slow drift of her weight, and the baby and the cup ride it with her
 * arms. Her head takes a little of the idle's tilt, her neck less, as her
 * veil rides her lean. Her bow (`BOW`) is 0.6 on her lean, 0.15 on her neck
 * and 0.25 on her head, her head 0.1 s behind. Her
 * arms keep their drawn angles round the baby.
 */
export const motherNumbers = (t: number) => {
  const { sway, breath, drift, tilt } = MOTHER_IDLE(t);
  return {
    lean: sway + 1.2 * breath + 0.5 * drift + 0.6 * bow(t),
    neck: 0.3 * tilt + 0.15 * bow(t),
    head: 0.6 * tilt + 0.25 * headBow(t),
  };
};

/** The man's idle, seed 3 (the lead's is seed 1, the mother's seed 2). */
const MAN_IDLE = idle(3);

/**
 * The most the man's head part turns from his poses-1 view, his neck and head
 * bones together, degrees: past it his collar's outline steps.
 */
export const MAN_HEAD_LIMIT = 4;

/** The most his lean turns from his poses-1 view, degrees: past it his hip's cut opens (issue #64), where the table hides it. */
export const MAN_LEAN_LIMIT = 3;

/**
 * The man's nod toward the lead, degrees clockwise on screen (his crown
 * toward picture-right): at each scene time he nods at, his head dips away
 * `dip` of the move, inclines `to` toward the lead over `dur` s and settles
 * back over `settle` s to `hold`, where it stays, still turned to him, so a
 * second nod moves as far as the first nearly.
 */
const NOD = { to: 2, hold: 0.6, dur: 0.4, dip: 0.2, settle: 0.8 } as const;

/**
 * The man's bone numbers at scene time `t`, degrees, clockwise on screen, as
 * he nods toward the lead at `nods` (scene s): his idle on the bones his
 * poses-1 cut turns with no new art, as the mother's: his lean carries his
 * sway, his breath and the slow drift of his weight, his neck and head a
 * little of the idle's tilt. His nod (`NOD`) is 0.35 on his neck and 0.65 on
 * his head, his head 0.06 s behind, so his head part's whole turn stays
 * within `MAN_HEAD_LIMIT` (0.9 of the tilt's 2 and the nod's 2) and his lean
 * within `MAN_LEAN_LIMIT`. His arms keep their drawn angles, his hands on his
 * knees.
 */
export const manNumbersOf = (nods: ReadonlyArray<number>) => {
  const nod = act(
    0,
    nods.flatMap((at) => [
      { at, dur: NOD.dur, to: NOD.to, anticipate: NOD.dip },
      { at: at + NOD.dur, dur: NOD.settle, to: NOD.hold },
    ]),
  );
  const headNod = lag(nod, 0.06);
  return (t: number) => {
    const { sway, breath, drift, tilt } = MAN_IDLE(t);
    return {
      lean: sway + 1.2 * breath + 0.5 * drift,
      neck: 0.3 * tilt + 0.35 * nod(t),
      head: 0.6 * tilt + 0.65 * headNod(t),
    };
  };
};

/** The paintings the table draws: the woman's keys. */
export const TABLE_PAINTINGS = {
  'woman-neutral': WOMAN.paintings.neutral,
  'woman-turn': WOMAN.paintings.turn,
  'woman-smile': WOMAN.paintings.smile,
} as const;

/** What the table needs of a scene's frame: its time, its canvas, the table's puppets and its paintings. */
export interface TableFrame {
  readonly t: number;
  readonly ctx: CanvasRenderingContext2D;
  puppet(name: keyof typeof TABLE_PUPPETS, pose: PuppetPose, look?: PuppetLook): void;
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

/** The lead's pose on his seat: his single-9 cut-out's. */
const LEAD_POSE = seat('lead');

/** Where the man's seated keys lie: their frame px laid by `seat`, scaled about his contact shadow's centre. */
const MAN_SEAT = seat('man');

/**
 * Where the man's part sheet lies on his seated keys, key px less part sheet
 * px: both are cut from his one kept sheet (`cast-sheet/kept/poses.png`),
 * his poses-1 part sheet's box at [69, 105] on it and his keys' box at
 * [67, 103] (their records), and his head part matches his neutral key there
 * px for px (measured).
 */
const MAN_ON_KEYS = [2, 2] as const;

/**
 * The man's pose on his stool: his poses-1 cut-out laid on the px his seated
 * keys lie on (`MAN_SEAT`), so he sits where they sat, as large. A key's px
 * lies at the seat's root plus its scale times the px's way from his contact
 * shadow's centre; a cut-out lays a sheet px at its pose's root plus its
 * scale times the px's way from its root, less its origin unscaled (`posed`).
 */
const MAN_POSE: PuppetPose = {
  numbers: {},
  root: [
    MAN_SEAT.root[0] +
      MAN_POSES.origin[0] +
      MAN_SEAT.scale * (MAN_POSES.skeleton.root[0] + MAN_ON_KEYS[0] - MAN.ground.at[0]),
    MAN_SEAT.root[1] +
      MAN_POSES.origin[1] +
      MAN_SEAT.scale * (MAN_POSES.skeleton.root[1] + MAN_ON_KEYS[1] - MAN.ground.at[1]),
  ],
  scale: MAN_SEAT.scale,
};

/** His head bone's middle, sheet px: the pivot his drawn heads ride his head part's bones at. */
const MAN_HEAD = headMiddle(MAN_POSES.skeleton);

/**
 * The man's look in key `key`: his own head (`OPEN`), or his head drawn
 * turned to the lead or smiling at him (his drawing of that name) in place of
 * it, on his head's own sheet canvas, riding his head part's bones at his
 * head bone's middle. He takes a look on every frame, so a key changes
 * nothing but his head.
 */
const manLook = (key: GuestKey): PuppetLook => {
  if (key === 'neutral') return OPEN;
  return { ...OPEN, swaps: [{ part: 'head', drawing: key, place: ON_SHEET, pivot: MAN_HEAD }] };
};

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
 * The lead on his seat: the contact shadow under him, on his view's px, drawn
 * where his cut-out lays those px (`posed`), then his cut-out at `LEAD_POSE`
 * at bone numbers `numbers` in look `look`.
 */
export const seatedLead = (f: TableFrame, numbers: PuppetPose['numbers'], look: PuppetLook) => {
  posed(f.ctx, LEAD_POSE, GUESTS.lead.root, LEAD_SEATED.origin, () =>
    ground(f.ctx, RAISE_SEATED.ground.at[0], RAISE_SEATED.ground.at[1], RAISE_SEATED.ground.w),
  );
  f.puppet('lead', { ...LEAD_POSE, numbers }, look);
};

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

/**
 * The man on his stool: the contact shadow under him on his keys' px, then
 * his cut-out at `MAN_POSE` through his tint (`TINT`), in his idle and his
 * nods toward the lead at `nods` (`manNumbersOf`), his head in key `key`
 * (`manLook`).
 */
const man = (f: TableFrame, key: GuestKey, nods: ReadonlyArray<number>) => {
  const { ground: shadow } = MAN;
  posed(f.ctx, MAN_SEAT, shadow.at, [0, 0], () =>
    ground(f.ctx, shadow.at[0], shadow.at[1], shadow.w),
  );
  f.ctx.save();
  f.ctx.filter = TINT.man;
  f.puppet('man', { ...MAN_POSE, numbers: manNumbersOf(nods)(f.t) }, manLook(key));
  f.ctx.restore();
};

/** The mother behind the woman: her eyes on her seat's point, her veil its width, in her idle (`motherNumbers`) and her blinks (`motherLook`). */
const mother = (f: TableFrame) => {
  const scale = MOTHER_SEAT.head / (MOTHER_SEAT.box[2] - MOTHER_SEAT.box[0]);
  f.puppet(
    'mother',
    {
      numbers: motherNumbers(f.t),
      root: [
        MOTHER_SEAT.at[0] + scale * (MOTHER_SEAT.root[0] - MOTHER_SEAT.eyes[0]),
        MOTHER_SEAT.at[1] + scale * (MOTHER_SEAT.root[1] - MOTHER_SEAT.eyes[1]),
      ],
      scale,
    },
    motherLook(f.t),
  );
};

/**
 * The table's people in the kept panel's px, back to front: the mother, the
 * man in key `key` nodding toward the lead at `nods` (scene s), the lead
 * (`lead`, the scene's own draw of him on his seat) and the woman in key
 * `key`.
 */
export const seatTable = (
  f: TableFrame,
  key: GuestKey,
  nods: ReadonlyArray<number>,
  lead: () => void,
) => {
  mother(f);
  man(f, key, nods);
  lead();
  guest(f, 'woman', key);
};
