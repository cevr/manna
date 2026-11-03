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

export const CLOTHS = {
  walnut: '#ab8163',
  indigo: '#4b566b',
  olive: '#768059',
  camel: '#8c7762',
} as const satisfies Readonly<Record<string, Hex>>;

export type Cloth = keyof typeof CLOTHS;

const CLOTH_NAMES = Rec.keys(CLOTHS);

export const ROBE_WHITE: Hex = '#fcfefc';

export type Headwear = 'bare' | 'tied' | 'draped' | 'over';

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

export interface Wave {
  readonly deg: number;
  readonly period: number;
  readonly phase: number;
}

export interface Idle {
  readonly breath: Wave;
  readonly tilt: Wave;
}

export interface Figure {
  readonly body: FramedView;
  readonly facing: 1 | -1;
  readonly headwear: Headwear;
  readonly beard: boolean;
  readonly mantle: Option.Option<Cloth>;
  readonly band: Option.Option<Cloth>;
  readonly hair: Hex;
  readonly idle: Idle;
}

const when = (ok: boolean): Option.Option<true> =>
  Option.filter(Option.some(true as const), () => ok);

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

const clothBut = (draw: Draw, not: Option.Option<Cloth>): Cloth =>
  pick(
    draw,
    Option.match(not, {
      onNone: () => CLOTH_NAMES,
      onSome: (c) => CLOTH_NAMES.filter((n) => n !== c),
    }),
  );

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

export const crowdOf = (seed: number, count: number): ReadonlyArray<Figure> => {
  const draw = rng(seed);
  const row: Array<Figure> = [];
  for (let i = 0; i < count; i++) row.push(figureOf(draw, Option.fromUndefinedOr(row[i - 1])));
  return row;
};

export const idleAt = ({ breath, tilt }: Idle, t: number) => {
  const lean = breath.deg * Math.sin((2 * Math.PI * t) / breath.period + breath.phase);
  return { lean, head: lean + tilt.deg * Math.sin((2 * Math.PI * t) / tilt.period + tilt.phase) };
};

export const CROWD_PUPPETS = {
  'crowd-poses-1': PUPPETS['poses-1'],
  'crowd-poses-2': PUPPETS['poses-2'],
  'crowd-poses-3': PUPPETS['poses-3'],
  'crowd-poses-4': PUPPETS['poses-4'],
} as const;

export type CrowdPuppet = keyof typeof CROWD_PUPPETS;

export const puppetOf = (body: FramedView): CrowdPuppet => `crowd-${body}`;

export const SHOWN = 1.6;

export const HANDS_ROW = 578;

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

export interface Placement {
  readonly x: number;
  readonly top: number;
  readonly scale: number;
}

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

const rampOf = (cloth: Cloth): Ramp => ramp(CLOTHS[cloth], keyLight, shading);

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

const STILL: PuppetLook = { boil: 0, amp: 0 };

const ON_SHEET = { s: 1, dx: 0, dy: 0 } as const;

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

export interface CrowdFrame {
  readonly t: number;
  readonly ctx: CanvasRenderingContext2D;
  puppet(name: CrowdPuppet, pose: PuppetPose, look?: PuppetLook, dress?: PuppetDress): void;
}

export const drawBust = (f: CrowdFrame, figure: Figure, at: Placement): void => {
  const { pose, transform } = bustAt(figure, at, f.t);
  f.ctx.save();
  f.ctx.transform(...transform);
  const spec = PUPPETS[figure.body];
  f.puppet(puppetOf(figure.body), pose, lookOf(figure, spec), dressOf(figure, spec));
  f.ctx.restore();
};
