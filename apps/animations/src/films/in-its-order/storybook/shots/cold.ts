import { write } from '@manna/film/canvas';
import type { FilmShot, Over } from '../../../../library/storybook/scene.ts';
import { Option } from 'effect';
import { fonts, palette } from '../../palette.ts';
import {
  BLINK,
  blinkingHold,
  type Figure,
  hold,
  type Plate,
  poseAt,
  type Span,
  swapOf,
  turn,
} from '../../../../library/storybook/shot.ts';
import { CELLS as LEAD_TABLE } from '../../../../library/cast/lead-feast/shot-sheets/iio-table/cells.ts';
import { BOTTLE, BOTTLE_BODY, BOTTLE_FOOT } from '../plates/bottle.ts';
import { BABY_BACK, FAR_TABLE, TABLE } from '../../plates/plates.ts';
import { SCROLL_ROLLED } from '../../plates/props.ts';
import {
  cam,
  drawScaleOf,
  framingAt,
  holds,
  key,
  layer,
  onScreen,
  plateOf,
  plateOn,
  seat,
  STORY_PLATES,
  tallOf,
  WOMAN_TABLE_SIZE,
  withAlpha,
} from '../kit.ts';
import { WHAT_DAY, WHAT_DAY_SCALE } from '../plates/what-day.ts';
import {
  AT_TABLE,
  backdrop,
  DINERS_ROW,
  diner,
  farTable,
  HEAD,
  table,
  tableClose,
  TABLE_TOP,
  Z,
} from './courtyard.ts';

/** The guests' run through a shot: `[at, cell]` changes, each a turn of `TURN` s from the cell before; the first cell held from 0 with its blink. */
const TURN = 0.3;

/** The longest a guest holds one stare with no blink (the act's acceptance, `ALIVE`, the longest one drawing may hold with the same eyes). */
const ALIVE = 4.6;

/** How finely `blinkStartsOf` reads a figure's blink schedule, in s. */
const BLINK_STEP = 1 / 240;

/** How long before and after its one blink a long stare's blinking hold runs, in s: past `BLINK_STEP`, and far short of `BLINK_GAP`, so the hold shows that blink alone. */
const BLINK_MARGIN = 0.05;

/** The starts of the blinks `name`'s seeded schedule (`poseAt` on a blinking hold) shows whole within [`from`, `to`], in s. */
const blinkStartsOf = (name: string, from: number, to: number): ReadonlyArray<number> => {
  const probe: Figure = {
    _tag: 'Figure',
    name,
    member: '',
    sheet: '',
    at: { x: 0, ground: 0 },
    spans: [blinkingHold(from, to, 'stare', 'neutralBlink')],
  };
  const steps = Math.floor((to - from) / BLINK_STEP);
  const shut = Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + i * BLINK_STEP;
    return { t, shut: poseAt(probe, t).eyes !== 'stare' };
  });
  return shut.flatMap(({ t, shut: now }, i) => {
    if (!now || i === 0 || shut[i - 1]?.shut || t + BLINK > to) return [];
    return [t];
  });
};

/**
 * A guest holding `cell` from `from` to `to`: blinking with the neutral
 * blink's shut eyes pasted on its own, but a stare, whose wide eyes the
 * neutral blink's upturned arcs do not fit (critique 3, finding 6): held
 * still when it lasts `ALIVE` or less, and else blinking once, at its blink
 * nearest the hold's middle.
 */
const guestHold = (name: string, from: number, to: number, cell: string): ReadonlyArray<Span> => {
  if (cell !== 'stare') return [blinkingHold(from, to, cell, 'neutralBlink')];
  if (to - from <= ALIVE) return [hold(from, to, cell)];
  const middle = (from + to) / 2;
  const nearest = blinkStartsOf(name, from, to).toSorted(
    (a, b) => Math.abs(a - middle) - Math.abs(b - middle),
  );
  return Option.match(Option.fromUndefinedOr(nearest[0]), {
    onNone: () => [hold(from, to, cell)],
    onSome: (start) => [
      hold(from, start - BLINK_MARGIN, cell),
      blinkingHold(start - BLINK_MARGIN, start + BLINK + BLINK_MARGIN, cell, 'neutralBlink'),
      hold(start + BLINK + BLINK_MARGIN, to, cell),
    ],
  });
};

/** A guest at the table, `name`, holding `first` from 0, then turning to each next cell at its time and holding it, each hold as `guestHold` holds it. */
const guestSpans = (
  name: string,
  first: string,
  changes: ReadonlyArray<readonly [number, string]>,
  end: number,
): readonly [Span, ...ReadonlyArray<Span>] => {
  const cells = [first, ...changes.map(([, c]) => c)];
  const starts = [0, ...changes.map(([at]) => at)];
  const [head = hold(0, end, first), ...held] = guestHold(name, 0, changes[0]?.[0] ?? end, first);
  const rest = changes.flatMap(([at, cell], i): ReadonlyArray<Span> => {
    const to = starts[i + 2] ?? end;
    return [turn(at, TURN, cells[i] ?? first, cell), ...guestHold(name, at + TURN, to, cell)];
  });
  return [head, ...held, ...rest];
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
      {
        member: 'feast-guest-woman',
        sheet: 'iio-table',
        name: 'woman',
        ...AT_TABLE.woman,
        size: WOMAN_TABLE_SIZE,
      },
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

/** The diners behind the mother in cold-baby, as the panel `cold.baby.3` seats them (the owner, critique 2 finding 8): a pair either side of her shoulders, shoulder to shoulder, on a plane near enough that each head is about 0.41 of hers, the panel's share, their crowns and their table where the panel sets them (layer px, at the shot's start the frame's own). */
const BABY_DINERS = { z: 2, crown: 420, xs: [300, 440, 1460, 1600], table: 680 } as const;

/** The table plate's top edge in its own px: where its wood begins under the bowls. */
export const TABLE_TOP_PX = 1061;

/** The mother in cold-baby, layer px: her centre and her crown. */
export const BABY_MOTHER = { x: 990, crown: 55 } as const;

/** Where the near table's top lies in cold-baby, layer px: across her lap, as the panel lays it, so its food stands before her and her stool is hidden. */
const NEAR_TOP = 800;

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
    const far = { headPx: BABY_HEAD, z: BABY_DINERS.z };
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
            { crown: BABY_DINERS.crown, xs: BABY_DINERS.xs },
            new Map([
              [1, [cue('talk').start, cue('talk').end]],
              [4, [cue('reply').start, cue('reply').end]],
            ] as const),
            duration,
          ),
          plateOn('far-table.png', FAR_TABLE, [960, 110], [960, BABY_DINERS.table], 1.2),
        ]),
        layer('mother', 1, [
          seat(
            {
              member: 'feast-mother',
              sheet: 'iio-baby',
              name: 'mother',
              ...BABY_MOTHER,
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
        layer('near table', 0.8, [
          plateOn('table.png', TABLE, [960, TABLE_TOP_PX], [960, NEAR_TOP], 2.75),
        ]),
      ],
    };
  },
};

/** Where cold-table's truck settles on the three at the table, and where its push on the stare ends, layer px: in toward the lead and his raised bottle. */
const TABLE_MEDIUM = {
  settled: { x: 960, y: 830, zoom: 2.2 },
  pushed: { x: 935, y: 845, zoom: 2.45 },
} as const;

/**
 * `cold-table`, `grown` to `smile`: the camera trucks from the diners at
 * picture left to the three at the table and settles on them in a medium;
 * the lead lifts the bottle on `bottle` and holds it up, the man and the
 * woman turn to stare on the word "bottle" (the woman a beat after), and
 * the camera pushes in on the stare toward the bottle, into the two-shot.
 */
export const coldTable: FilmShot = {
  id: 'cold-table',
  span: { mark: 'grown', until: 'smile' },
  cues: {
    truck: { mark: 'grown', until: 'bottle', untilOffset: -0.3 },
    lift: { mark: 'bottle', dur: 0.22 },
    stare: { mark: 'bottle', word: 'bottle', dur: 0.3 },
    stared: { mark: 'bottle', word: 'bottle', offset: 0.15, dur: 0.3 },
    push: { after: 'cold-table:truck', until: 'smile' },
    talk: { mark: 'grown', word: 'wedding', dur: 1.2 },
  },
  build: ({ duration, cue }) => {
    const { settled, pushed } = TABLE_MEDIUM;
    return {
      headPx: HEAD,
      camera: [
        cam(0, 560, settled.y, settled.zoom),
        cam(cue('truck').end, settled.x, settled.y, settled.zoom),
        cam(cue('push').end, pushed.x, pushed.y, pushed.zoom),
      ],
      layers: [
        ...backdrop(),
        dinersLayer(new Map([[1, [cue('talk').start, cue('talk').end]]] as const), duration),
        layer('table', Z.table, [
          ...guests(
            guestSpans('man', 'neutral', [[cue('stare').start, 'stare']], duration),
            guestSpans('woman', 'neutral', [[cue('stared').start, 'stare']], duration),
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
    };
  },
};

/**
 * The two-shot's framing, layer px: the man and the lead, each head about a
 * third of the frame's height (a grown head of `HEAD` at zoom 3.1 is 0.34 of
 * it), the bottle raised between the lead and the frame's right; the woman's
 * near shoulder at the right edge; the table's top across the frame's foot
 * (the whole table plate: the close's plate covers only the lead's middle of
 * it, so here it would show its edge beside the man). Its push ends `push`
 * times in.
 */
export const TWO_SHOT = { x: 862, y: 862, zoom: 3.1, push: 1.05 } as const;

/**
 * `cold-smile`, `smile` to `letter`: the close two-shot of the joke. Cut in
 * on `smile` to the man and the lead, his bottle still held up; the man,
 * staring, turns to the lead and smiles on the mark (the woman at the edge a
 * beat after), and the lead, caught, lowers the bottle sheepishly to his
 * chest in the beat after the stressed "smile", his sleeve's rustle heard in
 * the pause. A slow push holds them.
 */
export const coldSmile: FilmShot = {
  id: 'cold-smile',
  span: { mark: 'smile', until: 'letter' },
  cues: {
    smile: { mark: 'smile', dur: 0.3 },
    smiled: { mark: 'smile', offset: 0.15, dur: 0.3 },
    lower: { mark: 'smile', word: 'smile', offset: 0.6, dur: 0.3 },
    reply: { mark: 'smile', word: 'smile', dur: 1 },
  },
  build: ({ duration, cue }) => {
    const lower = cue('lower');
    return {
      headPx: HEAD,
      camera: [
        cam(0, TWO_SHOT.x, TWO_SHOT.y, TWO_SHOT.zoom),
        cam(duration, TWO_SHOT.x + 8, TWO_SHOT.y - 4, TWO_SHOT.zoom * TWO_SHOT.push),
      ],
      layers: [
        ...backdrop(),
        dinersLayer(new Map([[2, [cue('reply').start, cue('reply').end]]] as const), duration),
        layer('table', Z.table, [
          ...guests(
            guestSpans('man', 'stare', [[cue('smile').start, 'smile']], duration),
            guestSpans('woman', 'stare', [[cue('smiled').start, 'smile']], duration),
          ),
          leadAt([
            blinkingHold(0, lower.start, 'bottle', 'frontBlink'),
            turn(lower.start, lower.end - lower.start, 'bottle', 'lift'),
            hold(lower.end, duration, 'lift'),
          ]),
          table(),
        ]),
      ],
    };
  },
};

/** The rollers' length across, ink ends and all, of the scroll he holds in his table sheet's `read` cell, in its px: its lower roller's 97 px of his hair's brown (rows 471 to 484, from x 6) and its ink at each end. */
export const HELD_ROLLERS = 103;

/** The middle of the letter his table sheet's `read` cell holds up, in its px: its parchment's middle (x 20 to 108, rows 350 to 464). */
const READ_LETTER = [64, 407] as const;

/** The rolled scroll plate's rollers' length across, knobs and all, in its px: its whole width. */
const ROLLED_ROLLERS = SCROLL_ROLLED.size[0];

/** The rolled scroll's scale on the table: its rollers as long as the ones he holds, his table sheet's draw scale times their length, so the letter that lands is the letter he reads. */
export const LETTER_SCALE =
  drawScaleOf('lead-feast', 'iio-table', HEAD, Z.table) * (HELD_ROLLERS / ROLLED_ROLLERS);

/** Where the rolled scroll lies on the table, layer px (its foot's centre): on the top's front edge before his right hand (the picture's left), the hand that takes it up in cold-letter. */
export const LETTER_AT = [930, TABLE_TOP.y + TABLE_TOP.height] as const;

/** The rolled scroll on the table, moved by `moves`. */
export const letterOn = (moves: NonNullable<Plate['moves']>): Plate =>
  plateOn('scroll-rolled.png', SCROLL_ROLLED, [214.5, 202], LETTER_AT, LETTER_SCALE, { moves });

/** The hand his table sheet's `down` cell lowers on the viewer's right (the hand that held the bottle), in its px: its middle across and its lowest drawn row. */
export const DOWN_HAND = [178, 629] as const;

/** Where a point of one of the lead's table cells (its px) lies at his place at the table, layer px. */
const atTable = (
  cell: { readonly ax: number; readonly ay: number },
  point: readonly [number, number],
): readonly [number, number] => {
  const s = drawScaleOf('lead-feast', 'iio-table', HEAD, Z.table);
  const ground = AT_TABLE.lead.crown + tallOf('lead-feast', 'iio-table', HEAD, Z.table);
  return [AT_TABLE.lead.x + (point[0] - cell.ax) * s, ground + (point[1] - cell.ay) * s];
};

/** Where the bottle stands on the table in cold-ouch, layer px (its foot): where his lowered `down` hand rests (under its middle, at its lowest row, on the table top), the hand that held it, so it reads as set down by that hand. */
export const BOTTLE_AT = atTable(LEAD_TABLE.down, DOWN_HAND);

/** The cream body across of the bottle the lead holds in his table sheet's `bottle` cell, in its px (196 to 232). */
const HELD_BODY = 37;

/** The bottle plate's scale: its cream body the width of the one he held, his table sheet's draw scale (`HEAD` over that cell's head) times that bottle's body across. */
const BOTTLE_SCALE = (HEAD / LEAD_TABLE.bottle.head) * (HELD_BODY / BOTTLE_BODY);

/** The bottle on the table, moved by `moves` (at rest when none). */
const bottleOn = (moves: NonNullable<Plate['moves']>): Plate =>
  plateOn('bottle.png', BOTTLE, BOTTLE_FOOT, BOTTLE_AT, BOTTLE_SCALE, {
    dir: STORY_PLATES,
    moves,
  });

/** The bottle standing on the table top from a shot's start, where his lowered hand set it down. */
export const bottleOnTable = (): Plate => bottleOn([[0, key({})]]);

/** How far the rolled scroll rises from where it lies to his reading hand, layer px: its middle from the table to the middle of the letter his `read` cell holds up, so the open scroll he reads opens where the roll was lifted to, by the shortest way up. */
export const LETTER_LIFT = (() => {
  const [x, y] = atTable(LEAD_TABLE.read, READ_LETTER);
  const middle = (SCROLL_ROLLED.size[1] / 2) * LETTER_SCALE;
  return { x: x - LETTER_AT[0], y: y - (LETTER_AT[1] - middle) };
})();

/** The rolled scroll falling from above the frame onto the table before him over `fall`, hopping once over `hop`, lying there until `lift` starts, and rising alone, no hand drawn on it, to his reading hand's place by `lift`'s end, the swap of his key that takes it up, so it reads as snatched up: from that frame his hand holds it open, so the plate is gone. */
export const letterLands = (
  fall: { readonly start: number; readonly end: number },
  hop: { readonly start: number; readonly end: number },
  lift: { readonly start: number; readonly end: number },
): Plate =>
  letterOn([
    [fall.start, key({ y: -700, alpha: 0 })],
    [fall.start, key({ y: -700 })],
    [fall.end, key({})],
    [hop.start + (hop.end - hop.start) / 2, key({ y: -18 })],
    [hop.end, key({})],
    [lift.start, key({})],
    [lift.end, key({ x: LETTER_LIFT.x, y: LETTER_LIFT.y })],
    [lift.end, key({ x: LETTER_LIFT.x, y: LETTER_LIFT.y, alpha: 0 })],
  ]);

/** cold-letter's camera, layer px: where it opens on the table as the scroll falls, where it has eased in to once he holds the letter, and where its push toward the letter and his face ends, at the cut. */
export const LETTER = {
  from: { x: 960, y: 860, zoom: 1.9 },
  held: { x: 950, y: 856, zoom: 2.0 },
  to: { x: 925, y: 848, zoom: 2.45 },
} as const;

/**
 * `cold-letter`, `letter` to `ouch`: a rolled scroll falls onto the table
 * before the lead, who holds the bottle at his chest where he lowered it,
 * and hops; the guests turn to stare at it, and it rises alone from the
 * table to where his free hand will hold it, a snatch (the owner, scrawl
 * 0:21): from the swap he reads the letter, open in one hand, the bottle's
 * teat at his mouth in the other, his lids half down on the scroll, to the
 * cut; a lidded cell takes no pasted blink. From the take the camera pushes
 * in toward the letter and his face, and on `quote` Heb 5:12 is lettered
 * over the dimmed table (`LETTER_QUOTE`) and held until the cut.
 */
export const coldLetter: FilmShot = {
  id: 'cold-letter',
  span: { mark: 'letter', until: 'ouch' },
  cues: {
    fall: { mark: 'letter', offset: 0.4, dur: 0.45 },
    hop: { after: 'cold-letter:fall', dur: 0.24 },
    take: { after: 'cold-letter:hop', offset: 0.15, dur: 0.5 },
    stare: { mark: 'letter', offset: 0.3, dur: 0.3 },
    stared: { mark: 'letter', offset: 0.45, dur: 0.3 },
    read: { after: 'cold-letter:take', until: 'ouch' },
    dim: { mark: 'quote', dur: 0.4 },
    write: { mark: 'quote', until: 'such' },
    talk: { mark: 'letter', word: 'letters', dur: 1.2 },
  },
  build: ({ duration, cue }) => {
    const { from, held, to } = LETTER;
    const take = turn(cue('take').start, cue('take').end - cue('take').start, 'lift', 'read');
    return {
      headPx: HEAD,
      camera: [
        cam(0, from.x, from.y, from.zoom),
        cam(cue('read').start, held.x, held.y, held.zoom),
        cam(cue('read').end, to.x, to.y, to.zoom),
      ],
      layers: [
        ...backdrop(),
        dinersLayer(new Map([[4, [cue('talk').start, cue('talk').end]]] as const), duration),
        layer('table', Z.table, [
          ...guests(
            guestSpans('man', 'smile', [[cue('stare').start, 'stare']], duration),
            guestSpans('woman', 'smile', [[cue('stared').start, 'stare']], duration),
          ),
          leadAt([
            hold(0, cue('take').start, 'lift'),
            take,
            hold(cue('take').end, duration, 'read'),
          ]),
          table(),
          letterLands(cue('fall'), cue('hop'), { start: take.at, end: swapOf(take) }),
        ]),
      ],
    };
  },
};

/** Where the middle of the letter he reads and of his face lie at the table, layer px: what the light over the quote stays open on. */
export const LETTER_LIGHT = (() => {
  const [lx, ly] = atTable(LEAD_TABLE.read, READ_LETTER);
  return { x: (lx + AT_TABLE.lead.x) / 2, y: (ly + AT_TABLE.lead.crown + HEAD / 2) / 2 };
})();

/** The words of Heb 5:12 the take reads from `quote`, lettered line by line, and their reference. */
export const LETTER_WORDS = {
  lines: ['They “are become such as have need of milk,', 'and not of strong meat.”'],
  cite: 'Hebrews 5:12',
} as const;

/** How the quote over the table is set, frame px: its lines' baselines and type, the reference under them, and the dimming: its darkest share at the frame's edge and the band behind the words, and the clear light's inner and outer radius about the letter and his face, in layer px. */
const LETTER_TYPE = {
  x: 960,
  baselines: [118, 192],
  type: { family: fonts.display, size: 60, weight: 500, color: palette.cream, align: 'center' },
  cite: {
    y: 246,
    type: { family: fonts.display, size: 30, weight: 600, color: palette.gold, align: 'center' },
  },
  edge: 0.55,
  band: { height: 280, share: 0.45 },
  light: { inner: 70, outer: 260 },
} as const;

/**
 * Heb 5:12 over cold-letter, the film's own lettering in strokes: from
 * `quote` the table dims about the letter and his face (they stay lit, the
 * guests and diners seen through the dimming), and the take's words are
 * written on line by line until `such`, then held whole to the cut. The
 * camera it reads is cold-letter's push, the same keys eased the same way.
 */
export const LETTER_QUOTE: Over = {
  shot: 'cold-letter',
  box: { x: 0, y: 0, w: 1920, h: 1080 },
  draw: (f) => {
    const dim = f.at('cold-letter:dim');
    if (dim <= 0) return;
    const c = framingAt(LETTER.held, LETTER.to, f.at('cold-letter:read'));
    const [lx, ly] = onScreen(c, LETTER_LIGHT.x, LETTER_LIGHT.y);
    const ctx = f.ctx;
    ctx.save();
    const light = ctx.createRadialGradient(
      lx,
      ly,
      LETTER_TYPE.light.inner * c.zoom,
      lx,
      ly,
      LETTER_TYPE.light.outer * c.zoom,
    );
    light.addColorStop(0, withAlpha(palette.night, 0));
    light.addColorStop(1, withAlpha(palette.night, LETTER_TYPE.edge * dim));
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, f.w, f.h);
    const band = ctx.createLinearGradient(0, 0, 0, LETTER_TYPE.band.height);
    band.addColorStop(0, withAlpha(palette.night, LETTER_TYPE.band.share * dim));
    band.addColorStop(1, withAlpha(palette.night, 0));
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, f.w, LETTER_TYPE.band.height);
    const written = f.at('cold-letter:write');
    const sizes = LETTER_WORDS.lines.map((l) => l.length);
    const total = sizes.reduce((a, b) => a + b, 0);
    LETTER_WORDS.lines.forEach((line, i) => {
      const before = sizes.slice(0, i).reduce((a, b) => a + b, 0) / total;
      const share = (sizes[i] ?? 0) / total;
      const progress = Math.min(1, Math.max(0, (written - before) / share));
      if (progress <= 0) return;
      write(
        ctx,
        line,
        LETTER_TYPE.x,
        LETTER_TYPE.baselines[i] ?? 0,
        LETTER_TYPE.type,
        f.hand(`quote-${i}`),
        { progress, reveal: 'write', boil: 0 },
      );
    });
    write(
      ctx,
      LETTER_WORDS.cite,
      LETTER_TYPE.x,
      LETTER_TYPE.cite.y,
      LETTER_TYPE.cite.type,
      f.hand('cite'),
      {
        alpha: written,
        boil: 0,
      },
    );
    ctx.restore();
  },
};

/** The lead's close: his head a third of the frame's height (its crown at frame y 70), the guests either side and the letter on the table before him; his soles below the frame, his whole figure read in cold-table. The diners its frame shows: diner 1, at the row's left end, falls outside it. */
const CLOSE = { zoom: 3.3, crown: 70, diners: ['diner-2', 'diner-3', 'diner-4'] } as const;

/**
 * `cold-ouch`, `ouch` to `what`: cut in close on the lead, his head a third
 * of the frame, at the same table as cold-letter leaves it: the guests
 * either side still staring, the diners beyond. The cut in has taken him
 * past setting down what he held: the letter lies rolled on the table
 * before him where it landed, the bottle stands where his lowered hand
 * rests, and his hands are empty on his knees, his eyes lowered to the
 * letter, the table's middle from its plate painted for the close. He
 * winces on `ouch` and lowers his eyes again, under a slow push.
 */
export const coldOuch: FilmShot = {
  id: 'cold-ouch',
  span: { mark: 'ouch', until: 'what' },
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
          ...guests(
            guestSpans('man', 'stare', [], duration),
            guestSpans('woman', 'stare', [], duration),
          ),
          seat(
            { member: 'lead-feast', sheet: 'iio-close', name: 'lead', x: 960, crown },
            { headPx: HEAD, z: Z.table },
            holds(
              [
                [0, 'down', 'down'],
                [cue('wince').start, 'wince', 'wince'],
                [cue('wince').end, 'down', 'down'],
              ],
              duration,
            ),
          ),
          table(),
          tableClose(),
          letterOn([[0, key({})]]),
          bottleOnTable(),
        ]),
      ],
    };
  },
};

/** `cold-what`, `what` to the scene's end: the cup and the loaf on the table by day, the feast beyond (owner O1); the camera lifts and pushes in toward them. No figure. */
export const coldWhat: FilmShot = {
  id: 'cold-what',
  span: { mark: 'what', until: { at: 'end' } },
  cues: {},
  build: ({ duration }) => ({
    headPx: HEAD,
    camera: [cam(0, 960, 540, 1), cam(duration, 960, 500, 1.08)],
    layers: [
      layer('what', 1, [
        plateOf('cold-what-day.png', WHAT_DAY, { scale: WHAT_DAY_SCALE, dir: STORY_PLATES }),
      ]),
    ],
  }),
};
