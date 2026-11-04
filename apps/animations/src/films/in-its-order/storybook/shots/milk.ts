import type { FilmShot } from '../../../../library/storybook/scene.ts';
import {
  blinkingHold,
  hold,
  type Plate,
  type Span,
  turn,
} from '../../../../library/storybook/shot.ts';
import { BOOK_OPEN, BOOK_SHUT, DROPPER, PAGE, RIBBON } from '../../plates/milk.ts';
import { cam, holds, key, layer, plateOn, seat, STORY_PLATES, tallOf } from '../kit.ts';
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

/** The book at picture right, beside his shoulder and clear of his face, its centre and its size. */
const BOOK = { x: 885, y: 480, s: 0.55 } as const;

/** The camera at the end of `milk-cup`'s push: on the villager and the book. */
const PUSHED = { x: 860, y: 500, zoom: 1.1 } as const;

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
              [pop.end, key({})],
              [open.start, key({})],
              [open.end, key({ alpha: 0, sx: 0.2 })],
            ],
          }),
          plateOn('milk-book-open.png', BOOK_OPEN, [215.5, 119.5], [BOOK.x, BOOK.y], BOOK.s, {
            moves: [
              [open.start, key({ alpha: 0, sx: 0.2 })],
              [open.end, key({})],
            ],
          }),
        ]),
      ],
    };
  },
};

/** Where the milk leaves the book and where it goes into the cup, figures' plane px. */
const POUR = { top: [742, 505], scale: 0.32 } as const;

/** One pour of the ribbon: laid from the book down into the cup over `from`..`from + 0.6` s, gone at `stop`. */
const ribbon = (from: number, stop: number): Plate =>
  plateOn('milk-ribbon.png', RIBBON, [56, 4], POUR.top, POUR.scale, {
    reveal: { brush: RIBBON_BRUSH, from, to: from + 0.6 },
    moves: [
      [stop, key({})],
      [stop + 0.25, key({ alpha: 0 })],
    ],
  });

/** The ribbon's brush in its own px, its top end first: down its middle to its foot, wide enough to cover its twist. */
const RIBBON_BRUSH: ReadonlyArray<readonly [number, number, number]> = [
  [56, 4, 60],
  [60, 80, 70],
  [75, 160, 75],
  [85, 240, 70],
  [93, 305, 60],
];

/**
 * `milk-pour`, the card's end (`thereby`, the word's end in the take, which
 * the card runs until) to `need`: held on the villager and the open
 * book, the milk pours from the book into his cup until `sincere`; on
 * "nothing" a dropper comes over the cup and he waves it away; on `word` he
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
    dropper: { mark: 'mixed', word: 'nothing', dur: 0.3 },
    away: { mark: 'mixed', word: 'nothing', offset: 0.3, dur: 0.7 },
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
                [dropper.start, 'wave', 'wave'],
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
              [dropper.start, key({ y: -260, alpha: 0 })],
              [dropper.end, key({})],
              [away.start, key({})],
              [away.end, key({ x: 120, y: -300, alpha: 0 })],
            ],
          }),
        ]),
      ],
    };
  },
};

/** The row's ground line and its grown head on the figures' plane, at the whole row's framing. */
const ROW = { ground: 995, headPx: 285 } as const;

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
      const crown = ROW.ground - tallOf(member, sheet, ROW.headPx, 1);
      return [
        shadowAt(x, ROW.ground, w),
        seat(
          { member, sheet, name, x, crown },
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
              crown: ROW.ground - tallOf('lead-feast', 'iio-milk', ROW.headPx, 1),
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
