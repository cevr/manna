import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunServices from '@effect/platform-bun/BunServices';
import { rng } from '@manna/film/core';
import { decodePng, encodePng, ImageRoute, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Layer, Option, Result, Schema } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import {
  deltaE,
  hexOf,
  measuredInk,
  type Palette,
  PaletteJson,
  rgbOfHex,
  type Rgb,
  splitSheet,
  withProps,
} from './sheet.ts';
import {
  CAST,
  CLOSE_PAINTS,
  drawSheet,
  GROUNDS,
  groundFor,
  keepSheet,
  libraryCast,
  POSES,
  promptOf,
  readCell,
  readRecord,
  RecordJson,
  resplitSheet,
  sha256,
  sheetDir,
  sheetPalette,
} from './store.ts';

/** SHA-256 in hex by Bun's own hasher: the oracle the store's `Digest` hashes are held to. */
const sha256Of = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

const INK: Rgb = [30, 20, 15];
const BASE: Rgb = [200, 80, 60];
const PAPER: Rgb = [253, 247, 229];

const PALETTE: Palette = {
  ink: hexOf(INK),
  parts: [
    { name: 'cloth', base: hexOf(BASE), shade: '#5a78c8', role: 'garment' },
    { name: 'sandals', base: '#7a5236', role: 'footwear' },
  ],
};

/** A drawn sheet: `n` inked blocks of the base on a flat ground, 8 px apart. */
const sheetOf = (n: number, ground: Rgb): Raster => {
  const [fw, gap, margin, height] = [12, 8, 6, 30];
  const width = margin * 2 + n * fw + (n - 1) * gap;
  const rgba = new Uint8Array(width * height * 4);
  for (let q = 0; q < width * height; q++) {
    const x = q % width;
    const y = Math.floor(q / width);
    const f = Math.floor((x - margin) / (fw + gap));
    const u = x - margin - f * (fw + gap);
    const inFigure = x >= margin && f < n && u < fw && y >= 5 && y < height - 5;
    const edge = u === 0 || u === fw - 1 || y === 5 || y === height - 6;
    const paint = [ground, [BASE, INK][Number(edge)] ?? INK][Number(inFigure)] ?? ground;
    rgba.set([...paint, 255], q * 4);
  }
  return { width, height, rgba };
};

/** A cast holding one member `m`: its palette, look and one kept view. */
const castWith = (palette: Palette) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped();
    const cast = libraryCast(root);
    yield* fs.makeDirectory(`${root}/m/cast-sheet/views`, { recursive: true });
    yield* fs.writeFileString(
      `${root}/m/cast-sheet/palette.json`,
      yield* Schema.encodeEffect(PaletteJson)(palette),
    );
    yield* fs.writeFileString(`${root}/m/cast-sheet/look.md`, 'A plain man in a red robe.\n');
    yield* fs.writeFile(`${root}/m/cast-sheet/views/front.png`, encodePng(sheetOf(1, PAPER)));
    return cast;
  });

/** The services a draw runs on, its route drawing `raster` every time and counting its calls. */
const routeOf = (raster: Raster, calls: Array<string>) =>
  ImageRoute.fake((request) => {
    calls.push(request.prompt);
    return encodePng(raster);
  }).pipe(Layer.provideMerge(Layer.merge(BunServices.layer, BunCrypto.layerDigest)));

describe('drawSheet', () => {
  it.effect(
    'stores the sheet as drawn, one cell per key that a split reproduces, and a record of the prompt, its relative refs and every hash',
    () => {
      const calls: Array<string> = [];
      const drawn = sheetOf(3, PAPER);
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cast = yield* castWith(PALETTE);
        const record = yield* drawSheet(cast, 'm', 's1', ['side', 'front', 'lift'], ['front']);
        const dir = sheetDir(cast, 'm', 's1');
        expect(yield* readRecord(cast, 'm', 's1')).toEqual(record);
        expect(record.refs).toEqual([
          {
            file: 'cast-sheet/views/front.png',
            sha256: sha256Of(yield* fs.readFile(`${cast.dirOf('m')}/cast-sheet/views/front.png`)),
          },
        ]);
        expect(record.sheet).toBe(sha256Of(yield* fs.readFile(`${dir}/sheet.png`)));
        expect([record.size, record.ground, 'kept' in record]).toEqual([
          '1536x1024',
          hexOf(PAPER),
          false,
        ]);
        expect(record.prompt).toBe(calls[0] ?? '');
        const split = Result.getOrThrow(splitSheet(drawn, 3, PALETTE));
        expect(record.cells.map((c) => c.key)).toEqual(['side', 'front', 'lift']);
        expect(record.cells.map((c) => c.box)).toEqual(split.cells.map((c) => c.box));
        for (const [i, cell] of record.cells.entries()) {
          const png = yield* fs.readFile(`${dir}/cells/${cell.key}.png`);
          expect(sha256Of(png)).toBe(cell.sha256);
          expect(png).toEqual(encodePng(split.cells[i]?.raster ?? drawn));
        }
      }).pipe(Effect.scoped, Effect.provide(routeOf(drawn, calls)));
    },
  );

  it.effect('refuses an id drawn already, without calling the route again', () => {
    const calls: Array<string> = [];
    return Effect.gen(function* () {
      const cast = yield* castWith(PALETTE);
      yield* drawSheet(cast, 'm', 's1', ['side', 'front'], ['front']);
      const again = yield* Effect.flip(drawSheet(cast, 'm', 's1', ['side', 'front'], ['front']));
      expect(again._tag).toBe('DrawRefused');
      expect(calls).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(routeOf(sheetOf(2, PAPER), calls)));
  });

  it.effect('refuses a key no pose is written for', () => {
    const calls: Array<string> = [];
    return Effect.gen(function* () {
      const cast = yield* castWith(PALETTE);
      const refused = yield* Effect.flip(drawSheet(cast, 'm', 's1', ['side', 'dance'], ['front']));
      expect(refused.message).toContain('dance');
      expect(calls).toHaveLength(0);
    }).pipe(Effect.scoped, Effect.provide(routeOf(sheetOf(2, PAPER), calls)));
  });

  it.effect(
    'refuses a draw whose split finds fewer figures than keys, and writes no record',
    () => {
      const calls: Array<string> = [];
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cast = yield* castWith(PALETTE);
        const refused = yield* Effect.flip(
          drawSheet(cast, 'm', 's1', ['side', 'front', 'lift'], ['front']),
        );
        expect(refused.message).toContain('finds 2 figures, 3 keys asked');
        expect(yield* fs.exists(sheetDir(cast, 'm', 's1'))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(routeOf(sheetOf(2, PAPER), calls)));
    },
  );

  it.effect('refuses a draw whose ground lies within a channel sum of 60 of a paint', () => {
    const calls: Array<string> = [];
    const near: Rgb = [BASE[0] + 20, BASE[1] + 20, BASE[2] + 10];
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cast = yield* castWith(PALETTE);
      const refused = yield* Effect.flip(drawSheet(cast, 'm', 's1', ['side', 'front'], ['front']));
      expect(refused.message).toContain(`its ground ${hexOf(near)}`);
      expect(yield* fs.exists(`${sheetDir(cast, 'm', 's1')}/record.json`)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(routeOf(sheetOf(2, near), calls)));
  });
});

describe('resplitSheet', () => {
  it.effect(
    'rewrites stale cells as the split cuts the stored sheet now, the drawing, prompt, refs and keep standing',
    () => {
      const calls: Array<string> = [];
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cast = yield* castWith(PALETTE);
        yield* drawSheet(cast, 'm', 's1', ['side', 'front'], ['front']);
        const kept = yield* keepSheet(cast, 'm', 's1', 'keep it', 'abc123');
        const dir = sheetDir(cast, 'm', 's1');
        const stale = encodePng(sheetOf(1, [9, 9, 9]));
        yield* fs.writeFile(`${dir}/cells/side.png`, stale);
        yield* fs.writeFileString(
          `${dir}/record.json`,
          `${yield* Schema.encodeEffect(RecordJson)({
            ...kept,
            cells: kept.cells.map((c) => ({ ...c, sha256: sha256Of(stale) })),
          })}\n`,
        );
        const again = yield* resplitSheet(cast, 'm', 's1');
        expect(again).toEqual(kept);
        expect(yield* readRecord(cast, 'm', 's1')).toEqual(kept);
        for (const cell of again.cells)
          expect(sha256Of(yield* fs.readFile(`${dir}/cells/${cell.key}.png`))).toBe(cell.sha256);
      }).pipe(Effect.scoped, Effect.provide(routeOf(sheetOf(2, PAPER), calls)));
    },
  );

  it.effect('refuses a sheet.png its record does not name', () => {
    const calls: Array<string> = [];
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cast = yield* castWith(PALETTE);
      yield* drawSheet(cast, 'm', 's1', ['side', 'front'], ['front']);
      yield* fs.writeFile(
        `${sheetDir(cast, 'm', 's1')}/sheet.png`,
        encodePng(sheetOf(2, [9, 9, 9])),
      );
      const refused = yield* Effect.flip(resplitSheet(cast, 'm', 's1'));
      expect(refused._tag).toBe('StoreFailed');
    }).pipe(Effect.scoped, Effect.provide(routeOf(sheetOf(2, PAPER), calls)));
  });
});

/** A prop one sheet paints that its member's palette lacks, near its cloth (as the lead's cream bottle lies near his sash): the member's palette alone snaps it to the cloth. */
const PROP = { name: 'bottle', base: '#d26e46', role: 'other' } as const;

/** `sheetOf(n, PAPER)` with an 8 × 13 patch of the prop inside the first figure. */
const sheetWithProp = (n: number): Raster => {
  const drawn = sheetOf(n, PAPER);
  const rgba = drawn.rgba.slice();
  for (let y = 8; y < 21; y++)
    for (let x = 8; x < 16; x++) rgba.set([...rgbOfHex(PROP.base), 255], (y * drawn.width + x) * 4);
  return { ...drawn, rgba };
};

/** Pixels of `r` painted exactly `hex`. */
const painted = (r: Raster, hex: string): number => {
  const [cr, cg, cb] = rgbOfHex(hex);
  let n = 0;
  for (let q = 0; q < r.width * r.height; q++)
    if (r.rgba[q * 4] === cr && r.rgba[q * 4 + 1] === cg && r.rgba[q * 4 + 2] === cb) n++;
  return n;
};

describe('a sheet’s props', () => {
  it.effect(
    'paint a prop on that sheet alone: its record, prompt, cells and re-split keep the prop paint, and another sheet of the member splits with the member’s palette as before',
    () => {
      const calls: Array<string> = [];
      return Effect.gen(function* () {
        const cast = yield* castWith(PALETTE);
        const words = { poses: POSES, rules: [], props: [PROP] };
        const drawn = yield* drawSheet(cast, 'm', 's1', ['side', 'front'], ['front'], words);
        expect(drawn.props).toEqual([PROP]);
        expect(calls[0]).toContain(PROP.base);
        expect(yield* sheetPalette(cast, drawn)).toEqual(withProps(PALETTE, [PROP]));
        const side = yield* readCell(cast, 'm', 's1', 'side');
        expect(painted(side, PROP.base)).toBe(8 * 13);
        const split = Result.getOrThrow(splitSheet(sheetWithProp(2), 2, PALETTE));
        expect(painted(split.cells[0]?.raster ?? side, PROP.base)).toBe(0);
        expect(yield* resplitSheet(cast, 'm', 's1')).toEqual(drawn);
        expect(painted(yield* readCell(cast, 'm', 's1', 'side'), PROP.base)).toBe(8 * 13);
        const plain = yield* drawSheet(cast, 'm', 's2', ['side', 'front'], ['front']);
        expect('props' in plain).toBe(false);
        expect(yield* sheetPalette(cast, plain)).toEqual(PALETTE);
      }).pipe(Effect.scoped, Effect.provide(routeOf(sheetWithProp(2), calls)));
    },
  );
});

describe('readCell', () => {
  it.effect(
    "reads a stored cell's pixels as `decodePng` reads them, colour kept under any alpha (0 and 255 included), over generated cells; refuses bytes that are no PNG",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cast = libraryCast(yield* fs.makeTempDirectoryScoped());
        const dir = `${sheetDir(cast, 'm', 's')}/cells`;
        yield* fs.makeDirectory(dir, { recursive: true });
        for (let seed = 1; seed <= 12; seed++) {
          const draw = rng(seed);
          const [width, height] = [1 + Math.floor(draw() * 40), 1 + Math.floor(draw() * 40)];
          const alphas = [0, 255, 1, 128];
          const rgba = Uint8Array.from({ length: width * height * 4 }, (_, i) => {
            if (i % 4 !== 3) return Math.floor(draw() * 256);
            return alphas[Math.floor(draw() * 5)] ?? Math.floor(draw() * 256);
          });
          const bytes = encodePng({ width, height, rgba });
          yield* fs.writeFile(`${dir}/k${seed}.png`, bytes);
          const read = yield* readCell(cast, 'm', 's', `k${seed}`);
          expect(read).toEqual(Result.getOrThrow(decodePng(bytes)));
          expect(read.rgba).toEqual(rgba);
        }
        yield* fs.writeFile(`${dir}/bad.png`, Uint8Array.of(1, 2, 3));
        const bad = yield* Effect.flip(readCell(cast, 'm', 's', 'bad'));
        expect(bad._tag).toBe('StoreFailed');
        expect(bad.message).toContain(`${dir}/bad.png: `);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});

describe('sha256', () => {
  it.effect("is the SHA-256 of the bytes in hex, as Bun's hasher gives it", () =>
    Effect.gen(function* () {
      for (let seed = 1; seed <= 8; seed++) {
        const draw = rng(seed);
        const bytes = Uint8Array.from({ length: Math.floor(draw() * 300) }, () =>
          Math.floor(draw() * 256),
        );
        expect(yield* sha256(bytes)).toBe(sha256Of(bytes));
      }
    }).pipe(Effect.provide(BunCrypto.layerDigest)),
  );
});

describe('keepSheet', () => {
  it.effect("writes the owner's words and his ask on the record, the rest as drawn", () => {
    const calls: Array<string> = [];
    return Effect.gen(function* () {
      const cast = yield* castWith(PALETTE);
      const drawn = yield* drawSheet(cast, 'm', 's1', ['side', 'front'], ['front']);
      const kept = yield* keepSheet(cast, 'm', 's1', 'keep it', 'abc123');
      expect(yield* readRecord(cast, 'm', 's1')).toEqual(kept);
      expect(kept).toEqual({
        ...drawn,
        kept: { date: kept.kept?.date ?? '', why: 'keep it', ask: 'abc123' },
      });
    }).pipe(Effect.scoped, Effect.provide(routeOf(sheetOf(2, PAPER), calls)));
  });
});

describe('groundFor', () => {
  test('takes the house paper when every paint lies apart from it, and the next ground when a paint is near it', () => {
    expect(groundFor(PALETTE)).toEqual(Option.some(GROUNDS[0]));
    const pale: Palette = { ...PALETTE, parts: [{ name: 'robe', base: '#fdf4e2' }] };
    expect(groundFor(pale)).toEqual(Option.some(GROUNDS[1]));
  });

  test('finds none when every ground lies near a paint', () => {
    const near: Palette = {
      ink: hexOf(INK),
      parts: GROUNDS.map((g, i) => ({ name: `p${i}`, base: g })),
    };
    expect(groundFor(near)).toEqual(Option.none());
  });
});

/** The members the feast courtyard casts, each with its one sheet. */
const MEMBERS = ['lead-feast', 'feast-guest-man', 'feast-guest-woman'] as const;

describe('palette.json', () => {
  for (const member of MEMBERS)
    it.effect(
      `${member}: every paint is a colour its look.md names, and the ink is measured on the first kept view its sheet's refs name`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const folder = CAST.dirOf(member);
          const palette = yield* Schema.decodeEffect(PaletteJson)(
            yield* fs.readFileString(`${folder}/cast-sheet/palette.json`),
          );
          const look = (yield* fs.readFileString(`${folder}/cast-sheet/look.md`)).toLowerCase();
          const hexes = palette.parts.flatMap((p) => [
            p.base,
            ...Option.toArray(Option.fromUndefinedOr(p.shade)),
          ]);
          expect(hexes.filter((h) => !look.includes(h.toLowerCase()))).toEqual([]);
          const record = yield* readRecord(CAST, member, 'feast-courtyard');
          const first = record.refs[0]?.file ?? 'no ref';
          const kept = yield* Effect.fromResult(
            decodePng(yield* fs.readFile(`${folder}/${first}`)),
          );
          expect(deltaE(measuredInk(kept), rgbOfHex(palette.ink))).toBeLessThanOrEqual(2);
        }).pipe(Effect.provide(BunServices.layer)),
    );
});

describe('promptOf', () => {
  const prompt = promptOf('A plain man.', ['side', 'lift'], PALETTE, '#a6dcae');

  test('carries the house rules in words a check can find: round hands, no fingers, sleeves to the wrist, one flat shade', () => {
    expect(prompt).toMatch(/no thumb and no fingers/);
    expect(prompt).toMatch(/Sleeves run to the wrist in every figure/);
    expect(prompt).toMatch(/One flat shade per colour/);
  });

  test('names each pose in order, the continuity clause, every paint and the ground by hex', () => {
    expect(prompt).toMatch(
      /1\. standing in full profile[^\n]*\n2\. facing the viewer, the left hand/,
    );
    expect(prompt).toMatch(/one person drawn 2 times in one pass/);
    for (const hex of [PALETTE.ink, hexOf(BASE), '#5a78c8', '#7a5236', '#a6dcae'])
      expect(prompt).toContain(hex);
    expect(prompt).toContain('sandals #7a5236, drawn flat in that one colour');
  });

  test('outlines every pair of parts whose base paints lie within ΔE 12 in the ink, naming both by hex, and no farther pair', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const draw = rng(seed);
      const channel = () => 120 + Math.floor(draw() * 40);
      const parts = Array.from({ length: 2 + Math.floor(draw() * 4) }, (_, i) => ({
        name: `p${i}`,
        base: hexOf([channel(), channel(), channel()]),
      }));
      const lines = promptOf('A plain man.', ['front'], { ink: hexOf(INK), parts }, '#a6dcae')
        .split('\n')
        .filter((l) => l.startsWith('Close colours: '));
      const close = parts.flatMap((a, i) =>
        parts
          .slice(i + 1)
          .filter((b) => deltaE(rgbOfHex(a.base), rgbOfHex(b.base)) < CLOSE_PAINTS)
          .map((b) => [b.name, b.base, a.name, a.base] as const),
      );
      expect(lines).toHaveLength(close.length);
      for (const [[b, bHex, a, aHex], line] of close.map(
        (pair, k) => [pair, lines[k] ?? ''] as const,
      ))
        expect(line).toMatch(
          new RegExp(
            `^Close colours: the ${a} ${aHex} and the ${b} ${bHex} lie close, so the bold ink ${hexOf(INK)} outline runs between them wherever they meet, and each is painted exactly its own hex`,
          ),
        );
    }
  });

  test("parts the lead's sash from his tunic by its ink outline, as the kept views do, its knot one shape in every figure, and no rose on the clothes (critique 1, items 1 and 11)", () => {
    const lead: Palette = {
      ink: '#130803',
      parts: [
        { name: 'tunic', base: '#f2d8b7', role: 'garment' },
        { name: 'sash', base: '#eadcc2', role: 'sash' },
      ],
    };
    const words = promptOf('A man.', ['front'], lead, '#a6dcae');
    expect(words).toContain(
      'Close colours: the tunic #f2d8b7 and the sash #eadcc2 lie close, so the bold ink #130803 outline runs between them wherever they meet, and each is painted exactly its own hex; the sash reads apart from the tunic by that outline.',
    );
    expect(words).toContain('The sash: outlined all round in the same ink #130803 as the figure');
    expect(words).toContain('the knot the same small round knot in every figure');
    expect(words).toContain('no rose, pink or skin colour anywhere on the clothes');
    expect(words).not.toMatch(/greyer/);
    expect(promptOf('A man.', ['front'], PALETTE, '#a6dcae')).not.toMatch(/^The [a-z]+: outlined/m);
  });

  test("turns the guests' smile toward the viewer's left with the mouth shut, never a gasp, and draws each blink as its pose with the eyes closed (critique 1, items 3, 5 and 9)", () => {
    const words = promptOf(
      'A guest.',
      ['neutral', 'smile', 'turn', 'neutralBlink'],
      PALETTE,
      '#a6dcae',
    );
    expect(words).toMatch(
      /3\. [^\n]*a quarter turned toward the viewer's left[^\n]*the mouth shut/,
    );
    expect(words).not.toMatch(/open mouth|surprised/);
    expect(words).toMatch(
      /4\. seated on the stool exactly as in the first figure[^\n]*eyes closed in a blink/,
    );
    expect(POSES.get('threeQuarterBlink')).toMatch(
      /three-quarters toward the viewer's right[^\n]*eyes closed/,
    );
  });
});
