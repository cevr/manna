import { drawing, fly, flyV, stream } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { palette } from '../palette.ts';
import { PUPPETS as VILLAGER } from '../cast/idea-villagers/cutout/puppets.ts';
import {
  BOOK_OPEN,
  BOOK_SHUT,
  DRINKERS,
  DROPPER,
  PAGE,
  RIBBON,
  RIBBON_ROWS,
} from '../plates/milk.ts';

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

/** Shot B opens on the drinking row's left end. */
const ROW_START: Camera = { x: 800, y: 600, k: 1.2 };

/**
 * Shot B's framings: `truck` runs along the row to its right end as the four
 * come in, and `pull` draws back to the whole page as the lead comes in.
 */
const ROW_MOVES = [
  ['truck', { x: 1120, y: 600, k: 1.2 }],
  ['pull', WIDE],
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
 * The milk's drops, frame px and seconds, a few beside each pour so it reads
 * wet without drawing the eye. While the ribbon runs, `lip` drops a second
 * fall off its lip under the book, each landing in the cup's mouth (within
 * `aside` of its half width from the centre) `fall` s later under gravity
 * `g`; the first lands as the ribbon's foot goes in. While the ribbon runs
 * into the cup, `splash` drops a second hop up from where it goes in, `spread`
 * px/s aside, under gravity `hop`, up and back into the mouth in `bounce` s.
 * A drop is `size` px in radius, a splash drop `small` of that; each is the
 * cup's cream lit (`CUP.colour`), lilac in shade (`shade`, the ribbon's own
 * shade's hue) and ringed `line` px in the outline's ink, stretched along its
 * motion. Each pour's drops have their own seeds (`seeds`: lip, splash).
 */
const DROPS = {
  lip: 2.5,
  fall: [0.42, 0.55],
  aside: 0.4,
  g: 2200,
  splash: 7,
  spread: 70,
  hop: 1600,
  bounce: [0.16, 0.28],
  size: [2.5, 4.5],
  small: 0.7,
  shade: '#d8d1ea',
  ink: palette.outline,
  line: 1.6,
  seeds: {
    pour: [11, 21],
    pour2: [12, 22],
  },
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

const [BABY, TODDLER, CHILD, GROWN, LEAD] = DRINKERS;

/** The drinking row, left to right, each by its painting's name; the lead stands at its right end. */
const DRINKING = [
  ['baby', BABY],
  ['toddler', TODDLER],
  ['child', CHILD],
  ['grown', GROWN],
  ['lead', LEAD],
] as const;

/**
 * The drinking row on the page, frame px: each of the five drawn `s` its
 * size, its feet where the kept row has them (`sheet`) scaled to the frame
 * and moved by `shift`, so the 1536-px row spans the frame and its feet stand
 * at about y 1020. Each comes in rising `rise` px as it fades in, and rocks
 * `bob` degrees each way about its feet every `bobPeriod` s, each `phase`
 * radians after the one on its left.
 */
const ROW = {
  s: 1.25,
  shift: [-4, -52],
  rise: 16,
  bob: 1.2,
  bobPeriod: 3,
  phase: 0.9,
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
    truck: { mark: 'need', until: 'began', ease: 'inOutSine' },
    row: { mark: 'need', offset: 0.15, dur: 2.25, stagger: 0.8, ease: 'outCubic' },
    pull: { mark: 'began', until: 'shame', untilOffset: 0.4, ease: 'inOutCubic' },
    lead: { mark: 'shame', dur: 0.45, ease: 'outCubic' },
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
    baby: BABY,
    toddler: TODDLER,
    child: CHILD,
    grown: GROWN,
    lead: LEAD,
  },
  draw: (f) => {
    const { ctx, w } = f;
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
    const turn =
      ((sway(MAN.sway, MAN.swayPeriod, 0) + MAN.recoil * Math.sin(Math.PI * f.at('recoil'))) *
        Math.PI) /
      180;
    const [mx, my] = onPage(CUP.mouth);
    const [fx, fy] = MAN.feet;
    const mouth = turned([mx, my], MAN.feet, turn);
    const [rx, ry] = [MAN.scale * CUP.rx, MAN.scale * CUP.ry];

    const enter = f.at('book');
    const [bx, by] = [
      BOOK.at[0] + BOOK.drift[0] * (1 - enter),
      BOOK.at[1] + BOOK.drift[1] * (1 - enter) + sway(BOOK.bob, BOOK.bobPeriod, 0),
    ];
    const tip = (BOOK.tilt * f.at('tilt') * Math.PI) / 180;
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
    const spout = (): Pt => {
      const [px, py] = [BOOK.s * POUR.from[0], BOOK.s * POUR.from[1]];
      return [
        bx + px * Math.cos(tip) - py * Math.sin(tip),
        by + px * Math.sin(tip) + py * Math.cos(tip),
      ];
    };
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
    const drop = (at: Pt, v: Pt, r: number) => {
      const stretch = 1 + Math.min(0.8, Math.hypot(v[0], v[1]) / 1200);
      const a = Math.atan2(v[1], v[0]);
      const blob = (dx: number, dy: number, rx0: number, ry0: number, colour: string) => {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.ellipse(at[0] + dx, at[1] + dy, rx0, ry0, a, 0, 2 * Math.PI);
        ctx.fill();
      };
      blob(0, 0, r * stretch + DROPS.line, r + DROPS.line, DROPS.ink);
      blob(0, 0, r * stretch, r, DROPS.shade);
      blob(-0.25 * r, -0.25 * r, 0.7 * r * stretch, 0.7 * r, CUP.colour);
    };
    const drops = (pour: 'pour' | 'pour2', stop: 'stop' | 'stop2') => {
      const [poured, stopped] = [f.cue(pour), f.cue(stop)];
      if (f.t < poured.end - DROPS.fall[1] || f.t > stopped.end + DROPS.bounce[1]) return;
      const [lipSeed, splashSeed] = DROPS.seeds[pour];
      const size = (r: () => number) => lerp(DROPS.size[0], DROPS.size[1], r());
      const from = spout();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -200, 1920, mouth[1] + 200);
      ctx.ellipse(mouth[0], mouth[1], rx, ry, turn, 0, 2 * Math.PI);
      ctx.clip();
      stream(
        f.t,
        poured.end - DROPS.fall[0],
        stopped.start,
        DROPS.lip,
        lipSeed,
        (g) => lerp(DROPS.fall[0], DROPS.fall[1], g()),
        (age, life, r) => {
          const to: Pt = [mouth[0] + DROPS.aside * rx * (2 * r() - 1), mouth[1]];
          const vx = (to[0] - from[0]) / life;
          const vy = (to[1] - from[1]) / life - (DROPS.g * life) / 2;
          drop(fly(from[0], from[1], vx, vy, age, DROPS.g), flyV(vx, vy, age, DROPS.g), size(r));
        },
      );
      stream(
        f.t,
        poured.end,
        stopped.end,
        DROPS.splash,
        splashSeed,
        (g) => lerp(DROPS.bounce[0], DROPS.bounce[1], g()),
        (age, life, r) => {
          const [vx, vy] = [DROPS.spread * (2 * r() - 1), (-DROPS.hop * life) / 2];
          const x = mouth[0] + 0.3 * rx * (2 * r() - 1);
          drop(
            fly(x, mouth[1], vx, vy, age, DROPS.hop),
            flyV(vx, vy, age, DROPS.hop),
            DROPS.small * size(r),
          );
        },
      );
      ctx.restore();
    };
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

    const row = () => {
      for (const [i, [name, d]] of DRINKING.entries()) {
        const shown = name === 'lead' ? f.at('lead') : f.stagger('row', i, DRINKING.length - 1);
        if (shown <= 0) continue;
        ctx.save();
        ctx.translate(
          ROW.s * (d.sheet[0] + d.size[0] / 2) + ROW.shift[0],
          ROW.s * (d.sheet[1] + d.size[1]) + ROW.shift[1] + ROW.rise * (1 - shown),
        );
        ctx.rotate((sway(ROW.bob, ROW.bobPeriod, ROW.phase * i) * Math.PI) / 180);
        ctx.scale(ROW.s, ROW.s);
        ctx.globalAlpha = shown;
        f.painting(name);
        ctx.restore();
      }
    };

    if (f.t >= f.cue('truck').start) {
      const along = ROW_MOVES.reduce<Camera>(
        (cam, [cue, to]) => between(cam, to, f.at(cue)),
        ROW_START,
      );
      view(along, () => {
        f.painting('page');
        row();
      });
      return;
    }
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
      drops('pour', 'stop');
      drops('pour2', 'stop2');
      if (f.t >= f.cue('book').start) book();
      if (f.at('ink') > 0 && f.at('away') < 1) dropper();
    });
  },
});
