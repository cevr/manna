/**
 * The pages' Solid 2 JSX, compiled as Bun loads it: a `.tsx` module of this
 * package goes through Solid's compiler (`@solidjs/compiler`) to its server
 * output, string templates over `@solidjs/web`, and Bun strips the types
 * that remain. The pages are drawn to whole HTML files at publish time and
 * never hydrate, so the server output is the only one.
 *
 * `registerSolidSsr` adds the plugin to Bun's runtime, for every module of
 * this package imported after it: the package's tests preload it
 * (`../test/setup.ts`), and the publisher (`apps/animations/screening.ts`)
 * calls it before it imports the pages. Only this package's own `.tsx` is
 * compiled so: a process that also loads other Solid code (the film tools,
 * in the publisher) compiles that as its own owner says. A module is only
 * read, so a load runs with the file system alone.
 */
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { transform } from '@solidjs/compiler';
import type { BunPlugin } from 'bun';
import { Effect, FileSystem, ManagedRuntime } from 'effect';

/** This package's own `.tsx` modules. */
const OWN_TSX = new RegExp(
  `^${import.meta.dir.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.+\\.tsx$`,
);

/** A `.tsx` module as Bun loads it: Solid's server output, types still in. */
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

/** Add the plugin to Bun's runtime, once. */
export const registerSolidSsr = (): void => {
  if (registered) return;
  registered = true;
  void Bun.plugin(solidSsr);
};
