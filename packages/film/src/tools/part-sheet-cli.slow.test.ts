// `film concept parts`, run over memory on a small figure (a torso over a
// robe, an arm in front of both): its budget of calls holds across a moved
// cut, a call counts once it is in the ledger whatever follows it, an
// all-paper answer misses its drift and grain on the domain the sheet
// fixes and is never kept over one that paints, and each painted part's
// grain is read on its own.

import { Effect, Layer, Option, Path, Result, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { cutParts } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import { memoryFileSystem, text } from './host/testing.ts';
import { ImageRoute } from './image-route.ts';
import { type HiddenEntry, runParts } from './part-sheet-cli.ts';
import { encodePng } from './png.ts';

type Rgba = readonly [number, number, number, number];

const [W, H] = [32, 48];
const PAPER: Rgba = [244, 232, 212, 255];
const INK: Rgba = [30, 24, 20, 255];
const TEAL: Rgba = [90, 150, 150, 255];

/** A pixel's grain: a fixed spread of G about its paint, the same for every run. */
const grain = (x: number, y: number) => (((x * 7 + y * 13 + x * y * 3) % 7) - 3) * 1.5;

/** His body's paint at (x, y), with its grain: the torso above row 24, the robe below; `flat` paints the parts it names without grain. */
const bodyAt = (x: number, y: number, flat: ReadonlyArray<string>): Rgba => {
  const torso = y < 24;
  const g = grain(x, y) * Number(!flat.includes(['robe', 'torso'][Number(torso)] ?? ''));
  const fills: ReadonlyArray<Rgba> = [
    [120, 160 + g, 200, 255],
    [210, 170 + g, 120, 255],
  ];
  return fills[Number(torso)] ?? PAPER;
};

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** The figure: his body (x 4-27, y 4-45, inked round), and with `arm`, an inked arm in front (x 10-21, y 8-40). */
const figureAt = (x: number, y: number, arm: boolean, flat: ReadonlyArray<string>): Rgba => {
  const layers: ReadonlyArray<readonly [boolean, Rgba]> = [
    [arm && inBox(x, y, 11, 9, 20, 39), TEAL],
    [arm && inBox(x, y, 10, 8, 21, 40), INK],
    [inBox(x, y, 5, 5, 26, 44), bodyAt(x, y, flat)],
    [inBox(x, y, 4, 4, 27, 45), INK],
  ];
  return layers.find(([on]) => on)?.[1] ?? PAPER;
};

const rasterOf = (w: number, h: number, at: (x: number, y: number) => Rgba): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set(at(i % w, Math.floor(i / w)), i * 4);
  return { width: w, height: h, rgba };
};

const VIEW = rasterOf(W, H, (x, y) => figureAt(x, y, true, []));
const FIGURE = Uint8Array.from({ length: W * H }, (_, i) =>
  Number(inBox(i % W, Math.floor(i / W), 4, 4, 27, 45)),
);
const box = (x0: number, y0: number, x1: number, y1: number) => ({
  polygon: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as const,
});
const CUT = {
  parts: [
    { name: 'arm', take: [box(10, 8, 22, 41)] },
    { name: 'torso', take: [box(0, 0, W, 24)] },
    { name: 'robe', take: [box(0, 24, W, H)] },
  ],
};

/** A figure whose arm reaches past his body's side onto the paper (x 18-30): its hidden area meets the ground. */
const reachAt = (x: number, y: number): Rgba => {
  const layers: ReadonlyArray<readonly [boolean, Rgba]> = [
    [inBox(x, y, 19, 9, 29, 39), TEAL],
    [inBox(x, y, 18, 8, 30, 40), INK],
  ];
  return layers.find(([on]) => on)?.[1] ?? figureAt(x, y, false, []);
};
const REACH = {
  view: rasterOf(W, H, reachAt),
  figure: Uint8Array.from({ length: W * H }, (_, i) => {
    const [x, y] = [i % W, Math.floor(i / W)];
    return Number(inBox(x, y, 4, 4, 27, 45) || inBox(x, y, 18, 8, 30, 40));
  }),
  cut: {
    parts: [
      { name: 'arm', take: [box(18, 8, 31, 41)] },
      { name: 'torso', take: [box(0, 0, W, 24)] },
      { name: 'robe', take: [box(0, 24, W, H)] },
    ],
  },
};

/** The portrait the route is asked at: the view twice over, so a drawn answer lays back pixel for pixel. */
const PORTRAIT = { width: 2 * W, height: 2 * H };

/** An answer as the route would draw it: `picture` at the portrait, each pixel twice over each way. */
const answerOf = (picture: Raster) =>
  encodePng(
    rasterOf(PORTRAIT.width, PORTRAIT.height, (u, v) => {
      const i = (Math.floor(v / 2) * W + Math.floor(u / 2)) * 4;
      return [
        picture.rgba[i] ?? 0,
        picture.rgba[i + 1] ?? 0,
        picture.rgba[i + 2] ?? 0,
        picture.rgba[i + 3] ?? 0,
      ];
    }),
  );

/** The body under the arm, painted as the view paints it beside it; `flat` paints the parts it names without grain under the arm. */
const UNDER = (flat: ReadonlyArray<string>) =>
  answerOf(
    rasterOf(W, H, (x, y) =>
      Option.getOrElse(
        Option.liftPredicate(figureAt(x, y, false, flat), () => inBox(x, y, 10, 8, 21, 40)),
        () => figureAt(x, y, true, []),
      ),
    ),
  );
const PAPER_ANSWER = answerOf(rasterOf(W, H, () => PAPER));
const NOT_A_PNG = text('not a png');

const DIR = '/sheets/front';
const HIDDEN: HiddenEntry = { moving: ['arm'], prompt: 'Repaint the magenta.' };

/** One run over `files`, the route answering each call with the next of `answers`; the record, or the refusal's message. */
const run = (
  files: Map<string, Uint8Array>,
  answers: Array<Uint8Array>,
  options: {
    readonly view?: Raster;
    readonly hidden?: HiddenEntry;
    readonly mode?: 'call' | 'reuse';
    readonly figure?: Uint8Array;
    readonly cut?: typeof CUT;
  } = {},
) => {
  const view = options.view ?? VIEW;
  const sheet = Result.getOrThrow(
    cutParts(view, options.cut ?? CUT, { figure: options.figure ?? FIGURE }),
  );
  const route = ImageRoute.fake(() => answers.shift() ?? NOT_A_PNG);
  return runParts({
    label: 'f.front',
    command: 'film concept parts f m --view turnaround-front',
    kind: 'turnaround',
    name: 'front',
    view,
    sheet,
    hidden: options.hidden ?? HIDDEN,
    dir: DIR,
    mode: options.mode ?? 'call',
    portrait: PORTRAIT,
  }).pipe(
    Effect.map((record) => Result.succeed(record)),
    Effect.catchTag('PartsUnmade', (e) => Effect.succeed(Result.fail(e.reason))),
    Effect.provide(Layer.provideMerge(route, Layer.mergeAll(memoryFileSystem(files), Path.layer))),
  );
};

const Ledger = Schema.fromJsonString(
  Schema.Struct({ calls: Schema.Array(Schema.Struct({ n: Schema.Int })) }),
);

/** The numbers of the calls the view's ledger holds. */
const ledgerOf = (files: Map<string, Uint8Array>) =>
  Schema.decodeSync(Ledger)(
    new TextDecoder().decode(files.get(`${DIR}/okra/calls.json`)),
  ).calls.map((c) => c.n);

describe('film concept parts', () => {
  it.effect(
    'keeps an answer that paints the body under the arm, every bar met, each part read',
    () =>
      Effect.gen(function* () {
        const files = new Map<string, Uint8Array>();
        const record = Result.getOrThrow(yield* run(files, [UNDER([])]));
        expect(record.missed).toEqual([]);
        expect(record.measures.grain.map((g) => [g.part, g.verdict])).toEqual([
          ['torso', 'within'],
          ['robe', 'within'],
        ]);
        expect(record.measures.drift.deltaE).toBe(0);
      }),
  );

  it.effect(
    'misses an all-paper answer on its drift and grain, read where the sheet fixes them, and keeps the answer that paints over it',
    () =>
      Effect.gen(function* () {
        const files = new Map<string, Uint8Array>();
        const alone = Result.getOrThrow(yield* run(files, [PAPER_ANSWER]));
        expect(alone.missed).toEqual(['drift', 'grain']);
        const both = Result.getOrThrow(yield* run(files, [UNDER([])]));
        expect(both.okra.chosen).toBe(2);
        expect(alone.measures.drift.px).toBe(both.measures.drift.px);
        expect(both.okra.calls.map((c) => c.missed)).toEqual([['drift', 'grain'], []]);
      }),
  );

  it.effect(
    'misses an all-paper answer whose paper the ground reaches: its arm hides no paint, its seam is unread',
    () =>
      Effect.gen(function* () {
        // the arm reaches onto the paper, so the ground's flood takes the whole paper answer: no pixel is painted
        const record = Result.getOrThrow(
          yield* run(new Map(), [answerOf(rasterOf(W, H, () => PAPER))], {
            view: REACH.view,
            figure: REACH.figure,
            cut: REACH.cut,
          }),
        );
        expect(record.measures.paintedPx).toBe(0);
        expect(record.measures.seam.pairs).toBe(0);
        expect(record.missed).toEqual(['paint', 'seam', 'drift', 'grain']);
      }),
  );

  it.effect(
    "reads each painted part's grain on its own: paint without grain misses on its part alone",
    () =>
      Effect.gen(function* () {
        for (const flat of ['torso', 'robe']) {
          const record = Result.getOrThrow(yield* run(new Map(), [UNDER([flat])]));
          expect(record.measures.grain.map((g) => [g.part, g.verdict])).toEqual(
            ['torso', 'robe'].map((p) => [p, ['within', 'outside'][Number(p === flat)] ?? '']),
          );
          expect(record.missed).toEqual(['grain']);
        }
      }),
  );

  it.effect(
    'records a grain miss its cut table names, with both numbers, and the miss stays a miss',
    () =>
      Effect.gen(function* () {
        const named = [
          {
            bar: 'grain' as const,
            part: 'torso',
            by: 'the coordinator',
            on: '2026-10-27',
            why: 'a test',
          },
        ];
        const record = Result.getOrThrow(
          yield* run(new Map(), [UNDER(['torso'])], { hidden: { ...HIDDEN, named } }),
        );
        expect(record.missed).toEqual(['grain']);
        expect(
          record.named.map((m) => [
            m.part,
            m.grain.verdict,
            m.grain.painted.robust < m.grain.kept.robust,
          ]),
        ).toEqual([['torso', 'outside', true]]);
        const held = Result.getOrThrow(
          yield* run(new Map(), [UNDER([])], { hidden: { ...HIDDEN, named } }),
        );
        expect(held.named).toEqual([]);
      }),
  );

  it.effect(
    'refuses a call past the budget, a moved cut renewing none of it, and grants an allowance its table records',
    () =>
      Effect.gen(function* () {
        const files = new Map<string, Uint8Array>();
        const first = Result.getOrThrow(yield* run(files, [UNDER([])]));
        for (let k = 0; k < 2; k++) Result.getOrThrow(yield* run(files, [UNDER([])]));
        // one robe pixel the magenta leaves showing, repainted: another input, another hash
        const moved = { ...VIEW, rgba: Uint8Array.from(VIEW.rgba) };
        moved.rgba.set([121, 158, 201, 255], (30 * W + 7) * 4);
        const elsewhere = Result.getOrThrow(yield* run(new Map(), [UNDER([])], { view: moved }));
        expect(elsewhere.okra.input).not.toBe(first.okra.input);
        const refused = yield* run(files, [UNDER([])], { view: moved });
        expect(Result.isFailure(refused)).toBe(true);
        expect(ledgerOf(files)).toEqual([1, 2, 3]);
        const allowance = { calls: 1, by: 'the coordinator', on: '2026-10-27', why: 'a test' };
        const granted = yield* run(files, [UNDER([])], {
          view: moved,
          hidden: { ...HIDDEN, allowance },
        });
        expect(Result.getOrThrow(granted).okra.budget).toEqual({ calls: 4, allowance, used: 4 });
        const past = yield* run(files, [UNDER([])], {
          view: moved,
          hidden: { ...HIDDEN, allowance },
        });
        expect(Result.isFailure(past)).toBe(true);
        expect(ledgerOf(files)).toEqual([1, 2, 3, 4]);
      }),
  );

  it.effect(
    'counts answer files the ledger lacks beside its entries, and numbers a call past them',
    () =>
      Effect.gen(function* () {
        const files = new Map<string, Uint8Array>([
          [`${DIR}/okra/answer-1.png`, UNDER([])],
          [`${DIR}/okra/answer-2.png`, UNDER([])],
        ]);
        // a prompt naming an address: the route refuses it, after the call is in the ledger
        const failed = yield* run(files, [UNDER([])], {
          hidden: { ...HIDDEN, prompt: 'Repaint the magenta for a@b.co.' },
        });
        expect(Result.isFailure(failed)).toBe(true);
        expect(ledgerOf(files)).toEqual([3]);
        const refused = yield* run(files, [UNDER([])]);
        expect(Result.isFailure(refused)).toBe(true);
        expect(ledgerOf(files)).toEqual([3]);
      }),
  );

  it.effect('counts a call whose answer does not decode, and numbers the next after it', () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      const failed = yield* run(files, [NOT_A_PNG]);
      expect(Result.isFailure(failed)).toBe(true);
      expect(ledgerOf(files)).toEqual([1]);
      const record = Result.getOrThrow(yield* run(files, [UNDER([])]));
      expect(record.okra.calls.map((c) => [c.n, c.state])).toEqual([
        [1, 'failed'],
        [2, 'laid'],
      ]);
      expect(record.okra.budget.used).toBe(2);
    }),
  );
});
