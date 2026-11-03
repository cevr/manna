// The cast build makes every committed part sheet again, exactly. Each view
// with a committed `cutout/sheets/<view>/record.json` under the app's sources
// is checked by `concept parts --check`'s own job (`viewCutOf`, `jobOf`,
// `runParts`): its committed okra answers are laid again under its cut
// table's rule (`CLEAN`), and any byte of a committed file it would change
// fails the case. A hand fix committed with no rule is a byte the lay does not
// make, so it fails here before the build's `--reuse` would lay over it. The
// views are read from the tree, so a new member's are held with no edit here.
// filler-bases' own cutters, run into a scratch folder, make his committed
// files again, each PNG the same decoded RGBA, and no committed file is one
// they no longer make. The mother's kept drawings are fixed points of her
// paper rim's clear, and the woman's poses-1 holds under readings of cuff ink
// near the library's, so her sheet does not hang on one threshold.

import * as BunServices from '@effect/platform-bun/BunServices';
import {
  ImageRoute,
  type SheetClean,
  decodePng,
  jobOf,
  runParts,
  viewCutOf,
} from '@manna/film/tools';
import { Effect, FileSystem, Layer, Option, Result, Schema, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  DRAWINGS,
  drawingCleaned,
} from '../../films/in-its-order/cast/feast-mother/cutout/sheets-clean.ts';
import { cleanPoses1With } from '../cast/feast-guest-woman/cutout/cut.ts';

const HERE = import.meta.dir;
const SOURCES = `${HERE}/../..`;
const APP = `${SOURCES}/..`;
const FILLER = `${HERE}/../cast/filler-bases/cutout`;

/** A check draws nothing: every view's answers are committed. */
const noDraw = Layer.succeed(
  ImageRoute,
  ImageRoute.of({ draw: () => Effect.die('a check asks okra for nothing') }),
);
const layer = Layer.mergeAll(BunServices.layer, noDraw);

/** The record-bearing views the tree holds today: a glob that finds fewer has lost its way. */
const LEAST_VIEWS = 46;

/** A part sheet's record, as far as a check reads it: the command that makes it. */
const RecordCommand = Schema.fromJsonString(Schema.Struct({ command: Schema.String }));

/** `film concept parts <film> <member> --view <asked>`, read. */
const COMMAND = /^film concept parts (\S+) (\S+) --view (\S+)$/;

/** A committed view: its member's folder (`<member>/cast-sheet` beside `<member>/cutout`), the film, member and view its record's command names, or why it cannot be read. */
interface View {
  readonly record: string;
  readonly folder: string;
  readonly called: Result.Result<
    { readonly film: string; readonly member: string; readonly asked: string },
    string
  >;
}

/** Every committed view under the app's sources, by its record's path, sorted. */
const VIEWS: ReadonlyArray<View> =
  // oxlint-disable-next-line effect/noAsyncFunction -- read once as the file loads, so each view is a case of its own
  await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const names = yield* fs.readDirectory(SOURCES, { recursive: true });
      const records = names
        .filter((n) => /cutout\/sheets\/[^/]+\/record\.json$/.test(n))
        .toSorted();
      return yield* Effect.forEach(records, (name) =>
        Effect.map(
          fs
            .readFileString(`${SOURCES}/${name}`)
            .pipe(Effect.flatMap(Schema.decodeEffect(RecordCommand)), Effect.result),
          (read): View => ({
            record: name,
            folder: `${SOURCES}/${name.split('/').slice(0, -4).join('/')}/cast-sheet`,
            called: Result.flatMap(
              Result.mapError(read, (e) => e.message),
              ({ command }) =>
                Result.fromOption(
                  Option.map(Option.fromNullishOr(COMMAND.exec(command)), (m) => ({
                    film: m[1] ?? '',
                    member: m[2] ?? '',
                    asked: m[3] ?? '',
                  })),
                  () => `its command is not a concept parts view: ${command}`,
                ),
            ),
          }),
        ),
      );
    }).pipe(Effect.provide(BunServices.layer)),
  );

/**
 * The views a case's 5 s cannot hold in this process (cut and lay measured
 * at 4-7 s at rest), each checked by the command in its own process: the
 * series lead's single-9 lays more answers than any other view.
 */
const IN_ITS_OWN_PROCESS = new Set(['lead-feast.single-single-9']);

/** `concept parts <member> --view <asked> --check` in this process, its rule replaced when one is given. */
const check = (
  view: View,
  called: { readonly film: string; readonly member: string; readonly asked: string },
  clean: Option.Option<SheetClean> = Option.none(),
) =>
  Effect.gen(function* () {
    const cut = yield* viewCutOf(view.folder, called.member, called.asked);
    const job = jobOf(cut, called.film, 'check');
    const record = yield* runParts({
      ...job,
      clean: Option.orElse(clean, () => job.clean),
    }).pipe(Effect.result);
    return Result.match(record, {
      onFailure: (e) => `${called.asked}: ${e.message}`,
      onSuccess: () => `${called.asked}: holds`,
    });
  });

/** `bun <args>` in `cwd`: its exit code and its last line out. */
const bun = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', [...args], { cwd, forceKillAfter: '5 seconds' }),
      );
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      return `${Number(yield* handle.exitCode)} ${out.trim().split('\n').at(-1) ?? ''}`;
    }),
  );

/** The timeout of a case that checks its view in its own process (effect/requireSpawnBudget). */
const SPAWN_MS = 60_000;

/** A file's content as compared: a PNG's size and decoded RGBA, else its bytes. */
const contentOf = (file: string) =>
  Effect.gen(function* () {
    const bytes = yield* (yield* FileSystem.FileSystem).readFile(file);
    if (!file.endsWith('.png')) return { bytes: [...bytes] };
    const raster = yield* Effect.fromResult(decodePng(bytes));
    return { width: raster.width, height: raster.height, rgba: [...raster.rgba] };
  });

/** Each file under `dir`, by its path from it, sorted. */
const filesIn = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files: Array<string> = [];
    for (const entry of (yield* fs.readDirectory(dir, { recursive: true })).toSorted())
      if ((yield* fs.stat(`${dir}/${entry}`)).type === 'File') files.push(entry);
    return files;
  });

/** The woman's poses-1, which her cuff readings check again. */
const WOMAN = VIEWS.find((v) => v.record.includes('/feast-guest-woman/cutout/sheets/poses-1/'));

/** The readings of cuff ink the woman's poses-1 holds under. */
const READINGS = [1.5, 2, 2.5].flatMap((rim) => [10, 11, 12].map((darker) => ({ rim, darker })));

describe('the cast build makes every committed part sheet again', () => {
  it.effect(`finds at least ${LEAST_VIEWS} committed views`, () =>
    Effect.sync(() => expect(VIEWS.length).toBeGreaterThanOrEqual(LEAST_VIEWS)),
  );

  for (const view of VIEWS)
    Result.match(view.called, {
      onFailure: (why) =>
        it.effect(`${view.record} is named by its record's command`, () =>
          Effect.sync(() => expect(why).toBe('')),
        ),
      onSuccess: (called) => {
        const label = `${called.member}.${called.asked}`;
        if (IN_ITS_OWN_PROCESS.has(label))
          it.effect.layer(layer)(
            `${label} is laid again from its committed answers exactly`,
            () =>
              Effect.map(
                bun(APP, [
                  'cli.ts',
                  'concept',
                  'parts',
                  called.film,
                  called.member,
                  '--view',
                  called.asked,
                  '--check',
                ]),
                (line) =>
                  expect(line).toMatch(new RegExp(`^0 parts ${label} check: \\d+ files hold`)),
              ),
            SPAWN_MS,
          );
        else
          it.effect.layer(layer)(`${label} is laid again from its committed answers exactly`, () =>
            Effect.map(check(view, called), (line) => expect(line).toBe(`${called.asked}: holds`)),
          );
      },
    });

  for (const drawing of DRAWINGS)
    it.effect.layer(layer)(
      `the feast mother's ${drawing.view} ${drawing.file} is a fixed point of her clear`,
      () => Effect.map(drawingCleaned(drawing), (cleared) => expect(cleared.count).toBe(0)),
    );

  for (const cuff of READINGS)
    it.effect.layer(layer)(
      `the feast guest woman's poses-1, her cuff ink read ${cuff.rim} px past the hand, ${cuff.darker} darker`,
      () =>
        Effect.gen(function* () {
          const woman = yield* Effect.fromOption(Option.fromUndefinedOr(WOMAN));
          const called = yield* Effect.fromResult(woman.called);
          expect(yield* check(woman, called, Option.some(cleanPoses1With(cuff)))).toBe(
            'poses-poses-1: holds',
          );
        }),
    );

  it.effect.layer(layer)(
    "filler-bases' own cutters make his committed files again, each PNG the same RGBA, and every one of them",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'filler-cut-' });
        expect(yield* bun(FILLER, ['sheets-cut.ts', scratch])).toMatch(/^0 /);
        expect(yield* bun(FILLER, ['parts-cut.ts', scratch])).toMatch(/^0 /);
        const made = yield* filesIn(scratch);
        const committed = (yield* filesIn(`${FILLER}/sheets`)).filter(
          (f) => !f.split('/').includes('okra'),
        );
        expect(made).toEqual(committed);
        for (const file of made)
          expect({ file, content: yield* contentOf(`${scratch}/${file}`) }).toEqual({
            file,
            content: yield* contentOf(`${FILLER}/sheets/${file}`),
          });
      }).pipe(Effect.scoped),
    SPAWN_MS,
  );
});
