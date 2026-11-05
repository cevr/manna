import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { ImageRoute } from '@manna/film/tools';
import { Clock, Console, Effect, FileSystem, Layer, Option, Schema } from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { filmCast, filmFolder, filmNamed, filmShot, shotsJsonOf } from './films.ts';
import { APP, outOf, renderShot, StorybookFailed } from './render.ts';
import { frameAt, type Shot, timesOf } from './shot.ts';
import { verdictText } from './verify/verdict.ts';
import { VerdictFailed, verifyShot } from './verify/run.ts';
import { feastCourtyard } from './shots/feast-courtyard.ts';
import {
  CAST,
  type Cast,
  drawSheet,
  headsOf,
  keepSheet,
  LIBRARY_WORDS,
  loadFigures,
  resplitSheet,
  type SheetWords,
  sharesOf,
  splitFiles,
} from './store.ts';

/** The library's own shots, by id. */
const SHOTS: ReadonlyMap<string, Shot> = new Map([['feast-courtyard', feastCourtyard]]);

/** A shot the command can draw: the shot, where its members live, and where a run writes by default. */
interface Named {
  readonly shot: Shot;
  readonly cast: Cast;
  readonly out: string;
}

/** A shot by name: a library shot's id, or `<film>/<shot>` for a film's storybook shot made from its scene's cues as laid out. */
const shotNamed = Effect.fn('Storybook.shotNamed')(function* (name: string) {
  const [film = '', id = ''] = name.split('/');
  if (!name.includes('/'))
    return yield* Effect.fromOption(
      Option.map(Option.fromUndefinedOr(SHOTS.get(name)), (shot): Named => ({
        shot,
        cast: CAST,
        out: outOf(shot),
      })),
      () =>
        StorybookFailed.make({
          reason: `no shot ${name} (${[...SHOTS.keys()].join(', ')}, or <film>/<shot>)`,
        }),
    );
  const story = yield* filmNamed(film);
  const placed = yield* filmShot(story, id);
  return {
    shot: placed.shot,
    cast: yield* filmCast(story),
    out: `${APP}/out/storybook/${film}/${id}`,
  } satisfies Named;
});

/** A plan: each frame's time and camera and, per figure, its cell, the key whose eyes it shows, its place, squash, breath, scale and its plane's zoom. */
const PlanJson = Schema.fromJsonString(
  Schema.Struct({
    fps: Schema.Finite,
    duration: Schema.Finite,
    frames: Schema.Array(
      Schema.Struct({
        t: Schema.Finite,
        camera: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, zoom: Schema.Finite }),
        figures: Schema.Array(
          Schema.Struct({
            name: Schema.String,
            cell: Schema.String,
            eyes: Schema.String,
            x: Schema.Finite,
            y: Schema.Finite,
            sx: Schema.Finite,
            sy: Schema.Finite,
            breath: Schema.Finite,
            scale: Schema.Finite,
            zoom: Schema.Finite,
          }),
        ),
      }),
    ),
  }),
  { space: 2 },
);

/** Write the plan of a shot: every frame it draws (`timesOf`), the camera, and each figure's scale from its stored sheet and its member's head share, and its plane's zoom. */
const writePlan = Effect.fn('Storybook.writePlan')(function* (name: string, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const { shot, cast } = yield* shotNamed(name);
  const figures = yield* loadFigures(cast, shot);
  const [heads, shares] = [headsOf(figures), sharesOf(figures)];
  const frames = timesOf(shot).map((t) => {
    const frame = frameAt(shot, heads, t, shares);
    return {
      t,
      camera: { x: frame.camera.x, y: frame.camera.y, zoom: frame.camera.zoom },
      figures: frame.figures.map(({ name, cell, eyes, x, y, sx, sy, breath, scale, zoom }) => ({
        name,
        cell,
        eyes,
        x,
        y,
        sx,
        sy,
        breath,
        scale,
        zoom,
      })),
    };
  });
  yield* fs.writeFileString(
    out,
    `${yield* Schema.encodeEffect(PlanJson)({ fps: shot.fps, duration: shot.duration, frames })}\n`,
  );
  return frames.length;
});

const shotArgument = Argument.String('shot').pipe(
  Argument.withDescription(
    "the shot: a library shot's id (storybook/shots/), or <film>/<shot> for a film's storybook shot",
  ),
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

/** Where a verify run writes: `out` (default the shot's own folder under `out/storybook/`), under its `quick/` for a quick run. */
const verifyOut = (named: Named, out: Option.Option<string>, quick: boolean): string => {
  const dir = Option.getOrElse(out, () => named.out);
  if (quick) return `${dir}/quick`;
  return dir;
};

const verifyCommand = Command.make(
  'verify',
  {
    shot: shotArgument,
    quick: Flag.Boolean('quick').pipe(
      Flag.withDefault(false),
      Flag.withDescription('every sixth frame, written under quick/: iterate, not judge'),
    ),
    out: Flag.String('out').pipe(
      Flag.optional,
      Flag.withDescription('where the run writes (default out/storybook/<shot>/)'),
    ),
  },
  ({ shot, quick, out }) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      const named = yield* shotNamed(shot);
      const dir = verifyOut(named, out, quick);
      const { verdict, info } = yield* verifyShot(
        named.shot,
        dir,
        [1, 6][Number(quick)] ?? 1,
        named.cast,
      );
      yield* Console.log(verdictText(verdict, info));
      const took = ((yield* Clock.currentTimeMillis) - started) / 1000;
      yield* Console.log(`wrote ${dir} in ${took.toFixed(1)} s`);
      if (verdict.passed !== verdict.total)
        return yield* VerdictFailed.make({ passed: verdict.passed, total: verdict.total });
    }),
).pipe(
  Command.withDescription(
    'Render every frame of a shot (colour and each figure alone) in two page launches, measure every bar in storybook/verify/bars.ts, and write verdict.md, verdict.json, manifest.json, contact.png and shot.mp4. Exits 0 only on PASS n/n',
  ),
);

const renderCommand = Command.make(
  'render',
  {
    shot: shotArgument,
    out: Flag.String('out').pipe(
      Flag.optional,
      Flag.withDescription('where frames/ and shot.mp4 go (default out/storybook/<shot>/)'),
    ),
  },
  ({ shot, out }) =>
    Effect.gen(function* () {
      const named = yield* shotNamed(shot);
      const dir = Option.getOrElse(out, () => named.out);
      const n = yield* renderShot(named.shot, dir, named.cast);
      yield* Console.log(`rendered ${shot}: ${n} frames and shot.mp4 in ${dir}`);
    }),
).pipe(
  Command.withDescription(
    "Render every frame of a shot in a headless Chrome, each from its time alone, and its clip: the set's plates and each figure's lit cells on their layers through the shot's camera",
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

const filmFlag = Flag.String('film').pipe(
  Flag.optional,
  Flag.withDescription(
    "a film drawn in storybook shots: its member is found in the film's cast/ first, then the library's, and draw takes the sheet's keys, pose words, refs and rules from the film's declaration",
  ),
);

/** Where a command's member lives: the film's cast when it names a film, else the library's. */
const castFor = (film: Option.Option<string>) =>
  Option.match(film, {
    onNone: () => Effect.succeed(CAST),
    onSome: (name) => Effect.flatMap(filmNamed(name), filmCast),
  });

/** What a draw asks: the film's declaration of the sheet, or the keys and refs given with the library's pose words. */
const drawAsk = Effect.fn('Storybook.drawAsk')(function* (
  film: Option.Option<string>,
  member: string,
  sheetId: string,
  keys: Option.Option<string>,
  refs: Option.Option<string>,
) {
  if (Option.isSome(film)) {
    const story = yield* filmNamed(film.value);
    const decl = yield* Effect.fromOption(
      Option.fromUndefinedOr(story.sheets.find((s) => s.member === member && s.id === sheetId)),
      () =>
        StorybookFailed.make({ reason: `${film.value} declares no sheet ${member}/${sheetId}` }),
    );
    return {
      cast: yield* filmCast(story),
      keys: decl.keys,
      refs: decl.refs,
      words: {
        poses: new Map(Object.entries(decl.poses)),
        rules: decl.rules,
        props: decl.props ?? [],
      } satisfies SheetWords,
    };
  }
  return {
    cast: CAST,
    keys: listOf(Option.getOrElse(keys, () => '')),
    refs: listOf(Option.getOrElse(refs, () => '')),
    words: LIBRARY_WORDS,
  };
});

const drawCommand = Command.make(
  'draw',
  {
    member,
    sheetId,
    keys: Flag.String('keys').pipe(
      Flag.optional,
      Flag.withDescription(
        'the poses left to right, comma-separated (store.ts POSES); not with --film',
      ),
    ),
    refs: Flag.String('refs').pipe(
      Flag.optional,
      Flag.withDescription(
        "the member's kept views drawn from, comma-separated names under cast-sheet/views/; not with --film",
      ),
    ),
    film: filmFlag,
  },
  ({ member, sheetId, keys, refs, film }) =>
    Effect.gen(function* () {
      const ask = yield* drawAsk(film, member, sheetId, keys, refs);
      const record = yield* drawSheet(ask.cast, member, sheetId, ask.keys, ask.refs, ask.words);
      yield* Console.log(
        `drew ${member}/shot-sheets/${sheetId}: ${record.cells.map((c) => c.key).join(', ')} on ground ${record.ground}`,
      );
    }).pipe(Effect.provide(ImageRoute.layer)),
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
    film: filmFlag,
  },
  ({ member, sheetId, why, ask, film }) =>
    castFor(film).pipe(
      Effect.flatMap((cast) => keepSheet(cast, member, sheetId, why, ask)),
      Effect.flatMap(() => Console.log(`kept ${member}/shot-sheets/${sheetId}`)),
    ),
).pipe(Command.withDescription("Write the owner's keep on a drawn shot sheet's record"));

const resplitCommand = Command.make(
  'resplit',
  { member, sheetId, film: filmFlag },
  ({ member, sheetId, film }) =>
    castFor(film).pipe(
      Effect.flatMap((cast) => resplitSheet(cast, member, sheetId)),
      Effect.flatMap((record) =>
        Console.log(
          `resplit ${member}/shot-sheets/${sheetId}: ${record.cells.map((c) => c.key).join(', ')}`,
        ),
      ),
    ),
).pipe(
  Command.withDescription(
    "Split a drawn shot sheet again as split splits it now, rewriting its cells and its record's cells; the drawing, prompt, refs and keep stand",
  ),
);

const shotsCommand = Command.make(
  'shots',
  {
    film: Argument.String('film').pipe(
      Argument.withDescription('a film drawn in storybook shots (storybook/films.ts)'),
    ),
    out: Flag.String('out').pipe(Flag.withDescription('the JSON file to write')),
  },
  ({ film, out }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const story = yield* filmNamed(film);
      const { json, unkept } = yield* shotsJsonOf(story);
      yield* fs.writeFileString(out, `${json}\n`);
      for (const sheet of unkept) yield* Console.log(`INFO unkept ${sheet}`);
      yield* Console.log(`wrote ${film}'s storybook shots, cards and sheets to ${out}`);
    }),
).pipe(
  Command.withDescription(
    "Write a film's layout, its storybook shots and cards in film seconds, and its sheets as JSON, and name each sheet the owner has not kept",
  ),
);

const storybook = Command.make('storybook').pipe(
  Command.withSubcommands([
    shotsCommand,
    splitCommand,
    drawCommand,
    resplitCommand,
    keepCommand,
    planCommand,
    renderCommand,
    verifyCommand,
  ]),
  Command.withDescription('Shot sheets and storybook shots: flat drawn figures on depth layers'),
);

if (import.meta.main)
  Command.run(storybook, { version: '0.1.0' }).pipe(
    Effect.provide([
      filmFolder.pipe(Layer.provide(BunServices.layer)),
      BunServices.layer,
      BunCrypto.layerDigest,
    ]),
    BunRuntime.runMain,
  );
