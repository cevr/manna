import { Effect, Layer, Option, Path, Result, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type SheetClean, SheetCleanRefused, cutParts } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import { memoryFileSystem, text } from './host/testing.ts';
import { ImageRoute } from './image-route.ts';
import { type HiddenEntry, runParts } from './part-sheet-cli.ts';
import { decodePng, encodePng } from './png.ts';

type Rgba = readonly [number, number, number, number];

const [W, H] = [64, 96];
const PAPER: Rgba = [244, 232, 212, 255];
const INK: Rgba = [30, 24, 20, 255];
const TEAL: Rgba = [90, 150, 150, 255];

/** A pixel's grain: a fixed spread of G about its paint, the same for every run. */
const grain = (x: number, y: number) => (((x * 7 + y * 13 + x * y * 3) % 7) - 3) * 1.5;

/** His body's paint at (x, y), with its grain: the torso above row 48, the robe below; `flat` paints the parts it names without grain. */
const bodyAt = (x: number, y: number, flat: ReadonlyArray<string>): Rgba => {
  const torso = y < 48;
  const g = grain(x, y) * Number(!flat.includes(['robe', 'torso'][Number(torso)] ?? ''));
  const fills: ReadonlyArray<Rgba> = [
    [120, 160 + g, 200, 255],
    [210, 170 + g, 120, 255],
  ];
  return fills[Number(torso)] ?? PAPER;
};

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** The figure: his body (x 8-55, y 8-91, inked round), and with `arm`, an inked arm in front (x 20-43, y 16-81). */
const figureAt = (x: number, y: number, arm: boolean, flat: ReadonlyArray<string>): Rgba => {
  const layers: ReadonlyArray<readonly [boolean, Rgba]> = [
    [arm && inBox(x, y, 21, 17, 42, 80), TEAL],
    [arm && inBox(x, y, 20, 16, 43, 81), INK],
    [inBox(x, y, 9, 9, 54, 90), bodyAt(x, y, flat)],
    [inBox(x, y, 8, 8, 55, 91), INK],
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
  Number(inBox(i % W, Math.floor(i / W), 8, 8, 55, 91)),
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
    { name: 'arm', take: [box(20, 16, 44, 82)] },
    { name: 'torso', take: [box(0, 0, W, 48)] },
    { name: 'robe', take: [box(0, 48, W, H)] },
  ],
};

/** A figure whose arm reaches past his body's side onto the paper (x 36-61): its hidden area meets the ground. */
const reachAt = (x: number, y: number): Rgba => {
  const layers: ReadonlyArray<readonly [boolean, Rgba]> = [
    [inBox(x, y, 37, 17, 60, 80), TEAL],
    [inBox(x, y, 36, 16, 61, 81), INK],
  ];
  return layers.find(([on]) => on)?.[1] ?? figureAt(x, y, false, []);
};
const REACH = {
  view: rasterOf(W, H, reachAt),
  figure: Uint8Array.from({ length: W * H }, (_, i) => {
    const [x, y] = [i % W, Math.floor(i / W)];
    return Number(inBox(x, y, 8, 8, 55, 91) || inBox(x, y, 36, 16, 61, 81));
  }),
  cut: {
    parts: [
      { name: 'arm', take: [box(36, 16, 62, 82)] },
      { name: 'torso', take: [box(0, 0, W, 48)] },
      { name: 'robe', take: [box(0, 48, W, H)] },
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
        Option.liftPredicate(figureAt(x, y, false, flat), () => inBox(x, y, 20, 16, 43, 81)),
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
    readonly mode?: 'call' | 'reuse' | 'check';
    readonly figure?: Uint8Array;
    readonly cut?: typeof CUT;
    readonly clean?: SheetClean;
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
    frame: Option.none(),
    portrait: PORTRAIT,
    clean: Option.fromUndefinedOr(options.clean),
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
    'misses an all-paper answer on its drift, grain and step, read where the sheet fixes them, and keeps the answer that paints over it',
    () =>
      Effect.gen(function* () {
        const files = new Map<string, Uint8Array>();
        const alone = Result.getOrThrow(yield* run(files, [PAPER_ANSWER]));
        expect(alone.missed).toEqual(['drift', 'grain', 'step']);
        const both = Result.getOrThrow(yield* run(files, [UNDER([])]));
        expect(both.okra.chosen).toBe(2);
        expect(alone.measures.drift.px).toBe(both.measures.drift.px);
        expect(both.okra.calls.map((c) => c.missed)).toEqual([['drift', 'grain', 'step'], []]);
      }),
  );

  it.effect(
    'misses an all-paper answer whose paper the ground reaches: its arm hides no paint, its seam is unread',
    () =>
      Effect.gen(function* () {
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
        const moved = { ...VIEW, rgba: Uint8Array.from(VIEW.rgba) };
        moved.rgba.set([121, 158, 201, 255], (60 * W + 14) * 4);
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

  it.effect(
    "writes the parts as its view's rule leaves the laid sheet, and a check or a reuse makes them again",
    () =>
      Effect.gen(function* () {
        const at = 40 * W + 30;
        const clean: SheetClean = (sheet) =>
          Result.succeed({
            ...sheet,
            owner: Uint8Array.from(sheet.owner, (o, i) => o * Number(i !== at)),
            parts: sheet.parts.map((p) => ({
              ...p,
              pixels: {
                ...p.pixels,
                rgba: p.pixels.rgba.map((v, j) => v * Number(p.name !== 'arm' || j >> 2 !== at)),
              },
            })),
          });
        const files = new Map<string, Uint8Array>();
        const plain = Result.getOrThrow(yield* run(new Map(), [UNDER([])]));
        const record = Result.getOrThrow(yield* run(files, [UNDER([])], { clean }));
        const arm = (r: typeof record) => r.parts.find((p) => p.name === 'arm')?.kept ?? 0;
        expect(arm(record)).toBe(arm(plain) - 1);
        const written = new Map(files);
        const armPng = Result.getOrThrow(decodePng(written.get(`${DIR}/arm.png`) ?? NOT_A_PNG));
        expect(armPng.rgba[at * 4 + 3]).toBe(0);
        expect(Result.isSuccess(yield* run(files, [], { clean, mode: 'check' }))).toBe(true);
        expect(Result.isFailure(yield* run(files, [], { mode: 'check' }))).toBe(true);
        Result.getOrThrow(yield* run(files, [], { clean, mode: 'reuse' }));
        const empty = new Uint8Array(0);
        const changed = [...written].filter(
          ([f, bytes]) => !equalBytes(files.get(f) ?? empty, bytes),
        );
        expect(changed.map(([f]) => f)).toEqual([]);
      }),
  );

  it.effect(
    'fails the view and writes no part or record when its rule refuses the laid sheet',
    () =>
      Effect.gen(function* () {
        const clean: SheetClean = () =>
          Result.fail(SheetCleanRefused.make({ reason: 'the sheet has no part armX' }));
        const files = new Map<string, Uint8Array>();
        const made = yield* run(files, [UNDER([])], { clean });
        expect(Result.match(made, { onFailure: (reason) => reason, onSuccess: () => 'laid' })).toBe(
          "the view's rule cannot run: the sheet has no part armX",
        );
        expect([...files.keys()].filter((f) => !f.startsWith(`${DIR}/okra/`))).toEqual([]);
      }),
  );
});

/** Whether two files hold the same bytes. */
const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
