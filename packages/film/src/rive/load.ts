import type { Artboard, File, LinearAnimation, RiveCanvas } from '@rive-app/webgl2-advanced';
import { Effect, Exit, Option, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import {
  INK_NUMBER,
  type LoadedRig,
  type RivePropSpec,
  inFlight,
  rigSurfaces,
} from '../canvas/rive.ts';
import { RigNameMissing, RigUnloadable } from '../core/errors.ts';
import { RiveRuntime } from './runtime.ts';

const owned = <A, E>(acquire: Effect.Effect<A, E>, free: (a: A) => void) =>
  Effect.acquireRelease(acquire, (a) => Effect.sync(() => free(a)));

const found = <A, E>(value: A, missing: () => E) =>
  Effect.mapError(Effect.fromOption(Option.fromNullishOr(value)), () => missing());

const namesOf = (count: number, nameAt: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => nameAt(i));

const artboardNames = (file: File) =>
  namesOf(file.artboardCount(), (i) => {
    const artboard = file.artboardByIndex(i);
    const name = artboard.name;
    artboard.delete();
    return name;
  });

const fileOf = (spec: RivePropSpec, runtime: RiveCanvas, bytes: Uint8Array) => {
  const unloadable = (reason: string) => RigUnloadable.make({ rig: spec.key, reason });
  return owned(
    Effect.flatMap(
      Effect.tryPromise({
        try: () => runtime.load(bytes),
        catch: (cause) => unloadable(String(cause)),
      }),
      (file) => found(file, () => unloadable(`${spec.source.riv} is not a Rive file`)),
    ),
    (file) => file.unref(),
  );
};

const numberNames = (spec: RivePropSpec, has: ReadonlyArray<string>) =>
  Option.getOrElse(Option.fromNullishOr(spec.source.numbers), () => has);

const loadRig = Effect.fn('Rive.loadRig')(function* (spec: RivePropSpec) {
  const rive = yield* RiveRuntime;
  const relabel = (error: RigUnloadable) =>
    RigUnloadable.make({ rig: spec.key, reason: `${error.rig}: ${error.reason}` });
  const missing = (kind: RigNameMissing['kind'], name: string, has: ReadonlyArray<string>) => () =>
    RigNameMissing.make({ rig: spec.key, kind, name, has: [...has] });
  const { source } = spec;

  const runtime = yield* Effect.mapError(rive.runtime(spec.engine), relabel);
  const bytes = yield* Effect.mapError(rive.read(source.riv), relabel);
  const file = yield* fileOf(spec, runtime, bytes);
  const artboard: Artboard = yield* owned(
    Effect.suspend(() =>
      found(file.artboardByName(source.artboard), () =>
        missing('artboard', source.artboard, artboardNames(file))(),
      ),
    ),
    (a) => a.delete(),
  );

  const animations = namesOf(artboard.animationCount(), (i) => artboard.animationByIndex(i).name);
  const timelines = new Map<string, LinearAnimation>();
  for (const name of source.timelines) {
    const at = animations.indexOf(name);
    if (at < 0) return yield* missing('timeline', name, animations)();
    timelines.set(name, artboard.animationByIndex(at));
  }

  const model = Option.fromNullishOr(file.defaultArtboardViewModel(artboard));
  const vmNumbers = yield* Option.match(model, {
    onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
    onSome: (m) =>
      Effect.acquireUseRelease(
        Effect.sync(() => m.defaultInstance()),
        (v) =>
          Effect.sync(() =>
            v
              .getProperties()
              .filter((p) => `${p.type}` === 'number')
              .map((p) => p.name),
          ),
        (v) => Effect.sync(() => v.delete()),
      ),
  });
  const numbers = numberNames(spec, vmNumbers);
  for (const name of numbers)
    if (!vmNumbers.includes(name)) return yield* missing('view-model number', name, vmNumbers)();
  if (Option.isSome(Option.fromNullishOr(spec.ink)) && !vmNumbers.includes(INK_NUMBER))
    return yield* missing('view-model number', INK_NUMBER, vmNumbers)();

  for (const { node } of Option.toArray(Option.fromNullishOr(spec.face)))
    yield* found(artboard.node(node), missing('node', node, []));

  const scratch = yield* owned(
    Effect.sync(() => new runtime.Mat2D()),
    (m) => m.delete(),
  );
  const frame = yield* owned(Effect.sync(inFlight), (f) => f.free());
  const surfaces = yield* owned(
    Effect.sync(() =>
      rigSurfaces(runtime, () => file.artboardByName(source.artboard), scratch, frame),
    ),
    (s) => s.free(),
  );
  const rig: LoadedRig = {
    runtime,
    paints: rive.paints,
    file,
    timelines,
    model: Option.getOrUndefined(model),
    numbers: new Set(numbers),
    scratch,
    surfaces,
    frame,
  };
  return rig;
});

export const loadRigs = Effect.fn('Rive.loadRigs')(function* (
  film: Film,
): Effect.fn.Return<Film, RigUnloadable | RigNameMissing, RiveRuntime | Scope.Scope> {
  const caller = yield* Scope.Scope;
  const stood = Effect.gen(function* () {
    const loaded = new Map<RivePropSpec, LoadedRig>();
    for (const spec of film.rigs.declared) loaded.set(spec, yield* loadRig(spec));
    yield* Effect.acquireRelease(
      Effect.sync(() => film.rigs.stand(loaded)),
      (down) => Effect.sync(down),
    );
    return film;
  });
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const own = yield* Scope.make('sequential');
      const done = yield* Effect.exit(restore(Scope.provide(stood, own)));
      if (Exit.isFailure(done)) {
        yield* Scope.close(own, done);
        return yield* done;
      }
      yield* Scope.addFinalizerExit(caller, (exit) => Scope.close(own, exit));
      return done.value;
    }),
  );
});
