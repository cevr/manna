import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { transform } from '@solidjs/compiler';
import type { BunPlugin } from 'bun';
import { Effect, FileSystem, ManagedRuntime } from 'effect';

/** What a module compiles to: DOM expressions for the browser, string templates for the server. */
export type SolidOutput = 'dom' | 'ssr';

/** A `.tsx` module as the bundler loads it: Solid's `generate` output, hydratable, types still in. */
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

/** The plugin compiling `.tsx` to `generate`'s output. */
export const solidPluginFor = (generate: SolidOutput): BunPlugin => ({
  name: `solid-jsx-${generate}`,
  setup(build) {
    const runtime = ManagedRuntime.make(BunFileSystem.layer);
    build.onLoad({ filter: /\.tsx$/ }, (args) => runtime.runPromise(compile(args.path, generate)));
  },
});

/** The browser's: DOM output, which a server render's markup hydrates under. */
export const solidPlugin: BunPlugin = solidPluginFor('dom');

export default solidPlugin;
