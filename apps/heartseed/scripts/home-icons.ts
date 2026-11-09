/**
 * `bun run home-icons`: draws the home's hand-drawn icons from their masters,
 * `assets/home/<name>.svg`, once for each scheme. The masters are drawn in
 * the prototype's Palette A; `recolour` maps each of their hexes to the
 * role `src/theme.ts`'s `masters` names (or keeps it, for the gold family's
 * two shades in `kept`), and fails on a colour no table names. sharp then
 * renders the SVG at three times its 48 user units, a 144 px RGBA PNG on a
 * transparent ground, written beside its master as
 * `assets/home/<name>-<scheme>.png` with its type declaration
 * (`DECLARATION`). One's dev asset plugin registers one scale, so a screen
 * draws an icon at 48 pt or less.
 *
 * Redraw after a change to a master or to a role the masters map to.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import sharp from 'sharp';

import { kept, masters, type Scheme, theme } from '../src/theme.ts';

/** The schemes each master is drawn for. */
export const SCHEMES: ReadonlyArray<Scheme> = ['light', 'dark'];

/** Each PNG's declaration, as oxfmt writes it: the import's type under One's native bundler. */
export const DECLARATION = `/** The PNG as One's native bundler hands it over: an asset id (under \`bun test\`, the file's path). */
declare const asset: number;
export default asset;
`;

/** A master holds a colour token that neither `masters` nor `kept` names. */
export class UnmappedColour extends Schema.TaggedError<UnmappedColour>()('UnmappedColour', {
  file: Schema.String,
  hex: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.hex} is neither a master's colour nor kept`;
  }
}

/** sharp could not draw an icon. */
export class DrawFailed extends Schema.TaggedError<DrawFailed>()('DrawFailed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.reason}`;
  }
}

const TOKEN = /#[0-9a-f]+/giu;

/** A colour token's colour in `scheme`: its role's for a master's hex, itself for a kept one, none for any other. */
const colourOf = (token: string, scheme: Scheme): Option.Option<string> => {
  const hex = token.toLowerCase();
  if (hex.length !== 7) return Option.none();
  if (kept.includes(hex)) return Option.some(token);
  return Option.fromNullishOr(masters[hex]).pipe(Option.map((role) => theme[scheme][role]));
};

/**
 * A master's text with each colour token (`#` and one or more hex digits)
 * drawn in `scheme`: a master's hex becomes its role's colour, a kept hex
 * stays as written, and any other token fails with `UnmappedColour`.
 * Nothing else in the text changes.
 */
export const recolour = (
  svg: string,
  scheme: Scheme,
  file: string,
): Effect.Effect<string, UnmappedColour> =>
  Arr.findFirst(
    Array.from(svg.matchAll(TOKEN), (match) => match[0]),
    (token) => Option.isNone(colourOf(token, scheme)),
  ).pipe(
    Option.match({
      onSome: (hex) => Effect.fail(UnmappedColour.make({ file, hex })),
      onNone: () =>
        Effect.succeed(
          svg.replace(TOKEN, (token) => Option.getOrElse(colourOf(token, scheme), () => token)),
        ),
    }),
  );

/** A recoloured master as a 144 × 144 RGBA PNG on a transparent ground: 48 user units at 216 dpi. */
export const drawIcon = (svg: string, file: string): Effect.Effect<Buffer, DrawFailed> =>
  Effect.tryPromise({
    try: () => sharp(Buffer.from(svg), { density: 216 }).ensureAlpha().png().toBuffer(),
    catch: (cause) => DrawFailed.make({ file, reason: String(cause) }),
  });

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.resolve(import.meta.dir, '..', 'assets/home');
  const names = (yield* fs.readDirectory(dir))
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .toSorted();
  yield* Effect.forEach(
    names.flatMap((name) => SCHEMES.map((scheme) => ({ name, scheme }))),
    ({ name, scheme }) =>
      Effect.gen(function* () {
        const master = `assets/home/${name}.svg`;
        const png = `assets/home/${name}-${scheme}.png`;
        const declaration = `assets/home/${name}-${scheme}.d.png.ts`;
        const svg = yield* recolour(
          yield* fs.readFileString(path.join(dir, `${name}.svg`)),
          scheme,
          master,
        );
        yield* fs.writeFile(path.join(dir, `${name}-${scheme}.png`), yield* drawIcon(svg, png));
        yield* Console.log(`[home-icons] ${png}`);
        yield* fs.writeFileString(path.join(dir, `${name}-${scheme}.d.png.ts`), DECLARATION);
        yield* Console.log(`[home-icons] ${declaration}`);
      }),
    { concurrency: 4 },
  );
});

if (import.meta.main) run.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
