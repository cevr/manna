// The cast build makes every committed part sheet a clean rule or an own
// cutter shapes again, exactly. `concept parts --check`'s own job
// (`viewCutOf`, `jobOf`, `runParts`) lays each view's committed okra answers
// again under its cut table's rule and fails on any byte of a committed file
// it would change: the feast guest woman's poses-1 and the feast mother's 9
// views, and the series lead's single-9 through the command itself, in its
// own process. filler-bases' own cutters, run into
// a scratch folder, make his 20 committed files again, each PNG the same
// decoded RGBA. The mother's closed head is a fixed point of her paper rim's
// clear, and the woman's poses-1 holds under readings of cuff ink near the
// library's, so her sheet does not hang on one threshold.

import * as BunServices from '@effect/platform-bun/BunServices';
import {
  ImageRoute,
  type SheetClean,
  decodePng,
  jobOf,
  runParts,
  viewCutOf,
} from '@manna/film/tools';
import { Effect, FileSystem, Layer, Option, Result, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  DRAWINGS,
  drawingCleaned,
} from '../../films/in-its-order/cast/feast-mother/cutout/sheets-clean.ts';
import { cleanPoses1With } from '../cast/feast-guest-woman/cutout/cut.ts';

const HERE = import.meta.dir;
const LIBRARY = `${HERE}/../cast`;
const MOTHER = `${HERE}/../../films/in-its-order/cast/feast-mother/cast-sheet`;
const FILLER = `${LIBRARY}/filler-bases/cutout`;

/** A check draws nothing: every view's answers are committed. */
const noDraw = Layer.succeed(
  ImageRoute,
  ImageRoute.of({ draw: () => Effect.die('a check asks okra for nothing') }),
);
const layer = Layer.mergeAll(BunServices.layer, noDraw);

const MOTHER_VIEWS = [
  'turnaround-front',
  'turnaround-back',
  'turnaround-profileLeft',
  'turnaround-profileRight',
  'turnaround-threeQuarterLeft',
  'turnaround-threeQuarterRight',
  'poses-poses-1',
  'poses-poses-2',
  'poses-poses-3',
] as const;

/** Each view checked in this process: its member's sheet folder, the member and the view asked. */
const VIEWS = [
  [`${LIBRARY}/feast-guest-woman/cast-sheet`, 'feast-guest-woman', 'poses-poses-1'],
  ...MOTHER_VIEWS.map((asked) => [MOTHER, 'feast-mother', asked] as const),
] as const;

/** Each view cut by its cut table (`viewCutOf`), made as the file loads, so a case only lays its answers. */
const CUTS = new Map(
  // oxlint-disable-next-line effect/noAsyncFunction -- built once as the file loads, so no case's time limit holds its cost
  await Effect.runPromise(
    Effect.forEach(VIEWS, ([folder, member, asked]) =>
      Effect.map(viewCutOf(folder, member, asked), (cut) => [cut.label, cut] as const),
    ).pipe(Effect.provide(BunServices.layer)),
  ),
);

/** `concept parts <member> --view <asked> --check` on the view's cut, its rule replaced when one is given. */
const check = (member: string, asked: string, clean: Option.Option<SheetClean> = Option.none()) =>
  Effect.gen(function* () {
    const cut = yield* Effect.fromOption(Option.fromUndefinedOr(CUTS.get(`${member}.${asked}`)));
    const job = jobOf(cut, 'in-its-order', 'check');
    const record = yield* runParts({
      ...job,
      clean: Option.orElse(clean, () => job.clean),
    }).pipe(Effect.result);
    return Result.match(record, {
      onFailure: (e) => `${asked}: ${e.message}`,
      onSuccess: () => `${asked}: holds`,
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

/** A file's content as compared: a PNG's size and decoded RGBA, else its bytes. */
const contentOf = (file: string) =>
  Effect.gen(function* () {
    const bytes = yield* (yield* FileSystem.FileSystem).readFile(file);
    if (!file.endsWith('.png')) return { bytes: [...bytes] };
    const raster = yield* Effect.fromResult(decodePng(bytes));
    return { width: raster.width, height: raster.height, rgba: [...raster.rgba] };
  });

/** The readings of cuff ink the woman's poses-1 holds under. */
const READINGS = [1.5, 2, 2.5].flatMap((rim) => [10, 11, 12].map((darker) => ({ rim, darker })));

describe('the cast build makes every committed part sheet again', () => {
  // his view lays more answers than a case's 5 s, so the command checks it in its own process
  it.effect.layer(layer)(
    "the series lead's single-9, by his cuff and speck rules",
    () =>
      Effect.map(
        bun(`${HERE}/../../..`, [
          'cli.ts',
          'concept',
          'parts',
          'in-its-order',
          'lead-feast',
          '--view',
          'single-single-9',
          '--check',
        ]),
        (line) =>
          expect(line).toMatch(/^0 parts lead-feast\.single-single-9 check: \d+ files hold/),
      ),
    60_000,
  );

  it.effect.layer(layer)("the feast guest woman's poses-1, by her cut table's cuff rule", () =>
    Effect.map(check('feast-guest-woman', 'poses-poses-1'), (line) =>
      expect(line).toBe('poses-poses-1: holds'),
    ),
  );

  for (const asked of MOTHER_VIEWS)
    it.effect.layer(layer)(`the feast mother's ${asked}, by her paper rim's clear`, () =>
      Effect.map(check('feast-mother', asked), (line) => expect(line).toBe(`${asked}: holds`)),
    );

  it.effect.layer(layer)("the feast mother's closed head is a fixed point of her clear", () =>
    Effect.map(drawingCleaned(DRAWINGS[0]), (head) => expect(head.count).toBe(0)),
  );

  for (const cuff of READINGS)
    it.effect.layer(layer)(
      `the feast guest woman's poses-1, her cuff ink read ${cuff.rim} px past the hand, ${cuff.darker} darker`,
      () =>
        Effect.map(
          check('feast-guest-woman', 'poses-poses-1', Option.some(cleanPoses1With(cuff))),
          (line) => expect(line).toBe('poses-poses-1: holds'),
        ),
    );

  it.effect.layer(layer)(
    "filler-bases' own cutters make his 20 committed files again, each PNG the same RGBA",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'filler-cut-' });
        expect(yield* bun(FILLER, ['sheets-cut.ts', scratch])).toMatch(/^0 /);
        expect(yield* bun(FILLER, ['parts-cut.ts', scratch])).toMatch(/^0 /);
        const entries = yield* fs.readDirectory(scratch, { recursive: true });
        const made: Array<string> = [];
        for (const entry of entries.toSorted())
          if ((yield* fs.stat(`${scratch}/${entry}`)).type === 'File') made.push(entry);
        expect(made.length).toBe(20);
        for (const file of made)
          expect({ file, content: yield* contentOf(`${scratch}/${file}`) }).toEqual({
            file,
            content: yield* contentOf(`${FILLER}/sheets/${file}`),
          });
      }).pipe(Effect.scoped),
    60_000,
  );
});
