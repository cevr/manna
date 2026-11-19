/**
 * The drive's proof that a bundled font draws its own file (`tools/drive-type.ts`): verse 100's number as each
 * host laid it out in each face (measured by `drive-type`'s probe: Chrome at 10.5035 px, the iOS simulator at
 * 11.16 pt, the default size's figures) is the run its file predicts, and a planted wrong face (a chain that
 * falls back to the system's, or another family's file under the name) is told apart.
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

const TEXT = `${DRAWN_VERSE}`;

/** Verse 100's number on each host, each face's width and height (`layout verse-number-100`), at the size the host drew it. */
const HOSTS = [
  {
    host: 'web',
    size: 10.5035,
    measured: new Map<string, readonly [number, number]>([
      ['newyork', [15.75, 11]],
      ['sf', [20.13, 12]],
      ['literata', [18.34, 15]],
      ['sourceserif', [15.75, 15]],
      ['merriweather', [18.59, 13]],
      ['lora', [20.48, 14]],
      ['inter', [20.44, 13]],
      ['atkinson', [20.14, 13]],
      ['opendyslexic', [20.05, 19]],
    ]),
  },
  {
    host: 'ios',
    size: 11.16,
    measured: new Map<string, readonly [number, number]>([
      ['newyork', [19.65, 14]],
      ['sf', [21.25, 13]],
      ['literata', [19.49, 16]],
      ['sourceserif', [16.74, 16]],
      ['merriweather', [19.75, 14]],
      ['lora', [21.76, 14]],
      ['inter', [21.71, 14]],
      ['atkinson', [21.39, 14]],
      ['opendyslexic', [21.29, 21]],
    ]),
  },
] as const;

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

for (const { host, size, measured } of HOSTS) {
  const run = (key: string): DrawnRun => {
    const [w = Number.NaN, h = Number.NaN] = measured.get(key) ?? [];
    return { w, h, size };
  };

  describe(`${host}: a bundled face drawn from its file`, () => {
    for (const font of bundled)
      it(`${font.key}: its run is its file's, and unlike its fallback's`, () => {
        expect([
          drawsFile(fileOf(font.key), TEXT, run(font.key)),
          drawnApart(run(font.key), run(fallbackOf(font))),
        ]).toEqual([true, true]);
      });
  });

  describe(`${host}: a planted wrong face is red`, () => {
    for (const font of bundled)
      it(`${font.key}: its chain fallen back to ${fallbackOf(font)} does not draw its file`, () => {
        expect(drawsFile(fileOf(font.key), TEXT, run(fallbackOf(font)))).toBe(false);
      });

    it("every other bundled family's file under a bundled name does not draw that name's file", () => {
      const passing = bundled.flatMap((font) =>
        bundled
          .filter((other) => other.key !== font.key)
          .filter((other) => drawsFile(fileOf(font.key), TEXT, run(other.key)))
          .map((other) => `${other.key} as ${font.key}`),
      );
      expect(passing).toEqual([]);
    });
  });
}

it('reads the tabular figures through GSUB: Lora draws 100 wider than its plain figures', () => {
  const lora = fileOf('lora');
  expect(runOf(lora, TEXT, 10.5035).w).toBeCloseTo(20.48, 1);
  expect(lora.tabular('1')).toBeGreaterThan(0.364 + 0.2);
});
