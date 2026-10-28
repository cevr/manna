// The series lead's committed part sheets (`sheets/<view>/`, made by `film
// concept parts`): each part holds its view's own bytes where his cut gives
// it the pixel, the parts recompose the view byte for byte, every other
// pixel a part holds is paint that an opaque part in front hides at rest,
// each moving part hides some, and the command lays the same files again
// from the committed okra answers (`--check`).

import * as BunServices from '@effect/platform-bun/BunServices';
import { cutParts } from '@manna/film/tools';
import { Effect, FileSystem, Result, Schema, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import sharp from 'sharp';
import { CUTS, HIDDEN, cutOptionsFor } from './cut.ts';

const HERE = import.meta.dir;
const APP = `${HERE}/../../../../..`;

interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** A PNG's RGBA bytes. */
const rgbaOf = (file: string) =>
  Effect.promise(() => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).pipe(
    Effect.map(({ data, info }) => ({
      width: info.width,
      height: info.height,
      rgba: new Uint8Array(data),
    })),
  );

/** The part names and painted counts a sheet's record holds. */
const RecordJson = Schema.fromJsonString(
  Schema.Struct({
    parts: Schema.Array(Schema.Struct({ name: Schema.String, painted: Schema.Int })),
  }),
);

const VIEWS = [
  ['front', 'turnaround-front'],
  ['threeQuarterLeft', 'turnaround-threeQuarterLeft'],
  ['heads-4', 'heads-heads-4'],
] as const;

/**
 * The parts read back over the view: the pixels a part holds that are not
 * its view's own where it owns them, the painted pixels no opaque part in
 * front hides, each part's painted count, the parts whose paint is hidden
 * and the view the parts recompose.
 */
const readBack = (
  view: Rgba,
  owner: Uint8Array,
  names: ReadonlyArray<string>,
  parts: ReadonlyArray<Rgba>,
) => {
  const n = view.width * view.height;
  const recomposed = Uint8Array.from(view.rgba);
  const painted = parts.map(() => 0);
  let [visible, notOwn] = [0, 0];
  const hidden = new Set<string>();
  for (let k = parts.length - 1; k >= 0; k--)
    for (let i = 0; i < n; i++) {
      const px = parts[k]?.rgba.subarray(i * 4, i * 4 + 4) ?? new Uint8Array(4);
      const own = owner[i] === k + 1;
      const alpha = px[3] ?? 0;
      notOwn += Number(own && px.some((b, c) => b !== view.rgba[i * 4 + c]));
      const paint = !own && alpha > 0;
      painted[k] = (painted[k] ?? 0) + Number(paint);
      const o = owner[i] ?? 0;
      const covered = o >= 1 && o <= k && parts[o - 1]?.rgba[i * 4 + 3] === 255;
      visible += Number(paint && !covered);
      if (paint && covered) hidden.add(names[o - 1] ?? '');
      if (alpha > 0) recomposed.set(px, i * 4);
    }
  return { notOwn, visible, painted, hidden: [...hidden].sort(), recomposed };
};

/** `film concept parts in-its-order lead-feast --view <asked> --check` from the app's folder: its exit code and last line. */
const check = (asked: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          'bun',
          ['cli.ts', 'concept', 'parts', 'in-its-order', 'lead-feast', '--view', asked, '--check'],
          { cwd: APP, forceKillAfter: '5 seconds' },
        ),
      );
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      return `${Number(yield* handle.exitCode)} ${out.trim().split('\n').at(-1) ?? ''}`;
    }),
  );

describe("the series lead's part sheets", () => {
  for (const [name, asked] of VIEWS) {
    it.effect.layer(BunServices.layer)(
      `his ${name}'s parts recompose it byte for byte, and its paint shows nowhere at rest`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const view = yield* rgbaOf(`${HERE}/../cast-sheet/views/${name}.png`);
          const sheet = Result.getOrThrow(cutParts(view, CUTS[name], cutOptionsFor(name, view)));
          const record = yield* fs
            .readFileString(`${HERE}/sheets/${name}/record.json`)
            .pipe(Effect.flatMap(Schema.decodeEffect(RecordJson)));
          const names = sheet.parts.map((p) => p.name);
          expect(record.parts.map((p) => p.name)).toEqual(names);
          const parts = yield* Effect.forEach(names, (p) =>
            rgbaOf(`${HERE}/sheets/${name}/${p}.png`),
          );
          const back = readBack(view, sheet.owner, names, parts);
          expect(back.notOwn).toBe(0);
          expect(back.visible).toBe(0);
          expect(back.recomposed).toEqual(view.rgba);
          expect(back.painted).toEqual(record.parts.map((p) => p.painted));
          expect(back.hidden).toEqual([...HIDDEN[name].moving].sort());
        }),
    );
    it.effect.layer(BunServices.layer)(
      `film concept parts lays his ${name}'s committed files again from its okra answers`,
      () =>
        check(asked).pipe(
          Effect.map((line) => expect(line).toMatch(/^0 parts .* check: \d+ files hold/)),
        ),
      60_000,
    );
  }
});
