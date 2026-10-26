/**
 * `bun run screening`: publish a film's milestone to the screening site
 * (`apps/screening`, films.cvr.im) and list what it holds.
 *
 *   bun run screening publish <film> board|render|final [--from <video>] [--dry-run]
 *   bun run screening list
 *
 * `publish` gathers the version's material here and writes it to the site's
 * bucket through its desk (`@manna/screening` `publishTo`):
 *
 * - `board`: renders the Board with its voice (`film render <film> --board
 *   --share`; a render reuses each unchanged segment), takes that render's
 *   share copy, a poster still from it, and each kept panel of `board.json`
 *   in the film's order, made 960 px wide for a phone;
 * - `render`: the share copy of the film's latest full render (the
 *   catalogue's newest `main` render of the whole film at full scale, never
 *   a look wedge, a Board or a proof: `./screening-renders.ts`) and a poster
 *   still;
 * - `final`: the video `--from` names, else the latest full render, the same.
 *
 * It names every file by its bytes, uploads those the bucket lacks, writes
 * the version's page, the film's folder, its manifest and the index, deletes
 * the files older than the version it replaced, and prints the version's link. `--dry-run`
 * gathers the same (the Board render included) and prints what it would
 * upload, writing nothing to the bucket.
 *
 * The site's and the desk's URLs and the desk's secret come from `.env`
 * (`SCREENING_*`), written there by `bun run --cwd ../screening keys
 * [--stage <stage>]`; the stage they name is the site written to.
 */
import { createHash } from 'node:crypto';

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Media } from '@manna/film/tools';
import type { FilmManifest, Material, MaterialFile } from '@manna/screening';
import { registerSolidSsr } from '@manna/screening/solid-ssr';
import {
  Array as Arr,
  Config,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Schema,
  Stream,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import sharp from 'sharp';

import {
  Catalogue,
  type CatalogueRender,
  isBoardRender,
  isFullRender,
  newestOf,
} from './screening-renders.ts';

/** The site's pages are Solid JSX: the plugin that compiles them is registered before they load. */
const loadSite = Effect.sync(registerSolidSsr).pipe(
  Effect.andThen(() => Effect.promise(() => import('@manna/screening'))),
);

/** Where a poster still is taken, as a share of the video's length. */
const POSTER_AT = 0.2;
/** A poster's width, and a panel's on the page. */
const POSTER_WIDTH = 1280;
const PANEL_WIDTH = 960;

class ScreeningFailed extends Schema.TaggedError<ScreeningFailed>()('ScreeningFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

const fail = (reason: string) => Effect.fail(ScreeningFailed.make({ reason }));

/** A Board panel, as far as publishing reads it (`@manna/film`'s `board.json`). */
const BoardPanel = Schema.Struct({
  beat: Schema.String,
  kept: Schema.OptionFromOptionalKey(Schema.Int),
  /** A card or verse page the engine sets: no picture. */
  text: Schema.OptionFromOptionalKey(Schema.Unknown),
  tries: Schema.Array(Schema.Struct({ n: Schema.Int, file: Schema.String })),
});
const Board = Schema.fromJsonString(Schema.Struct({ panels: Schema.Array(BoardPanel) }));

/** The film's title, as its script names it (`TITLE`). */
const ScriptModule = Schema.Struct({ TITLE: Schema.String });

/** Where a film's sources and renders are: this app's films, and its outputs (FILMS_OUT moves them, as for `film`). */
const filmPaths = Effect.fn('screening.paths')(function* (film: string) {
  const path = yield* Path.Path;
  const out = yield* Config.String('FILMS_OUT').pipe(
    Config.withDefault(path.join(import.meta.dir, 'out')),
  );
  const dir = path.join(import.meta.dir, 'src', 'films', film);
  return {
    dir,
    out: path.join(out, film),
    work: path.join(out, film, 'screening'),
  };
});

/** A variable of `.env` the site's keys script writes; its absence says how to write it. */
const siteVariable = (name: string) =>
  Config.option(Config.String(name)).pipe(
    Effect.orDie,
    Effect.flatMap(
      Option.match({
        onNone: () =>
          fail(
            `${name} is not set: write the site's keys with \`bun run --cwd ../screening keys --stage <stage>\``,
          ),
        onSome: Effect.succeed,
      }),
    ),
  );

/** The site's URL and its desk, from `.env`. */
const openSite = Effect.gen(function* () {
  const site = yield* loadSite;
  const url = yield* siteVariable('SCREENING_URL');
  const desk = yield* site.deskClient({
    url: yield* siteVariable('SCREENING_DESK_URL'),
    token: Redacted.make(yield* siteVariable('SCREENING_DESK_TOKEN')),
  });
  return { site, url, desk };
});

/** `file` as material: its bytes' sha256 (streamed through the hash), its size and kind. */
const materialFile = Effect.fn('screening.file')(function* (
  file: string,
  ext: MaterialFile['ext'],
) {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.stat(file);
  const hash = createHash('sha256');
  yield* Stream.runForEach(fs.stream(file), (chunk) => Effect.sync(() => hash.update(chunk)));
  return { file, sha256: hash.digest('hex'), bytes: Number(info.size), ext } satisfies MaterialFile;
});

/** The share copy of the catalogue's newest render that `wanted` admits (`./screening-renders.ts`). */
const latestShare = Effect.fn('screening.latest')(function* (
  out: string,
  wanted: (render: CatalogueRender) => boolean,
  what: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(out, 'catalogue.json');
  if (!(yield* fs.exists(file)))
    return yield* fail(`${file} does not exist: render the film first`);
  const catalogue = yield* Schema.decodeEffect(Catalogue)(yield* fs.readFileString(file));
  const found = newestOf(catalogue.renders, wanted);
  return yield* Option.match(
    Option.flatMap(found, (render) => render.files.share),
    {
      onNone: () => fail(`the catalogue at ${file} holds no ${what} with a share copy`),
      onSome: (share) => Effect.succeed(path.join(out, share)),
    },
  );
});

/** `film render <film> --board --share`, its output on this terminal. */
const renderBoard = Effect.fn('screening.renderBoard')(function* (film: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* Console.log(`screening.render film=${film} board`);
  const code = yield* spawner.exitCode(
    ChildProcess.make('bun', ['cli.ts', 'render', film, '--board', '--share'], {
      cwd: import.meta.dir,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      forceKillAfter: '10 seconds',
    }),
  );
  if (code !== 0) return yield* fail(`the Board render exited ${code}`);
});

/** A poster still of `video`, a fifth of the way in. */
const posterOf = Effect.fn('screening.poster')(function* (video: string, to: string) {
  const media = yield* Media;
  const { seconds } = yield* media.timing(video);
  yield* media.still(video, seconds * POSTER_AT, POSTER_WIDTH, to);
  return yield* materialFile(to, 'jpg');
});

/** The film's kept Board panels in its order, each made `PANEL_WIDTH` wide as a JPEG. */
const keptPanels = Effect.fn('screening.panels')(function* (dir: string, work: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const board = yield* Schema.decodeEffect(Board)(
    yield* fs.readFileString(path.join(dir, 'board.json')),
  );
  const kept = board.panels.flatMap((panel) =>
    Option.toArray(
      Option.filter(panel.kept, () => Option.isNone(panel.text)).pipe(
        Option.flatMap((n) => Arr.findFirst(panel.tries, (each) => each.n === n)),
        Option.map((shown) => ({ beat: panel.beat, file: path.join(dir, 'board', shown.file) })),
      ),
    ),
  );
  yield* fs.makeDirectory(path.join(work, 'panels'), { recursive: true });
  return yield* Effect.forEach(
    kept,
    (panel) =>
      Effect.gen(function* () {
        const to = path.join(
          work,
          'panels',
          `${path.basename(panel.file).replace(/\.[a-z]+$/, '')}.jpg`,
        );
        yield* Effect.promise(() =>
          sharp(panel.file)
            .resize({ width: PANEL_WIDTH })
            .jpeg({ quality: 82, mozjpeg: true })
            .toFile(to),
        );
        return { beat: panel.beat, image: yield* materialFile(to, 'jpg') };
      }),
    { concurrency: 4 },
  );
});

/** The film's title, from its script. */
const titleOf = Effect.fn('screening.title')(function* (dir: string) {
  const module: unknown = yield* Effect.promise(() => import(`${dir}/script.ts`));
  return (yield* Schema.decodeUnknownEffect(ScriptModule)(module)).TITLE;
});

/** Everything `version` of `film` is made of, gathered here. */
const gather = Effect.fn('screening.gather')(function* (
  film: string,
  version: Material['version'],
  from: Option.Option<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const paths = yield* filmPaths(film);
  if (!(yield* fs.exists(path.join(paths.dir, 'script.ts'))))
    return yield* fail(`no film ${film} under ${path.dirname(paths.dir)}`);
  yield* fs.makeDirectory(paths.work, { recursive: true });
  let video: string;
  if (version === 'board') {
    yield* renderBoard(film);
    video = yield* latestShare(paths.out, isBoardRender, 'Board render');
  } else if (version === 'final' && Option.isSome(from)) {
    video = path.resolve(from.value);
    if (!(yield* fs.exists(video))) return yield* fail(`${video} does not exist`);
  } else {
    video = yield* latestShare(
      paths.out,
      isFullRender,
      'full render (the main variant at full scale)',
    );
  }
  const now = yield* DateTime.now;
  const panels = yield* Effect.suspend(() => {
    if (version === 'board') return keptPanels(paths.dir, paths.work);
    return Effect.succeed([]);
  });
  const material: Material = {
    film,
    title: yield* titleOf(paths.dir),
    version,
    at: DateTime.formatIso(now),
    // The date on this machine's clock, as the owner would say it.
    day: DateTime.formatIsoDate(DateTime.setZone(now, DateTime.zoneMakeLocal())),
    video: yield* materialFile(video, 'mp4'),
    poster: yield* posterOf(video, path.join(paths.work, `${version}-poster.jpg`)),
    panels,
  };
  return material;
});

const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

const publish = Command.make(
  'publish',
  {
    film: Argument.String('film').pipe(
      Argument.withDescription("the film's folder under src/films"),
    ),
    version: Argument.Literals('version', ['board', 'render', 'final'] as const).pipe(
      Argument.withDescription('board, render or final'),
    ),
    from: Flag.String('from').pipe(
      Flag.optional,
      Flag.withDescription('final only: the video to publish (default: the latest full render)'),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('gather the version and print what would be uploaded, writing nothing'),
    ),
  },
  Effect.fn('screening.publish')(function* (input) {
    if (Option.isSome(input.from) && input.version !== 'final')
      return yield* fail('--from names the video of a final; a board or render is gathered here');
    const { site, url, desk } = yield* openSite;
    // A film's folder name is a path segment here and a key prefix in the bucket.
    const film = yield* Schema.decodeEffect(site.FilmId)(input.film);
    const material = yield* gather(film, input.version, input.from);
    const { plan, held, pruned } = yield* site.publishTo(desk, material, input.dryRun);
    for (const upload of plan.uploads) {
      let state = 'upload';
      if (held.has(upload.key)) state = 'held  ';
      yield* Console.log(`${state}  ${upload.key}  ${megabytes(upload.bytes)}  (${upload.file})`);
    }
    for (const text of plan.texts) yield* Console.log(`write   ${text.key}`);
    for (const key of pruned) yield* Console.log(`delete  ${key}`);
    if (input.dryRun) {
      const fresh = plan.uploads.length - held.size;
      yield* Console.log(
        `dry run: ${fresh} of ${plan.uploads.length} files and ${plan.texts.length} texts would be written; nothing was`,
      );
      return;
    }
    yield* Console.log(`published ${film} ${input.version}: ${url}${plan.path}`);
  }),
).pipe(Command.withDescription("Publish a film's board, render or final to the screening site"));

const list = Command.make(
  'list',
  {},
  Effect.fn('screening.list')(function* () {
    const { site, url, desk } = yield* openSite;
    const films: ReadonlyArray<FilmManifest> = yield* desk.manifests;
    if (films.length === 0) yield* Console.log(`nothing is published at ${url}`);
    for (const film of films) {
      yield* Console.log(`${film.film}  ${film.title}  ${url}${site.PATHS.folder(film.film)}`);
      for (const version of site.versionsOf(film))
        yield* Console.log(
          `  ${version.name.padEnd(6)}  ${version.day}  ${url}${site.PATHS.version(film.film, version.name)}`,
        );
    }
  }),
).pipe(Command.withDescription('Every published film, its versions and their links'));

const screening = Command.make('screening').pipe(
  Command.withDescription('The screening site: publish a milestone, list what is published'),
  Command.withSubcommands([publish, list]),
);

if (import.meta.main)
  Command.run(screening, { version: '0.1.0' }).pipe(
    Effect.provide(
      Layer.mergeAll(Media.layer, FetchHttpClient.layer).pipe(
        Layer.provideMerge(BunServices.layer),
      ),
    ),
    BunRuntime.runMain,
  );
