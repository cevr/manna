import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer } from 'effect';
import { reviewFileUrl } from '../../core/api.ts';
import { RenderCatalogue } from '../catalogue.ts';
import type { FilmName } from '../film-repo.ts';
import { noRenders } from '../film-services/testing.ts';
import { text } from '../host/testing.ts';
import { NOTES_LAB, labInMemory } from '../lab/testing.ts';
import { Review } from '../review.ts';
import { drawingSetLive } from './drawing-set.ts';
import { DrawingSet, type OwnerNeed } from './owner-ask.ts';

const film = 'in-its-order' as FilmName;

const SIDE = '/m/lead-feast/views/side.png';
const WIFE_FRONT = '/m/wife/views/front.png';

const needs: ReadonlyArray<OwnerNeed> = [
  { film, member: 'lead-feast', id: 'turnaround-side', file: SIDE, lacks: 'kept' },
  { film, member: 'wife', id: 'turnaround-front', file: WIFE_FRONT, lacks: 'kept' },
];

const setOver = (files: Map<string, Uint8Array>) => {
  const lab = labInMemory(files);
  const review = Layer.effect(
    Review,
    Effect.map(Effect.service(Review), (none) =>
      Review.of({ ...none, roots: [{ label: 'spare', path: '/out' }] }),
    ),
  ).pipe(Layer.provide(noRenders));
  const over = Layer.mergeAll(
    review,
    RenderCatalogue.layer,
    ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out', FILMS_LAB: NOTES_LAB })),
  ).pipe(Layer.provide(lab));
  return drawingSetLive.pipe(Layer.provideMerge(Layer.merge(lab, over)));
};

describe('drawingSetLive', () => {
  it.effect('serves each need its own drawing, at <member>/<id> in the set', () => {
    const files = new Map<string, Uint8Array>([
      [`/films/${film}/scenes/index.ts`, text('export {};\n')],
      [SIDE, text('lead side')],
      [WIFE_FRONT, text('wife front')],
    ]);
    return Effect.gen(function* () {
      const srcs = yield* (yield* DrawingSet).publish(film, needs);
      expect(srcs).toEqual([
        reviewFileUrl('spare/cast-keep-in-its-order/lead-feast/turnaround-side.png'),
        reviewFileUrl('spare/cast-keep-in-its-order/wife/turnaround-front.png'),
      ]);
      const fs = yield* FileSystem.FileSystem;
      const served = yield* Effect.forEach(
        ['lead-feast/turnaround-side.png', 'wife/turnaround-front.png'],
        (at) => fs.readFileString(`/out/cast-keep-in-its-order/${at}`),
      );
      expect(served).toEqual(['lead side', 'wife front']);
    }).pipe(Effect.provide(setOver(files)));
  });
});
