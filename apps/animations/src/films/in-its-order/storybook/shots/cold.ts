import type { FilmShot } from '../../../../library/storybook/scene.ts';
import {
  blinkingHold,
  hold,
  type Plate,
  type Span,
  turn,
} from '../../../../library/storybook/shot.ts';
import { BABY_BACK, FAR_TABLE, TABLE, WHAT } from '../../plates/plates.ts';
import { SCROLL_OPEN, SCROLL_ROLLED } from '../../plates/props.ts';
import { cam, holds, key, layer, plateOf, plateOn, seat } from '../kit.ts';
import {
  AT_TABLE,
  backdrop,
  DINERS_ROW,
  diner,
  farTable,
  HEAD,
  table,
  TABLE_TOP,
  Z,
} from './courtyard.ts';

/** The guests' run through a shot: `[at, cell]` changes, each a turn of `TURN` s from the cell before; the first cell held from 0 with its blink. */
const TURN = 0.3;

/** A guest at the table holding `first` (blinking with `neutralBlink`), then turning to each next cell at its time and holding it, blinking with the neutral blink's shut eyes pasted on its own. */
const guestSpans = (
  first: string,
  changes: ReadonlyArray<readonly [number, string]>,
  end: number,
): readonly [Span, ...ReadonlyArray<Span>] => {
  const cells = [first, ...changes.map(([, c]) => c)];
  const starts = [0, ...changes.map(([at]) => at)];
  const head = blinkingHold(0, changes[0]?.[0] ?? end, first, 'neutralBlink');
  const rest = changes.flatMap(([at, cell], i): ReadonlyArray<Span> => {
    const to = starts[i + 2] ?? end;
    return [
      turn(at, TURN, cells[i] ?? first, cell),
      blinkingHold(at + TURN, to, cell, 'neutralBlink'),
    ];
  });
  return [head, ...rest];
};

/** The diners' row on its plane, each holding and blinking; diners 1, 2 and 4 turn to talk over `talks` (diner 3's open mouth is a drawn red the palette lacks, so it never talks). */
const dinersOn = (
  at: { readonly headPx: number; readonly z: number },
  row: { readonly crown: number; readonly xs: ReadonlyArray<number> },
  talks: ReadonlyMap<1 | 2 | 4, readonly [number, number]>,
  end: number,
) =>
  ([1, 2, 3, 4] as const).map((n, i) => {
    const talk = [...talks].filter(([d]) => d === n).map(([, span]) => span);
    const runs = talk.flatMap(
      ([from, to]) =>
        [
          [from, 'talk', 'talk'],
          [to, 'neutral', 'neutralBlink'],
        ] as const,
    );
    return diner(
      n,
      row.xs[i] ?? 0,
      row.crown,
      at,
      holds([[0, 'neutral', 'neutralBlink'], ...runs], end),
    );
  });

/** The mother at the far right of the diners' row, the cup at the baby's lips, blinking. */
const motherOn = (at: { readonly headPx: number; readonly z: number }, end: number) =>
  seat(
    {
      member: 'feast-mother',
      sheet: 'iio-baby',
      name: 'mother',
      x: DINERS_ROW.mother.x,
      crown: DINERS_ROW.mother.crown,
    },
    at,
    holds([[0, 'cup', 'cupBlink']], end),
  );

/** The diners' plane of the courtyard at the table: the row (those of it `seen`, all four unless named), the mother, and the far table before them. */
const dinersLayer = (
  talks: ReadonlyMap<1 | 2 | 4, readonly [number, number]>,
  end: number,
  seen: ReadonlyArray<string> = ['diner-1', 'diner-2', 'diner-3', 'diner-4'],
) => {
  const at = { headPx: HEAD, z: Z.diners };
  return layer('diners', Z.diners, [
    ...dinersOn(at, DINERS_ROW, talks, end).filter((d) => seen.includes(d.name)),
    motherOn(at, end),
    farTable(),
  ]);
};

/** The man and the woman either side of the lead, each on the table's plane. */
const guests = (man: ReadonlyArray<Span>, woman: ReadonlyArray<Span>) => {
  const at = { headPx: HEAD, z: Z.table };
  const [m0, ...ms] = man;
  const [w0, ...ws] = woman;
  return [
    seat({ member: 'feast-guest-man', sheet: 'iio-table', name: 'man', ...AT_TABLE.man }, at, [
      m0 ?? hold(0, 1, 'neutral'),
      ...ms,
    ]),
    seat(
      { member: 'feast-guest-woman', sheet: 'feast-courtyard', name: 'woman', ...AT_TABLE.woman },
      at,
      [w0 ?? hold(0, 1, 'neutral'), ...ws],
    ),
  ];
};

/** The lead at the table on his `iio-table` sheet. */
const leadAt = (spans: readonly [Span, ...ReadonlyArray<Span>]) =>
  seat(
    { member: 'lead-feast', sheet: 'iio-table', name: 'lead', ...AT_TABLE.lead },
    { headPx: HEAD, z: Z.table },
    spans,
  );

/** The close of the mother: a grown head on her plane, so the diners behind read at matched scale on theirs, and her whole seated figure (crown to the stool's feet) fits the frame at the shot's start. */
const BABY_HEAD = 430;

/** Where the baby's face is in the close, frame px at the shot's start: the push holds it there. */
const BABY_FACE = [748, 418] as const;

/**
 * `cold-baby`, the scene's start to `grown`: the close on the mother, the
 * cup at her baby's lips; the baby drinks on "drinks" and she lowers the cup
 * a little after. The diners sit at their table beyond (two turn to talk),
 * the courtyard behind, and the near table's edge before her. A slow push
 * holds the baby's face where the panel has it.
 */
export const coldBaby: FilmShot = {
  id: 'cold-baby',
  span: { at: 'start', until: 'grown' },
  cues: {
    sip: { mark: 'baby', word: 'drinks', dur: 1.2 },
    talk: { mark: 'baby', word: 'milk', dur: 1 },
    reply: { mark: 'baby', word: 'nobody', dur: 1 },
  },
  build: ({ duration, cue }) => {
    const far = { headPx: BABY_HEAD, z: 4.4 };
    const push = 1.06;
    return {
      headPx: BABY_HEAD,
      camera: [
        cam(0, 960, 540, 1),
        cam(
          duration,
          BABY_FACE[0] + (960 - BABY_FACE[0]) / push,
          BABY_FACE[1] + (540 - BABY_FACE[1]) / push,
          push,
        ),
      ],
      layers: [
        layer('back', 6, [plateOf('cold-baby-back.png', BABY_BACK)]),
        layer('diners', far.z, [
          ...dinersOn(
            far,
            { crown: 396, xs: [120, 320, 1600, 1800] },
            new Map([
              [1, [cue('talk').start, cue('talk').end]],
              [4, [cue('reply').start, cue('reply').end]],
            ] as const),
            duration,
          ),
          plateOn('far-table.png', FAR_TABLE, [960, 110], [960, 590], 1.2),
        ]),
        layer('mother', 1, [
          seat(
            {
              member: 'feast-mother',
              sheet: 'iio-baby',
              name: 'mother',
              x: 990,
              crown: 55,
            },
            { headPx: BABY_HEAD, z: 1 },
            holds(
              [
                [0, 'cup', 'cupBlink'],
                [cue('sip').start, 'sip', 'sip'],
                [cue('sip').end, 'cup', 'cupBlink'],
              ],
              duration,
            ),
          ),
        ]),
        layer('near table', 0.8, [plateOn('table.png', TABLE, [960, 1050], [960, 985], 2.75)]),
      ],
    };
  },
};

/**
 * `cold-table`, `grown` to `letter`: the camera trucks from the diners at
 * picture left to the three at the table and holds them in a medium; the
 * lead lifts the bottle on `bottle` and holds it up, the man and the woman
 * turn to stare on the word "bottle" (the woman a beat after) and turn to
 * smile on `smile`, and the camera eases back to waist-up over the smile.
 */
export const coldTable: FilmShot = {
  id: 'cold-table',
  span: { mark: 'grown', until: 'letter' },
  cues: {
    truck: { mark: 'grown', until: 'bottle', untilOffset: -0.3 },
    lift: { mark: 'bottle', dur: 0.22 },
    stare: { mark: 'bottle', word: 'bottle', dur: 0.3 },
    stared: { mark: 'bottle', word: 'bottle', offset: 0.15, dur: 0.3 },
    smile: { mark: 'smile', dur: 0.35 },
    smiled: { mark: 'smile', offset: 0.1, dur: 0.35 },
    back: { mark: 'smile', until: 'letter' },
    talk: { mark: 'grown', word: 'wedding', dur: 1.2 },
    reply: { mark: 'smile', word: 'smile', dur: 1 },
  },
  build: ({ duration, cue }) => ({
    headPx: HEAD,
    camera: [
      cam(0, 560, 830, 2.2),
      cam(cue('truck').end, 960, 830, 2.2),
      cam(cue('back').start, 960, 830, 2.2),
      cam(cue('back').end, 960, 845, 1.95),
    ],
    layers: [
      ...backdrop(),
      dinersLayer(
        new Map([
          [1, [cue('talk').start, cue('talk').end]],
          [2, [cue('reply').start, cue('reply').end]],
        ] as const),
        duration,
      ),
      layer('table', Z.table, [
        ...guests(
          guestSpans(
            'neutral',
            [
              [cue('stare').start, 'stare'],
              [cue('smile').start, 'smile'],
            ],
            duration,
          ),
          guestSpans(
            'neutral',
            [
              [cue('stared').start, 'turn'],
              [cue('smiled').start, 'smile'],
            ],
            duration,
          ),
        ),
        leadAt(
          holds(
            [
              [0, 'front', 'frontBlink'],
              [cue('lift').start, 'lift', 'lift'],
              [cue('lift').end, 'bottle', 'frontBlink'],
            ],
            duration,
          ),
        ),
        table(),
      ]),
    ],
  }),
};

/** The scroll's size on the table, a share of its painted size. */
const SCROLL = 0.62;

/** Where the scroll's near edge lies on the table, layer px: the centre of the table top's front edge. */
const SCROLL_AT = [960, TABLE_TOP.y + TABLE_TOP.height] as const;

/** How deep the open scroll lies on the table top, a share of its painted height: flat and seen from just above the table, its far roller over the top's back edge. */
const SCROLL_LIES = 0.35;

/** The open scroll on the table top, its near roller on the top's front edge, moved by `moves`. */
export const scrollLaid = (moves: NonNullable<Plate['moves']>): Plate =>
  plateOn('scroll-open.png', SCROLL_OPEN, [225, 368], SCROLL_AT, SCROLL, { moves });

/** The scroll unrolling flat away from the viewer over `start`..`end`, from a sliver at its near roller to lying open. */
const unrolling = (start: number, end: number): NonNullable<Plate['moves']> => [
  [start, key({ sy: 0.08, alpha: 0 })],
  [start, key({ sy: 0.08 })],
  [end, key({ sy: SCROLL_LIES })],
];

/** The push into the scroll's seal on `quote`: from the table's framing to 15 % in (the spec's cap), toward the seal. */
const LETTER = {
  from: { x: 960, y: 860, zoom: 1.9 },
  to: { x: 980, y: 900, zoom: 1.9 * 1.15 },
} as const;

/**
 * `cold-letter`, `letter` to the card: a rolled scroll falls onto the table
 * before the lead, hops and unrolls flat across the table top away from the
 * viewer; the guests turn to stare at it, the lead lowers the bottle and
 * looks down at it as it unrolls, and on `quote` the camera eases in toward
 * its seal until the card.
 */
export const coldLetter: FilmShot = {
  id: 'cold-letter',
  span: { mark: 'letter', until: 'such' },
  cues: {
    fall: { mark: 'letter', offset: 0.4, dur: 0.45 },
    hop: { after: 'cold-letter:fall', dur: 0.24 },
    unroll: { after: 'cold-letter:hop', dur: 1 },
    down: { with: 'cold-letter:unroll', offset: 0.4, dur: 0.3 },
    stare: { mark: 'letter', offset: 0.3, dur: 0.3 },
    stared: { mark: 'letter', offset: 0.45, dur: 0.3 },
    quote: { mark: 'quote', until: 'such' },
    talk: { mark: 'letter', word: 'letters', dur: 1.2 },
  },
  build: ({ duration, cue }) => {
    const fall = cue('fall');
    const hop = cue('hop');
    const unroll = cue('unroll');
    const { from, to } = LETTER;
    return {
      headPx: HEAD,
      camera: [
        cam(0, from.x, from.y, from.zoom),
        cam(cue('quote').start, from.x, from.y, from.zoom),
        cam(cue('quote').end, to.x, to.y, to.zoom),
      ],
      layers: [
        ...backdrop(),
        dinersLayer(new Map([[4, [cue('talk').start, cue('talk').end]]] as const), duration),
        layer('table', Z.table, [
          ...guests(
            guestSpans('smile', [[cue('stare').start, 'stare']], duration),
            guestSpans('smile', [[cue('stared').start, 'turn']], duration),
          ),
          leadAt([
            blinkingHold(0, cue('down').start, 'bottle', 'frontBlink'),
            turn(cue('down').start, cue('down').end - cue('down').start, 'bottle', 'down'),
            blinkingHold(cue('down').end, duration, 'down', 'downBlink'),
          ]),
          table(),
          plateOn('scroll-rolled.png', SCROLL_ROLLED, [214.5, 202], SCROLL_AT, SCROLL, {
            moves: [
              [fall.start, key({ y: -700, alpha: 0 })],
              [fall.start, key({ y: -700 })],
              [fall.end, key({})],
              [hop.start + (hop.end - hop.start) / 2, key({ y: -18 })],
              [hop.end, key({})],
              [unroll.start, key({})],
              [unroll.start, key({ alpha: 0 })],
            ],
          }),
          scrollLaid(unrolling(unroll.start, unroll.end)),
        ]),
      ],
    };
  },
};

/** The lead's close: his head a third of the frame's height (its crown at frame y 70), the guests either side and the scroll on the table before him; his soles below the frame, his whole figure read in cold-table. The diners its frame shows: diner 1, at the row's left end, falls outside it. */
const CLOSE = { zoom: 3.3, crown: 70, diners: ['diner-2', 'diner-3', 'diner-4'] } as const;

/**
 * `cold-ouch`, the card's end to `what`: close on the lead, his head a third
 * of the frame, at the same table as cold-letter leaves it: the guests
 * either side still staring at the scroll, the diners beyond, the scroll
 * open before him. He winces on `ouch` and lowers his eyes again, under a
 * slow push.
 */
export const coldOuch: FilmShot = {
  id: 'cold-ouch',
  span: { after: 'card:cold', until: 'what' },
  cues: {
    wince: { mark: 'ouch', dur: 1.4 },
  },
  build: ({ duration, cue }) => {
    const crown = AT_TABLE.lead.crown;
    const y = crown + (540 - CLOSE.crown) / CLOSE.zoom;
    return {
      headPx: HEAD,
      camera: [cam(0, 960, y, CLOSE.zoom), cam(duration, 960, y + 6, CLOSE.zoom * 1.05)],
      layers: [
        ...backdrop(),
        dinersLayer(new Map(), duration, CLOSE.diners),
        layer('table', Z.table, [
          ...guests(guestSpans('stare', [], duration), guestSpans('turn', [], duration)),
          seat(
            { member: 'lead-feast', sheet: 'iio-close', name: 'lead', x: 960, crown },
            { headPx: HEAD, z: Z.table },
            holds(
              [
                [0, 'down', 'downBlink'],
                [cue('wince').start, 'wince', 'wince'],
                [cue('wince').end, 'down', 'downBlink'],
              ],
              duration,
            ),
          ),
          table(),
          scrollLaid([[0, key({ sy: SCROLL_LIES })]]),
        ]),
      ],
    };
  },
};

/** `cold-what`, `what` to the scene's end: the cup and the loaf alone, lit; the camera lifts and pushes in toward them. No figure. */
export const coldWhat: FilmShot = {
  id: 'cold-what',
  span: { mark: 'what', until: { at: 'end' } },
  cues: {},
  build: ({ duration }) => ({
    headPx: HEAD,
    camera: [cam(0, 960, 540, 1), cam(duration, 960, 500, 1.08)],
    layers: [layer('what', 1, [plateOf('cold-what.png', WHAT)])],
  }),
};
