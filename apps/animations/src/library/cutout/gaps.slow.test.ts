import { enclosedPaperOf } from '@manna/film/core';
import { Glob } from 'bun';
import { Effect, Option, Record as Records } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import type { CutFrame, CutGap } from './table.ts';

const SRC = `${import.meta.dir}/../..`;

interface CutModule {
  readonly FRAMES: Readonly<Record<string, CutFrame>>;
  readonly GAPS?: Readonly<Record<string, ReadonlyArray<CutGap>>>;
}

const MEMBERS = [
  ...new Glob('library/cast/*/cutout/cut.ts').scanSync(SRC),
  ...new Glob('films/*/cast/*/cutout/cut.ts').scanSync(SRC),
].toSorted();

const keptOf = (file: string, view: string, frame: CutFrame) => {
  const [x0, y0, x1, y1] = frame.kept;
  const sheet = Option.match(
    Option.liftPredicate(frame.sheet, (s) => s === 'single'),
    {
      onNone: () => frame.sheet,
      onSome: () => view,
    },
  );
  return Effect.promise(() =>
    sharp(`${SRC}/${file.replace(/cutout\/cut\.ts$/, '')}cast-sheet/kept/${sheet}.png`)
      .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ).pipe(
    Effect.map(({ data, info }) => ({
      width: info.width,
      height: info.height,
      rgba: new Uint8Array(data),
    })),
  );
};

const gapsOf = (file: string) =>
  Effect.gen(function* () {
    const cut = yield* Effect.promise((): Promise<CutModule> => import(`${SRC}/${file}`));
    const views = Records.toEntries(cut.GAPS ?? {}).filter(([, gaps]) => gaps.length > 0);
    return yield* Effect.forEach(views, ([view, gaps]) =>
      Effect.gen(function* () {
        const frame = cut.FRAMES[view];
        expect({ file, view, sheet: frame?.sheet }).not.toEqual({ file, view, sheet: 'heads' });
        const kept = yield* Option.match(Option.fromUndefinedOr(frame), {
          onNone: () => Effect.die(`${file}: ${view} names gaps and has no frame`),
          onSome: (f) => keptOf(file, view, f),
        });
        return gaps.map((gap) => ({
          file,
          view,
          why: gap.why,
          box: [...gap.box],
          opened: enclosedPaperOf(kept, [gap.at])
            .pieces.filter((p) => p.gaps.length > 0)
            .map((p) => [...p.box]),
        }));
      }),
    );
  });

describe('every named gap', () => {
  it.effect('is a piece of enclosed paper on its kept crop, with the box it names', () =>
    Effect.gen(function* () {
      const read = (yield* Effect.forEach(MEMBERS, gapsOf)).flat(2);
      for (const { opened, box, ...gap } of read)
        expect({ ...gap, opened }).toEqual({ ...gap, opened: [box] });
      expect(read.length).toBe(13);
    }),
  );
});
