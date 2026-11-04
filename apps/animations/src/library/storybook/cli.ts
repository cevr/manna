import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { decodePng, encodePng } from '@manna/film/tools';
import { Console, Effect, FileSystem, Path, Schema } from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { PaletteJson, splitSheet } from './sheet.ts';

/** A box in sheet px, as `cells.json` and a record write it. */
const BoxJson = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});

/** `cells.json`: the sheet's sha256 and each cell's box, left to right. */
const CellsJson = Schema.fromJsonString(
  Schema.Struct({ sheet: Schema.String, cells: Schema.Array(BoxJson) }),
  { space: 2 },
);

/** A file the command could not read or write, and why. */
class StorybookFailed extends Schema.TaggedError<StorybookFailed>()('StorybookFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

const sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

/** Split `sheet` into `cells` cells with `palette`, writing `cell-<i>.png` and `cells.json` to `out`. */
const splitFiles = Effect.fn('Storybook.split')(function* (
  sheet: string,
  cells: number,
  palette: string,
  out: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bytes = yield* fs.readFile(sheet);
  const raster = yield* Effect.fromResult(decodePng(bytes)).pipe(
    Effect.mapError((e) => StorybookFailed.make({ reason: `${sheet}: ${e.message}` })),
  );
  const colours = yield* Schema.decodeEffect(PaletteJson)(yield* fs.readFileString(palette));
  const split = yield* Effect.fromResult(splitSheet(raster, cells, colours));
  yield* fs.makeDirectory(out, { recursive: true });
  for (const [i, cell] of split.cells.entries())
    yield* fs.writeFile(path.join(out, `cell-${i}.png`), encodePng(cell.raster));
  yield* fs.writeFileString(
    path.join(out, 'cells.json'),
    `${yield* Schema.encodeEffect(CellsJson)({ sheet: sha256(bytes), cells: split.cells.map((c) => c.box) })}\n`,
  );
  yield* Console.log(`split ${sheet} into ${split.cells.length} cells in ${out}`);
});

const splitCommand = Command.make(
  'split',
  {
    sheet: Argument.String('sheet').pipe(Argument.withDescription('the drawn sheet, a PNG')),
    cells: Flag.Int('cells').pipe(Flag.withDescription('how many figures it holds, left to right')),
    palette: Flag.String('palette').pipe(
      Flag.withDescription("the member's palette.json the cells snap to"),
    ),
    out: Flag.String('out').pipe(Flag.withDescription('where cell-<i>.png and cells.json go')),
  },
  ({ sheet, cells, palette, out }) => splitFiles(sheet, cells, palette, out),
).pipe(
  Command.withDescription(
    "Split a shot sheet into its figures' cells: the background cleared, each cell its largest piece, pockets mended, paints snapped",
  ),
);

const storybook = Command.make('storybook').pipe(
  Command.withSubcommands([splitCommand]),
  Command.withDescription('Shot sheets and storybook shots: flat drawn figures on depth layers'),
);

if (import.meta.main)
  Command.run(storybook, { version: '0.1.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
