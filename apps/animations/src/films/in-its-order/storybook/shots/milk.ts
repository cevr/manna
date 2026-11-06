import { unprobed } from '@manna/film/canvas';
import type { FilmShot, Over } from '../../../../library/storybook/scene.ts';
import { fonts, palette } from '../../palette.ts';
import { hold, type Plate, type Span, turn } from '../../../../library/storybook/shot.ts';
import { BOOK_OPEN, BOOK_SHUT, PAGE } from '../../plates/milk.ts';
import {
  type Area,
  boxOver,
  cam,
  type CameraPath,
  camerasOf,
  type Framing,
  holds,
  inkLines,
  key,
  layer,
  onScreen,
  pathFramingAt,
  plateOf,
  plateOn,
  seat,
  STORY_PLATES,
  tallOf,
  withAlpha,
} from '../kit.ts';
import {
  BOOK_CLOSE,
  CUP_CLOSE,
  CUP_CLOSE_AT,
  DROPPER_CLOSE,
  DROPPER_TIP,
  INSERT_FACES,
  INSERT_SCALE,
  POUR_CLOSE,
  POUR_LIP,
} from '../plates/inserts.ts';
import { SHADOW } from '../plates/shadow.ts';

/** How far the parchment page stands behind the figures, as a camera's divisor: a truck shows them standing off it. */
const PAGE_Z = 1.1;

/** The page, half again its painted size, centred on the frame: a margin past every edge for a truck along the row. */
const page = () =>
  layer('page', PAGE_Z, [plateOn('milk-page.png', PAGE, [960, 640], [960, 540], 1.5)]);

/** A soft violet contact shadow under feet at `x` on ground `y`, `w` px wide, on the figures' plane so a truck keeps it under them. */
const shadowAt = (x: number, y: number, w: number): Plate =>
  plateOn('shadow.png', SHADOW, [496, 116.5], [x, y], w / SHADOW.size[0], { dir: STORY_PLATES });

/** The grown villager in the IDEA beats: a grown head on the figures' plane, his place, and his crown. */
const VILLAGER = { headPx: 310, x: 680, crown: 120 } as const;

/** The villager on his `iio-milk` sheet. */
const villager = (spans: readonly [Span, ...ReadonlyArray<Span>]) =>
  seat(
    {
      member: 'idea-villagers',
      sheet: 'iio-milk',
      name: 'villager',
      x: VILLAGER.x,
      crown: VILLAGER.crown,
    },
    { headPx: VILLAGER.headPx, z: 1 },
    spans,
  );

/** The villager's ground line on the figures' plane. */
const villagerGround = () =>
  VILLAGER.crown + tallOf('idea-villagers', 'iio-milk', VILLAGER.headPx, 1);

/** The open book beside the villager, as the panels `milk.newborn.5` and `milk.word.5` set it (the owner: the book nearer the cup), its centre and its scale: about the panel's 400 px across, its left edge just clear of his robe (layer x 828). */
export const BOOK = { x: 1025, y: 586, s: 0.9 } as const;

/** The camera at the end of `milk-cup`'s push: on the villager and the book beside him. */
const PUSHED = { x: 880, y: 520, zoom: 1.1 } as const;

/**
 * `milk-cup`, the scene's start to `newborn`: the villager on the parchment
 * holding his cup; after "Start with the milk." he takes a sip; on `peter`
 * the shut book pops in at picture right and he turns to look at it, it
 * opens before "As newborn babes", and the camera pushes in toward it.
 */
export const milkCup: FilmShot = {
  id: 'milk-cup',
  span: { at: 'start', until: 'newborn' },
  cues: {
    sip: { mark: 'start', word: 'milk', offset: 0.5, dur: 0.8 },
    pop: { mark: 'peter', dur: 0.35 },
    look: { mark: 'peter', offset: 0.15, dur: 0.3 },
    open: { mark: 'peter', offset: 0.6, dur: 0.25 },
    push: { mark: 'peter', until: 'newborn' },
  },
  build: ({ duration, cue }) => {
    const pop = cue('pop');
    const open = cue('open');
    const look = cue('look');
    const flip = (open.start + open.end) / 2;
    return {
      headPx: VILLAGER.headPx,
      camera: [
        cam(0, 960, 540, 1),
        cam(cue('push').start, 960, 540, 1),
        cam(duration, PUSHED.x, PUSHED.y, PUSHED.zoom),
      ],
      layers: [
        page(),
        layer('figures', 1, [
          shadowAt(VILLAGER.x, villagerGround(), 330),
          villager([
            ...holds(
              [
                [0, 'cup', 'cupBlink'],
                [cue('sip').start, 'drink', 'drink'],
                [cue('sip').end, 'cup', 'cupBlink'],
              ],
              look.start,
            ),
            turn(look.start, look.end - look.start, 'cup', 'look'),
            hold(look.end, duration, 'look'),
          ]),
          plateOn('milk-book-shut.png', BOOK_SHUT, [131, 132], [BOOK.x, BOOK.y], BOOK.s, {
            moves: [
              [pop.start, key({ alpha: 0, sx: 0.5, sy: 0.5 })],
              [pop.start, key({ sx: 0.5, sy: 0.5 })],
              [pop.end, key({})],
              [open.start, key({})],
              [flip, key({ sx: 0.2 })],
              [flip, key({ alpha: 0, sx: 0.2 })],
            ],
          }),
          plateOn('milk-book-open.png', BOOK_OPEN, [215.5, 119.5], [BOOK.x, BOOK.y], BOOK.s, {
            moves: [
              [flip, key({ alpha: 0, sx: 0.2 })],
              [flip, key({ sx: 0.2 })],
              [open.end, key({})],
            ],
          }),
        ]),
      ],
    };
  },
};

/** The plates act 1 dissolves on purpose, by file: none; every plate shows whole or not at all, but for one frame. */
export const DISSOLVES: ReadonlySet<string> = new Set<string>();

/** An insert's face (its own px) on the plane it is laid on as `WHAT_DAY` is (`INSERT_SCALE`, 100 px above the frame's top), layer px. */
const insertArea = (face: Area): Area => ({
  x0: face.x0 * INSERT_SCALE,
  y0: face.y0 * INSERT_SCALE - 100,
  x1: face.x1 * INSERT_SCALE,
  y1: face.y1 * INSERT_SCALE - 100,
});

/** milk-book's camera: one slow push in toward the verse on the pages, from `newborn` to the cut. */
export const BOOK_PATH: CameraPath = [
  ['push', { x: 960, y: 540, zoom: 1 }, { x: 960, y: 560, zoom: 1.07 }],
];

/**
 * `milk-book`, `newborn` to `sincere`: cut in to the open book on the feast
 * table, close, and 1 Pet 2:2 lettered on its two pages in the film's own
 * inked hand from the verse's first word, quickly, so it stands whole on
 * the page for longer than its words take to read (`BOOK_QUOTE`), under a
 * slow push.
 */
export const milkBook: FilmShot = {
  id: 'milk-book',
  span: { mark: 'newborn', until: 'sincere' },
  cues: {
    write: { mark: 'newborn', dur: 2.1 },
    push: { mark: 'newborn', until: 'sincere' },
  },
  build: ({ cue }) => ({
    headPx: VILLAGER.headPx,
    camera: camerasOf(BOOK_PATH, cue),
    layers: [
      layer('book', 1, [
        plateOf('milk-book-close.png', BOOK_CLOSE, { scale: INSERT_SCALE, dir: STORY_PLATES }),
      ]),
    ],
  }),
};

/** The verse's ink on the pages: the hand's face, at its size on the pages' plane. */
export const INK = {
  family: fonts.hand,
  size: 70,
  weight: 700,
  color: palette.ink,
  align: 'center',
} as const;

/** 1 Pet 2:2 as it is lettered on the two pages, left then right, layer px, and its reference under the right page's lines. */
export const BOOK_WORDS = [
  { x: 594, y: 400, text: '“As newborn babes,' },
  { x: 594, y: 510, text: 'desire the sincere' },
  { x: 594, y: 620, text: 'milk of the word,' },
  { x: 1337, y: 400, text: 'that ye may' },
  { x: 1337, y: 510, text: 'grow thereby.”' },
  { x: 1337, y: 650, text: '1 Peter 2:2' },
] as const;

/** Where the verse is lettered on the two pages, layer px: across both pages' faces, from above its first line's letters to below its reference's. */
const PAGES: Area = (() => {
  const [l, r] = [insertArea(INSERT_FACES.left), insertArea(INSERT_FACES.right)];
  return { x0: l.x0 - 20, y0: 320, x1: r.x1 + 20, y1: 690 };
})();

/** 1 Pet 2:2 in ink on the open book's pages in milk-book, the film's own lettering in strokes: written from the verse's first word over `write`, then held whole to the cut. It follows milk-book's push, inside the pages' frame box. */
export const BOOK_QUOTE: Over = {
  shot: 'milk-book',
  box: boxOver(BOOK_PATH, PAGES),
  draw: (f) =>
    inkLines(
      f,
      pathFramingAt('milk-book', BOOK_PATH, f.at),
      BOOK_WORDS,
      INK,
      f.at('milk-book:write'),
      'verse',
    ),
};

/** The pour close laid on its plane: scaled up past the inserts' scale and raised, so its tipped book stands high over the table, layer px. */
const POUR_AT = { scale: 1.4, x: -120, y: -330 } as const;

/** The cup on the table in the pour close: its foot, layer px, and its scale (its height a third of the frame and more). */
const CUP_AT = { x: 820, y: 1000, s: 0.95 } as const;

/** Where the milk leaves the tipped book, layer px. */
export const LIP = [
  POUR_LIP[0] * POUR_AT.scale + POUR_AT.x,
  POUR_LIP[1] * POUR_AT.scale + POUR_AT.y,
] as const;

/** The inside of the cup's mouth, layer px: its centre and radii. */
export const MOUTH = {
  x: CUP_AT.x + (CUP_CLOSE_AT.mouth.x - CUP_CLOSE_AT.foot[0]) * CUP_AT.s,
  y: CUP_AT.y + (CUP_CLOSE_AT.mouth.y - CUP_CLOSE_AT.foot[1]) * CUP_AT.s,
  rx: CUP_CLOSE_AT.mouth.rx * CUP_AT.s,
  ry: CUP_CLOSE_AT.mouth.ry * CUP_AT.s,
} as const;

/** How far below the mouth's middle the milk's face starts in the empty cup, layer px: the inside's depth the mouth shows. */
const CUP_DEPTH = 52;

/** milk-pour's camera: a slight drift in while the stream runs and the dropper comes, then a push in on the cup from `word` to `good`, held on the full cup. */
export const POUR_PATH: CameraPath = [
  ['drift', { x: 960, y: 540, zoom: 1 }, { x: 930, y: 556, zoom: 1.03 }],
  ['push', { x: 930, y: 556, zoom: 1.03 }, { x: 880, y: 600, zoom: 1.1 }],
];

/** Where the dropper waits off the frame's left and where it hangs over the cup, its tip, layer px; and its scale. */
const DROPPER = {
  off: [-320, MOUTH.y - 60],
  over: [MOUTH.x - MOUTH.rx * 0.35, MOUTH.y - 60],
  s: 0.8,
} as const;

/**
 * `milk-pour`, `sincere` to `need`: cut to the feast table, close, the
 * clay cup on it and the open book tipped high over it. On `sincere` a
 * clean white stream runs from the book's lower corner down into the cup
 * and keeps running, its surface flowing, while the milk climbs the cup
 * (`POUR_STREAM`). On `mixed` a large dropper of ink comes in from the
 * left and hangs over the cup, its drop trembling; on "nothing" it shakes
 * and is drawn back out the way it came, the stream unbroken and white. On
 * `word` the camera pushes in on the cup; by `good` it is full to the brim
 * and the stream stops.
 */
export const milkPour: FilmShot = {
  id: 'milk-pour',
  span: { mark: 'sincere', until: 'need' },
  cues: {
    pour: { mark: 'sincere', dur: 0.4 },
    drift: { mark: 'sincere', until: 'word' },
    fill: { mark: 'sincere', until: 'good' },
    dropper: { mark: 'mixed', dur: 0.5 },
    shake: { mark: 'mixed', word: 'nothing', offset: 0.7, dur: 0.6 },
    away: { after: 'milk-pour:shake', dur: 0.6 },
    push: { mark: 'word', until: 'good' },
    full: { mark: 'good', dur: 0.3 },
  },
  build: ({ cue }) => {
    const [dropper, shake, away] = [cue('dropper'), cue('shake'), cue('away')];
    const [dx, dy] = [DROPPER.off[0] - DROPPER.over[0], DROPPER.off[1] - DROPPER.over[1]];
    const step = (shake.end - shake.start) / 4;
    return {
      headPx: VILLAGER.headPx,
      camera: camerasOf(POUR_PATH, cue),
      layers: [
        layer('table', 1, [
          plateOf('milk-pour-close.png', POUR_CLOSE, {
            at: [POUR_AT.x, POUR_AT.y],
            scale: POUR_AT.scale,
            dir: STORY_PLATES,
          }),
          plateOn(
            'milk-cup-close.png',
            CUP_CLOSE,
            CUP_CLOSE_AT.foot,
            [CUP_AT.x, CUP_AT.y],
            CUP_AT.s,
            {
              dir: STORY_PLATES,
            },
          ),
          plateOn('milk-dropper-close.png', DROPPER_CLOSE, DROPPER_TIP, DROPPER.over, DROPPER.s, {
            dir: STORY_PLATES,
            moves: [
              [0, key({ x: dx, y: dy, alpha: 0 })],
              [dropper.start, key({ x: dx, y: dy, alpha: 0 })],
              [dropper.start, key({ x: dx, y: dy })],
              [dropper.end, key({})],
              [shake.start, key({})],
              [shake.start + step, key({ x: -24, y: -6 })],
              [shake.start + 2 * step, key({ x: 18 })],
              [shake.start + 3 * step, key({ x: -24, y: -6 })],
              [shake.end, key({ y: -10 })],
              [away.start, key({ y: -10 })],
              [away.end, key({ x: dx, y: dy })],
              [away.end, key({ x: dx, y: dy, alpha: 0 })],
            ],
          }),
        ]),
      ],
    };
  },
};

/** How the stream is drawn, layer px: its width at the book's lip and at the cup, how many light streaks run down it, and how fast (its lengths a second). */
const STREAM = { lip: 46, cup: 24, streaks: 7, speed: 1.6 } as const;

/** The stream's middle line from the lip to the milk's face at `level` (0 empty, 1 full): it leaves the book's corner a little outward and falls into the cup's mouth right of its middle. */
const streamAt = (level: number, u: number): readonly [number, number] => {
  const end = [MOUTH.x + MOUTH.rx * 0.42, surfaceY(level)] as const;
  const c1 = [LIP[0] - 40, LIP[1] + 10] as const;
  const c2 = [end[0] + 6, LIP[1] + (end[1] - LIP[1]) * 0.45] as const;
  const v = 1 - u;
  return [
    v ** 3 * LIP[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * end[0],
    v ** 3 * LIP[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * end[1],
  ];
};

/** The milk's face in the cup at `level`: from `CUP_DEPTH` under the mouth's middle when empty to the mouth's own line when full. */
const surfaceY = (level: number): number => MOUTH.y + CUP_DEPTH * (1 - level);

/** The area the stream and the cup's milk draw in, layer px. */
const POUR_AREA: Area = {
  x0: MOUTH.x - MOUTH.rx - 4,
  y0: LIP[1] - 24,
  x1: LIP[0] + 30,
  y1: MOUTH.y + CUP_DEPTH + MOUTH.ry + 6,
};

/**
 * The milk in milk-pour, drawn over the table in its shot's framing: the
 * stream from the book's lip into the cup from `pour` (laid down from the
 * lip over that cue) to `full`, tapering as it falls, its light streaks
 * running down it all the while; its splash at the milk's face; and the
 * milk itself in the cup's mouth, climbing from the empty cup's floor to
 * the brim over `fill`.
 */
export const POUR_STREAM: Over = {
  shot: 'milk-pour',
  box: boxOver(POUR_PATH, POUR_AREA),
  draw: (f) => {
    const c: Framing = pathFramingAt('milk-pour', POUR_PATH, f.at);
    const level = f.at('milk-pour:fill');
    const laid = f.at('milk-pour:pour');
    const stopped = f.at('milk-pour:full');
    const ctx = f.ctx;
    const [x0, y0] = onScreen(c, 0, 0);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.scale(c.zoom, c.zoom);
    milkInCup(ctx, level, f.t);
    if (laid > 0 && stopped < 1) stream(ctx, level, stopped, laid, f.t);
    ctx.restore();
  },
};

/** The milk in the cup's mouth at `level`, clipped to the mouth's inside, rippling at time `t`. */
const milkInCup = (ctx: CanvasRenderingContext2D, level: number, t: number) => {
  if (level <= 0) return;
  const y = surfaceY(level);
  const spread = 0.62 + 0.38 * level;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(MOUTH.x, MOUTH.y, MOUTH.rx, MOUTH.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#f7f1e3';
  ctx.beginPath();
  ctx.ellipse(MOUTH.x, y, MOUTH.rx * spread, MOUTH.ry * spread, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#c9bde0', 0.55);
  ctx.beginPath();
  ctx.ellipse(
    MOUTH.x + MOUTH.rx * 0.12,
    y + MOUTH.ry * 0.2,
    MOUTH.rx * spread * 0.85,
    MOUTH.ry * spread * 0.6,
    0,
    0,
    Math.PI,
  );
  ctx.fill();
  ctx.strokeStyle = withAlpha('#ffffff', 0.8);
  ctx.lineWidth = 3;
  const ring = (t * 1.3) % 1;
  ctx.beginPath();
  ctx.ellipse(
    MOUTH.x + MOUTH.rx * 0.42,
    y,
    10 + 46 * ring,
    (10 + 46 * ring) * 0.25,
    0,
    0,
    Math.PI * 2,
  );
  ctx.globalAlpha *= 1 - ring;
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

/** The stream into the cup at `level`: laid `laid` of its length from the lip, its top lifted `stopped` of the way to the cup as it stops; tapering, shaded on its right, light streaks running down it at time `t`. */
const stream = (
  ctx: CanvasRenderingContext2D,
  level: number,
  stopped: number,
  laid: number,
  t: number,
) => {
  const n = 40;
  const [from, to] = [stopped, laid];
  const points = Array.from({ length: n + 1 }, (_, i) => {
    const u = from + ((to - from) * i) / n;
    const [x, y] = streamAt(level, u);
    const [ax, ay] = streamAt(level, Math.max(0, u - 0.01));
    const [bx, by] = streamAt(level, Math.min(1, u + 0.01));
    const [tx, ty] = [bx - ax, by - ay];
    const len = Math.hypot(tx, ty) || 1;
    const wobble = Math.sin(t * 19 + u * 13) * 1.2;
    const w = (STREAM.lip + (STREAM.cup - STREAM.lip) * u) / 2;
    return {
      u,
      x: x + (-ty / len) * wobble,
      y: y + (tx / len) * wobble,
      nx: -ty / len,
      ny: tx / len,
      w,
    };
  });
  const edge = (side: number, share: number) =>
    points.map((p) => [p.x + p.nx * p.w * side * share, p.y + p.ny * p.w * side * share] as const);
  const band = (
    a: ReadonlyArray<readonly [number, number]>,
    b: ReadonlyArray<readonly [number, number]>,
    fill: string,
  ) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    a.forEach(([x, y]) => ctx.lineTo(x, y));
    b.toReversed().forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  band(edge(-1, 1.18), edge(1, 1.18), palette.ink);
  band(edge(-1, 1), edge(1, 1), '#fbf7ee');
  band(edge(1, 0.25), edge(1, 1), withAlpha('#c9bde0', 0.8));
  ctx.strokeStyle = withAlpha('#ffffff', 0.95);
  ctx.lineCap = 'round';
  Array.from({ length: STREAM.streaks }, (_, k) => {
    const head = (k / STREAM.streaks + t * STREAM.speed) % 1;
    const span = points.filter((p) => p.u >= head - 0.07 && p.u <= head);
    if (span.length < 2) return;
    ctx.lineWidth = 2 + 2 * (1 - head);
    ctx.beginPath();
    span.forEach((p) => ctx.lineTo(p.x - p.nx * p.w * 0.35, p.y - p.ny * p.w * 0.35));
    unprobed(ctx, () => ctx.stroke());
  });
  if (stopped <= 0 && laid >= 1) {
    const [ex, ey] = streamAt(level, 1);
    ctx.fillStyle = '#fbf7ee';
    [0, 1, 2].forEach((d) => {
      const phase = (t * 2.2 + d / 3) % 1;
      const r = 4 + 2 * (1 - phase);
      ctx.beginPath();
      ctx.arc(ex + (d - 1) * 16 * phase, ey - 18 * Math.sin(Math.PI * phase), r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
};

/** The row's ground line and its grown head on the figures' plane, at the whole row's framing. */
const ROW = { ground: 995, headPx: 285 } as const;

/**
 * milk-row's sizes on their head shares (owner O2, by the orchestrator's
 * ruling): the lead a little smaller and the row a little larger, so the two
 * grown men's crowns come near level, as the panel stands them; each the
 * farthest the scale bar's ±5 % allows over the cells the shot draws (the
 * lead's `front` reads 0.993 of his share, the toddler's `hold` 1.005).
 */
export const ROW_SIZES = { lead: 0.958, row: 1.043 } as const;

/** The row left to right: each member, sheet, name, its x, its first cell and blink, and its contact shadow's width. */
const RowMember = [
  ['idea-villagers', 'iio-milk-baby', 'baby', 360, 'sit', 'sitBlink', 230],
  ['villager-toddler', 'iio-milk', 'toddler', 640, 'hold', 'holdBlink', 210],
  ['villager-child', 'iio-milk', 'child', 900, 'hold', 'holdBlink', 230],
  ['idea-villagers', 'iio-milk', 'villager', 1240, 'cup', 'cupBlink', 300],
] as const;

/** The row's turns to drink: one cue whose starts spread over its `stagger` share of its `dur`, the baby's first. */
const DRINKS = { mark: 'need', offset: 0.15, dur: 2.8, stagger: 0.75 } as const;

/** When each of the row's drinkers turns to drink, left to right, in seconds after `milk-row:drinks` starts; the shot and the sound's chimes both read it. */
export const drinkTurns: ReadonlyArray<number> = RowMember.map(
  (_, i) => (DRINKS.dur * DRINKS.stagger * i) / (RowMember.length - 1),
);

/**
 * `milk-row`, `need` to the scene's end: the row on the page, the baby, the
 * toddler, the child and the villager, each drinking in turn as the camera
 * trucks along it from the baby, then the camera pulls back to the whole row
 * as the lead at its right end lifts his cup on `shame` and holds it,
 * smiling.
 */
export const milkRow: FilmShot = {
  id: 'milk-row',
  span: { mark: 'need', until: { at: 'end' } },
  cues: {
    truck: { mark: 'need', until: 'began' },
    drinks: DRINKS,
    pull: { mark: 'began', until: 'shame', untilOffset: 0.4 },
    lift: { mark: 'shame', dur: 0.22 },
  },
  build: ({ duration, cue }) => {
    const drinks = cue('drinks');
    const lift = cue('lift');
    const at = { headPx: ROW.headPx, z: 1 };
    const turnAt = (i: number) => drinks.start + (drinkTurns[i] ?? 0);
    const row = RowMember.flatMap(([member, sheet, name, x, rest, blink, w], i) => {
      const crown = ROW.ground - tallOf(member, sheet, ROW.headPx, 1) * ROW_SIZES.row;
      return [
        shadowAt(x, ROW.ground, w),
        seat(
          { member, sheet, name, x, crown, size: ROW_SIZES.row },
          at,
          holds(
            [
              [0, rest, blink],
              [turnAt(i), 'drink', 'drink'],
              [turnAt(i) + 0.8, rest, blink],
            ],
            duration,
          ),
        ),
      ];
    });
    const leadX = 1640;
    return {
      headPx: ROW.headPx,
      camera: [
        cam(0, 760, 650, 1.2),
        cam(cue('truck').end, 1160, 650, 1.2),
        cam(cue('pull').end, 960, 560, 1),
      ],
      layers: [
        page(),
        layer('figures', 1, [
          plateOn('milk-book-open.png', BOOK_OPEN, [215.5, 119.5], [190, 960], 0.4),
          ...row,
          shadowAt(leadX, ROW.ground, 300),
          seat(
            {
              member: 'lead-feast',
              sheet: 'iio-milk',
              name: 'lead',
              x: leadX,
              crown: ROW.ground - tallOf('lead-feast', 'iio-milk', ROW.headPx, 1) * ROW_SIZES.lead,
              size: ROW_SIZES.lead,
            },
            at,
            holds(
              [
                [0, 'front', 'frontBlink'],
                [lift.start, 'lift', 'lift'],
                [lift.end, 'cup', 'cup'],
              ],
              duration,
            ),
          ),
        ]),
      ],
    };
  },
};
