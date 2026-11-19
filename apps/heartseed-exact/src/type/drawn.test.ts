/**
 * The drive's proof that a bundled font draws its own file (`tools/drive-type.ts`): verse 100's number as
 * Chrome laid it out in each face (measured by `drive-type web` at 10.5035 px, the default size's figures) is
 * the run its file predicts, and a planted wrong face (a chain that falls back to the system's, or another
 * family's file under the name) is told apart.
 */

import { describe, expect, it } from 'bun:test';

import { fontMeasures, readFontFile, readFontFolders } from '../../tools/fonts';
import { TYPE_FONTS } from './choices';
import {
  DRAWN_VERSE,
  drawnApart,
  drawsFile,
  fallbackOf,
  runOf,
  type DrawnRun,
  type FaceFile,
} from './drawn';

const SIZE = 10.5035;
const TEXT = `${DRAWN_VERSE}`;

/** Verse 100's number on the web, each face's (`drive-type web`'s `layout verse-number-100`). */
const MEASURED = new Map<string, readonly [number, number]>([
  ['newyork', [15.75, 11]],
  ['sf', [20.13, 12]],
  ['literata', [18.34, 15]],
  ['sourceserif', [15.75, 15]],
  ['merriweather', [18.59, 13]],
  ['lora', [20.48, 14]],
  ['inter', [20.44, 13]],
  ['atkinson', [20.14, 13]],
  ['opendyslexic', [20.05, 19]],
]);
const run = (key: string): DrawnRun => {
  const [w = Number.NaN, h = Number.NaN] = MEASURED.get(key) ?? [];
  return { w, h, size: SIZE };
};

const files = new Map(
  readFontFolders().map((folder) => {
    const regular = folder.files.find((name) => name.includes('Regular')) ?? '';
    return [folder.key, fontMeasures(readFontFile(`${folder.key}/${regular}`))] as const;
  }),
);
const bundled = TYPE_FONTS.filter((font) => font.bundled !== '');
/** A face with no file: every measure unknown, so no run is its. */
const MISSING: FaceFile = { ascent: Number.NaN, descent: Number.NaN, tabular: () => Number.NaN };
const fileOf = (key: string): FaceFile => files.get(key) ?? MISSING;

describe('a bundled face drawn from its file', () => {
  for (const font of bundled)
    it(`${font.key}: the web's run is its file's, and unlike its fallback's`, () => {
      expect([
        drawsFile(fileOf(font.key), TEXT, run(font.key), 'web'),
        drawnApart(run(font.key), run(fallbackOf(font)), 'web'),
      ]).toEqual([true, true]);
    });

  it('reads the tabular figures through GSUB: Lora draws 100 wider than its plain figures', () => {
    const lora = fileOf('lora');
    expect(runOf(lora, TEXT, SIZE, 'web').w).toBeCloseTo(20.48, 1);
    expect(lora.tabular('1')).toBeGreaterThan(0.364 + 0.2);
  });
});

describe('a planted wrong face is red', () => {
  for (const font of bundled)
    it(`${font.key}: its chain fallen back to ${fallbackOf(font)} does not draw its file`, () => {
      expect(drawsFile(fileOf(font.key), TEXT, run(fallbackOf(font)), 'web')).toBe(false);
    });

  it("every other bundled family's file under a bundled name does not draw that name's file", () => {
    const passing = bundled.flatMap((font) =>
      bundled
        .filter((other) => other.key !== font.key)
        .filter((other) => drawsFile(fileOf(font.key), TEXT, run(other.key), 'web'))
        .map((other) => `${other.key} as ${font.key}`),
    );
    expect(passing).toEqual([]);
  });
});
