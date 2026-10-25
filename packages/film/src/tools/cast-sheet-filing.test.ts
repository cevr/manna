// A cast keep filed, its try cut by a stand-in that reads the try's file:
// a kept sheet is replaced only on the owner's answer (a keep of a kind kept
// already that does not ask to replace it, a replace that names no ask and a
// replace of a kind not kept are each refused before the try is read); a
// replace whose try is missing or does not cut leaves every file as it was;
// a replace stopped at any write leaves the record's files in place and a
// retry finishes it; a member that keeps some views of its sheet keeps the
// same views; and replaces on one day each set the old keep aside in a
// folder of its own.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Exit, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { type CastKept, CastSheetJson, type CastSheetRecord } from '../core/cast-record.ts';
import { Segment } from '../core/segment.ts';
import { fileCastKeep } from './cast-sheet-filing.ts';
import { ContentStore } from './content-store.ts';
import { crashingFileSystem, memoryFileSystem, memoryLocks, text } from './host/testing.ts';

const FOLDER = '/library/cast/lead/cast-sheet';
const OUT = '/out/f/cast/lead';
const RECORD = `${FOLDER}/cast-sheet.json`;
const tried = (n: number) => ({
  n,
  file: `poses-${n}.png`,
  prompt: 'p',
  refs: [],
  underlay: false,
  flags: [],
  at: '2026-10-25T00:00:00.000Z',
});
const keptOf = (n: number, views: ReadonlyArray<number>): CastKept => ({
  try: n,
  why: `keep ${n}`,
  ask: `a${n}`,
  views: views.map((view) => ({ view, name: `poses-${view}`, box: [0, 0, 1, 1] })),
});
const recordKeeping = (kept: CastKept): CastSheetRecord => ({
  member: Segment.make('lead'),
  scope: 'library',
  who: 'Him',
  refs: [],
  sheets: {
    poses: {
      anchor: 1,
      layout: 'Standing, facing the viewer; turned to the left.',
      slots: ['front', 'left'],
      tries: [tried(1), tried(2), tried(3), tried(4)],
    },
  },
  kept: { poses: kept },
});
const record = recordKeeping(keptOf(1, [1, 2]));

/** The folder as the record keeps try 1: its sheet and both views on disk, and tries 1, 2 and a bad 4 drawn (3 never landed). */
const folderOf = (held: CastSheetRecord) =>
  new Map<string, Uint8Array>([
    [RECORD, text(Schema.encodeSync(CastSheetJson)(held))],
    [`${FOLDER}/kept/poses.png`, text('sheet 1')],
    [`${FOLDER}/views/poses-1.png`, text('sheet 1 view 1')],
    [`${FOLDER}/views/poses-2.png`, text('sheet 1 view 2')],
    [`${OUT}/poses-1.png`, text('sheet 1')],
    [`${OUT}/poses-2.png`, text('sheet 2')],
    [`${OUT}/poses-4.png`, text('bad')],
  ]);

const storeOver = <E, R>(fs: Layer.Layer<FileSystem.FileSystem, E, R>) =>
  ContentStore.layer.pipe(
    Layer.provideMerge([
      fs,
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({})),
    ]),
  );

const decoder = new TextDecoder();
const read = (files: Map<string, Uint8Array>, file: string) =>
  decoder.decode(files.get(file) ?? new Uint8Array());
const recordIn = (files: Map<string, Uint8Array>) =>
  Schema.decodeSync(CastSheetJson)(read(files, RECORD));

/** The try's file read and cut into both slots, each view's crop its sheet's words and its number; a try that reads `bad` does not cut. */
const keep = (n: number, replace = true, ask: Option.Option<string> = Option.some(`b${n}`)) =>
  fileCastKeep(
    { folder: FOLDER },
    { kind: 'poses', n, why: `replace with ${n}`, ask, replace },
    ({ tried, refused }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const bytes = yield* fs.readFile(`${OUT}/${tried.file}`);
        const words = decoder.decode(bytes);
        if (words === 'bad') return yield* refused('it does not read as its sheet');
        return {
          bytes,
          views: [1, 2].map((view) => ({
            view,
            name: `poses-${view}`,
            box: [0, 0, 1, 1] as const,
            png: text(`${words} view ${view}`),
          })),
        };
      }),
  );

/** Try 2 replacing the keep over the file system `fs`. */
const replaceOver = <E, R>(fs: Layer.Layer<FileSystem.FileSystem, E, R>) =>
  keep(2).pipe(Effect.provide(storeOver(fs)));

/** The keep's failure as its message reads, or the empty string when it kept. */
const refusal = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.exit(self), (exit) => (Exit.isFailure(exit) && String(exit.cause)) || '');

/** The old keep's files where the record's history says it went. */
const historyOf = (files: Map<string, Uint8Array>, k: number) => {
  const folder = `${FOLDER}/${recordIn(files).replaced?.[k]?.folder}`;
  return [
    read(files, `${folder}/poses.png`),
    read(files, `${folder}/views/poses-1.png`),
    read(files, `${folder}/views/poses-2.png`),
  ];
};

describe('a cast keep filed', () => {
  it.effect('refuses a keep of a kind kept already that does not ask to replace it', () => {
    const files = folderOf(record);
    return Effect.gen(function* () {
      const why = yield* refusal(keep(2, false));
      expect(why).toContain('it is kept already');
      expect(why).toContain('--replace');
    }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
  });

  it.effect(
    "refuses a replace that names no ask: only the owner's answer replaces a kept sheet",
    () => {
      const files = folderOf(record);
      const before = new Map(files);
      return Effect.gen(function* () {
        const why = yield* refusal(keep(2, true, Option.none()));
        expect(why).toContain('--ask');
        expect(files).toEqual(before);
      }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
    },
  );

  it.effect('refuses a replace of a kind not kept', () => {
    const { kept: _, ...unkept } = record;
    const files = folderOf(unkept);
    return Effect.gen(function* () {
      const why = yield* refusal(keep(2));
      expect(why).toContain('nothing kept to replace');
    }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
  });

  it.effect(
    'leaves every file as it was when the new try is missing, or does not cut, or is not in the record',
    () => {
      const files = folderOf(record);
      const before = new Map(files);
      return Effect.gen(function* () {
        for (const n of [3, 4, 9]) {
          expect(yield* refusal(keep(n))).not.toBe('');
          expect(files).toEqual(before);
        }
      }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
    },
  );

  it.effect(
    "a replace stopped at any write leaves the record's files in place, and a retry finishes it",
    () =>
      Effect.gen(function* () {
        const clean = crashingFileSystem(folderOf(record), 0);
        yield* replaceOver(clean.layer);
        const writes = clean.ops();
        expect(writes).toBeGreaterThan(3);
        for (let nth = 1; nth <= writes; nth++) {
          const files = folderOf(record);
          const crashed = yield* refusal(replaceOver(crashingFileSystem(files, nth).layer));
          expect(crashed).toContain('crash');
          const held = recordIn(files);
          expect(held.kept?.poses?.try).toBe(1);
          expect(files.has(`${FOLDER}/kept/poses.png`)).toBe(true);
          expect(files.has(`${FOLDER}/views/poses-1.png`)).toBe(true);
          expect(files.has(`${FOLDER}/views/poses-2.png`)).toBe(true);
          yield* replaceOver(memoryFileSystem(files));
          expect(recordIn(files).kept?.poses?.try).toBe(2);
          expect(recordIn(files).replaced?.length).toBe(1);
          expect(read(files, `${FOLDER}/kept/poses.png`)).toBe('sheet 2');
          expect(read(files, `${FOLDER}/views/poses-2.png`)).toBe('sheet 2 view 2');
          expect(historyOf(files, 0)).toEqual(['sheet 1', 'sheet 1 view 1', 'sheet 1 view 2']);
        }
      }),
  );

  it.effect('a replace on a member that keeps some views of its sheet keeps the same views', () => {
    const files = folderOf(recordKeeping(keptOf(1, [1])));
    return Effect.gen(function* () {
      yield* keep(2);
      expect(recordIn(files).kept?.poses?.views.map((v) => v.view)).toEqual([1]);
      expect(read(files, `${FOLDER}/views/poses-1.png`)).toBe('sheet 2 view 1');
      expect(read(files, `${FOLDER}/views/poses-2.png`)).toBe('sheet 1 view 2');
      const folder = `${FOLDER}/${recordIn(files).replaced?.[0]?.folder}`;
      expect(read(files, `${folder}/views/poses-1.png`)).toBe('sheet 1 view 1');
      expect(files.has(`${folder}/views/poses-2.png`)).toBe(false);
    }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
  });

  it.effect('three replaces on one day each set the old keep aside in a folder of its own', () => {
    const files = folderOf(record);
    return Effect.gen(function* () {
      yield* keep(2);
      yield* keep(1);
      yield* keep(2);
      const replaced = recordIn(files).replaced ?? [];
      expect(replaced.map((r) => [r.kept.try, r.by])).toEqual([
        [1, 2],
        [2, 1],
        [1, 2],
      ]);
      expect(new Set(replaced.map((r) => r.folder)).size).toBe(3);
      expect(historyOf(files, 0)).toEqual(['sheet 1', 'sheet 1 view 1', 'sheet 1 view 2']);
      expect(historyOf(files, 1)).toEqual(['sheet 2', 'sheet 2 view 1', 'sheet 2 view 2']);
      expect(historyOf(files, 2)).toEqual(['sheet 1', 'sheet 1 view 1', 'sheet 1 view 2']);
    }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
  });
});
