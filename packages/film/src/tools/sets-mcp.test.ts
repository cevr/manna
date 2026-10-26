// `record_render`'s work (`setsReads().recordRender`) over a project folder in
// memory: a video made another way gets a render record of its lead file,
// empty unless a local render of that file left one, so `film cache --prune
// --days 0` runs after it.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path } from 'effect';
import { MAIN_VARIANT, type Render } from '../core/catalogue.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder } from './film-repo.ts';
import { noRenders } from './film-services/testing.ts';
import { memoryFileSystem, memoryLocks, text } from './host/testing.ts';
import { LabAddress } from './lab-command.ts';
import { ManifestLock } from './manifest-lock.ts';
import { ProductionStore } from './production-store.ts';
import { Review } from './review.ts';
import { pruneIdle, recordRender } from './segment-cache.ts';
import { keepSegment } from './segments.ts';
import { setsReads } from './sets-mcp.ts';

const out = '/out/f';

/** A video of `address` at `clip` (relative to the film's folder), as an agent records it. */
const videoAt = (address: Render['address'], clip: string): Omit<Render, 'at'> => ({
  address,
  variant: MAIN_VARIANT,
  kind: 'video',
  settings: { scale: 1, captions: false },
  stamp: { commit: Option.none(), key: 'k' },
  span: Option.none(),
  files: {
    clip: Option.some(clip),
    share: Option.none(),
    captions: Option.none(),
    chapters: Option.none(),
    description: Option.none(),
    images: [],
  },
  sound: Option.none(),
});

/** Segment `key` kept whole in the film's cache. */
const kept = (key: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const segments = `${out}/cache/segments`;
    yield* fs.makeDirectory(`${segments}/${key}`, { recursive: true });
    yield* fs.writeFile(`${segments}/${key}/0-10.mp4`, new Uint8Array(10));
    yield* keepSegment(
      fs,
      path,
      segments,
      key,
      [{ from: 0, to: 10, master: true, share: false }],
      0,
    );
  });

/** Film `f` in memory, with two videos in its folder; the lab's roots hold `/out`. */
const lab = () => {
  const files = new Map([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    [`${out}/film/main.mp4`, text('made elsewhere')],
    [`${out}/scenes/b/main.mp4`, text('rendered here')],
  ]);
  const platform = Layer.mergeAll(
    memoryFileSystem(files),
    memoryLocks,
    Path.layer,
    ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out' })),
  );
  const review = Layer.effect(
    Review,
    Effect.map(Review, (none) => Review.of({ ...none, roots: [{ label: 'spare', path: '/out' }] })),
  ).pipe(Layer.provide(noRenders));
  return Layer.mergeAll(
    RenderCatalogue.layer,
    ProductionStore.layer,
    FilmFolder.layer('/films'),
    review,
    Layer.succeed(
      LabAddress,
      LabAddress.of({ local: 'http://lab.test/', phone: 'http://phone.test/' }),
    ),
  ).pipe(Layer.provideMerge(ContentStore.layer), Layer.provideMerge(platform));
};

describe('record_render', () => {
  it.effect(
    'gives a video made another way an empty render record, keeps a local render’s, and a prune with 0 days runs after it',
    () =>
      Effect.gen(function* () {
        yield* kept('used');
        yield* kept('mine');
        yield* kept('stale');
        // Another output's render recorded what it used; `scenes/b` was rendered here.
        yield* recordRender(out, `${out}/scenes/a/main.mp4`, 0, ['used']);
        yield* recordRender(out, `${out}/scenes/b/main.mp4`, 0, ['mine']);
        const sets = yield* setsReads();
        yield* sets.recordRender('f', videoAt({ _tag: 'Film' }, 'film/main.mp4'));
        yield* sets.recordRender('f', videoAt({ _tag: 'Scenes', ids: ['b'] }, 'scenes/b/main.mp4'));
        expect((yield* (yield* RenderCatalogue).read({ name: 'f', out })).renders).toHaveLength(2);
        const pruned = yield* pruneIdle(out, { now: 0, days: 0, keep: new Set() }, false).pipe(
          Effect.provideService(ManifestLock, yield* ManifestLock),
        );
        expect(pruned.removed.map((s) => s.key)).toEqual(['stale']);
      }).pipe(Effect.provide(lab())),
  );
});
