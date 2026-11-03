import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, cutParts, decodePng, encodePng } from '@manna/film/tools';
import { Array as Arr, Console, Effect, FileSystem, Option, Record, Result } from 'effect';
import { CUTS, cutOptionsFor } from './cut.ts';
import { boxOf } from './frames.ts';

const here = import.meta.dir;
const KEPT = `${here}/../cast-sheet/kept/poses.png`;

const KEYS = {
  turn: [490, -1],
  smile: [983, -1],
} as const;

const INK = 110;

const DRAPE_TOP_ROW_AT_HIS_EAR_TOP = 135;

const FIT = 12;

const DRAPE_FADE_ROWS = 20;

const cropOf = (
  sheet: Raster,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): Raster => {
  const [w, h] = [x1 - x0, y1 - y0];
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    rgba.set(
      sheet.rgba.subarray(((y0 + y) * sheet.width + x0) * 4, ((y0 + y) * sheet.width + x1) * 4),
      y * w * 4,
    );
  return { width: w, height: h, rgba };
};

const lumAt = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  return 0.299 * (r.rgba[i] ?? 0) + 0.587 * (r.rgba[i + 1] ?? 0) + 0.114 * (r.rgba[i + 2] ?? 0);
};

interface Edges {
  readonly outlineL: readonly [number, number];
  readonly faceL: readonly [number, number];
  readonly faceR: readonly [number, number];
  readonly outlineR: readonly [number, number];
}

const inkRuns = (r: Raster, y: number) => {
  const runs: Array<readonly [number, number]> = [];
  let start = -1;
  for (let x = 0; x <= r.width; x++) {
    const ink = x < r.width && lumAt(r, x, y) < INK;
    if (ink && start < 0) start = x;
    if (!ink && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs;
};

const edgesOf = (r: Raster, y: number): Result.Result<Edges, string> => {
  const runs = inkRuns(r, y);
  return Result.fromOption(
    Option.filter(
      Option.all({
        outlineL: Arr.head(runs),
        faceL: Arr.get(runs, 1),
        faceR: Arr.get(runs, runs.length - 2),
        outlineR: Arr.last(runs),
      }),
      () => runs.length >= 3,
    ),
    () => `row ${y} has ${runs.length} ink runs, not an outline and a face edge a side`,
  );
};

const centreOf = (r: Raster, y: number, [a, b]: readonly [number, number]) => {
  let [sum, weight] = [0, 0];
  for (let x = Math.max(0, a - 2); x <= Math.min(r.width - 1, b + 2); x++) {
    const w = Math.max(0, 200 - lumAt(r, x, y));
    sum += x * w;
    weight += w;
  }
  return sum / weight;
};

const outlinesAt = (r: Raster, chin: number): Result.Result<readonly [number, number], string> => {
  const rows = Arr.makeBy(FIT + 1, (i) => chin - FIT + i);
  const my = Arr.reduce(rows, 0, (s, y) => s + y) / rows.length;
  const lineOf = (
    outermost: (
      runs: ReadonlyArray<readonly [number, number]>,
    ) => Option.Option<readonly [number, number]>,
  ) =>
    Result.map(
      Result.all(
        Arr.map(rows, (y) =>
          Result.fromOption(
            Option.map(outermost(inkRuns(r, y)), (run) => [y, centreOf(r, y, run)] as const),
            () => `row ${y} has no ink`,
          ),
        ),
      ),
      (centres) => {
        const mx = Arr.reduce(centres, 0, (s, [, x]) => s + x) / centres.length;
        const slope =
          Arr.reduce(centres, 0, (s, [y, x]) => s + (y - my) * (x - mx)) /
          Arr.reduce(rows, 0, (s, y) => s + (y - my) ** 2);
        return mx + slope * (chin - my);
      },
    );
  return Result.all([lineOf(Arr.head), lineOf(Arr.last)] as const);
};

const warped = (
  view: Raster,
  [shiftL, shiftR]: readonly [number, number],
  chin: number,
): Result.Result<Raster, string> => {
  const { width: w } = view;
  const rgba = Uint8Array.from(view.rgba);
  for (let y = DRAPE_TOP_ROW_AT_HIS_EAR_TOP; y <= chin; y++) {
    const edges = edgesOf(view, y);
    if (Result.isFailure(edges)) return Result.fail(edges.failure);
    const { outlineL, faceL, faceR, outlineR } = edges.success;
    const t = (y - DRAPE_TOP_ROW_AT_HIS_EAR_TOP) / (chin - DRAPE_TOP_ROW_AT_HIS_EAR_TOP);
    const ease = t * t * (3 - 2 * t);
    const [sL, sR] = [shiftL * ease, shiftR * ease];
    const aL = outlineL[1] + 1;
    const bL = Math.max(faceL[0] - 1, aL + 1);
    const bR = faceR[1] + 1;
    const aR = Math.max(outlineR[0] - 1, bR + 1);
    if (bL - aL - sL <= 0 || aR + sR - bR <= 0)
      return Result.fail(`row ${y}: the drape's cloth is too narrow to take its shift`);
    const sourceOf = (x: number) => {
      if (x <= aL + sL) return x - sL;
      if (x < bL) return aL + ((x - aL - sL) * (bL - aL)) / (bL - aL - sL);
      if (x <= bR) return x;
      if (x < aR + sR) return bR + ((x - bR) * (aR - bR)) / (aR + sR - bR);
      return x - sR;
    };
    for (let x = 0; x < w; x++) {
      const src = Math.min(w - 1, Math.max(0, sourceOf(x)));
      const x0 = Math.floor(src);
      const x1 = Math.min(w - 1, x0 + 1);
      const f = src - x0;
      for (let c = 0; c < 4; c++) {
        const p = view.rgba[(y * w + x0) * 4 + c] ?? 0;
        const q = view.rgba[(y * w + x1) * 4 + c] ?? 0;
        rgba[(y * w + x) * 4 + c] = Math.round(p + (q - p) * f);
      }
    }
  }
  return Result.succeed({ width: w, height: view.height, rgba });
};

const clothOf = (r: Raster, y: number) =>
  Result.map(
    edgesOf(r, y),
    ({ outlineL, faceL, faceR, outlineR }) =>
      [
        [outlineL[1] + 2, faceL[0] - 2],
        [faceR[1] + 2, outlineR[0] - 2],
      ] as const,
  );

const EDGE = 16;

const neutralColumn = (
  side: 0 | 1,
  [a, b]: readonly [number, number],
  [c, d]: readonly [number, number],
  x: number,
) => {
  const across = c + ((x - a) * (d - c)) / Math.max(1, b - a);
  if (side === 0) {
    const p = Math.min(b, d) - EDGE;
    if (p <= Math.max(a, c)) return across;
    if (x <= p) return Math.max(x, c);
    return p + ((x - p) * (d - p)) / Math.max(1, b - p);
  }
  const q = Math.max(a, c) + EDGE;
  if (q >= Math.min(b, d)) return across;
  if (x >= q) return Math.min(x, d);
  return c + ((x - a) * (q - c)) / Math.max(1, q - a);
};

const faded = (drape: Raster, neutral: Raster, chin: number): Result.Result<Raster, string> => {
  const { width: w } = drape;
  const rgba = Uint8Array.from(drape.rgba);
  for (let y = chin - DRAPE_FADE_ROWS + 1; y <= chin; y++) {
    const t = (y - chin + DRAPE_FADE_ROWS) / DRAPE_FADE_ROWS;
    const share = t * t * (3 - 2 * t);
    const cloths = Result.all([clothOf(drape, y), clothOf(neutral, y)] as const);
    if (Result.isFailure(cloths)) return Result.fail(cloths.failure);
    const [key, base] = cloths.success;
    for (const side of [0, 1] as const) {
      const [a, b] = key[side];
      for (let x = a; x <= b; x++) {
        const src = neutralColumn(side, key[side], base[side], x);
        const x0 = Math.floor(src);
        const x1 = Math.min(w - 1, x0 + 1);
        const f = src - x0;
        for (let ch = 0; ch < 3; ch++) {
          const i = (y * w + x) * 4 + ch;
          const own = drape.rgba[i] ?? 0;
          const n0 = neutral.rgba[(y * w + x0) * 4 + ch] ?? 0;
          const n1 = neutral.rgba[(y * w + x1) * 4 + ch] ?? 0;
          rgba[i] = Math.round(own + (n0 + (n1 - n0) * f - own) * share);
        }
      }
    }
  }
  return Result.succeed({ width: w, height: drape.height, rgba });
};

const headOf = (view: Raster) =>
  Effect.gen(function* () {
    const parts = yield* Effect.fromResult(
      cutParts(view, CUTS['poses-1'], cutOptionsFor('poses-1', view)),
    );
    return yield* Option.match(
      Arr.findFirst(parts.parts, (p) => p.name === 'head'),
      {
        onNone: () => Effect.die(new Error('his poses-1 cut has no head part')),
        onSome: Effect.succeed,
      },
    );
  });

const lowestRow = (r: Raster) => {
  for (let y = r.height - 1; y >= 0; y--)
    for (let x = 0; x < r.width; x++) if ((r.rgba[(y * r.width + x) * 4 + 3] ?? 0) > 0) return y;
  return -1;
};

const cut = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const sheet = yield* Effect.fromResult(decodePng(yield* fs.readFile(KEPT)));
  const [x0, y0, x1, y1] = boxOf('poses-1');
  const neutral = cropOf(sheet, [x0, y0, x1, y1]);
  const chin = lowestRow((yield* headOf(neutral)).pixels);
  const [nL, nR] = yield* Effect.fromResult(outlinesAt(neutral, chin));
  yield* Effect.forEach(Record.toEntries(KEYS), ([name, [dx, dy]]) =>
    Effect.gen(function* () {
      const view = cropOf(sheet, [x0 + dx, y0 + dy, x1 + dx, y1 + dy]);
      const [kL, kR] = yield* Effect.fromResult(outlinesAt(view, chin));
      const drape = yield* Effect.fromResult(
        Result.flatMap(warped(view, [nL - kL, nR - kR], chin), (d) => faded(d, neutral, chin)),
      );
      const [wL, wR] = yield* Effect.fromResult(outlinesAt(drape, chin));
      const head = yield* headOf(drape);
      yield* fs.writeFile(`${here}/sheets/poses-1/head-${name}.png`, encodePng(head.pixels));
      yield* Console.log(
        `head-${name}.png: ${head.kept} px, at [${dx}, ${dy}], drape shifted ${(nL - kL).toFixed(1)} and ${(nR - kR).toFixed(1)} at row ${chin}, now ${(wL - nL).toFixed(2)} and ${(wR - nR).toFixed(2)} off the neutral's`,
      );
    }),
  );
});

if (import.meta.main) cut.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
