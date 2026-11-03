import { Array as Arr, Context, Effect, Layer, Option, Predicate, Result } from 'effect';
import { CUE_PATCH_KEYS, type CuePatch, type Knob } from '../core/schema.ts';
import {
  type SceneNotLocated,
  type SourceRefused,
  type SourceShared,
  TimelineUnresolved,
} from '../core/refusals.ts';
import { toMs } from '../core/time.ts';
import type { FilmName } from './film-repo.ts';
import { CueRead, FreshFilm } from './fresh-film.ts';
import { cueLanded, editCue, editKnob, readKnob, readSpans } from './scene-source.ts';
import { type Field, type LocateError, type SceneSite, SceneSources } from './scene-sources.ts';
import { type RewriteError, SourceWriter, type Wrote } from './source-writer.ts';

interface Written extends Wrote {
  readonly after: string;
  readonly exportName: string;
}

type WriteError = LocateError | SceneNotLocated | SourceShared | TimelineUnresolved | RewriteError;

export interface CueWritten {
  readonly written: Written;
  readonly read: CueRead;
}

interface SceneWriterService {
  readonly setCue: (
    film: FilmName,
    scene: string,
    cue: string,
    patch: CuePatch,
  ) => Effect.Effect<CueWritten, WriteError>;
  readonly setKnob: (
    film: FilmName,
    scene: string,
    knob: string,
    value: Knob,
  ) => Effect.Effect<Written, WriteError>;
}

const same = (a: number, b: number) => toMs(a) === toMs(b);

const sameKnob = (a: Knob, b: Knob): boolean => {
  if (Predicate.isNumber(a) || Predicate.isNumber(b))
    return Predicate.isNumber(a) && Predicate.isNumber(b) && same(a, b);
  return same(a[0], b[0]) && same(a[1], b[1]);
};

const fieldsOf = (patch: CuePatch) => CUE_PATCH_KEYS.filter((k) => Predicate.hasProperty(patch, k));

export class SceneWriter extends Context.Service<SceneWriter, SceneWriterService>()(
  '@manna/film/tools/SceneWriter',
) {
  static readonly layer = Layer.effect(
    SceneWriter,
    Effect.gen(function* () {
      const fresh = yield* FreshFilm;
      const sources = yield* SceneSources;
      const writer = yield* SourceWriter;

      const write = <A>(
        film: string,
        scene: string,
        slot: Field,
        target: string,
        edit: (at: SceneSite, source: string) => Result.Result<string, SourceRefused>,
        verify: (
          at: SceneSite,
          after: string,
          before: string,
        ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
        check: (at: SceneSite, after: string) => Effect.Effect<A, TimelineUnresolved>,
      ) =>
        Effect.gen(function* () {
          const at = yield* sources.writable(film, scene, slot);
          const [change, [checked, after]] = yield* writer.write({
            film,
            scene: Option.some(scene),
            file: at.file,
            target,
            edit: (source) => edit(at, source),
            verify: (after, before) => verify(at, after, before),
            check: (after) => Effect.map(check(at, after), (a) => [a, after] as const),
          });
          const written: Written = {
            scene: Option.some(scene),
            file: at.file,
            target,
            change,
            after,
            exportName: at.exportName,
          };
          return [written, checked] as const;
        });

      const resolves =
        (film: FilmName, scene: string, cue: string, patch: CuePatch, target: string) =>
        (at: SceneSite, after: string) =>
          Effect.gen(function* () {
            const spans = readSpans(at.shown, after, at.exportName);
            const answered = yield* Effect.result(
              fresh.cue(film, scene, cue, Option.some(spans), Option.some(patch)),
            );
            if (Result.isFailure(answered)) {
              const why = `${answered.failure._tag}: ${answered.failure.message}`;
              yield* Effect.logWarning(
                `lab.cue.unread film=${film} scene=${scene} cue=${cue} reason=${why}`,
              );
              return CueRead.make({ unresolved: why });
            }
            const read = answered.success;
            if (Predicate.isString(read.unresolved))
              return yield* TimelineUnresolved.make({
                file: at.shown,
                target,
                reason: read.unresolved,
              });
            return read;
          });

      const setCue = Effect.fn('SceneWriter.setCue')(function* (
        film: FilmName,
        scene: string,
        cue: string,
        patch: CuePatch,
      ) {
        const target = `cue ${cue} ${fieldsOf(patch).join(',')}`;
        const [written, read] = yield* write(
          film,
          scene,
          'timeline',
          target,
          (at, source) => editCue(at.shown, source, at.exportName, cue, patch),
          (at, after, before) => cueLanded(at.shown, before, after, at.exportName, cue, patch),
          resolves(film, scene, cue, patch, target),
        );
        const done: CueWritten = { written, read };
        return done;
      });

      const setKnob = Effect.fn('SceneWriter.setKnob')(function* (
        film: FilmName,
        scene: string,
        knob: string,
        value: Knob,
      ) {
        const [written] = yield* write(
          film,
          scene,
          'knobs',
          `knob ${knob}`,
          (at, source) => editKnob(at.shown, source, at.exportName, knob, value),
          (at, after) =>
            Result.map(readKnob(at.shown, after, at.exportName, knob), (read) =>
              Arr.filter([knob], () => !Option.exists(read, (r) => sameKnob(r, value))),
            ),
          () => Effect.void,
        );
        return written;
      });

      return SceneWriter.of({ setCue, setKnob });
    }),
  );
}
