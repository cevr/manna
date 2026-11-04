import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { ImageRoute } from '@manna/film/tools';
import { Console, Effect, FileSystem, Schema } from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { frameAt, timesOf } from './shot.ts';
import { feastCourtyard } from './shots/feast-courtyard.ts';
import { CAST, drawSheet, headsOf, keepSheet, loadFigures, splitFiles } from './store.ts';

/** The shots the command knows, by id. */
const SHOTS = { 'feast-courtyard': feastCourtyard } as const;

const SHOT_IDS = ['feast-courtyard'] as const;

/** A plan: each frame's time and, per figure, its cell, place, squash and scale. */
const PlanJson = Schema.fromJsonString(
  Schema.Struct({
    fps: Schema.Finite,
    duration: Schema.Finite,
    frames: Schema.Array(
      Schema.Struct({
        t: Schema.Finite,
        figures: Schema.Array(
          Schema.Struct({
            name: Schema.String,
            cell: Schema.String,
            x: Schema.Finite,
            y: Schema.Finite,
            sx: Schema.Finite,
            sy: Schema.Finite,
            scale: Schema.Finite,
          }),
        ),
      }),
    ),
  }),
  { space: 2 },
);

/** Write the plan of `shot`: every frame at `i / fps`, each figure's scale from its stored sheet. */
const writePlan = Effect.fn('Storybook.writePlan')(function* (
  id: (typeof SHOT_IDS)[number],
  out: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const shot = SHOTS[id];
  const heads = headsOf(yield* loadFigures(CAST, shot));
  const frames = timesOf(shot).map((t) => {
    const frame = frameAt(shot, heads, t);
    return {
      t,
      figures: frame.figures.map(({ name, cell, x, y, sx, sy, scale }) => ({
        name,
        cell,
        x,
        y,
        sx,
        sy,
        scale,
      })),
    };
  });
  yield* fs.writeFileString(
    out,
    `${yield* Schema.encodeEffect(PlanJson)({ fps: shot.fps, duration: shot.duration, frames })}\n`,
  );
  return frames.length;
});

const shotArgument = Argument.Literals('shot', SHOT_IDS).pipe(
  Argument.withDescription('the shot, by id (storybook/shots/)'),
);

const planCommand = Command.make(
  'plan',
  {
    shot: shotArgument,
    out: Flag.String('out').pipe(Flag.withDescription('the plan file to write')),
  },
  ({ shot, out }) =>
    writePlan(shot, out).pipe(
      Effect.flatMap((n) => Console.log(`planned ${shot}: ${n} frames in ${out}`)),
    ),
).pipe(
  Command.withDescription(
    "Write a shot's plan: every frame at i / fps, each figure's cell, place, squash and derived scale",
  ),
);

/** A comma-separated list's items, blanks dropped. */
const listOf = (text: string): ReadonlyArray<string> =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

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
  ({ sheet, cells, palette, out }) =>
    splitFiles(sheet, cells, palette, out).pipe(
      Effect.flatMap((split) =>
        Console.log(`split ${sheet} into ${split.cells.length} cells in ${out}`),
      ),
    ),
).pipe(
  Command.withDescription(
    "Split a shot sheet into its figures' cells: the background cleared, each cell its largest piece, pockets mended, paints snapped",
  ),
);

const member = Argument.String('member').pipe(
  Argument.withDescription('the cast member, a folder under src/library/cast'),
);

const sheetId = Argument.String('sheet-id').pipe(
  Argument.withDescription("the shot sheet's id, a folder under the member's shot-sheets/"),
);

const drawCommand = Command.make(
  'draw',
  {
    member,
    sheetId,
    keys: Flag.String('keys').pipe(
      Flag.withDescription('the poses left to right, comma-separated (store.ts POSES)'),
    ),
    refs: Flag.String('refs').pipe(
      Flag.withDescription(
        "the member's kept views drawn from, comma-separated names under cast-sheet/views/",
      ),
    ),
  },
  ({ member, sheetId, keys, refs }) =>
    drawSheet(CAST, member, sheetId, listOf(keys), listOf(refs)).pipe(
      Effect.flatMap((record) =>
        Console.log(
          `drew ${member}/shot-sheets/${sheetId}: ${record.cells.map((c) => c.key).join(', ')} on ground ${record.ground}`,
        ),
      ),
      Effect.provide(ImageRoute.layer),
    ),
).pipe(
  Command.withDescription(
    "Draw a member's shot sheet in one okra image pass (the subscription route), split it into one cell per key and write its record; refuses a ground near a paint, too few figures, or an id drawn already",
  ),
);

const keepCommand = Command.make(
  'keep',
  {
    member,
    sheetId,
    why: Flag.String('why').pipe(Flag.withDescription("the owner's words")),
    ask: Flag.String('ask').pipe(Flag.withDescription('the ask he answered')),
  },
  ({ member, sheetId, why, ask }) =>
    keepSheet(CAST, member, sheetId, why, ask).pipe(
      Effect.flatMap(() => Console.log(`kept ${member}/shot-sheets/${sheetId}`)),
    ),
).pipe(Command.withDescription("Write the owner's keep on a drawn shot sheet's record"));

const storybook = Command.make('storybook').pipe(
  Command.withSubcommands([splitCommand, drawCommand, keepCommand, planCommand]),
  Command.withDescription('Shot sheets and storybook shots: flat drawn figures on depth layers'),
);

if (import.meta.main)
  Command.run(storybook, { version: '0.1.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
