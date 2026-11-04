import * as BunServices from '@effect/platform-bun/BunServices';
import { rng } from '@manna/film/core';
import { decodePng, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Option, Result, Schema } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import {
  alphaAt,
  cellsOf,
  clearBackground,
  deltaE,
  figuresIn,
  groundOf,
  hexOf,
  largestPiece,
  measuredInk,
  mendPockets,
  type Palette,
  PaletteJson,
  paintsOf,
  rgbAt,
  rgbOfHex,
  type Rgb,
  snapped,
  splitSheet,
} from './sheet.ts';

const INK: Rgb = [30, 20, 15];
const BASE: Rgb = [200, 80, 60];
const SHADE: Rgb = [90, 120, 200];
const GROUND: Rgb = [240, 236, 220];
const FOREIGN: Rgb = [0, 200, 0];

const PALETTE: Palette = {
  ink: hexOf(INK),
  parts: [{ name: 'cloth', base: hexOf(BASE), shade: hexOf(SHADE), role: 'garment' }],
};

const PAINTS = paintsOf(PALETTE);

/** A picture drawn by rows of letters: `.` clear, every other letter the colour `key` gives it, opaque. */
const art = (rows: ReadonlyArray<string>, key: Readonly<Record<string, Rgb>>): Raster => {
  const width = rows[0]?.length ?? 0;
  const rgba = new Uint8Array(width * rows.length * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      rgba.set([...(key[ch] ?? FOREIGN), 255], (y * width + x) * 4);
    }),
  );
  return { width, height: rows.length, rgba };
};

const KEY = { k: INK, b: BASE, s: SHADE, g: GROUND, f: FOREIGN };

/** Each pixel as a letter: `.` clear, else the letter of the key colour it is exactly, `?` for none. */
const lettersOf = (r: Raster): ReadonlyArray<string> =>
  Array.from({ length: r.height }, (_, y) =>
    Array.from({ length: r.width }, (_, x) => {
      const q = y * r.width + x;
      if (alphaAt(r, q) === 0) return '.';
      const c = hexOf(rgbAt(r, q));
      return Object.entries(KEY).find(([, v]) => hexOf(v) === c)?.[0] ?? '?';
    }).join(''),
  );

describe('mendPockets', () => {
  test('refills a pale pocket with the paint of its rim: a garment painted the paper', () => {
    const r = art(['kkkkkk', 'kbbbbk', 'kbggbk', 'kbgbbk', 'kbbbbk', 'kkkkkk'], KEY);
    expect(lettersOf(mendPockets(r, GROUND, PAINTS))).toEqual([
      'kkkkkk',
      'kbbbbk',
      'kbbbbk',
      'kbbbbk',
      'kbbbbk',
      'kkkkkk',
    ]);
  });

  test('clears a pocket ringed all in ink: a true gap', () => {
    const r = art(['kkkkk', 'kgggk', 'kgggk', 'kkkkk'], KEY);
    expect(lettersOf(mendPockets(r, GROUND, PAINTS))).toEqual(['kkkkk', 'k...k', 'k...k', 'kkkkk']);
  });

  test('refills by the most of its rim, the ink not counted, however large or high the pocket', () => {
    const r = art(['kkkkkkk', 'kgggggs', 'kgggggs', 'kbbbbbk'], KEY);
    expect(lettersOf(mendPockets(r, GROUND, PAINTS))).toEqual([
      'kkkkkkk',
      'kbbbbbs',
      'kbbbbbs',
      'kbbbbbk',
    ]);
  });
});

describe('largestPiece', () => {
  test('drops a speck apart from the figure and keeps a pixel touching it at a corner', () => {
    const r = art(['b.....', '......', '..bbb.', '..bbb.', '.....b'], KEY);
    expect(lettersOf(largestPiece(r))).toEqual(['......', '......', '..bbb.', '..bbb.', '.....b']);
  });
});

/** The first colour along the red axis from `BASE` lying at least `want` ΔE from it. */
const atDistance = (want: number): Rgb => {
  for (let k = 0; k < 120; k++) {
    const c: Rgb = [BASE[0], BASE[1] + k, BASE[2]];
    if (deltaE(c, BASE) >= want) return c;
  }
  return BASE;
};

describe('snapped', () => {
  test('takes a paint exactly within ΔE 30 and keeps a farther pixel as drawn, every opaque pixel at alpha 255', () => {
    const near = atDistance(29);
    const far = atDistance(31);
    expect(deltaE(near, BASE)).toBeLessThan(30);
    expect(deltaE(far, BASE)).toBeGreaterThan(30);
    const r: Raster = {
      width: 3,
      height: 1,
      rgba: new Uint8Array([...near, 200, ...far, 255, ...INK, 0]),
    };
    expect([...snapped(r, PAINTS).rgba]).toEqual([...BASE, 255, ...far, 255, ...INK, 0]);
  });
});

describe('cellsOf', () => {
  test('cuts through a one-column touch, the lowest occupancy, the touch going to the right cell', () => {
    const r = art(['bbbb.bbb', 'bbbbbbbb', 'bbbb.bbb'], KEY);
    expect(Result.getOrThrow(cellsOf(r, 2))).toEqual([
      { x: 0, y: 0, width: 4, height: 3 },
      { x: 4, y: 0, width: 4, height: 3 },
    ]);
  });

  test('cuts in the widest empty runs, at each centre, from the first to the last occupied column', () => {
    const r = art(['..b...b.b....b..', '..b...b.b....b..'], KEY);
    expect(Result.getOrThrow(cellsOf(r, 3)).map((b) => [b.x, b.width])).toEqual([
      [2, 2],
      [4, 6],
      [10, 4],
    ]);
  });

  test('goes to the next level up when the empty runs are too few', () => {
    const r = art(['bb.bbbb', 'bb.b.bb'], KEY);
    expect(Result.getOrThrow(cellsOf(r, 3)).map((b) => [b.x, b.width])).toEqual([
      [0, 2],
      [2, 2],
      [4, 3],
    ]);
  });

  test('refuses a sheet that holds no figure or too few columns to cut', () => {
    expect(Result.isFailure(cellsOf(art(['...'], KEY), 1))).toBe(true);
    expect(Result.isFailure(cellsOf(art(['bb'], KEY), 3))).toBe(true);
  });

  test('counts the figures as the empty runs between the first and last occupied columns, plus one', () => {
    expect(figuresIn(art(['.b.bb..b.'], KEY))).toBe(3);
    expect(figuresIn(art(['...'], KEY))).toBe(0);
  });
});

describe('groundOf and clearBackground', () => {
  test('reads the ground as the border median and clears only ground joined to the border', () => {
    const r = art(['ggggggg', 'gkkkkkg', 'gkgggkg', 'gkkkkkg', 'ggggggg'], { ...KEY, g: GROUND });
    expect(groundOf(r)).toEqual(GROUND);
    expect(lettersOf(clearBackground(r, GROUND))).toEqual([
      '.......',
      '.kkkkk.',
      '.kgggk.',
      '.kkkkk.',
      '.......',
    ]);
  });
});

/** A generated sheet: its pixels, which figure owns each (-1 none), and the colour each owned pixel must end as. */
interface Generated {
  readonly n: number;
  readonly raster: Raster;
  readonly owner: Int32Array;
  readonly want: ReadonlyArray<Rgb>;
}

const HEIGHT = 60;

/** A generated sheet being drawn: its seeded draws and its pixels. */
interface Easel {
  readonly int: (a: number, b: number) => number;
  readonly chance: () => boolean;
  readonly noisy: (c: Rgb) => Rgb;
  readonly put: (x: number, y: number, c: Rgb) => void;
  readonly own: (x: number, y: number, f: number, paint: Rgb, drawn: Rgb) => void;
  readonly free: (x: number, y: number) => void;
}

/** One figure's place: its left column, width, crown row and soles row. */
interface Place {
  readonly left: number;
  readonly fw: number;
  readonly top: number;
  readonly soles: number;
}

/** Each pixel in the rows `y0..y1` and columns `x0..x1`, the ends outside. */
const area = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): ReadonlyArray<readonly [number, number]> =>
  Array.from({ length: (x1 - x0) * (y1 - y0) }, (_, k) => [
    x0 + (k % (x1 - x0)),
    y0 + Math.floor(k / (x1 - x0)),
  ]);

/** A figure's body: an ink edge 2 px wide round its base, its right third in its shade. */
const body = (e: Easel, f: number, p: Place) => {
  for (const [x, y] of area(p.left, p.left + p.fw, p.top, p.soles + 1)) {
    const edge = x < p.left + 2 || x >= p.left + p.fw - 2 || y < p.top + 2 || y > p.soles - 2;
    const cloth = [BASE, SHADE][Number(x - p.left > (p.fw * 2) / 3)] ?? BASE;
    const paint = [cloth, INK][Number(edge)] ?? INK;
    e.own(x, y, f, paint, e.noisy(paint));
  }
};

/** A 3 × 3 pocket of the ground's colour inside the base: it must come back as the base. */
const palePocket = (e: Easel, f: number, p: Place) => {
  for (const [x, y] of area(p.left + 3, p.left + 6, p.top + 3, p.top + 6))
    e.own(x, y, f, BASE, e.noisy(GROUND));
};

/** A 3 × 3 hole of ground ringed 2 px in ink, low in the body: it must come back clear. */
const trueGap = (e: Easel, f: number, p: Place) => {
  for (const [x, y] of area(p.left + 2, p.left + 9, p.soles - 9, p.soles - 2))
    e.own(x, y, f, INK, e.noisy(INK));
  for (const [x, y] of area(p.left + 4, p.left + 7, p.soles - 7, p.soles - 4)) e.free(x, y);
};

/** A small sheet drawn as the acceptance draws its own: inked figures in a row on noisy ground, half with a pale pocket, half a true gap, a foreign patch, specks above. */
const generated = (seed: number): Generated => {
  const draw = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const n = int(2, 4);
  const [slot, gap, margin] = [24, int(4, 8), 6];
  const width = margin * 2 + n * slot + (n - 1) * gap;
  const rgba = new Uint8Array(width * HEIGHT * 4);
  const owner = new Int32Array(width * HEIGHT).fill(-1);
  const want: Array<Rgb> = Array.from({ length: width * HEIGHT }, () => GROUND);
  const put = (x: number, y: number, c: Rgb) => rgba.set([...c, 255], (y * width + x) * 4);
  const noisy = (c: Rgb): Rgb => [c[0] + int(-2, 2), c[1] + int(-2, 2), c[2] + int(-2, 2)];
  const e: Easel = {
    int,
    chance: () => draw() < 0.5,
    noisy,
    put,
    own: (x, y, f, paint, drawn) => {
      put(x, y, drawn);
      owner[y * width + x] = f;
      want[y * width + x] = paint;
    },
    free: (x, y) => {
      put(x, y, noisy(GROUND));
      owner[y * width + x] = -1;
    },
  };
  for (const [x, y] of area(0, width, 0, HEIGHT)) put(x, y, noisy(GROUND));
  const foreign = e.chance();
  for (let f = 0; f < n; f++) {
    const fw = int(14, slot - 2);
    const p: Place = {
      left: margin + f * (slot + gap) + int(0, slot - fw),
      fw,
      top: int(8, 16),
      soles: HEIGHT - 6,
    };
    body(e, f, p);
    if (foreign) e.own(p.left + 6, p.top + 12, f, FOREIGN, FOREIGN);
    if (e.chance()) palePocket(e, f, p);
    if (e.chance()) trueGap(e, f, p);
    for (const [x, y] of area(p.left + 4, p.left + 6, p.top - 6, p.top - 4)) put(x, y, noisy(BASE));
  }
  return { n, raster: { width, height: HEIGHT, rgba }, owner, want };
};

/** Every pixel of every cell against the generated sheet: clear unless its figure owns it, else opaque in exactly its colour. */
const missesOf = (g: Generated): ReadonlyArray<string> => {
  const split = Result.getOrThrow(splitSheet(g.raster, g.n, PALETTE));
  const misses: Array<string> = [];
  for (const [i, cell] of split.cells.entries())
    for (let v = 0; v < cell.box.height; v++)
      for (let u = 0; u < cell.box.width; u++) {
        const q = v * cell.box.width + u;
        const s = (cell.box.y + v) * g.raster.width + cell.box.x + u;
        const mine = g.owner[s] === i;
        const ok =
          (!mine && alphaAt(cell.raster, q) === 0) ||
          (mine &&
            alphaAt(cell.raster, q) === 255 &&
            hexOf(rgbAt(cell.raster, q)) === hexOf(g.want[s] ?? GROUND));
        if (!ok) misses.push(`cell ${i} (${u},${v})`);
      }
  const owned = [...g.owner].filter((f) => f >= 0).length;
  const kept = split.cells.reduce(
    (sum, c) =>
      sum +
      Array.from({ length: c.box.width * c.box.height }, (_, q) => q).filter(
        (q) => alphaAt(c.raster, q) > 0,
      ).length,
    0,
  );
  if (kept !== owned) misses.push(`${kept} pixels kept, ${owned} owned`);
  return misses;
};

describe('splitSheet over generated sheets', () => {
  test('gives each figure alone, pale pockets refilled, gaps and specks cleared, foreign paint kept, every other pixel snapped exactly', () => {
    const misses = Array.from({ length: 6 }, (_, k) => k + 1).flatMap((seed) =>
      missesOf(generated(seed)).map((m) => `seed ${seed}: ${m}`),
    );
    expect(misses.slice(0, 10)).toEqual([]);
  });

  test('two splits of one sheet are the same pixels', () => {
    const g = generated(9);
    const a = Result.getOrThrow(splitSheet(g.raster, g.n, PALETTE));
    const b = Result.getOrThrow(splitSheet(g.raster, g.n, PALETTE));
    expect(a.cells.map((c) => [...c.raster.rgba])).toEqual(b.cells.map((c) => [...c.raster.rgba]));
  });
});

const CAST = `${import.meta.dir}/../cast`;

/** Each member a shot casts, with the kept view its shot sheet's refs name first. */
const MEMBERS = [
  ['lead-feast', 'profileRight'],
  ['feast-guest-man', 'poses-1'],
  ['feast-guest-woman', 'poses-1'],
] as const;

describe('palette.json', () => {
  for (const [member, view] of MEMBERS)
    it.effect(
      `${member}: every paint is a colour its look.md names, and the ink is its first kept view's, measured`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const folder = `${CAST}/${member}/cast-sheet`;
          const palette = yield* Schema.decodeEffect(PaletteJson)(
            yield* fs.readFileString(`${folder}/palette.json`),
          );
          const look = (yield* fs.readFileString(`${folder}/look.md`)).toLowerCase();
          const hexes = palette.parts.flatMap((p) => [
            p.base,
            ...Option.toArray(Option.fromUndefinedOr(p.shade)),
          ]);
          expect(hexes.filter((h) => !look.includes(h.toLowerCase()))).toEqual([]);
          const kept = yield* Effect.fromResult(
            decodePng(yield* fs.readFile(`${folder}/views/${view}.png`)),
          );
          expect(deltaE(measuredInk(kept), rgbOfHex(palette.ink))).toBeLessThanOrEqual(2);
        }).pipe(Effect.provide(BunServices.layer)),
    );
});
