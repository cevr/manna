import { Cache, Context, Effect, Layer, Option } from 'effect';
import type { Pcm } from '../core/audio.ts';
import {
  type DerivedSource,
  type Measure,
  type MeasuredSounds,
  type Sounds,
  isDerived,
  measurePcm,
  placedSounds,
  renderSource,
  seedSources,
  soundEntry,
  sourceLabel,
} from '../core/sfx.ts';
import type { LoadedFilm, MeasuredFilm } from './film-repo.ts';

const SOUNDS_KEPT = 64;
const MEASURES_KEPT = 1024;

interface SoundRenderService {
  readonly pcm: (source: DerivedSource) => Effect.Effect<Pcm>;
  readonly measure: (source: DerivedSource) => Effect.Effect<Measure>;
  readonly measured: (sounds: Sounds, names: Iterable<string>) => Effect.Effect<MeasuredSounds>;
}

export class SoundRender extends Context.Service<SoundRender, SoundRenderService>()(
  '@manna/film/tools/SoundRender',
) {
  static readonly layer = Layer.effect(
    SoundRender,
    Effect.gen(function* () {
      const made = yield* Cache.make({
        lookup: (source: DerivedSource) => Effect.sync(() => renderSource(source)),
        capacity: SOUNDS_KEPT,
      });
      const pcm = Effect.fn('SoundRender.pcm')(function* (source: DerivedSource) {
        const sound = yield* Cache.get(made, source);
        yield* Effect.annotateCurrentSpan({ label: sourceLabel(source), frames: sound.frames });
        return sound;
      });
      const measures = yield* Cache.make({
        lookup: (source: DerivedSource) => Effect.map(pcm(source), measurePcm),
        capacity: MEASURES_KEPT,
      });
      const measure = Effect.fn('SoundRender.measure')(function* (source: DerivedSource) {
        yield* Effect.annotateCurrentSpan({ label: sourceLabel(source) });
        return yield* Cache.get(measures, source);
      });
      const measured = Effect.fn('SoundRender.measured')(function* (
        sounds: Sounds,
        names: Iterable<string>,
      ) {
        const sources = [...new Set(names)].flatMap((name) =>
          Option.match(Option.filter(soundEntry(sounds.library, name), isDerived), {
            onNone: (): ReadonlyArray<DerivedSource> => [],
            onSome: (entry) => seedSources(sounds, name, entry),
          }),
        );
        yield* Effect.annotateCurrentSpan({ seeds: sources.length });
        const found = yield* Effect.forEach(sources, (source) =>
          Effect.map(measure(source), (m): readonly [string, Measure] => [sourceLabel(source), m]),
        );
        const heard: MeasuredSounds = { ...sounds, measured: new Map(found) };
        return heard;
      });
      return SoundRender.of({ pcm, measure, measured });
    }),
  );
}

export const measuredFilm = Effect.fn('SoundRender.film')(function* (film: LoadedFilm) {
  const sounds = yield* (yield* SoundRender).measured(
    film.sounds,
    Option.match(film.sound, { onNone: () => [], onSome: placedSounds }),
  );
  const measured: MeasuredFilm = { ...film, sounds };
  return measured;
});
