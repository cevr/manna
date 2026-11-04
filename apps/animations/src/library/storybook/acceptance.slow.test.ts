import * as BunServices from '@effect/platform-bun/BunServices';
import { labOf } from '@manna/film/core';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';

/** The storybook command every check drives: `bun src/library/storybook/cli.ts <sub> …` (package script `storybook`). */
const CLI = `${import.meta.dir}/cli.ts`;

/** The shared cast, where each member's palette and shot sheets live. */
const CAST = `${import.meta.dir}/../cast`;

/** The app's root, where a shot's set plates are named from. */
const APP = `${import.meta.dir}/../../..`;

/** The acceptance shot's id and the members it casts. */
const SHOT = 'feast-courtyard';
const MEMBERS = ['feast-guest-man', 'feast-guest-woman', 'lead-feast'];

/** The verdict's checks, in the bars table's order. */
const BAR_IDS = [
  'palette',
  'pockets',
  'colour-step',
  'proportions',
  'scale',
  'one-sheet',
  'light',
  'render-height',
  'determinism',
];

type Rgb = readonly [number, number, number];

/** A figure's box in sheet px: left, top, right, bottom, all inside it. */
type Bounds = readonly [number, number, number, number];

const sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

/** How near the sheet's ground a figure's pixel may come, as the sum of the three channels' differences, before it is a pocket (owner, take 3: the raised sleeve painted the paper's colour). */
const POCKET_SUM = 30;

const rgbSum = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

const hexOf = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const deltaE = (a: Rgb, b: Rgb): number => {
  const p = labOf(a);
  const q = labOf(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** A seeded draw in [0, 1): mulberry32, so every case is reproducible from its seed. */
const random = (seed: number) => {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Seeded integers in [a, b], and a colour drawn until it meets a test. */
const drawsOf = (seed: number) => {
  const rng = random(seed);
  const int = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const pick = (ok: (c: Rgb) => boolean): Rgb => {
    for (let k = 0; k < 20000; k++) {
      const c: Rgb = [int(0, 255), int(0, 255), int(0, 255)];
      if (ok(c)) return c;
    }
    return [0, 0, 0];
  };
  const noisy = (c: Rgb): Rgb => [
    Math.min(255, Math.max(0, c[0] + int(-2, 2))),
    Math.min(255, Math.max(0, c[1] + int(-2, 2))),
    Math.min(255, Math.max(0, c[2] + int(-2, 2))),
  ];
  return { rng, int, pick, noisy };
};

type Draws = ReturnType<typeof drawsOf>;

interface Paint {
  readonly name: string;
  readonly base: Rgb;
  readonly shade: Rgb;
}

/** A generated palette: a light ground, a dark ink, 2..5 paints, every colour ΔE 25 or more from every other; half the time a foreign colour ΔE 45 or more from all. */
interface Palette {
  readonly ground: Rgb;
  readonly ink: Rgb;
  readonly parts: ReadonlyArray<Paint>;
  readonly foreign: Option.Option<Rgb>;
}

const paletteOf = (d: Draws): Palette => {
  const ground = d.pick((c) => labOf(c)[0] > 88);
  const ink = d.pick((c) => labOf(c)[0] < 30);
  const chosen: Array<Rgb> = [ground, ink];
  const apart = (c: Rgb) =>
    chosen.every((o) => deltaE(c, o) >= 25) && rgbSum(c, ground) >= POCKET_SUM * 2;
  const parts: Array<Paint> = [];
  const count = d.int(2, 5);
  for (let k = 0; k < count; k++) {
    const base = d.pick(apart);
    chosen.push(base);
    const shade = d.pick(apart);
    chosen.push(shade);
    parts.push({ name: `part${k}`, base, shade });
  }
  const foreign = Option.some(d.rng()).pipe(
    Option.filter((r) => r < 0.5),
    Option.map(() =>
      d.pick((c) => chosen.every((o) => deltaE(c, o) >= 45) && rgbSum(c, ground) >= POCKET_SUM * 2),
    ),
  );
  return { ground, ink, parts, foreign };
};

/** One generated sheet: its pixels, which figure owns each pixel (-1 for none), and what each owned pixel must snap to. */
interface Sheet {
  readonly n: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly owner: Int32Array;
  readonly expected: Uint8Array;
  readonly palette: Palette;
  readonly boxes: Array<Bounds>;
}

const blankSheet = (d: Draws, palette: Palette, n: number, width: number): Sheet => {
  const height = 260;
  const sheet: Sheet = {
    n,
    width,
    height,
    rgba: new Uint8Array(width * height * 4),
    owner: new Int32Array(width * height).fill(-1),
    expected: new Uint8Array(width * height * 3),
    palette,
    boxes: [],
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) put(sheet, x, y, d.noisy(palette.ground));
  return sheet;
};

const put = (sheet: Sheet, x: number, y: number, c: Rgb) => {
  sheet.rgba.set([c[0], c[1], c[2], 255], (y * sheet.width + x) * 4);
};

/** Paints `want` at (x, y) with noise or exactly, and gives the pixel to figure `f`. */
const own = (sheet: Sheet, x: number, y: number, f: number, want: Rgb, drawn: Rgb) => {
  put(sheet, x, y, drawn);
  sheet.owner[y * sheet.width + x] = f;
  sheet.expected.set(want, (y * sheet.width + x) * 3);
};

/** A figure's outline: a head box on a body box, touching, so one piece. */
interface Body {
  readonly left: number;
  readonly width: number;
  readonly top: number;
  readonly soles: number;
  readonly headLeft: number;
  readonly headWidth: number;
  readonly headHeight: number;
}

const bodyOf = (d: Draws, left: number, width: number): Body => {
  const height = d.int(100, 180);
  const soles = 220 + d.int(-3, 3);
  const headWidth = d.int(Math.ceil(width * 0.4), Math.floor(width * 0.7));
  return {
    left,
    width,
    top: soles - height,
    soles,
    headLeft: left + Math.floor((width - headWidth) / 2) + d.int(-2, 2),
    headWidth,
    headHeight: d.int(Math.floor(height * 0.2), Math.floor(height * 0.3)),
  };
};

const inside = (s: Body, x: number, y: number): boolean =>
  (y >= s.top && y < s.top + s.headHeight && x >= s.headLeft && x < s.headLeft + s.headWidth) ||
  (y >= s.top + s.headHeight && y <= s.soles && x >= s.left && x < s.left + s.width);

/** Whether (x, y) lies within 2 px of the body's outside: the ink. */
const onEdge = (s: Body, x: number, y: number): boolean => {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) if (!inside(s, x + dx, y + dy)) return true;
  return false;
};

const boundsOf = (s: Body): Bounds => [
  Math.min(s.left, s.headLeft),
  s.top,
  Math.max(s.left + s.width, s.headLeft + s.headWidth) - 1,
  s.soles,
];

/** The paint at (x, y): ink on the edge, else its band's base, or its shade on the right third. */
const paintAt = (s: Body, palette: Palette, bands: number, x: number, y: number): Rgb => {
  if (onEdge(s, x, y)) return palette.ink;
  const bandHeight = Math.max(1, Math.floor((s.soles - s.top - s.headHeight) / bands));
  const band = Math.min(
    bands - 1,
    Math.max(0, Math.floor((y - s.top - s.headHeight) / bandHeight)),
  );
  const paint = palette.parts[band] ?? { name: 'ink', base: palette.ink, shade: palette.ink };
  return [paint.base, paint.shade][Number(x - s.left > (s.width * 2) / 3)] ?? paint.base;
};

/** A 6 × 6 patch of the ground's colour inside the first band's base, its rim all that paint: a garment painted the paper's colour, which the split refills with the paint. */
const palePocket = (d: Draws, sheet: Sheet, f: number, s: Body, bands: number) => {
  const px = s.left + 4;
  const py = s.top + s.headHeight + 4;
  const want = paintAt(s, sheet.palette, bands, px, py);
  for (let y = py; y < py + 6; y++)
    for (let x = px; x < px + 6; x++) own(sheet, x, y, f, want, d.noisy(sheet.palette.ground));
};

/** A 6 × 6 hole of the ground's colour ringed by ink 2 px wide, low in the body: a true gap, which the split clears. */
const truePocket = (d: Draws, sheet: Sheet, f: number, s: Body) => {
  const rx = s.left + 4;
  const ry = s.soles - 14;
  for (let y = ry; y < ry + 10; y++)
    for (let x = rx; x < rx + 10; x++) {
      const hole = x >= rx + 2 && x < rx + 8 && y >= ry + 2 && y < ry + 8;
      if (!hole) {
        own(sheet, x, y, f, sheet.palette.ink, d.noisy(sheet.palette.ink));
        continue;
      }
      put(sheet, x, y, d.noisy(sheet.palette.ground));
      sheet.owner[y * sheet.width + x] = -1;
    }
};

const drawFigure = (d: Draws, sheet: Sheet, f: number, s: Body) => {
  const [x0, y0, x1, y1] = boundsOf(s);
  const bands = d.int(1, sheet.palette.parts.length);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(s, x, y)) continue;
      const want = paintAt(s, sheet.palette, bands, x, y);
      own(sheet, x, y, f, want, d.noisy(want));
    }
  Option.map(sheet.palette.foreign, (c) => {
    const fx = s.left + Math.floor(s.width / 2) - 2;
    const fy = s.top + s.headHeight + Math.floor((s.soles - s.top - s.headHeight) / 2) - 2;
    for (let y = fy; y < fy + 4; y++) for (let x = fx; x < fx + 4; x++) own(sheet, x, y, f, c, c);
  });
  if (d.rng() < 0.5) palePocket(d, sheet, f, s, bands);
  if (d.rng() < 0.5) truePocket(d, sheet, f, s);
  const specks = d.int(1, 3);
  for (let k = 0; k < specks; k++) {
    const sx = s.left + d.int(0, Math.max(0, s.width - 3));
    const sy =
      [d.int(s.top - 14, s.top - 9), d.int(s.soles + 7, s.soles + 12)][d.int(0, 1)] ?? s.top - 9;
    const c = [sheet.palette.ink, ...sheet.palette.parts.map((p) => p.base)][
      d.int(0, sheet.palette.parts.length)
    ];
    for (let y = sy; y < sy + 3; y++)
      for (let x = sx; x < sx + 3; x++) put(sheet, x, y, d.noisy(c ?? sheet.palette.ink));
  }
  sheet.boxes.push(boundsOf(s));
};

/**
 * A sheet in the domain the split is written for: n (2..8) figures in one
 * row on a flat light ground, each one connected piece outlined in ink 2 px
 * wide and filled with its member's base and shade paints, in slots of one
 * width with each figure 60..100 % of it and 6 or more ground columns
 * between figures; the ground, the ink and the paints carry ±2 per channel
 * of noise; half the sheets hold one 4 × 4 patch of the foreign colour inside
 * each figure; half the figures hold a pale pocket (a garment painted the
 * ground's colour) and half a true gap (a hole of ground ringed in ink);
 * 1..3 specks of 3 × 3 sit above or below each figure, apart from it. Every
 * palette colour lies ΔE 25 or more from every other, and twice the pocket
 * sum or more from the ground.
 */
const generate = (seed: number): Sheet => {
  const d = drawsOf(seed);
  const palette = paletteOf(d);
  const n = d.int(2, 8);
  const slot = d.int(50, 90);
  const gap = d.int(6, 14);
  const margin = d.int(10, 30);
  const sheet = blankSheet(d, palette, n, margin * 2 + n * slot + (n - 1) * gap);
  for (let f = 0; f < n; f++) {
    const width = d.int(Math.ceil(slot * 0.6), slot);
    drawFigure(d, sheet, f, bodyOf(d, margin + f * (slot + gap) + d.int(0, slot - width), width));
  }
  return sheet;
};

const PaletteJson = Schema.fromJsonString(
  Schema.Struct({
    ink: Schema.String,
    parts: Schema.Array(
      Schema.Struct({ name: Schema.String, base: Schema.String, shade: Schema.String }),
    ),
  }),
  { space: 2 },
);

const Box = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});

type Box = typeof Box.Type;

const CellsJson = Schema.fromJsonString(
  Schema.Struct({ sheet: Schema.String, cells: Schema.Array(Box) }),
);

const VerdictJson = Schema.fromJsonString(
  Schema.Struct({
    passed: Schema.Finite,
    total: Schema.Finite,
    checks: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        pass: Schema.Boolean,
        value: Schema.String,
        at: Schema.String,
        bar: Schema.String,
        source: Schema.Literals(['owner', 'orchestrator-proposed']),
      }),
    ),
  }),
);

const Figure = Schema.Struct({
  name: Schema.String,
  member: Schema.String,
  sheet: Schema.String,
  sha256: Schema.String,
});

const ManifestJson = Schema.fromJsonString(
  Schema.Struct({
    shot: Schema.String,
    figures: Schema.Array(Figure),
    frames: Schema.Record(Schema.String, Schema.String),
    set: Schema.Array(Schema.Struct({ file: Schema.String, testArt: Schema.Boolean })),
  }),
);

const RecordJson = Schema.fromJsonString(
  Schema.Struct({
    member: Schema.String,
    id: Schema.String,
    prompt: Schema.String,
    refs: Schema.Array(Schema.Struct({ file: Schema.String, sha256: Schema.String })),
    sheet: Schema.String,
    cells: Schema.Array(Schema.Struct({ key: Schema.String, box: Box, sha256: Schema.String })),
  }),
);

const PlanJson = Schema.fromJsonString(
  Schema.Struct({
    fps: Schema.Finite,
    duration: Schema.Finite,
    frames: Schema.Array(
      Schema.Struct({
        t: Schema.Finite,
        figures: Schema.Array(Schema.Struct({ name: Schema.String, cell: Schema.String })),
      }),
    ),
  }),
);

/** Runs the storybook command and answers its exit code. */
const storybook = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return Number(
      yield* spawner.exitCode(
        ChildProcess.make('bun', [CLI, ...args], { forceKillAfter: '5 seconds' }),
      ),
    );
  });

const split = (sheet: string, cells: number, palette: string, out: string) =>
  storybook(['split', sheet, '--cells', String(cells), '--palette', palette, '--out', out]);

interface Cell {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

const cellOf = (bytes: Uint8Array) =>
  Effect.promise(() => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).pipe(
    Effect.map((r): Cell => ({ data: r.data, width: r.info.width, height: r.info.height })),
  );

const boxText = (b: Box): string => `${b.x},${b.y} ${b.width}x${b.height}`;

/** Whether the cell's size is its box's, and its box holds the whole figure. */
const boxMisses = (sheet: Sheet, i: number, box: Box, cell: Cell): Array<string> => {
  const misses: Array<string> = [];
  if (cell.width !== box.width || cell.height !== box.height)
    misses.push(`cell ${i} is ${cell.width}x${cell.height}, its box ${boxText(box)}`);
  const [x0, y0, x1, y1] = sheet.boxes[i] ?? [0, 0, -1, -1];
  if (x0 < box.x || y0 < box.y || x1 >= box.x + box.width || y1 >= box.y + box.height)
    misses.push(
      `cell ${i}'s box ${boxText(box)} leaves out part of figure ${i} (${x0},${y0} to ${x1},${y1})`,
    );
  return misses;
};

/** One cell pixel against the sheet: clear unless the figure owns it, and then opaque in exactly the colour it snaps to. */
const pixelMiss = (
  sheet: Sheet,
  i: number,
  box: Box,
  cell: Cell,
  u: number,
  v: number,
): Option.Option<string> => {
  const x = box.x + u;
  const y = box.y + v;
  const p = (v * cell.width + u) * 4;
  const alpha = cell.data[p + 3] ?? -1;
  const at = `cell ${i} (${u},${v}) = sheet (${x},${y})`;
  const mine =
    x >= 0 &&
    y >= 0 &&
    x < sheet.width &&
    y < sheet.height &&
    sheet.owner[y * sheet.width + x] === i;
  if (!mine)
    return Option.some(`${at}: not figure ${i}'s, alpha ${alpha}`).pipe(
      Option.filter(() => alpha !== 0),
    );
  const got: Rgb = [cell.data[p] ?? -1, cell.data[p + 1] ?? -1, cell.data[p + 2] ?? -1];
  const k = (y * sheet.width + x) * 3;
  const want: Rgb = [
    sheet.expected[k] ?? -2,
    sheet.expected[k + 1] ?? -2,
    sheet.expected[k + 2] ?? -2,
  ];
  return Option.some(`${at}: ${hexOf(got)} alpha ${alpha}, want ${hexOf(want)} alpha 255`).pipe(
    Option.filter(() => alpha !== 255 || hexOf(got) !== hexOf(want)),
  );
};

const cellMisses = (sheet: Sheet, i: number, box: Box, cell: Cell): Array<string> => {
  const misses = boxMisses(sheet, i, box, cell);
  for (let v = 0; v < cell.height && misses.length < 5; v++)
    for (let u = 0; u < cell.width && misses.length < 5; u++)
      misses.push(...Option.toArray(pixelMiss(sheet, i, box, cell, u, v)));
  return misses;
};

/** One split run of a case: its failures and each cell's bytes. */
const splitRun = (sheet: Sheet, dir: string, png: Uint8Array, out: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const code = yield* split(`${dir}/sheet.png`, sheet.n, `${dir}/palette.json`, out);
    if (code !== 0) return { failures: [`split exited ${code}`], bytes: [] };
    const cells = yield* Schema.decodeEffect(CellsJson)(
      yield* fs.readFileString(`${out}/cells.json`),
    );
    const failures: Array<string> = [];
    if (cells.sheet !== sha256(png))
      failures.push(`cells.json names sheet ${cells.sheet}, not its sha256`);
    if (cells.cells.length !== sheet.n)
      return { failures: [`${cells.cells.length} cells, want ${sheet.n}`], bytes: [] };
    const bytes: Array<Uint8Array> = [];
    for (const [i, box] of cells.cells.entries()) {
      const prev = cells.cells[i - 1];
      if (prev && prev.x + prev.width > box.x)
        failures.push(`cell ${i} overlaps or precedes cell ${i - 1}`);
      const file = yield* fs.readFile(`${out}/cell-${i}.png`);
      bytes.push(file);
      failures.push(...cellMisses(sheet, i, box, yield* cellOf(file)));
    }
    return { failures, bytes };
  });

/** One generated case, split twice: every failure, labelled by its seed. */
const splitCase = (tmp: string, seed: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sheet = generate(seed);
    const dir = `${tmp}/case-${seed}`;
    yield* fs.makeDirectory(dir, { recursive: true });
    const png = yield* Effect.promise(() =>
      sharp(Buffer.from(sheet.rgba), {
        raw: { width: sheet.width, height: sheet.height, channels: 4 },
      })
        .png()
        .toBuffer(),
    );
    yield* fs.writeFile(`${dir}/sheet.png`, png);
    const { ink, parts } = sheet.palette;
    yield* fs.writeFileString(
      `${dir}/palette.json`,
      yield* Schema.encodeEffect(PaletteJson)({
        ink: hexOf(ink),
        parts: parts.map((p) => ({ name: p.name, base: hexOf(p.base), shade: hexOf(p.shade) })),
      }),
    );
    const a = yield* splitRun(sheet, dir, png, `${dir}/a`);
    const b = yield* splitRun(sheet, dir, png, `${dir}/b`);
    const same = a.bytes.map(sha256).join() === b.bytes.map(sha256).join();
    return [
      ...a.failures,
      ...b.failures,
      ...Option.toArray(Option.some('two splits differ in bytes').pipe(Option.filter(() => !same))),
    ].map((f) => `seed ${seed}: ${f}`);
  });

describe('storybook shot sheets: split', () => {
  it.effect(
    'splits every generated sheet into its n figures, each the whole figure alone, every palette pixel snapped exactly, a foreign one kept, twice the same bytes',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const failures: Array<string> = [];
        for (let seed = 1; seed <= 24; seed++) failures.push(...(yield* splitCase(tmp, seed)));
        expect(failures.slice(0, 20)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    120_000,
  );
});

/** One figure of the shot: its sheet is the one its record names and hashes, the record carries the house rules and true refs, and its cells are that sheet's split, byte for byte. */
const checkFigure = (tmp: string, figure: typeof Figure.Type) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const folder = `${CAST}/${figure.member}`;
    const dir = `${folder}/shot-sheets/${figure.sheet}`;
    const sheetPng = yield* fs.readFile(`${dir}/sheet.png`);
    const record = yield* Schema.decodeEffect(RecordJson)(
      yield* fs.readFileString(`${dir}/record.json`),
    );
    expect([record.member, record.id]).toEqual([figure.member, figure.sheet]);
    expect([figure.sha256, record.sheet]).toEqual([sha256(sheetPng), sha256(sheetPng)]);
    expect(record.prompt).toMatch(/no fingers/i);
    expect(record.prompt).toMatch(/wrist/i);
    expect(record.refs.length).toBeGreaterThan(0);
    for (const ref of record.refs)
      expect(sha256(yield* fs.readFile(`${folder}/${ref.file}`))).toBe(ref.sha256);
    const again = `${tmp}/split-${figure.name}`;
    expect(
      yield* split(
        `${dir}/sheet.png`,
        record.cells.length,
        `${folder}/cast-sheet/palette.json`,
        again,
      ),
    ).toBe(0);
    const cells = yield* Schema.decodeEffect(CellsJson)(
      yield* fs.readFileString(`${again}/cells.json`),
    );
    expect(cells.cells).toEqual(record.cells.map((c) => c.box));
    for (const [i, cell] of record.cells.entries()) {
      expect(sha256(yield* fs.readFile(`${dir}/cells/${cell.key}.png`))).toBe(cell.sha256);
      expect(sha256(yield* fs.readFile(`${again}/cell-${i}.png`))).toBe(cell.sha256);
    }
    return record.cells.map((c) => c.key);
  });

/** Every frame of the plan against the figures' sheets: each frame at i / fps draws every figure, each from a cell of its own sheet; answers the stray frames and each figure's cells used. */
const planStrays = (
  plan: typeof PlanJson.Type,
  keys: ReadonlyMap<string, ReadonlyArray<string>>,
) => {
  const names = [...keys.keys()].toSorted().join();
  const used = new Map<string, Set<string>>();
  const strays: Array<string> = [];
  for (const [i, frame] of plan.frames.entries()) {
    if (Math.abs(frame.t - i / plan.fps) > 1e-9) strays.push(`frame ${i} at t ${frame.t}`);
    const drawn = frame.figures.map((f) => f.name);
    if (drawn.toSorted().join() !== names) strays.push(`frame ${i} draws ${drawn.join()}`);
    for (const f of frame.figures) {
      if (!(keys.get(f.name) ?? []).includes(f.cell))
        strays.push(`frame ${i}: ${f.name} draws ${f.cell}, not a cell of its sheet`);
      used.set(f.name, (used.get(f.name) ?? new Set<string>()).add(f.cell));
    }
  }
  return { strays, used };
};

describe('storybook acceptance shot: the feast courtyard', () => {
  it.effect(
    'verifies PASS 9/9 over every frame, each figure drawn only from cells its one recorded sheet splits into, byte for byte',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const out = `${tmp}/verify`;
        expect(yield* storybook(['verify', SHOT, '--out', out])).toBe(0);

        const verdict = yield* Schema.decodeEffect(VerdictJson)(
          yield* fs.readFileString(`${out}/verdict.json`),
        );
        expect(verdict.checks.map((c) => c.id)).toEqual(BAR_IDS);
        expect(verdict.checks.filter((c) => !c.pass)).toEqual([]);
        expect([verdict.passed, verdict.total]).toEqual([BAR_IDS.length, BAR_IDS.length]);
        expect((yield* fs.readFileString(`${out}/verdict.md`)).split('\n')[0]).toBe(
          `PASS ${BAR_IDS.length}/${BAR_IDS.length} pass`,
        );

        const manifest = yield* Schema.decodeEffect(ManifestJson)(
          yield* fs.readFileString(`${out}/manifest.json`),
        );
        expect(manifest.shot).toBe(SHOT);
        expect(manifest.figures.map((f) => f.member).toSorted()).toEqual(MEMBERS);
        expect(manifest.set.length).toBeGreaterThan(0);
        for (const plate of manifest.set)
          expect(yield* fs.exists(`${APP}/${plate.file}`)).toBe(true);

        const keys = new Map<string, ReadonlyArray<string>>();
        for (const figure of manifest.figures)
          keys.set(figure.name, yield* checkFigure(tmp, figure));

        const planFile = `${tmp}/plan.json`;
        expect(yield* storybook(['plan', SHOT, '--out', planFile])).toBe(0);
        const plan = yield* Schema.decodeEffect(PlanJson)(yield* fs.readFileString(planFile));
        expect(plan.duration).toBeGreaterThanOrEqual(10);
        expect(plan.frames).toHaveLength(Math.round(plan.duration * plan.fps));
        expect(Object.keys(manifest.frames)).toHaveLength(plan.frames.length);
        const { strays, used } = planStrays(plan, keys);
        expect(strays.slice(0, 10)).toEqual([]);
        for (const figure of manifest.figures)
          expect(used.get(figure.name)?.size ?? 0).toBeGreaterThanOrEqual(
            [2, 5][Number(figure.member === 'lead-feast')] ?? 5,
          );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    600_000,
  );
});
