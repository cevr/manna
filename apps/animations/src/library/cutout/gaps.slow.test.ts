// Every cast member's named gaps (`<member>/cutout/cut.ts` `GAPS`, through
// `cutTable`) against his kept sheets: each gap's point lies in a piece of
// paper the view's ink encloses, read on the kept crop as a framed view's
// figure is, and that piece's box is the box the gap names. A gap whose piece
// moves or vanishes (the sheet redrawn, the frame moved, the paper reading
// changed) fails here, where its view would otherwise hold the ground its
// kept sheet shows open.

import { enclosedPaperOf } from '@manna/film/tools';
import { Glob } from 'bun';
import { Effect, Option, Record as Records } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import type { CutFrame, CutGap } from './table.ts';

const SRC = `${import.meta.dir}/../..`;

/** A member's cut table as this test reads it; a member who names no gap may export no `GAPS`. */
interface CutModule {
  readonly FRAMES: Readonly<Record<string, CutFrame>>;
  readonly GAPS?: Readonly<Record<string, ReadonlyArray<CutGap>>>;
}

const MEMBERS = [
  ...new Glob('library/cast/*/cutout/cut.ts').scanSync(SRC),
  ...new Glob('films/*/cast/*/cutout/cut.ts').scanSync(SRC),
].toSorted();

/** A view's kept crop: its kept sheet's pixels in its kept box. */
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

/** Each of a member's named gaps: where it is, and the boxes of the enclosed paper pieces its point opens on its kept crop. */
const gapsOf = (file: string) =>
  Effect.gen(function* () {
    const cut = yield* Effect.promise((): Promise<CutModule> => import(`${SRC}/${file}`));
    const views = Records.toEntries(cut.GAPS ?? {}).filter(([, gaps]) => gaps.length > 0);
    return yield* Effect.forEach(views, ([view, gaps]) =>
      Effect.gen(function* () {
        const frame = cut.FRAMES[view];
        // a bust's figure is read on its padded view closed by an ink row, not on its kept crop
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
      // the 13 gaps the kept sheets show (cut-held's 1:1 pass over every enclosed paper piece)
      expect(read.length).toBe(13);
    }),
  );
});
