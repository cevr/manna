import type { FilmShot } from '../../../../library/storybook/scene.ts';
import {
  blinkingHold,
  hold,
  type Plate,
  type Span,
  turn,
} from '../../../../library/storybook/shot.ts';
import { CELLS as VILLAGER_CELLS } from '../../cast/idea-villagers/shot-sheets/iio-milk/cells.ts';
import { BOOK_OPEN, BOOK_SHUT, DROPPER, PAGE } from '../../plates/milk.ts';
import {
  cam,
  drawScaleOf,
  holds,
  key,
  layer,
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

/** The milk's face in the villager's cup, in each cell he holds it in while it pours, in that cell's px: the cup's mouth, read on the cells. */
export const CUP_MOUTHS = {
  cup: { x: 100, y: 501, width: 42, height: 8 },
  look: { x: 131, y: 501, width: 43, height: 8 },
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
 * `milk-cup`, the scene's start to the card: the villager on the parchment
 * holding his cup; on `newborn` the shut book pops in at picture right and
 * he turns to look at it, it opens, and from `peter` the camera pushes in.
 */
export const milkCup: FilmShot = {
  id: 'milk-cup',
  span: { at: 'start', until: 'desire' },
  cues: {
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
            blinkingHold(0, look.start, 'cup', 'cupBlink'),
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
 * `milk-pour`, the card's end (`thereby`, the word's end in the take, which
 * the card runs until) to `need`: held on the villager and the open
 * book, the milk pours from the book into his cup until `sincere`; on
 * "nothing" a dropper comes in level from the left to the cup and he waves
 * it away, back out the way it came; on `word` he
 * looks to the book and it pours again, filling the cup, until `good`, and
 * he drinks. A slow push. Each `cup` hold blinks through `cupBlink`.
 */
export const milkPour: FilmShot = {
  id: 'milk-pour',
  span: { after: 'card:milk', until: 'need' },
  cues: {
    thereby: { mark: 'desire', word: 'thereby', offset: 0.56 },
    pour: { after: 'card:milk', dur: 0.3 },
    stop: { mark: 'sincere', dur: 0.25 },
    toCup: { after: 'card:milk', dur: 0.3 },
    dropper: { mark: 'mixed', word: 'nothing', offset: 0.3, dur: 0.8, ends: true },
    wave: { mark: 'mixed', word: 'nothing', dur: 0.3 },
    away: { mark: 'mixed', word: 'nothing', offset: 0.3, dur: 0.8 },
    look: { mark: 'word', dur: 0.3 },
    again: { mark: 'word', offset: 0.3, dur: 0.3 },
    back: { after: 'milk-pour:again', dur: 0.3 },
    full: { mark: 'good', dur: 0.3 },
    drink: { mark: 'good', offset: 0.3, dur: 1.2 },
  },
  build: ({ duration, cue }) => {
    const [toCup, dropper, away, look, again, back, drink] = [
      cue('toCup'),
      cue('dropper'),
      cue('away'),
      cue('look'),
      cue('again'),
      cue('back'),
      cue('drink'),
    ];
    return {
      headPx: VILLAGER.headPx,
      camera: [
        cam(0, PUSHED.x, PUSHED.y, PUSHED.zoom),
        cam(duration, PUSHED.x - 10, PUSHED.y, PUSHED.zoom * 1.04),
      ],
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
            hold(look.end, again.end, 'look'),
            turn(back.start, back.end - back.start, 'look', 'cup'),
            ...holds(
              [
                [back.end, 'cup', 'cupBlink'],
                [drink.start, 'drink', 'drink'],
                [drink.end, 'cup', 'cupBlink'],
              ],
              duration,
            ),
          ]),
          plateOn('milk-book-open.png', BOOK_OPEN, [215.5, 119.5], [BOOK.x, BOOK.y], BOOK.s),
          ribbon(cue('pour').start, cue('stop').start),
          ribbon(again.start, cue('full').start),
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
