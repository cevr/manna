import { fileURLToPath } from 'node:url';

import { Effect, FileSystem, Path, Schema } from 'effect';

const TypeScriptPackage = Schema.fromJsonString(
  Schema.Struct({ bin: Schema.Struct({ tsc: Schema.String }) }),
);

export const tscScript = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifest = fileURLToPath(import.meta.resolve('typescript/package.json'));
  const { bin } = yield* Schema.decodeEffect(TypeScriptPackage)(yield* fs.readFileString(manifest));
  return path.join(path.dirname(manifest), bin.tsc);
});
