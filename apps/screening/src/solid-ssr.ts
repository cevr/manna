import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { transform } from '@solidjs/compiler';
import type { BunPlugin } from 'bun';
import { Effect, FileSystem, ManagedRuntime } from 'effect';

const OWN_TSX = new RegExp(
  `^${import.meta.dir.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.+\\.tsx$`,
);

const compile = Effect.fn('solid.compile')(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const code = yield* fs.readFileString(path);
  const out = transform(code, {
    filename: path,
    generate: 'ssr',
    hydratable: false,
    moduleName: '@solidjs/web',
  });
  return { contents: out.code, loader: 'ts' as const };
});

const solidSsr: BunPlugin = {
  name: 'screening-solid-ssr',
  setup(build) {
    const runtime = ManagedRuntime.make(BunFileSystem.layer);
    build.onLoad({ filter: OWN_TSX }, (args) => runtime.runPromise(compile(args.path)));
  },
};

let registered = false;

export const registerSolidSsr = (): void => {
  if (registered) return;
  registered = true;
  void Bun.plugin(solidSsr);
};
