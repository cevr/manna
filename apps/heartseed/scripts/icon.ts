/**
 * `bun run icon`: draws every app icon and both launch screens' artwork
 * from the one mark, `assets/icon/heartseed.svg` (brand C, "Two leaves": a
 * seedling whose two first leaves open into a heart), in the colours of
 * `src/theme.ts`: the icon's own ground and mark by day and by night, and the
 * app's ink for the launch screens, which stand on the app's ground.
 *
 * Each row of `icons` is one PNG: its size, its layout (how large the mark
 * sits on the square), the mark's colour, and its ground, or none for the
 * Android layers and the launch screens' artwork, which the launcher or the
 * launch screen puts on its own ground. `svgFor` writes the row as an SVG
 * and sharp renders it (`draw`). An icon with a ground is opaque, with no
 * alpha channel. An icon with no ground is the mark's colour in every pixel,
 * with the shape in the alpha channel alone. The web is not a target, so
 * the run writes no web icon.
 *
 * A native build reads the new icons only after `bun run prebuild:native`.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import sharp from 'sharp';

import { icon as iconColours, theme } from '../src/theme.ts';

/**
 * How the mark sits on its square, centred on the shape's box:
 * - `full`: the box fits the central square of side 0.72.
 * - `adaptive`: the box's half-diagonal is 0.29 of the side, inside
 *   Android's safe circle (radius 33/108 ≈ 0.3056).
 */
export type Layout = 'full' | 'adaptive';

export interface Icon {
  /** Under the app's root. */
  readonly file: string;
  readonly size: number;
  readonly layout: Layout;
  readonly mark: string;
  /** None: a transparent ground. */
  readonly ground: Option.Option<string>;
}

const on = (ground: string) => Option.some(ground);
const clear = Option.none<string>();

export const icons: ReadonlyArray<Icon> = [
  {
    file: 'assets/icon/ios-light.png',
    size: 1024,
    layout: 'full',
    mark: iconColours.light.mark,
    ground: on(iconColours.light.ground),
  },
  {
    file: 'assets/icon/ios-dark.png',
    size: 1024,
    layout: 'full',
    mark: iconColours.dark.mark,
    ground: on(iconColours.dark.ground),
  },
  {
    file: 'assets/icon/ios-tinted.png',
    size: 1024,
    layout: 'full',
    mark: iconColours.tinted.mark,
    ground: on(iconColours.tinted.ground),
  },
  {
    file: 'assets/icon/android-foreground.png',
    size: 1024,
    layout: 'adaptive',
    mark: iconColours.light.mark,
    ground: clear,
  },
  {
    file: 'assets/icon/android-monochrome.png',
    size: 1024,
    layout: 'adaptive',
    mark: iconColours.tinted.mark,
    ground: clear,
  },
  {
    file: 'assets/icon/splash.png',
    size: 1024,
    layout: 'full',
    mark: theme.light.ink,
    ground: clear,
  },
  {
    file: 'assets/icon/splash-dark.png',
    size: 1024,
    layout: 'full',
    mark: theme.dark.ink,
    ground: clear,
  },
];

/** The mark's path and the box its `viewBox` draws tight around it. */
export interface Mark {
  readonly d: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `heartseed.svg` had no `viewBox` of four numbers with a width and height, or no path. */
export class MarkUnreadable extends Schema.TaggedError<MarkUnreadable>()('MarkUnreadable', {
  reason: Schema.String,
}) {
  override get message() {
    return `assets/icon/heartseed.svg: ${this.reason}`;
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

/** Reads the shape out of `heartseed.svg`'s text. */
export const markOf = (svg: string): Effect.Effect<Mark, MarkUnreadable> =>
  Effect.gen(function* () {
    const box = yield* Effect.fromOption(boxOf(svg)).pipe(
      Effect.mapError(() => MarkUnreadable.make({ reason: 'no viewBox of four numbers' })),
    );
    const d = yield* Effect.fromOption(
      Option.fromNullishOr(/<path[^>]*\sd="([^"]+)"/.exec(svg)?.[1]),
    ).pipe(Effect.mapError(() => MarkUnreadable.make({ reason: 'no path' })));
    return { d, ...box };
  });

const scales: Record<Layout, (mark: Mark, size: number) => number> = {
  full: (mark, size) => (0.72 * size) / Math.max(mark.width, mark.height),
  adaptive: (mark, size) => (2 * 0.29 * size) / Math.hypot(mark.width, mark.height),
};

const num = (n: number) => String(Math.round(n * 10_000) / 10_000);

/** The mark's path, scaled and centred on a square of `size` by `layout`. */
const placed = (mark: Mark, layout: Layout, size: number, fill: string) => {
  const s = scales[layout](mark, size);
  const tx = size / 2 - s * (mark.x + mark.width / 2);
  const ty = size / 2 - s * (mark.y + mark.height / 2);
  return `<path transform="translate(${num(tx)} ${num(ty)}) scale(${num(s)})" fill="${fill}" fill-rule="evenodd" d="${mark.d}"/>`;
};

/** One icon as an SVG: its ground (when it has one), then the mark in its colour. */
export const svgFor = (mark: Mark, icon: Icon): string => {
  const ground = Option.match(icon.ground, {
    onNone: () => '',
    onSome: (fill) => `<rect width="${icon.size}" height="${icon.size}" fill="${fill}"/>`,
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.size}" height="${icon.size}" ` +
    `viewBox="0 0 ${icon.size} ${icon.size}">${ground}` +
    `${placed(mark, icon.layout, icon.size, icon.mark)}</svg>`
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
 * groundless one is a plate of the mark's colour that takes the render's
 * alpha, so no pixel's colour drifts at the antialiased edge.
 */
export const draw = (mark: Mark, icon: Icon): Effect.Effect<Buffer, DrawFailed> => {
  const svg = Buffer.from(svgFor(mark, icon));
  const side = { width: icon.size, height: icon.size };
  return Option.match(icon.ground, {
    onSome: () => sharply(icon, () => sharp(svg).removeAlpha().png().toBuffer()),
    onNone: () =>
      sharply(icon, () => sharp(svg).ensureAlpha().extractChannel(3).raw().toBuffer()).pipe(
        Effect.flatMap((alpha) =>
          sharply(icon, () =>
            sharp({ create: { ...side, channels: 3, background: icon.mark } })
              .joinChannel(alpha, { raw: { ...side, channels: 1 } })
              .png()
              .toBuffer(),
          ),
        ),
      ),
  });
};

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '..');
  const at = (file: string) => path.join(root, file);
  const mark = yield* markOf(yield* fs.readFileString(at('assets/icon/heartseed.svg')));
  yield* Effect.forEach(
    icons,
    (icon) =>
      draw(mark, icon).pipe(
        Effect.flatMap((png) => fs.writeFile(at(icon.file), png)),
        Effect.andThen(Console.log(`[icon] ${icon.file} ${icon.size} px`)),
      ),
    { concurrency: 4 },
  );
});

if (import.meta.main) run.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
