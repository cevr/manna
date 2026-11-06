import { decodePng, encodePng, type PartCut, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Record, Result, Schema } from 'effect';
import type { PaintRig } from '../painter.ts';
import { dataUrlOf, StorybookFailed } from '../render.ts';
import { cellPaintsOf, chainOf, ownersOf, partsOfKey, type RigSheet } from './parts.ts';

type Pt = readonly [number, number];

/**
 * The rig the painter draws a figure's keys by: each drawn key in `keys`
 * (the open cell first) cut by the sheet into its parts (`partsOfKey`, the
 * body reaching `reach` px past its cut), back to front, each part's
 * picture a PNG data URL, each chained by `parents`.
 */
export const paintRigOf = <P extends string>(
  sheet: RigSheet<P>,
  parents: Readonly<Record<P, P | 'none'>>,
  keys: ReadonlyArray<readonly [string, Raster]>,
  reach = 0,
): PaintRig => {
  const [open] = keys;
  const first = open?.[1] ?? { width: 0, height: 0, rgba: new Uint8Array(0) };
  const owners = ownersOf(sheet, first.width, first.height);
  const paints = cellPaintsOf(first);
  const cut = keys.map(
    ([key, raster]) => [key, partsOfKey(sheet, raster, owners, paints, reach)] as const,
  );
  return {
    pivots: sheet.pivots,
    parts: sheet.parts.toReversed().map(({ name }) => ({
      name,
      chain: chainOf(parents, name),
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

/** A committed part sheet read as the rig reads it (`RigSheet`): `dir` its folder, `cut` its cut (each part's pivot in the sheet's px), `soles` the pivot of a part the cut gives none (the cell's soles' centre, in the cell's px), `parents` its rig's parts by name, each with its parent. */
export const loadRigSheet = Effect.fn('Storybook.rig.loadSheet')(function* <P extends string>(
  dir: string,
  cut: PartCut,
  soles: Pt,
  parents: Readonly<Record<P, P | 'none'>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const failed = (reason: string) => StorybookFailed.make({ reason: `${dir}: ${reason}` });
  const record = yield* Schema.decodeEffect(SheetRecordJson)(
    yield* fs.readFileString(`${dir}/record.json`),
  ).pipe(Effect.mapError((e) => failed(e.message)));
  const names = record.parts.map((p) => p.name);
  const isPart = (name: string): name is P => name in parents;
  const known = names.filter(isPart);
  if (known.length !== names.length || names.at(-1) !== 'body')
    return yield* failed(`its parts ${names.join(', ')} are not the rig's, the body last`);
  const at: Pt = [record.box[0] ?? 0, record.box[1] ?? 0];
  const pivots = Record.map(parents, (_, name): Pt => {
    const p = cut.parts.find((q) => q.name === name)?.pivot ?? [soles[0] - at[0], soles[1] - at[1]];
    return [p[0] + at[0], p[1] + at[1]];
  });
  const parts = yield* Effect.forEach(known, (name) =>
    Effect.gen(function* () {
      const bytes = yield* fs.readFile(`${dir}/${name}.png`);
      const png = yield* Effect.fromResult(
        Result.mapError(decodePng(bytes), (e) => failed(`${name}.png: ${e.message}`)),
      );
      return { name, png };
    }),
  );
  const sheet: RigSheet<P> = { parts, at, pivots };
  return sheet;
});
