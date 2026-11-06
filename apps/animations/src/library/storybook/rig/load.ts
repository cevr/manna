import { decodePng, encodePng, type PartCut, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Result, Schema } from 'effect';
import type { PaintRig } from '../painter.ts';
import { dataUrlOf, StorybookFailed } from '../render.ts';
import { PARENTS, type RigPart } from './channels.ts';
import { cellPaintsOf, chainOf, ownersOf, partsOfKey, type RigSheet } from './parts.ts';

type Pt = readonly [number, number];

/**
 * The rig the painter draws a figure's keys by: each drawn key in `keys`
 * (the open cell first) cut by the sheet into its parts (`partsOfKey`),
 * back to front, each part's picture a PNG data URL.
 */
export const paintRigOf = (
  sheet: RigSheet,
  keys: ReadonlyArray<readonly [string, Raster]>,
): PaintRig => {
  const [open] = keys;
  const first = open?.[1] ?? { width: 0, height: 0, rgba: new Uint8Array(0) };
  const owners = ownersOf(sheet, first.width, first.height);
  const paints = cellPaintsOf(first);
  const cut = keys.map(
    ([key, raster]) => [key, partsOfKey(sheet, raster, owners, paints)] as const,
  );
  return {
    pivots: sheet.pivots,
    parts: sheet.parts.toReversed().map(({ name }) => ({
      name,
      chain: chainOf(name),
      images: Object.fromEntries(
        cut.map(([key, parts]) => {
          const raster = parts.get(name) ?? first;
          return [
            key,
            { image: dataUrlOf(encodePng(raster)), size: [raster.width, raster.height] as const },
          ] as const;
        }),
      ),
    })),
  };
};

/** The part sheet's record as the rig reads it: its parts front to back, and its box on the kept sheet (the cell's px). */
const SheetRecordJson = Schema.fromJsonString(
  Schema.Struct({
    parts: Schema.Array(Schema.Struct({ name: Schema.String })),
    box: Schema.Array(Schema.Int),
  }),
);

/** Whether `name` is a part of the rig. */
const isRigPart = (name: string): name is RigPart => name in PARENTS;

/** A committed part sheet read as the rig reads it (`RigSheet`): `dir` its folder, `cut` its cut (each moving part's pivot in the sheet's px), `soles` the body's pivot in the cell's px (the cell's soles' centre, where today's breath stretches it from). */
export const loadRigSheet = Effect.fn('Storybook.rig.loadSheet')(function* (
  dir: string,
  cut: PartCut,
  soles: Pt,
) {
  const fs = yield* FileSystem.FileSystem;
  const failed = (reason: string) => StorybookFailed.make({ reason: `${dir}: ${reason}` });
  const record = yield* Schema.decodeEffect(SheetRecordJson)(
    yield* fs.readFileString(`${dir}/record.json`),
  ).pipe(Effect.mapError((e) => failed(e.message)));
  const names = record.parts.map((p) => p.name);
  const known = names.filter(isRigPart);
  if (known.length !== names.length || names.at(-1) !== 'body')
    return yield* failed(`its parts ${names.join(', ')} are not the rig's, the body last`);
  const at: Pt = [record.box[0] ?? 0, record.box[1] ?? 0];
  const pivotOf = (name: RigPart): Pt => {
    const p = cut.parts.find((q) => q.name === name)?.pivot ?? [soles[0] - at[0], soles[1] - at[1]];
    return [p[0] + at[0], p[1] + at[1]];
  };
  const pivots: Readonly<Record<RigPart, Pt>> = {
    body: pivotOf('body'),
    head: pivotOf('head'),
    armLeft: pivotOf('armLeft'),
    armRight: pivotOf('armRight'),
    clothSash: pivotOf('clothSash'),
  };
  const parts = yield* Effect.forEach(known, (name) =>
    Effect.gen(function* () {
      const bytes = yield* fs.readFile(`${dir}/${name}.png`);
      const png = yield* Effect.fromResult(
        Result.mapError(decodePng(bytes), (e) => failed(`${name}.png: ${e.message}`)),
      );
      return { name, png };
    }),
  );
  return { parts, at, pivots } satisfies RigSheet;
});
