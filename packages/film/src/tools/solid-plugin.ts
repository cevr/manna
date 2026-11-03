import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { transform } from '@solidjs/compiler';
import type { BunPlugin } from 'bun';
import { Effect, FileSystem, ManagedRuntime } from 'effect';

export type SolidOutput = 'dom' | 'ssr';

const compile = Effect.fn('solid.compile')(function* (path: string, generate: SolidOutput) {
  const fs = yield* FileSystem.FileSystem;
  const code = yield* fs.readFileString(path);
  const out = transform(code, {
    filename: path,
    generate,
    hydratable: true,
    moduleName: '@solidjs/web',
  });
  return { contents: out.code, loader: 'ts' as const };
});

export const solidPluginFor = (generate: SolidOutput): BunPlugin => ({
  name: `solid-jsx-${generate}`,
  setup(build) {
    const runtime = ManagedRuntime.make(BunFileSystem.layer);
    build.onLoad({ filter: /\.tsx$/ }, (args) => runtime.runPromise(compile(args.path, generate)));
  },
});

export const solidPlugin: BunPlugin = solidPluginFor('dom');

export default solidPlugin;
