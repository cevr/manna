// What milk is, drawn to its kept panels (`milk.newborn.5`, `milk.word.5`,
// `milk.shame.6`) on the parchment page matched from the cup on the
// courtyard table in `cold` (`PAGE`). The grown villager stands right of
// centre with his cup raised at picture left (his kept single-15 view, whose
// sides are kept, so the shot mirrors the panel), swaying a little as he
// stands, and on `peter` the camera pushes in on him and his cup. On
// `newborn` a shut book drifts in above his cup and opens, tilts toward the
// cup, and on the word "milk" a white ribbon runs out of its pages down into
// the cup (`POUR`), which fills. On `sincere` the ribbon's tail falls in and
// the camera closes on his face and the cup as an ink dropper comes down over
// it (`INK`); on `mixed`, at "nothing", he leans back from it and it goes.
// On `word` the camera draws back to the book and the cup and the ribbon
// pours again, filling the cup to its brim. On `good` the pour ends and the
// book fades away as the camera settles on him and his full cup.
//
// A shot's camera is a centre and a zoom on the page's frame px; each move
// runs from where the last one left it (`MOVES`). The page covers frame x
// 0..1920 and y -100..1180, so every framing keeps 960/k <= x <= 1920 - 960/k
// and 540/k - 100 <= y <= 1180 - 540/k, and a straight move in (x, y, k)
// between two framings that keep them keeps them all the way.

import { drawing } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { PUPPETS as VILLAGER } from '../cast/idea-villagers/cutout/puppets.ts';
import { BOOK_OPEN, BOOK_SHUT, DROPPER, PAGE, RIBBON, RIBBON_ROWS } from '../plates/milk.ts';

/** A point, px. */
type Pt = readonly [number, number];

/** A camera on the page, frame px: the point at the frame's centre and the zoom. */
type Camera = { readonly x: number; readonly y: number; readonly k: number };

/** The frame's centre, frame px. */
const CENTRE = [960, 540] as const;

/** The whole page, as the scene opens. */
const WIDE: Camera = { x: 960, y: 540, k: 1 };

/**
 * Shot A's framings, each a cue and where it leaves the camera: `push`
 * closes in on the villager and his cup, `close` on his face and the cup
 * as the dropper comes, `again` draws back to the book and the cup, and
 * `settle` holds on him and his full cup as the book goes.
 */
const MOVES = [
  ['push', { x: 1060, y: 380, k: 1.35 }],
  ['close', { x: 1150, y: 360, k: 1.9 }],
  ['again', { x: 1040, y: 330, k: 1.6 }],
  ['settle', { x: 1100, y: 420, k: 1.4 }],
] as const satisfies ReadonlyArray<readonly [string, Camera]>;

/**
 * The grown villager, frame px: his root (the hip) and his scale, so he
 * stands about 950 px from crown to feet as the panel's villager does. As he
 * stands he sways whole about his feet, `sway` degrees each way every
 * `swayPeriod` s, and on `mixed` he leans `recoil` degrees back from the
 * dropper and comes upright again: his rig's lean and head bones open seams
 * at his hip and at his headcloth's flaps, and a turn of his cup arm's
 * shoulder shows a dash of the sleeve's outline at his elbow, so he is
 * turned whole and no bone moves.
 */
const MAN = {
  root: [1200, 630],
  scale: 0.83,
  feet: [1200, 1020],
  sway: 0.4,
  swayPeriod: 4,
  recoil: 2.5,
} as const;

/**
 * His cup's mouth on his single-15 sheet, sheet px: its centre and half
 * axes (the rim's inside, dark while the cup is empty), and his root there.
 * Milk is the ribbon's own cream (`colour`); it rises `depth` sheet px, from
 * under the mouth's front rim to just under its centre, so a sliver of it
 * shows at the front first: the first pour fills the cup `first` of the way,
 * the second the rest.
 */
const CUP = {
  mouth: [171, 382],
  rx: 44,
  ry: 8,
  root: [224, 675],
  depth: 18,
  first: 0.65,
  colour: '#fef8e7',
} as const;

/**
 * The book, frame px: its centre over his cup and to its left, clear of
 * his headcloth, and its scale. It drifts in by `drift` while it fades in,
 * shut, turns open, and tips `tilt` degrees toward the cup; it floats `bob`
 * px up and down every `bobPeriod` s.
 */
const BOOK = {
  at: [867, 142],
  s: 0.7,
  drift: [-40, -30],
  tilt: 10,
  bob: 4,
  bobPeriod: 3,
} as const;

/**
 * The pour: the ribbon's top end's middle and its foot, its own px, laid
 * from `from` (the open book's px from its centre, under its right page,
 * so the book hides the ribbon's top end) to `into` sheet px under the
 * cup's mouth centre, so its foot goes in. It is mirrored, so its lower
 * twist bows away from his face, and `thin` narrows it across.
 */
const POUR = {
  top: [56, 4],
  foot: [93, 305],
  from: [100, 40],
  into: 8,
  thin: 0.65,
} as const;

/**
 * The ink dropper over his cup, frame px: its tip `at` from the cup's mouth
 * as he stands at rest, over the mouth's near side and under his beard, the
 * dropper leaning `lean` degrees back to the left so it stays off his face,
 * drawn `s` its size. Its drop of ink (its plate's rows from `cut` px under
 * the tip) hangs straight down under the tip. It comes in along its own
 * length from `from` px away, out of the frame, bobs `bob` px every
 * `bobPeriod` s as it hovers, and goes back out the same way.
 */
const INK = {
  at: [-22, -32],
  lean: -45,
  s: 0.85,
  cut: 4,
  from: 420,
  bob: 3,
  bobPeriod: 1.6,
} as const;

const between = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  k: lerp(a.k, b.k, t),
});

/** Where the ribbon's opaque pixels start and end on its row `y`, its own px: between the two listed rows round it (`RIBBON_ROWS`), else the nearest. */
const ribbonRow = (y: number): Pt => {
  let last: (typeof RIBBON_ROWS)[number] | undefined;
  for (const row of RIBBON_ROWS) {
    if (row[0] >= y) {
      if (last === undefined) return [row[1], row[2]];
      const t = (y - last[0]) / (row[0] - last[0]);
      return [lerp(last[1], row[1], t), lerp(last[2], row[2], t)];
    }
    last = row;
  }
  return last === undefined ? [0, RIBBON.size[0]] : [last[1], last[2]];
};

/** A sheet point of his on the page at rest, frame px. */
const onPage = (p: Pt): Pt => [
  MAN.root[0] + MAN.scale * (p[0] - CUP.root[0]),
  MAN.root[1] + MAN.scale * (p[1] - CUP.root[1]),
];

/** `p` turned `a` radians about `o`, from +x toward +y as a canvas turns. */
const turned = (p: Pt, o: Pt, a: number): Pt => [
  o[0] + (p[0] - o[0]) * Math.cos(a) - (p[1] - o[1]) * Math.sin(a),
  o[1] + (p[0] - o[0]) * Math.sin(a) + (p[1] - o[1]) * Math.cos(a),
];

export const milk = drawing({
  timeline: {
    push: { mark: 'peter', dur: 1.4, ease: 'inOutCubic' },
    book: { mark: 'newborn', dur: 0.6, ease: 'outCubic' },
    flip: { after: 'book', dur: 0.5, ease: 'inOutSine' },
    tilt: { after: 'flip', dur: 0.8, ease: 'inOutSine' },
    pour: { mark: 'newborn', word: 'milk', dur: 1.6, ease: 'inOutSine' },
    fill: { after: 'pour', dur: 3, ease: 'inOutSine' },
    stop: { mark: 'sincere', dur: 0.6, ease: 'inQuad' },
    close: { mark: 'sincere', dur: 1.2, ease: 'inOutCubic' },
    ink: { mark: 'sincere', offset: 0.6, dur: 1, ease: 'outCubic' },
    recoil: { mark: 'mixed', word: 'nothing', dur: 0.9, ease: 'inOutSine' },
    away: { mark: 'mixed', word: 'nothing', offset: 0.3, dur: 0.7, ease: 'inQuad' },
    again: { mark: 'word', dur: 1.4, ease: 'inOutCubic' },
    pour2: { mark: 'word', dur: 1.6, ease: 'inOutSine' },
    fill2: { after: 'pour2', dur: 2.5, ease: 'inOutSine' },
    stop2: { mark: 'good', dur: 0.6, ease: 'inQuad' },
    settle: { mark: 'good', dur: 1.4, ease: 'inOutCubic' },
    gone: { mark: 'good', offset: 0.3, dur: 0.7 },
  },
  puppets: {
    villager: VILLAGER['single-15'],
  },
  paintings: {
    page: PAGE,
    open: BOOK_OPEN,
    shut: BOOK_SHUT,
    ribbon: RIBBON,
    dropper: DROPPER,
  },
  draw: (f) => {
    const { ctx, w } = f;
    // The page's frame px under the camera.
    const view = (camera: Camera, draw: () => void) => {
      ctx.save();
      ctx.scale(w / 1920, w / 1920);
      ctx.translate(CENTRE[0], CENTRE[1]);
      ctx.scale(camera.k, camera.k);
      ctx.translate(-camera.x, -camera.y);
      draw();
      ctx.restore();
    };
    const sway = (degrees: number, period: number, phase: number) =>
      degrees * Math.sin((2 * Math.PI * f.t) / period + phase);
    // How far he is turned about his feet.
    const turn =
      ((sway(MAN.sway, MAN.swayPeriod, 0) + MAN.recoil * Math.sin(Math.PI * f.at('recoil'))) *
        Math.PI) /
      180;
    // His cup's mouth on the page at rest, and as he sways (its ellipse
    // tipped with him).
    const [mx, my] = onPage(CUP.mouth);
    const [fx, fy] = MAN.feet;
    const mouth = turned([mx, my], MAN.feet, turn);
    const [rx, ry] = [MAN.scale * CUP.rx, MAN.scale * CUP.ry];

    // The book's centre on the page, drifting in and floating, and how far it is tipped toward the cup.
    const enter = f.at('book');
    const [bx, by] = [
      BOOK.at[0] + BOOK.drift[0] * (1 - enter),
      BOOK.at[1] + BOOK.drift[1] * (1 - enter) + sway(BOOK.bob, BOOK.bobPeriod, 0),
    ];
    const tip = (BOOK.tilt * f.at('tilt') * Math.PI) / 180;
    // The book, shut as it fades in, turning open edge on: the shut book
    // narrows away as the turn's cosine falls to 0, the open one widens in.
    // On `good` it fades away.
    const book = () => {
      const across = Math.cos(f.at('flip') * Math.PI);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(tip);
      ctx.scale(BOOK.s * Math.abs(across), BOOK.s);
      ctx.globalAlpha = enter * (1 - f.at('gone'));
      f.painting(across > 0 ? 'shut' : 'open');
      ctx.restore();
    };
    // Where the ribbon leaves the book, on the page.
    const spout = (): Pt => {
      const [px, py] = [BOOK.s * POUR.from[0], BOOK.s * POUR.from[1]];
      return [
        bx + px * Math.cos(tip) - py * Math.sin(tip),
        by + px * Math.sin(tip) + py * Math.cos(tip),
      ];
    };
    // The ribbon from the book into the cup, its rows `tail` to `reach` shown,
    // the leading row rounded; above the mouth it hangs in front of the cup's
    // back rim, under it only inside the mouth.
    const ribbon = (tail: number, reach: number) => {
      if (reach <= tail) return;
      const from = spout();
      const into: Pt = [mouth[0], mouth[1] + MAN.scale * POUR.into];
      const [vx, vy] = [-POUR.thin * (POUR.foot[0] - POUR.top[0]), POUR.foot[1] - POUR.top[1]];
      const [ux, uy] = [into[0] - from[0], into[1] - from[1]];
      const s = Math.hypot(ux, uy) / Math.hypot(vx, vy);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -200, 1920, mouth[1] + 200);
      ctx.ellipse(mouth[0], mouth[1], rx, ry, turn, 0, 2 * Math.PI);
      ctx.clip();
      ctx.translate(from[0], from[1]);
      ctx.rotate(Math.atan2(uy, ux) - Math.atan2(vy, vx));
      ctx.scale(-s * POUR.thin, s);
      ctx.translate(-POUR.top[0], -POUR.top[1]);
      const [x0, x1] = ribbonRow(reach);
      ctx.beginPath();
      ctx.rect(0, tail, RIBBON.size[0], reach - tail);
      ctx.ellipse(
        (x0 + x1) / 2,
        reach,
        (x1 - x0) / 2 + 2,
        Math.min(12, (x1 - x0) / 4),
        0,
        0,
        2 * Math.PI,
      );
      ctx.clip();
      f.painting('ribbon');
      ctx.restore();
    };
    // The milk in his cup, `fill` of the way up.
    const milkIn = (fill: number) => {
      if (fill <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(mouth[0], mouth[1], rx, ry, turn, 0, 2 * Math.PI);
      ctx.clip();
      ctx.fillStyle = CUP.colour;
      ctx.beginPath();
      ctx.ellipse(
        mouth[0],
        mouth[1] + MAN.scale * CUP.depth * (1 - fill),
        rx,
        ry,
        turn,
        0,
        2 * Math.PI,
      );
      ctx.fill();
      ctx.restore();
    };
    // The dropper coming in over his cup along its length, hovering, and
    // going back out: the dropper turned, its drop hanging straight under it.
    const dropper = () => {
      const fall = INK.from * (1 - f.at('ink') + f.at('away'));
      const lean = (INK.lean * Math.PI) / 180;
      ctx.save();
      ctx.translate(
        mx + INK.at[0] + fall * Math.sin(lean),
        my + INK.at[1] - fall * Math.cos(lean) + sway(INK.bob, INK.bobPeriod, 0),
      );
      ctx.scale(INK.s, INK.s);
      ctx.save();
      ctx.rotate(lean);
      ctx.beginPath();
      ctx.rect(-DROPPER.size[0], -DROPPER.size[1], 2 * DROPPER.size[0], DROPPER.size[1] + INK.cut);
      ctx.clip();
      f.painting('dropper');
      ctx.restore();
      ctx.beginPath();
      ctx.rect(-DROPPER.size[0], INK.cut, 2 * DROPPER.size[0], DROPPER.size[1]);
      ctx.clip();
      f.painting('dropper');
      ctx.restore();
    };

    const camera = MOVES.reduce<Camera>((cam, [cue, to]) => between(cam, to, f.at(cue)), WIDE);
    view(camera, () => {
      f.painting('page');
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(turn);
      ctx.translate(-fx, -fy);
      f.puppet('villager', { numbers: {}, root: MAN.root, scale: MAN.scale });
      ctx.restore();
      milkIn(CUP.first * f.at('fill') + (1 - CUP.first) * f.at('fill2'));
      const end = RIBBON.size[1];
      if (f.t < f.cue('pour2').start) ribbon(end * f.at('stop'), end * f.at('pour'));
      else ribbon(end * f.at('stop2'), end * f.at('pour2'));
      if (f.t >= f.cue('book').start) book();
      if (f.at('ink') > 0 && f.at('away') < 1) dropper();
    });
  },
});
