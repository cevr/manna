import glWasm from '@rive-app/webgl2-advanced/rive.wasm' with { type: 'file' };
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { Effect, FileSystem, Layer } from 'effect';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { RigUnloadable } from '../core/errors.ts';
import { onceScoped } from '../core/once.ts';
import { RiveRuntime } from './runtime.ts';

/** The WebGL 2 runtime's module, loaded with the first rig. */
const loadGl = () => import('@rive-app/webgl2-advanced');

/** Why the runtime would not start. */
const unstarted = (cause: unknown) =>
  RigUnloadable.make({ rig: 'the WebGL 2 runtime', reason: String(cause) });

/** The runtime started from `wasm` (its bytes), under a stand-in document that comes down once it has. */
const started = (wasm: Uint8Array) =>
  Effect.flatMap(Effect.tryPromise({ try: loadGl, catch: unstarted }), (module) =>
    standInDom().pipe(
      Effect.andThen(
        Effect.tryPromise({
          try: () =>
            module.default({
              wasmBinary: new Uint8Array(wasm).buffer,
              locateFile: () => glWasm,
            }),
          catch: unstarted,
        }),
      ),
      Effect.scoped,
    ),
  );

export const RiveRuntimeBun = Layer.effect(
  RiveRuntime,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const runtime = yield* onceScoped(
      fs.readFile(glWasm).pipe(
        Effect.mapError((error) => unstarted(error.message)),
        Effect.flatMap(started),
      ),
    );
    return RiveRuntime.of({
      runtime: () => runtime,
      read: (riv) =>
        Effect.mapError(fs.readFile(riv), (error) =>
          RigUnloadable.make({ rig: riv, reason: error.message }),
        ),
      paints: false,
    });
  }),
).pipe(Layer.provide(BunFileSystem.layer));
