import * as BunServices from '@effect/platform-bun/BunServices';
import type { Raster } from '@manna/film/tools';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { deltaE, measuredInk, rgbOfHex, withProps } from '../../../library/storybook/sheet.ts';
import { RecordJson } from '../../../library/storybook/store.ts';
import { folderOf, pngIn } from './cast-files.ts';
import { SHEET_CELLS } from './cells.ts';
import { MEASURED, type MeasuredPaint, measureMiss, PALETTES, unsourced } from './palettes.ts';
import { SHEETS } from './sheets.ts';

/** The base each dressed look names, whose hexes its palette may take too: `filler-dressed` is `filler-bases` in house parts. */
const BASES: ReadonlyMap<string, string> = new Map([['filler-dressed', 'filler-bases']]);

/** The words a member's palette may take its hexes from: its look, and its base's when it names one. */
const looksOf = Effect.fn('Act1Palettes.looksOf')(function* (member: string) {
  const fs = yield* FileSystem.FileSystem;
  const members = [member, ...Option.toArray(Option.fromUndefinedOr(BASES.get(member)))];
  const looks = yield* Effect.forEach(members, (m) =>
    Effect.flatMap(folderOf(m), (dir) => fs.readFileString(`${dir}/cast-sheet/look.md`)),
  );
  return looks.join('\n').toLowerCase();
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
