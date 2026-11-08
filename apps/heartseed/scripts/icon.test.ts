/**
 * The app icon and the launch screens' artwork, held to their one mark and
 * their colours: the native manifest names the files drawn here, on the
 * icon's grounds and the app's, and One validates it; every pixel of every icon is its ground, its mark or a
 * blend of the two; the mark sits at its layout's size; the Android layers
 * stay inside the launcher's safe circle; and every committed file is, byte
 * for byte, what `bun run icon` draws from `assets/icon/heartseed.svg` now.
 *
 * The expected colours come from `src/theme.ts`, not from the script's
 * table, so a wrong row in the table is red too.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option } from 'effect';
import { validateNativeApp } from 'one/native';
import sharp from 'sharp';

import { icon, theme } from '../src/theme.ts';
import { app } from '../vite/app.ts';
import { draw, icons, markOf } from './icon.ts';

const test = it.effect.layer(BunServices.layer);

/** scripts/ → the app's root. */
const ROOT = `${import.meta.dir}/..`;
const SIDE = 1024;
/** The `full` layout: the mark's box fits the central square of this share of the side. */
const FULL = 0.72;
/** Android's adaptive icon safe circle, as a share of the side. */
const SAFE = 33 / 108;

type Rgb = readonly [number, number, number];
interface Pixels {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** A PNG's pixels, from a file under the app's root. */
const decode = (file: string) =>
  Effect.promise(() => sharp(`${ROOT}/${file}`).raw().toBuffer({ resolveWithObject: true })).pipe(
    Effect.map(({ data, info }): Pixels => ({
      data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    })),
  );

/** Each opaque icon's file, ground and mark. */
const opaque: ReadonlyArray<readonly [string, string, string]> = [
  ['assets/icon/ios-light.png', icon.light.ground, icon.light.mark],
  ['assets/icon/ios-dark.png', icon.dark.ground, icon.dark.mark],
  ['assets/icon/ios-tinted.png', '#000000', '#ffffff'],
];

/** Each groundless layer's file, mark, and whether it must sit inside Android's safe circle. */
const layers: ReadonlyArray<readonly [string, string, boolean]> = [
  ['assets/icon/android-foreground.png', icon.light.mark, true],
  ['assets/icon/android-monochrome.png', '#ffffff', true],
  ['assets/icon/splash.png', theme.light.ink, false],
  ['assets/icon/splash-dark.png', theme.dark.ink, false],
];

/** The box (`width` × `height`) of the pixels `drawn` holds, and the first drawn pixel farther than `radius` × side from the centre. */
const extent = (p: Pixels, drawn: (i: number) => boolean, radius: number) => {
  let [left, top, right, bottom] = [p.width, p.height, -1, -1];
  let outside = 'none';
  const r2 = (radius * p.width) ** 2;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      if (!drawn((y * p.width + x) * p.channels)) continue;
      [left, top, right, bottom] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
      ];
      const [dx, dy] = [x + 0.5 - p.width / 2, y + 0.5 - p.height / 2];
      if (outside === 'none' && dx * dx + dy * dy > r2) outside = `${x},${y}`;
    }
  return { width: right - left + 1, height: bottom - top + 1, outside };
};

/**
 * How far a pixel lies off the segment from ground to mark (the worst
 * channel's distance from its nearest point there), and where on it it
 * falls: 0 the ground, 1 the mark.
 */
const offSegment = (p: Pixels, i: number, ground: Rgb, mark: Rgb) => {
  const span = [mark[0] - ground[0], mark[1] - ground[1], mark[2] - ground[2]] as const;
  const length2 = span[0] ** 2 + span[1] ** 2 + span[2] ** 2;
  const along = [0, 1, 2].reduce(
    (sum, c) => sum + (span[c] ?? 0) * (p.data.readUInt8(i + c) - (ground[c] ?? 0)),
    0,
  );
  const t = Math.min(1, Math.max(0, along / length2));
  const off = Math.max(
    ...[0, 1, 2].map((c) =>
      Math.abs(p.data.readUInt8(i + c) - ((ground[c] ?? 0) + t * (span[c] ?? 0))),
    ),
  );
  return { off, t };
};

/** The share of the side the mark's box takes at the `full` layout, read from a drawn icon. */
const boxShare = (box: { readonly width: number; readonly height: number }) =>
  Math.max(box.width, box.height) / SIDE;

describe('the app icon', () => {
  test('names the app Heartseed, passes One for iOS and Android, and leaves the appearance to the system', () =>
    Effect.sync(() => {
      expect(() => validateNativeApp(app, 'ios')).not.toThrow();
      expect(() => validateNativeApp(app, 'android')).not.toThrow();
      expect(app.name).toBe('Heartseed');
      expect(Object.hasOwn(app, 'userInterfaceStyle')).toBe(false);
    }));

  test('names the files drawn here, in the icon’s colours, and the launch screens on the app’s ground', () =>
    Effect.sync(() => {
      const { splash, android } = app;
      expect({
        icon: [app.icon.source, app.icon.backgroundColor],
        dark: [app.icon.dark.source, app.icon.dark.backgroundColor],
        tinted: [app.icon.tinted.source, app.icon.tinted.backgroundColor],
        foreground: [android.adaptiveIcon.foreground, android.adaptiveIcon.backgroundColor],
        monochrome: android.adaptiveIcon.monochrome,
        splash: [splash.source, splash.backgroundColor, splash.width],
        splashDark: [splash.dark.source, splash.dark.backgroundColor],
      }).toEqual({
        icon: ['./assets/icon/ios-light.png', icon.light.ground],
        dark: ['./assets/icon/ios-dark.png', icon.dark.ground],
        tinted: ['./assets/icon/ios-tinted.png', '#000000'],
        foreground: ['./assets/icon/android-foreground.png', icon.light.ground],
        monochrome: './assets/icon/android-monochrome.png',
        splash: ['./assets/icon/splash.png', theme.light.ground, 224],
        splashDark: ['./assets/icon/splash-dark.png', theme.dark.ground],
      });
    }));

  test('the script draws exactly the files held here', () =>
    Effect.sync(() => {
      expect(icons.map((row) => row.file).toSorted()).toEqual(
        [...opaque.map(([file]) => file), ...layers.map(([file]) => file)].toSorted(),
      );
    }));

  test('draws each opaque icon at 1024 px as its ground, its mark or a blend, the mark at 0.72 of the side', () =>
    Effect.forEach(
      opaque,
      ([file, groundHex, markHex]) =>
        decode(file).pipe(
          Effect.map((p) => {
            const [ground, mark] = [rgb(groundHex), rgb(markHex)];
            let first = Option.none<string>();
            let marked = 0;
            const inMark = new Uint8Array(p.width * p.height);
            for (let i = 0; i < p.data.length; i += p.channels) {
              const { off, t } = offSegment(p, i, ground, mark);
              if (off > 2 && Option.isNone(first)) first = Option.some(String(i / p.channels));
              if (off === 0 && t === 1) marked++;
              inMark[i / p.channels] = Number(t > 0.5);
            }
            const box = extent(p, (i) => inMark[i / p.channels] === 1, 1);
            return {
              file,
              side: [p.width, p.height, p.channels],
              offBlend: Option.getOrElse(first, () => 'none'),
              solidMark: marked >= 0.12 * p.width * p.height,
              share: Math.abs(boxShare(box) - FULL) <= 3 / SIDE,
            };
          }),
        ),
      { concurrency: 3 },
    ).pipe(
      Effect.map((rows) =>
        expect(rows).toEqual(
          opaque.map(([file]) => ({
            file,
            side: [SIDE, SIDE, 3],
            offBlend: 'none',
            solidMark: true,
            share: true,
          })),
        ),
      ),
    ));

  test('draws each layer at 1024 px in its mark’s colour alone, the Android ones inside the safe circle and the launch ones at 0.72', () =>
    Effect.forEach(
      layers,
      ([file, markHex, circle]) =>
        decode(file).pipe(
          Effect.map((p) => {
            const mark = rgb(markHex);
            let offColour = 0;
            for (let i = 0; i < p.data.length; i += p.channels)
              if (
                p.data.readUInt8(i + 3) > 0 &&
                [0, 1, 2].some((c) => Math.abs(p.data.readUInt8(i + c) - (mark[c] ?? 0)) > 1)
              )
                offColour++;
            const box = extent(p, (i) => p.data.readUInt8(i + 3) > 127, SAFE);
            const seen = extent(p, (i) => p.data.readUInt8(i + 3) > 0, SAFE);
            return {
              file,
              side: [p.width, p.height, p.channels],
              offColour,
              placed:
                (circle && seen.outside === 'none') ||
                (!circle && Math.abs(boxShare(box) - FULL) <= 3 / SIDE),
            };
          }),
        ),
      { concurrency: 4 },
    ).pipe(
      Effect.map((rows) =>
        expect(rows).toEqual(
          layers.map(([file]) => ({
            file,
            side: [SIDE, SIDE, 4],
            offColour: 0,
            placed: true,
          })),
        ),
      ),
    ));

  test('commits, byte for byte, what bun run icon draws from the mark now', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const mark = yield* markOf(yield* fs.readFileString(`${ROOT}/assets/icon/heartseed.svg`));
      const drifted = yield* Effect.forEach(
        icons,
        (row) =>
          Effect.all([fs.readFile(`${ROOT}/${row.file}`), draw(mark, row)], {
            concurrency: 2,
          }).pipe(
            Effect.map(([kept, fresh]) => [row.file, Buffer.from(kept).equals(fresh)] as const),
          ),
        { concurrency: 7 },
      );
      expect(drifted.filter(([, same]) => !same).map(([file]) => file)).toEqual([]);
    }));
});
