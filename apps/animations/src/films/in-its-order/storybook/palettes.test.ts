import * as BunServices from '@effect/platform-bun/BunServices';
import { decodePng, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import {
  clearBackground,
  cropOf,
  deltaE,
  drawnNearestOf,
  groundOf,
  measuredInk,
  paintsOf,
  rgbOfHex,
  snapped,
  tidiedReport,
  withProps,
} from '../../../library/storybook/sheet.ts';
import { RecordJson } from '../../../library/storybook/store.ts';
import { SHEET_CELLS } from './cells.ts';
import { MEASURED, type MeasuredPaint, measureMiss, PALETTES, unsourced } from './palettes.ts';
import { SHEETS } from './sheets.ts';

/** The film's own roles' folders, then the library's: where a member's `cast-sheet/` lies (`castFolder`'s order). */
const ROOTS = [`${import.meta.dir}/../cast`, `${import.meta.dir}/../../../library/cast`] as const;

/** The base each dressed look names, whose hexes its palette may take too: `filler-dressed` is `filler-bases` in house parts. */
const BASES: ReadonlyMap<string, string> = new Map([['filler-dressed', 'filler-bases']]);

/** A member's folder: the first root that holds its `cast-sheet/look.md`. */
const folderOf = Effect.fn('Act1Palettes.folderOf')(function* (member: string) {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* Effect.findFirst(ROOTS, (root) =>
    fs.exists(`${root}/${member}/cast-sheet/look.md`),
  );
  return `${Option.getOrElse(found, () => ROOTS[0])}/${member}`;
});

/** The words a member's palette may take its hexes from: its look, and its base's when it names one. */
const looksOf = Effect.fn('Act1Palettes.looksOf')(function* (member: string) {
  const fs = yield* FileSystem.FileSystem;
  const members = [member, ...Option.toArray(Option.fromUndefinedOr(BASES.get(member)))];
  const looks = yield* Effect.forEach(members, (m) =>
    Effect.flatMap(folderOf(m), (dir) => fs.readFileString(`${dir}/cast-sheet/look.md`)),
  );
  return looks.join('\n').toLowerCase();
});

/** A PNG of a member's folder, decoded. */
const pngIn = Effect.fn('Act1Palettes.pngIn')(function* (member: string, file: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.fromResult(
    decodePng(yield* fs.readFile(`${yield* folderOf(member)}/${file}`)),
  );
});

describe('act 1 palettes', () => {
  for (const [member, palette] of PALETTES)
    it.effect(
      `${member}: every paint, and every prop its sheets paint, is a hex its look (or the base its look names) gives or a measured paint, and the ink is measured on the first ref of its first sheet`,
      () =>
        Effect.gen(function* () {
          const look = yield* looksOf(member);
          const props = SHEETS.filter((s) => s.member === member).flatMap((s) => s.props ?? []);
          const hexes = [...palette.parts, ...props].flatMap((p) => [
            p.base,
            ...Option.toArray(Option.fromUndefinedOr(p.shade)),
          ]);
          expect(unsourced(member, hexes, look, MEASURED)).toEqual([]);
          const first = SHEETS.find((s) => s.member === member)?.refs[0] ?? 'no ref';
          const kept = yield* pngIn(member, `cast-sheet/views/${first}.png`);
          expect(deltaE(measuredInk(kept), rgbOfHex(palette.ink))).toBeLessThanOrEqual(2);
        }).pipe(Effect.provide(BunServices.layer)),
    );

  it.effect(
    'every measured paint reads within ΔE 2 in its box on its own drawing, and is a paint its member takes',
    () =>
      Effect.gen(function* () {
        const misses = yield* Effect.forEach(MEASURED, (m) =>
          Effect.map(pngIn(m.member, m.source), (drawing) =>
            Option.toArray(
              Option.map(
                measureMiss(drawing, m),
                (d) => `${m.member} ${m.hex}: ΔE ${d.toFixed(2)}`,
              ),
            ),
          ),
        );
        expect(misses.flat()).toEqual([]);
        const taken = MEASURED.filter((m) => {
          const props = SHEETS.filter((s) => s.member === m.member).flatMap((s) => s.props ?? []);
          return ![...(PALETTES.get(m.member)?.parts ?? []), ...props].some(
            (p) => p.base === m.hex || p.shade === m.hex,
          );
        });
        expect(taken.map((m) => `${m.member} ${m.hex}`)).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    "each sheet's props are its record's, and the film draws that sheet with its member's palette and those props",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        for (const s of SHEETS) {
          const dir = `${yield* folderOf(s.member)}/shot-sheets/${s.id}`;
          if (!(yield* fs.exists(`${dir}/record.json`))) continue;
          const record = yield* Schema.decodeEffect(RecordJson)(
            yield* fs.readFileString(`${dir}/record.json`),
          );
          expect([s.id, record.props ?? []]).toEqual([s.id, s.props ?? []]);
          const drawn = SHEET_CELLS.get(`${s.member}/${s.id}`);
          const member = PALETTES.get(s.member);
          if (drawn && member) expect(drawn.palette).toEqual(withProps(member, s.props ?? []));
        }
      }).pipe(Effect.provide(BunServices.layer)),
  );
});

describe("the mother's sheet", () => {
  /** Her first figure's head (hair, face, the baby's head) and the stool's left legs, in her sheet's px. */
  const BOXES = [
    { x: 140, y: 60, width: 260, height: 300 },
    { x: 30, y: 700, width: 90, height: 220 },
  ] as const;

  it.effect(
    'splits with no skin pixel repainted past SNAP_RADIUS (critique 1, item 2: her terracotta hair and stool turned cream)',
    () =>
      Effect.gen(function* () {
        const sheet = yield* pngIn('feast-mother', 'shot-sheets/iio-baby/sheet.png');
        const ground = groundOf(sheet);
        const paints = paintsOf(PALETTES.get('feast-mother') ?? { ink: '#000000', parts: [] });
        const far = BOXES.map((box) => {
          const drawn = clearBackground(cropOf(sheet, box), ground);
          const nearest = drawnNearestOf(drawn, paints);
          return tidiedReport(drawn, snapped(drawn, paints, nearest), paints, nearest).skinFar;
        });
        expect(far).toEqual([0, 0]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    "takes her head share as her head (the veil's peak to the collar) over her bare head (her hair's crown to the collar) on her cup cell, within 0.02, so her face draws at the table's width (critique 1, item 2)",
    () =>
      Effect.gen(function* () {
        const cup = yield* pngIn('feast-mother', 'shot-sheets/iio-baby/cells/cup.png');
        const head = SHEET_CELLS.get('feast-mother/iio-baby')?.cells['cup']?.head ?? 0;
        const hair = rgbOfHex('#ca7c65');
        const rowOf = (hit: (q: number) => boolean) =>
          Array.from({ length: cup.height }, (_, y) => y).find((y) =>
            Array.from({ length: cup.width }, (_, x) => y * cup.width + x).some(hit),
          ) ?? 0;
        const top = rowOf((q) => (cup.rgba[q * 4 + 3] ?? 0) > 0);
        const crown = rowOf((q) => hair.every((c, k) => cup.rgba[q * 4 + k] === c));
        const bare = top + head - (crown - 1);
        expect(
          Math.abs((PALETTES.get('feast-mother')?.head ?? 1) - head / bare),
        ).toBeLessThanOrEqual(0.02);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});

describe('measured paints', () => {
  /** A 20 × 20 drawing, flat `hex`. */
  const flat = (hex: string): Raster => {
    const rgba = new Uint8Array(20 * 20 * 4);
    for (let q = 0; q < 400; q++) rgba.set([...rgbOfHex(hex), 255], q * 4);
    return { width: 20, height: 20, rgba };
  };
  const paint: MeasuredPaint = {
    member: 'm',
    hex: '#ca7c65',
    source: 'shot-sheets/s/sheet.png',
    box: { x: 2, y: 2, width: 10, height: 10 },
    what: 'a test patch',
  };

  test('a declared measured paint passes: its member takes it, and its box reads it', () => {
    expect(unsourced('m', ['#CA7C65', '#112233'], 'a look naming #112233', [paint])).toEqual([]);
    expect(measureMiss(flat('#cb7d66'), paint)).toEqual(Option.none());
  });

  test('a paint no look gives and no measured paint of its member declares is unsourced', () => {
    expect(unsourced('m', ['#ca7c65'], 'a look naming #112233', [])).toEqual(['#ca7c65']);
    expect(unsourced('other', ['#ca7c65'], 'a look naming #112233', [paint])).toEqual(['#ca7c65']);
  });

  test('a measured paint whose box reads more than ΔE 2 away fails, naming how far', () => {
    const miss = measureMiss(flat('#d08a70'), paint);
    expect(Option.isSome(miss)).toBe(true);
    expect(Option.getOrElse(miss, () => 0)).toBeGreaterThan(2);
  });
});
