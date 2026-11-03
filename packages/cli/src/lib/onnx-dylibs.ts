import { Config, Effect, FileSystem, Option, Path } from 'effect';

import { packagedDataCandidates } from './paths.js';

const tempDir: Config.Config<string> = Config.String('TMPDIR').pipe(Config.withDefault('/tmp'));

export const ensureOnnxDylibs: Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const candidates = packagedDataCandidates('onnxruntime');
    let staged = Option.none<string>();
    for (const candidate of candidates) {
      if (yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))) {
        staged = Option.some(candidate);
        break;
      }
    }
    if (Option.isNone(staged)) return;

    const destination = yield* tempDir;
    const entries = yield* fs.readDirectory(staged.value);
    for (const entry of entries) {
      if (!entry.endsWith('.dylib')) continue;
      const target = path.join(destination, entry);
      if (yield* fs.exists(target).pipe(Effect.orElseSucceed(() => false))) continue;
      yield* fs.copyFile(path.join(staged.value, entry), target).pipe(Effect.ignore);
    }
  }).pipe(Effect.ignore);
