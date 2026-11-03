import {
  type Hex,
  type PuppetDress,
  type PuppetLook,
  type PuppetPose,
  type PuppetSpec,
  type Ramp,
  ramp,
} from '@manna/film/canvas';
import { rng } from '@manna/film/core';
import { keyLight, shading } from '@manna/film/style';
import { Array as Arr, Option, Record as Rec } from 'effect';
import { FRAMES, type FramedView } from './frames.ts';
import { HEAD_COVERED, PUPPETS } from './puppets.ts';
import { SKELETONS } from './skeleton.ts';

/** The story kit's mantle cloths (`docs/casting.md` §3.1): walnut, indigo, olive and camel, each at the band's floor. */
export const CLOTHS = {
  walnut: '#ab8163',
  indigo: '#4b566b',
  olive: '#768059',
  camel: '#8c7762',
} as const satisfies Readonly<Record<string, Hex>>;

/** A kit cloth, by name. */
export type Cloth = keyof typeof CLOTHS;

const CLOTH_NAMES = Rec.keys(CLOTHS);

/** The robe of righteousness's white, which no crowd figure wears (`.claude/skills/film/reference/character-design.md`). */
export const ROBE_WHITE: Hex = '#fcfefc';

/**
 * What a figure wears on its head: bare, the grown man's headcloth tied with
 * a band, the older man's headcloth draped to the shoulders, or a woman's
 * mantle drawn over her head.
 */
export type Headwear = 'bare' | 'tied' | 'draped' | 'over';

/**
 * Each body as the dressed sheet draws it (`C-plan.md`, "One new drawing"):
 * the headwear it can wear besides bare and how often it wears it
 * (`covered`), how often it wears a beard (none on the women), whether its
 * mantle is its headwear (the women's, drawn over the head) or worn on its
 * own as often as `cloaked`, and its hair as drawn, which its head part
 * carries and no dress changes: the grown man's dark walnut, the grown
 * woman's lighter walnut, and the older pair's pale cool paper, baked at the
 * cut (`sheets-cut.ts`).
 */
export const BODIES = {
  'poses-1': {
    headwear: 'tied',
    covered: 0.65,
    beard: 0.5,
    over: false,
    cloaked: 0.75,
    hair: '#4f291c',
  },
  'poses-2': { headwear: 'over', covered: 0.75, beard: 0, over: true, cloaked: 0, hair: '#6f3b22' },
  'poses-3': {
    headwear: 'draped',
    covered: 0.65,
    beard: 0.6,
    over: false,
    cloaked: 0.75,
    hair: '#dbd6dc',
  },
  'poses-4': { headwear: 'over', covered: 0.75, beard: 0, over: true, cloaked: 0, hair: '#dbd6dc' },
} as const satisfies Readonly<
  Record<
    FramedView,
    {
      readonly headwear: Headwear;
      readonly covered: number;
      readonly beard: number;
      readonly over: boolean;
      readonly cloaked: number;
      readonly hair: Hex;
    }
  >
>;

const BODY_NAMES = Rec.keys(BODIES);

/** One wave of an idle: its swing either way, degrees, its period, s, and its phase, radians. */
export interface Wave {
  readonly deg: number;
  readonly period: number;
  readonly phase: number;
}

/**
 * A figure's idle: a breath on the lean of about 1.5 degrees, and a tilt of
 * the head of about 2 degrees, each with its own period (`BREATH`, `TILT`) and
 * its own phase.
 * The busts are drawn too small for a blink to read, so they never blink.
 */
export interface Idle {
  readonly breath: Wave;
  readonly tilt: Wave;
}

/** A figure of the crowd. */
export interface Figure {
  readonly body: FramedView;
  /** 1 as the base faces, -1 mirrored. */
  readonly facing: 1 | -1;
  readonly headwear: Headwear;
  readonly beard: boolean;
  /** The mantle's cloth, or none; a mantle over the head is the headwear too. */
  readonly mantle: Option.Option<Cloth>;
  /** The tied headcloth's band's cloth. */
  readonly band: Option.Option<Cloth>;
  /** The hair as drawn (`BODIES`). */
  readonly hair: Hex;
  readonly idle: Idle;
}

/** Some when `ok`: a choice the figure makes. */
const when = (ok: boolean): Option.Option<true> =>
  Option.filter(Option.some(true as const), () => ok);

/**
 * The idle's ranges, inside C-plan C1d1's (the breath about 1.5 degrees over
 * 3.5-4.5 s, the tilt 2-4 degrees over 4-5 s), drawn apart so the two waves
 * never cancel at the crown: the head tip's sway is the sum of the two, and
 * where their periods meet, or the tilt's swing at the crown nears the
 * breath's, a figure's crown holds still for seconds at a time while its
 * waves pull against each other (measured: 0.01 px in a 2 s window at scale
 * 0.25 over the full ranges). The breath's quick swing and the head riding
 * it (`idleAt`) keep each crown moving 2.6 px or more in every 2 s window at
 * that scale (`crowd.test.ts`), and the head's own turn within 3.8 degrees,
 * inside the 4 its cut is held to.
 */
const BREATH = { deg: [1.4, 1.6], period: [3.5, 3.7] } as const;
const TILT = { deg: [2, 2.2], period: [4.7, 5] } as const;

type Draw = () => number;

const within = (draw: Draw, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * draw();

const pick = <A>(draw: Draw, from: ReadonlyArray<A>): A =>
  Arr.getUnsafe(from, Math.min(from.length - 1, Math.floor(draw() * from.length)));

const waveOf = (draw: Draw, range: typeof BREATH | typeof TILT): Wave => ({
  deg: within(draw, range.deg),
  period: within(draw, range.period),
  phase: 2 * Math.PI * draw(),
});

/** A kit cloth other than `not`'s, so two neighbours' mantles differ. */
const clothBut = (draw: Draw, not: Option.Option<Cloth>): Cloth =>
  pick(
    draw,
    Option.match(not, {
      onNone: () => CLOTH_NAMES,
      onSome: (c) => CLOTH_NAMES.filter((n) => n !== c),
    }),
  );

/** The figure after `before` (its neighbour in the row, if any): a body other than its neighbour's, a mantle cloth other than its neighbour's. */
const figureOf = (draw: Draw, before: Option.Option<Figure>): Figure => {
  const body = pick(
    draw,
    Option.match(before, {
      onNone: () => BODY_NAMES,
      onSome: (b) => BODY_NAMES.filter((n) => n !== b.body),
    }),
  );
  const drawn = BODIES[body];
  const facing = pick(draw, [1, -1] as const);
  const theirs = Option.flatMap(before, (b) => b.mantle);
  const covered = draw() < drawn.covered;
  const headwear = Option.getOrElse(
    Option.map(when(covered), (): Headwear => drawn.headwear),
    (): Headwear => 'bare',
  );
  const beard = draw() < drawn.beard;
  const cloaked = (drawn.over && covered) || draw() < drawn.cloaked;
  const mantle = Option.map(when(cloaked), () => clothBut(draw, theirs));
  const band = Option.map(when(headwear === 'tied'), () => clothBut(draw, mantle));
  const idle = { breath: waveOf(draw, BREATH), tilt: waveOf(draw, TILT) };
  return { body, facing, headwear, beard, mantle, band, hair: drawn.hair, idle };
};

/**
 * A row of `count` figures drawn from `seed`, in the order a scene lays them
 * along its table, so a figure's neighbours are the ones before and after it:
 * no two neighbours share a body, nor a mantle's cloth.
 */
export const crowdOf = (seed: number, count: number): ReadonlyArray<Figure> => {
  const draw = rng(seed);
  const row: Array<Figure> = [];
  for (let i = 0; i < count; i++) row.push(figureOf(draw, Option.fromUndefinedOr(row[i - 1])));
  return row;
};

/**
 * A figure's bone numbers at `t` (s), degrees, clockwise on screen: the
 * breath on the lean, and on the head its tilt and the breath again, so the
 * head rides the chest's swing as a neck carries it and the crown sways
 * more than the shoulders.
 */
export const idleAt = ({ breath, tilt }: Idle, t: number) => {
  const lean = breath.deg * Math.sin((2 * Math.PI * t) / breath.period + breath.phase);
  return { lean, head: lean + tilt.deg * Math.sin((2 * Math.PI * t) / tilt.period + tilt.phase) };
};

/** Each body's bust, by the name a scene's drawing gives it (`f.puppet`). */
export const CROWD_PUPPETS = {
  'crowd-poses-1': PUPPETS['poses-1'],
  'crowd-poses-2': PUPPETS['poses-2'],
  'crowd-poses-3': PUPPETS['poses-3'],
  'crowd-poses-4': PUPPETS['poses-4'],
} as const;

/** A crowd puppet's name in a scene's drawing. */
export type CrowdPuppet = keyof typeof CROWD_PUPPETS;

/** A body's puppet name. */
export const puppetOf = (body: FramedView): CrowdPuppet => `crowd-${body}`;

/** How many of a body's heads, crown to chin (its head pivot's row), show above the table: the table top lies across the robe above the sash. */
export const SHOWN = 1.6;

/**
 * The row of each base's hands' upper ink on the kept sheet: the round hands
 * hang at the sleeves' ends below the waist row (y 560) every bust is cut at,
 * so the bust draws no hand (measured by eye on `cast-sheet/kept/poses.png`).
 */
export const HANDS_ROW = 578;

/** A body's rows in its part sheet's frame: the head's pivot, the foot (the cut's waist row, the lean's root), the table top, and the hands below. */
export const rowsOf = (body: FramedView) => {
  const { root, bones } = SKELETONS[body];
  const top = FRAMES[body].pad[1];
  const { pivot } = Option.getOrThrow(Arr.findFirst(bones, (b) => b.name === 'head'));
  return {
    root,
    pivot,
    table: top + SHOWN * (pivot[1] - top),
    hands: top + HANDS_ROW - FRAMES[body].kept[1],
  };
};

/** Where a bust is laid: `x`, screen px, where the neck's centre stands; `top`, the screen row of the table top in front of it; `scale`, screen px a sheet px. */
export interface Placement {
  readonly x: number;
  readonly top: number;
  readonly scale: number;
}

/**
 * A figure's bust at `at`, time `t`: its pose, and the canvas transform it is
 * drawn under (`[a, b, c, d, e, f]`, mirrored when it faces -1). The pose's
 * root stands the bust's foot under the neck's centre at `x`, so far below
 * the table top that the table top crosses the body at its `SHOWN` row; the
 * breath turns the lean about that foot, which the table hides.
 */
export const bustAt = (figure: Figure, at: Placement, t: number) => {
  const spec = PUPPETS[figure.body];
  const { root, table } = rowsOf(figure.body);
  const pose: PuppetPose = {
    numbers: idleAt(figure.idle, t),
    root: [spec.origin[0], spec.origin[1] + at.scale * (root[1] - table)],
    scale: at.scale,
  };
  const transform = [figure.facing, 0, 0, 1, at.x, at.top] as const;
  return { pose, transform };
};

/** The ramp a dress dyes a part to: the kit cloth under the house's key light. */
const rampOf = (cloth: Cloth): Ramp => ramp(CLOTHS[cloth], keyLight, shading);

/**
 * What `figure` wears on `spec`'s puppet (`PuppetDress`): the house parts its
 * choices leave off hidden, and its mantle and band dyed to their cloths;
 * each asked only of a part the puppet has, and a dye only of a part that
 * declares the ramp it is drawn in, since a dress naming any other refuses
 * the draw.
 */
export const dressOf = (figure: Figure, spec: Pick<PuppetSpec, 'parts'>): PuppetDress => {
  const has = new Set(spec.parts.map((p) => p.name));
  const ramped = new Set(
    spec.parts.filter((p) => Option.isSome(Option.fromUndefinedOr(p.ramp))).map((p) => p.name),
  );
  const off = (
    [
      ['headwear', figure.headwear === 'bare'],
      ['band', figure.headwear !== 'tied'],
      ['beard', !figure.beard],
      ['mantle', Option.isNone(figure.mantle)],
    ] as const
  )
    .filter(([name, hidden]) => hidden && has.has(name))
    .map(([name]) => name);
  const dyes = [
    ['mantle', figure.mantle],
    ['band', figure.band],
  ] as const;
  const dye: Record<string, Ramp> = {};
  for (const [name, cloth] of dyes)
    Option.match(
      Option.filter(cloth, () => ramped.has(name)),
      {
        onNone: () => {},
        onSome: (c) => {
          dye[name] = rampOf(c);
        },
      },
    );
  return { hide: off, dye };
};

/** A bust's look: no drawing laid and the boil off, as the table's guests hold between their keys; at a crowd's size a boil would read as noise. */
const STILL: PuppetLook = { boil: 0, amp: 0 };

/** A drawing on its bust's own part sheet canvas, laid where its part lies with every bone at 0. */
const ON_SHEET = { s: 1, dx: 0, dy: 0 } as const;

/**
 * `figure`'s look on `spec`'s puppet: `STILL`, and when the figure wears its
 * headwear and the puppet has a covered head (`HEAD_COVERED`, `puppets.ts`),
 * that head laid in place of its head, riding the head bone at its pivot, so
 * none of the base's hair shows round the headcloth.
 */
export const lookOf = (figure: Figure, spec: Pick<PuppetSpec, 'drawings'>): PuppetLook =>
  Option.match(
    Option.fromUndefinedOr(spec.drawings).pipe(
      Option.flatMap((drawings) => Arr.findFirst(drawings, (d) => d.name === HEAD_COVERED)),
      Option.filter(() => figure.headwear !== 'bare'),
    ),
    {
      onNone: () => STILL,
      onSome: (d) => ({
        ...STILL,
        swaps: [
          { part: 'head', drawing: d.name, place: ON_SHEET, pivot: rowsOf(figure.body).pivot },
        ],
      }),
    },
  );

/** What the crowd needs of a scene's frame: its time, its canvas and the crowd's puppets. */
export interface CrowdFrame {
  readonly t: number;
  readonly ctx: CanvasRenderingContext2D;
  puppet(name: CrowdPuppet, pose: PuppetPose, look?: PuppetLook, dress?: PuppetDress): void;
}

/** Draw `figure`'s bust at `at` in its dress and its idle at the frame's time; the scene draws the table over it. */
export const drawBust = (f: CrowdFrame, figure: Figure, at: Placement): void => {
  const { pose, transform } = bustAt(figure, at, f.t);
  f.ctx.save();
  f.ctx.transform(...transform);
  const spec = PUPPETS[figure.body];
  f.puppet(puppetOf(figure.body), pose, lookOf(figure, spec), dressOf(figure, spec));
  f.ctx.restore();
};
