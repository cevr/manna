import { write } from '@manna/film/canvas';
import type { FilmShot, Over } from '../../../../library/storybook/scene.ts';
import { fonts, palette } from '../../palette.ts';
import { hold, type Plate, type Span, turn } from '../../../../library/storybook/shot.ts';
import { CELLS as VILLAGER_CELLS } from '../../cast/idea-villagers/shot-sheets/iio-milk/cells.ts';
import { BOOK_OPEN, BOOK_SHUT, DROPPER, PAGE } from '../../plates/milk.ts';
import {
  cam,
  drawScaleOf,
  type Framing,
  framingAt,
  holds,
  key,
  layer,
  onScreen,
  plateAcross,
  plateOn,
  seat,
  STORY_PLATES,
  tallOf,
} from '../kit.ts';
import { MILK_ARC, MILK_ARC_BRUSH, MILK_ARC_ENDS } from '../plates/milk-arc.ts';
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

/** The milk's face in the villager's cup, in each cell he holds it in while it pours (waving the dropper away too, the cup kept in his other hand), in that cell's px: the cup's mouth, read on the cells. */
export const CUP_MOUTHS = {
  cup: { x: 100, y: 501, width: 42, height: 8 },
  look: { x: 131, y: 501, width: 43, height: 8 },
  wave: { x: 126, y: 501, width: 42, height: 8 },
} as const;

/** Where the milk falls into the cup in his `cup` hold, on the figures' plane: the mouth's middle across, 2 px under its rim, so his breath stays inside it. */
const cupMouth = (): readonly [number, number] => {
  const s = drawScaleOf('idea-villagers', 'iio-milk', VILLAGER.headPx, 1);
  const m = CUP_MOUTHS.cup;
  return [
    VILLAGER.x + (m.x + m.width / 2 - VILLAGER_CELLS.cup.ax) * s,
    villagerGround() + (m.y + 2 - VILLAGER_CELLS.cup.ay) * s,
  ];
};

/** The open book beside the villager, as the panels `milk.newborn.5` and `milk.word.5` set it (the owner: the book nearer the cup), its centre and its scale: about the panel's 400 px across, its left edge just clear of his robe (layer x 828), so the milk pours about the panel's 340 px. */
export const BOOK = { x: 1025, y: 586, s: 0.9 } as const;

/** The gutter of the open book, in its own px: the fold the milk leaves from, its upper half. */
export const GUTTER = { x: 195, y: 40, width: 41, height: 100 } as const;

/** The point in the gutter the milk leaves from, on the figures' plane. */
const gutterPour = (): readonly [number, number] => [
  BOOK.x + (GUTTER.x + GUTTER.width / 2 - BOOK_OPEN.size[0] / 2) * BOOK.s,
  BOOK.y + (GUTTER.y + GUTTER.height / 2 - BOOK_OPEN.size[1] / 2) * BOOK.s,
];

/** The camera at the end of `milk-cup`'s push: on the villager, the book and the milk's arc between them. */
const PUSHED = { x: 880, y: 520, zoom: 1.1 } as const;

/**
 * `milk-cup`, the scene's start to `desire`: the villager on the parchment
 * holding his cup; after "Start with the milk." he takes a sip; on
 * `newborn` the shut book pops in at picture right and he turns to look at
 * it, it opens, and from `peter` the camera pushes in.
 */
export const milkCup: FilmShot = {
  id: 'milk-cup',
  span: { at: 'start', until: 'desire' },
  cues: {
    sip: { mark: 'start', word: 'milk', offset: 0.5, dur: 0.8 },
    pop: { mark: 'newborn', dur: 0.35 },
    look: { mark: 'newborn', offset: 0.15, dur: 0.3 },
    open: { mark: 'newborn', offset: 0.6, dur: 0.25 },
    push: { mark: 'peter', until: 'desire' },
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

/** How far left of its place the dropper waits and leaves to, layer px: its right edge (x 702 at rest) past the pushed frame's left edge (x 7 at zoom 1.1), so it comes in and goes out whole and level, under his face, over his tunic and his cup hand. */
const DROPPER_LEFT = -730;

/** The plates act 1 dissolves on purpose, by file: the milk's arc thinning away as a pour stops, a stream of milk and no drawn prop. Every other plate shows whole or not at all, but for one frame. */
export const DISSOLVES: ReadonlySet<string> = new Set(['milk-arc.png']);

/** One pour of the milk: its arc laid from the book's gutter over and down into the cup's mouth over `from`..`from + 0.6` s, gone at `stop`. */
const ribbon = (from: number, stop: number): Plate =>
  plateAcross(
    'milk-arc.png',
    MILK_ARC,
    [MILK_ARC_ENDS.source, MILK_ARC_ENDS.mouth],
    [gutterPour(), cupMouth()],
    {
      dir: STORY_PLATES,
      reveal: { brush: MILK_ARC_BRUSH, from, to: from + 0.6 },
      moves: [
        [stop, key({})],
        [stop + 0.25, key({ alpha: 0 })],
      ],
    },
  );

/**
 * milk-pour's camera, each move a cue of the shot from one framing to the
 * next, in order, each starting where the one before ended (layer px): up
 * and right onto the parchment over the open book on `desire`; a slow push
 * while the verse is lettered there; down to the book and the cup after
 * "thereby"; down the stream to the cup as it pours, until the dropper
 * comes; left with the dropper as it is waved away; back in toward the
 * stream and the cup on `word`; and easing out as he drinks. It stays at
 * zoom 1.16 or under throughout, so the villager's drawing (drawn at 1.281)
 * is never enlarged past the act's 1.5 cap.
 */
export const POUR_PATH = [
  ['page', PUSHED, { x: 960, y: 470, zoom: 1.12 }],
  ['study', { x: 960, y: 470, zoom: 1.12 }, { x: 965, y: 468, zoom: 1.16 }],
  ['back', { x: 965, y: 468, zoom: 1.16 }, { x: 905, y: 525, zoom: 1.16 }],
  ['follow', { x: 905, y: 525, zoom: 1.16 }, { x: 820, y: 555, zoom: 1.16 }],
  ['leave', { x: 820, y: 555, zoom: 1.16 }, { x: 765, y: 550, zoom: 1.16 }],
  ['unmixed', { x: 765, y: 550, zoom: 1.16 }, { x: 860, y: 540, zoom: 1.16 }],
  ['settle', { x: 860, y: 540, zoom: 1.16 }, { x: 830, y: 525, zoom: 1.1 }],
] as const;

/** The framing milk-pour's camera holds at a frame whose cues have run `at` of their way: the first move not yet done, eased as the shot eases it, or the last move's end. */
const pourFramingAt = (at: (cue: string) => number): Framing => {
  const [moving] = POUR_PATH.filter(([cue]) => at(`milk-pour:${cue}`) < 1);
  const [cue, from, to] = moving ?? POUR_PATH[POUR_PATH.length - 1] ?? POUR_PATH[0];
  return framingAt(from, to, at(`milk-pour:${cue}`));
};

/**
 * `milk-pour`, `desire` to `need`: the camera rises onto the parchment over
 * the open book, and 1 Pet 2:2 is lettered there in ink as it is read
 * (`BOOK_QUOTE`). After "thereby" the camera comes down to the book and the
 * cup, the villager turns to his cup, the verse fades off the parchment, and
 * as it settles, before `sincere`, one clean white stream pours from the
 * book's gutter into his cup and keeps pouring: the camera follows it down
 * to the cup; on
 * "nothing" a dropper of ink comes in level from the left and rests at the
 * cup, and he waves it away, back out the way it came, the stream unbroken;
 * on `word` he looks to the book and back while it pours on, and the
 * camera goes in toward the stream; on `good` the cup is full, the stream
 * stops and he drinks. Each `cup` hold blinks through `cupBlink`.
 */
export const milkPour: FilmShot = {
  id: 'milk-pour',
  span: { mark: 'desire', until: 'need' },
  cues: {
    thereby: { mark: 'desire', word: 'thereby', offset: 0.56 },
    page: { mark: 'desire', dur: 0.9 },
    study: { after: 'milk-pour:page', until: { cue: 'milk-pour:thereby' } },
    write: { mark: 'desire', until: { cue: 'milk-pour:thereby' } },
    back: { after: 'milk-pour:thereby', dur: 0.5 },
    clear: { after: 'milk-pour:thereby', offset: 0.3, dur: 0.3 },
    toCup: { after: 'milk-pour:thereby', dur: 0.3 },
    pour: { after: 'milk-pour:back', dur: 0.3 },
    follow: { after: 'milk-pour:back', until: { cue: 'milk-pour:dropper' } },
    dropper: { mark: 'mixed', word: 'nothing', dur: 1.2, ends: true },
    wave: { mark: 'mixed', word: 'nothing', dur: 0.3 },
    away: { mark: 'mixed', word: 'nothing', offset: 0.3, dur: 1.2 },
    leave: { after: 'milk-pour:wave', until: 'word' },
    look: { mark: 'word', dur: 0.3 },
    turnBack: { after: 'milk-pour:look', offset: 0.6, dur: 0.3 },
    unmixed: { mark: 'word', until: 'good' },
    full: { mark: 'good', dur: 0.3 },
    drink: { mark: 'good', offset: 0.3, dur: 1.2 },
    settle: { mark: 'good', until: 'need' },
  },
  build: ({ duration, cue }) => {
    const [toCup, dropper, away, look, turnBack, drink] = [
      cue('toCup'),
      cue('dropper'),
      cue('away'),
      cue('look'),
      cue('turnBack'),
      cue('drink'),
    ];
    return {
      headPx: VILLAGER.headPx,
      camera: POUR_PATH.flatMap(([name, from, to]) => [
        cam(cue(name).start, from.x, from.y, from.zoom),
        cam(cue(name).end, to.x, to.y, to.zoom),
      ]),
      layers: [
        page(),
        layer('figures', 1, [
          shadowAt(VILLAGER.x, villagerGround(), 330),
          villager([
            hold(0, toCup.start, 'look'),
            turn(toCup.start, toCup.end - toCup.start, 'look', 'cup'),
            ...holds(
              [
                [toCup.end, 'cup', 'cupBlink'],
                [cue('wave').start, 'wave', 'wave'],
                [away.end, 'cup', 'cupBlink'],
              ],
              look.start,
            ),
            turn(look.start, look.end - look.start, 'cup', 'look'),
            hold(look.end, turnBack.start, 'look'),
            turn(turnBack.start, turnBack.end - turnBack.start, 'look', 'cup'),
            ...holds(
              [
                [turnBack.end, 'cup', 'cupBlink'],
                [drink.start, 'drink', 'drink'],
                [drink.end, 'cup', 'cupBlink'],
              ],
              duration,
            ),
          ]),
          plateOn('milk-book-open.png', BOOK_OPEN, [215.5, 119.5], [BOOK.x, BOOK.y], BOOK.s),
          ribbon(cue('pour').start, cue('full').start),
          plateOn('milk-dropper.png', DROPPER, [14, 130], [667, 530], 0.9, {
            moves: [
              [0, key({ x: DROPPER_LEFT, alpha: 0 })],
              [dropper.start, key({ x: DROPPER_LEFT, alpha: 0 })],
              [dropper.start, key({ x: DROPPER_LEFT })],
              [dropper.end, key({})],
              [away.start, key({})],
              [away.end, key({ x: DROPPER_LEFT })],
              [away.end, key({ x: DROPPER_LEFT, alpha: 0 })],
            ],
          }),
        ]),
      ],
    };
  },
};

/** 1 Pet 2:2 as it is lettered on the parchment over the open book: each line's centre and baseline on the figures' plane (layer px), and its words. */
const BOOK_WORDS = [
  { x: 1230, y: 205, text: '“As newborn babes, desire' },
  { x: 1230, y: 262, text: 'the sincere milk of the word,' },
  { x: 1230, y: 319, text: 'that ye may grow thereby.”' },
] as const;

/** The reference under the verse, on the figures' plane. */
export const BOOK_CITE = { x: 1230, y: 365, text: '1 Peter 2:2' } as const;

/** The verse's type on the figures' plane (drawn at the camera's zoom: about 50 frame px while it is written), and the reference's. */
const BOOK_TYPE = {
  verse: { family: fonts.display, size: 44, weight: 500, color: palette.ink, align: 'center' },
  cite: { family: fonts.display, size: 26, weight: 600, color: palette.goldShade, align: 'center' },
} as const;

/** The parchment over the book the verse is lettered on, on the figures' plane: clear of the villager's head (its right edge near layer x 805) and above the book's pages (from layer y 478). */
const VERSE_AREA = { x0: 880, y0: 140, x1: 1580, y1: 400 } as const;

/** The moves of milk-pour's camera the verse shows through: written on `page` and `study`, held and faded through `back` and `clear`. */
const VERSE_MOVES = new Set(['page', 'study', 'back']);

/** The frame box `VERSE_AREA` covers at some point of the moves the verse shows through, read at a hundred steps of each and clipped to the frame: the only place `BOOK_QUOTE` draws. */
const BOOK_BOX = (() => {
  const corners = POUR_PATH.filter(([move]) => VERSE_MOVES.has(move)).flatMap(([, from, to]) =>
    Array.from({ length: 101 }, (_, i) => framingAt(from, to, i / 100)).flatMap((c) => [
      onScreen(c, VERSE_AREA.x0, VERSE_AREA.y0),
      onScreen(c, VERSE_AREA.x1, VERSE_AREA.y1),
    ]),
  );
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const [x0, y0] = [
    Math.max(0, Math.floor(Math.min(...xs))),
    Math.max(0, Math.floor(Math.min(...ys))),
  ];
  const [x1, y1] = [
    Math.min(1920, Math.ceil(Math.max(...xs))),
    Math.min(1080, Math.ceil(Math.max(...ys))),
  ];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
})();

/**
 * 1 Pet 2:2 in ink on the parchment over the open book in milk-pour, the
 * film's own lettering in strokes: written line by line from `desire` to the
 * end of "thereby" while the camera holds on it, held whole as the camera
 * comes down to the book, then faded off on `clear`, so the stream pours
 * under clean parchment. It follows milk-pour's camera (`pourFramingAt`),
 * the same moves eased the same way. Not on the book's pages: a page type
 * that reads at 1080p needs the camera near 2.5, which enlarges the
 * villager's drawing past the act's 1.5 cap (state.md).
 */
export const BOOK_QUOTE: Over = {
  shot: 'milk-pour',
  box: BOOK_BOX,
  draw: (f) => {
    const written = f.at('milk-pour:write');
    const shown = 1 - f.at('milk-pour:clear');
    if (written <= 0 || shown <= 0) return;
    const c = pourFramingAt(f.at);
    const [x0, y0] = onScreen(c, 0, 0);
    const ctx = f.ctx;
    ctx.save();
    ctx.globalAlpha *= shown;
    ctx.translate(x0, y0);
    ctx.scale(c.zoom, c.zoom);
    const sizes = BOOK_WORDS.map((l) => l.text.length);
    const total = sizes.reduce((a, b) => a + b, 0);
    BOOK_WORDS.forEach((line, i) => {
      const before = sizes.slice(0, i).reduce((a, b) => a + b, 0) / total;
      const share = (sizes[i] ?? 0) / total;
      const progress = Math.min(1, Math.max(0, (written - before) / share));
      if (progress <= 0) return;
      write(ctx, line.text, line.x, line.y, BOOK_TYPE.verse, f.hand(`verse-${i}`), {
        progress,
        reveal: 'write',
        boil: 0,
      });
    });
    write(ctx, BOOK_CITE.text, BOOK_CITE.x, BOOK_CITE.y, BOOK_TYPE.cite, f.hand('cite'), {
      alpha: written,
      boil: 0,
    });
    ctx.restore();
  },
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
