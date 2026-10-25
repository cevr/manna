// A kept sheet replaced only on the owner's answer: a keep of a kind kept
// already is refused unless it asks to replace it and names the ask he
// answered, and a replace of a kind not kept is refused. Each refusal comes
// before the try is read, so the record and the folder stay as they were.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Exit, Layer, Option, Path, Schema } from 'effect';
import { CastSheetJson, type CastSheetRecord } from '../core/cast-record.ts';
import { Segment } from '../core/segment.ts';
import { keepCastSheet } from './cast-sheet-keep.ts';
import { ContentStore } from './content-store.ts';
import { memoryFileSystem, memoryLocks, text } from './host/testing.ts';

const FOLDER = '/library/cast/lead/cast-sheet';
const OUT = '/out/f/cast/lead';
const tried = (n: number) => ({
  n,
  file: `poses-${n}.png`,
  prompt: 'p',
  refs: [],
  underlay: false,
  flags: [],
  at: '2026-10-25T00:00:00.000Z',
});
const record: CastSheetRecord = {
  member: Segment.make('lead'),
  scope: 'library',
  who: 'Him',
  refs: [],
  sheets: {
    poses: {
      anchor: 1,
      layout: 'Standing, facing the viewer; turned to the left.',
      slots: ['front', 'left'],
      tries: [tried(1), tried(2)],
    },
  },
  kept: {
    poses: {
      try: 1,
      why: 'the first',
      ask: 'a1',
      views: [{ view: 1, name: 'poses-1', box: [0, 0, 1, 1] }],
    },
  },
};

const over = (files: Map<string, Uint8Array>, held: CastSheetRecord) => {
  files.set(`${FOLDER}/cast-sheet.json`, text(Schema.encodeSync(CastSheetJson)(held)));
  return ContentStore.layer.pipe(
    Layer.provideMerge([
      memoryFileSystem(files),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({})),
    ]),
  );
};

const keep = (kind: 'poses' | 'heads', replace: boolean, ask: Option.Option<string>) =>
  keepCastSheet(
    { folder: FOLDER, out: OUT },
    { kind, n: 2, why: 'keep the new sheet', ask, replace },
  );

/** The keep's failure as its message reads, or the empty string when it kept. */
const refusal = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.exit(self), (exit) => (Exit.isFailure(exit) && String(exit.cause)) || '');

describe('a kept sheet replaced', () => {
  it.effect('refuses a keep of a kind kept already that does not ask to replace it', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const why = yield* refusal(keep('poses', false, Option.some('a2')));
      expect(why).toContain('it is kept already');
      expect(why).toContain('--replace');
    }).pipe(Effect.provide(over(files, record)));
  });

  it.effect(
    "refuses a replace that names no ask: only the owner's answer replaces a kept sheet",
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        const before = files.get(`${FOLDER}/cast-sheet.json`);
        const why = yield* refusal(keep('poses', true, Option.none()));
        expect(why).toContain('--ask');
        expect(files.get(`${FOLDER}/cast-sheet.json`)).toEqual(before);
      }).pipe(Effect.provide(over(files, record)));
    },
  );

  it.effect('refuses a replace of a kind not kept', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const why = yield* refusal(keep('heads', true, Option.some('a2')));
      expect(why).toContain('nothing kept to replace');
    }).pipe(Effect.provide(over(files, record)));
  });
});
