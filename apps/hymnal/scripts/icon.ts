/**
 * `bun run icon`: draws every app icon from the one ear of wheat,
 * `assets/icon/ear.svg`, in Heartseed's colours (`src/icon-colours.ts`):
 * its gold ear on its garden ink by day and on its night ground by night,
 * and the launch screen's ear in its ink and its gold.
 *
 * Each row of `icons` is one PNG: its size, its layout (how large the wheat
 * sits on the square), the wheat's colour, and its ground, or none for the
 * Android layers and the launch screen's artwork, which the launcher or the
 * launch screen puts on its own ground. `svgFor` writes the row
 * as an SVG and sharp renders it (`draw`). An icon with a ground is opaque,
 * with no alpha channel. An icon with no ground is the wheat's colour in
 * every pixel, with the shape in the alpha channel alone. The run also writes
 * the web's `favicon.svg` (the light icon's colours, the dark icon's in dark
 * mode) and `manifest.webmanifest`.
 *
 * A native build reads the new icons only after `bun run prebuild:native`.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import sharp from 'sharp';

import { type Face, icon as faces, launch } from '../src/icon-colours.ts';

/**
 * How the wheat sits on its square, centred on the shape's box:
 * - `full`: the box fits the central square of side 0.78.
 * - `favicon`: the box fits the central square of side 0.92, as large as a
 *   16 px tab allows.
 * - `adaptive`: the box's half-diagonal is 0.29 of the side, inside
 *   Android's safe circle (radius 33/108 ≈ 0.3056).
 * - `maskable`: the box's half-diagonal is 0.38 of the side, inside the
 *   W3C maskable safe circle (radius 0.40).
 */
export type Layout = 'full' | 'favicon' | 'adaptive' | 'maskable';

export interface Icon {
  /** Under the app's root. */
  readonly file: string;
  readonly size: number;
  readonly layout: Layout;
  readonly wheat: string;
  /** None: a transparent ground. */
  readonly ground: Option.Option<string>;
}

/** A face drawn whole: its mark on its ground. */
const on = (face: Face) => ({ wheat: face.mark, ground: Option.some(face.ground) });
/** A face's mark alone, on the transparent ground its launcher or launch screen fills. */
const cut = (wheat: string) => ({ wheat, ground: Option.none<string>() });

export const icons: ReadonlyArray<Icon> = [
  { file: 'assets/icon/ios-light.png', size: 1024, layout: 'full', ...on(faces.light) },
  { file: 'assets/icon/ios-dark.png', size: 1024, layout: 'full', ...on(faces.dark) },
  { file: 'assets/icon/ios-tinted.png', size: 1024, layout: 'full', ...on(faces.tinted) },
  {
    file: 'assets/icon/android-foreground.png',
    size: 1024,
    layout: 'adaptive',
    ...cut(faces.light.mark),
  },
  {
    file: 'assets/icon/android-monochrome.png',
    size: 1024,
    layout: 'adaptive',
    ...cut(faces.tinted.mark),
  },
  { file: 'public/splash.png', size: 1024, layout: 'full', ...cut(launch.light.mark) },
  { file: 'public/splash-dark.png', size: 1024, layout: 'full', ...cut(launch.dark.mark) },
  { file: 'public/apple-touch-icon.png', size: 180, layout: 'full', ...on(faces.light) },
  { file: 'public/icon-192.png', size: 192, layout: 'full', ...on(faces.light) },
  { file: 'public/icon-512.png', size: 512, layout: 'full', ...on(faces.light) },
  { file: 'public/icon-maskable-512.png', size: 512, layout: 'maskable', ...on(faces.light) },
  { file: 'public/favicon-32.png', size: 32, layout: 'favicon', ...on(faces.light) },
];

/** The wheat's path and the box its `viewBox` draws tight around it. */
export interface Wheat {
  readonly d: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The master every icon is drawn from, under the app's root. */
export const MASTER = 'assets/icon/ear.svg';

/** The master had no `viewBox` of four numbers with a width and height, or no path. */
export class WheatUnreadable extends Schema.TaggedError<WheatUnreadable>()('WheatUnreadable', {
  reason: Schema.String,
}) {
  override get message() {
    return `${MASTER}: ${this.reason}`;
  }
}

const boxOf = (svg: string) =>
  Option.fromNullishOr(/viewBox="([^"]+)"/.exec(svg)?.[1]).pipe(
    Option.map((text) => text.trim().split(/\s+/).map(Number)),
    Option.flatMap(([x = 0, y = 0, width = 0, height = 0, ...rest]) =>
      Option.liftPredicate(
        { x, y, width, height },
        (box) =>
          rest.length === 0 && [x, y].every(Number.isFinite) && box.width > 0 && box.height > 0,
      ),
    ),
  );

/** Reads the shape out of the master's text. */
export const wheatOf = (svg: string): Effect.Effect<Wheat, WheatUnreadable> =>
  Effect.gen(function* () {
    const box = yield* Effect.fromOption(boxOf(svg)).pipe(
      Effect.mapError(() => WheatUnreadable.make({ reason: 'no viewBox of four numbers' })),
    );
    const d = yield* Effect.fromOption(
      Option.fromNullishOr(/<path[^>]*\sd="([^"]+)"/.exec(svg)?.[1]),
    ).pipe(Effect.mapError(() => WheatUnreadable.make({ reason: 'no path' })));
    return { d, ...box };
  });

const scales: Record<Layout, (wheat: Wheat, size: number) => number> = {
  full: (wheat, size) => (0.78 * size) / Math.max(wheat.width, wheat.height),
  favicon: (wheat, size) => (0.92 * size) / Math.max(wheat.width, wheat.height),
  adaptive: (wheat, size) => (2 * 0.29 * size) / Math.hypot(wheat.width, wheat.height),
  maskable: (wheat, size) => (2 * 0.38 * size) / Math.hypot(wheat.width, wheat.height),
};

const num = (n: number) => String(Math.round(n * 10_000) / 10_000);

/** The wheat's path, scaled and centred on a square of `size` by `layout`. */
const placed = (wheat: Wheat, layout: Layout, size: number, paint: string) => {
  const s = scales[layout](wheat, size);
  const tx = size / 2 - s * (wheat.x + wheat.width / 2);
  const ty = size / 2 - s * (wheat.y + wheat.height / 2);
  return `<path transform="translate(${num(tx)} ${num(ty)}) scale(${num(s)})"${paint} fill-rule="evenodd" d="${wheat.d}"/>`;
};

/** One icon as an SVG: its ground (when it has one), then the wheat in its colour. */
export const svgFor = (wheat: Wheat, icon: Icon): string => {
  const ground = Option.match(icon.ground, {
    onNone: () => '',
    onSome: (fill) => `<rect width="${icon.size}" height="${icon.size}" fill="${fill}"/>`,
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.size}" height="${icon.size}" ` +
    `viewBox="0 0 ${icon.size} ${icon.size}">${ground}` +
    `${placed(wheat, icon.layout, icon.size, ` fill="${icon.wheat}"`)}</svg>`
  );
};

/** sharp could not draw an icon. */
export class DrawFailed extends Schema.TaggedError<DrawFailed>()('DrawFailed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.reason}`;
  }
}

const sharply = <A>(icon: Icon, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => DrawFailed.make({ file: icon.file, reason: String(cause) }),
  });

/**
 * One icon as PNG bytes. A grounded icon is flattened to three channels. A
 * groundless one is a plate of the wheat's colour that takes the render's
 * alpha, so no pixel's colour drifts at the antialiased edge.
 */
export const draw = (wheat: Wheat, icon: Icon): Effect.Effect<Buffer, DrawFailed> => {
  const svg = Buffer.from(svgFor(wheat, icon));
  const side = { width: icon.size, height: icon.size };
  return Option.match(icon.ground, {
    onSome: () => sharply(icon, () => sharp(svg).removeAlpha().png().toBuffer()),
    onNone: () =>
      sharply(icon, () => sharp(svg).ensureAlpha().extractChannel(3).raw().toBuffer()).pipe(
        Effect.flatMap((alpha) =>
          sharply(icon, () =>
            sharp({ create: { ...side, channels: 3, background: icon.wheat } })
              .joinChannel(alpha, { raw: { ...side, channels: 1 } })
              .png()
              .toBuffer(),
          ),
        ),
      ),
  });
};

/** The tab's icon: the light icon's colours, and the dark icon's when the system is dark. */
export const faviconSvg = (wheat: Wheat, light: Face, dark: Face): string =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<style>rect{fill:${light.ground}}path{fill:${light.mark}}@media (prefers-color-scheme: dark){rect{fill:${dark.ground}}path{fill:${dark.mark}}}</style>`,
    '<rect width="32" height="32"/>',
    placed(wheat, 'favicon', 32, ''),
    '</svg>',
    '',
  ].join('\n');

/** The web app manifest's fields this app sets. */
export const WebManifest = Schema.Struct({
  name: Schema.String,
  short_name: Schema.String,
  start_url: Schema.String,
  background_color: Schema.String,
  icons: Schema.Array(
    Schema.Struct({
      src: Schema.String,
      sizes: Schema.String,
      type: Schema.String,
      purpose: Schema.String,
    }),
  ),
});

/** `manifest.webmanifest`'s text: two-space JSON and a final newline. */
export const WebManifestJson = Schema.fromJsonString(WebManifest, { space: 2 });

/** The name, the ground, and the icons a browser may install. */
export const manifest = `${Schema.encodeSync(WebManifestJson)({
  name: 'Hymnal',
  short_name: 'Hymnal',
  start_url: '/',
  background_color: launch.light.ground,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
})}\n`;

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '..');
  const at = (file: string) => path.join(root, file);
  const wheat = yield* wheatOf(yield* fs.readFileString(at(MASTER)));
  yield* Effect.forEach(
    icons,
    (icon) =>
      draw(wheat, icon).pipe(
        Effect.flatMap((png) => fs.writeFile(at(icon.file), png)),
        Effect.andThen(Console.log(`[icon] ${icon.file} ${icon.size} px`)),
      ),
    { concurrency: 4 },
  );
  yield* fs.writeFileString(at('public/favicon.svg'), faviconSvg(wheat, faces.light, faces.dark));
  yield* fs.writeFileString(at('public/manifest.webmanifest'), manifest);
  yield* Console.log('[icon] public/favicon.svg, public/manifest.webmanifest');
});

if (import.meta.main) run.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
