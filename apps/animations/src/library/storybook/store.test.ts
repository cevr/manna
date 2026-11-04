import * as BunServices from '@effect/platform-bun/BunServices';
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
} from './sheet.ts';
import {
  CAST,
  drawSheet,
  GROUNDS,
  groundFor,
  keepSheet,
  promptOf,
  readRecord,
  sha256,
  sheetDir,
} from './store.ts';

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
    const cast = yield* fs.makeTempDirectoryScoped();
    yield* fs.makeDirectory(`${cast}/m/cast-sheet/views`, { recursive: true });
    yield* fs.writeFileString(
      `${cast}/m/cast-sheet/palette.json`,
      yield* Schema.encodeEffect(PaletteJson)(palette),
    );
    yield* fs.writeFileString(`${cast}/m/cast-sheet/look.md`, 'A plain man in a red robe.\n');
    yield* fs.writeFile(`${cast}/m/cast-sheet/views/front.png`, encodePng(sheetOf(1, PAPER)));
    return cast;
  });

/** The services a draw runs on, its route drawing `raster` every time and counting its calls. */
const routeOf = (raster: Raster, calls: Array<string>) =>
  ImageRoute.fake((request) => {
    calls.push(request.prompt);
    return encodePng(raster);
  }).pipe(Layer.provideMerge(BunServices.layer));

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
            sha256: sha256(yield* fs.readFile(`${cast}/m/cast-sheet/views/front.png`)),
          },
        ]);
        expect(record.sheet).toBe(sha256(yield* fs.readFile(`${dir}/sheet.png`)));
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
          expect(sha256(png)).toBe(cell.sha256);
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
          const folder = `${CAST}/${member}`;
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
});
