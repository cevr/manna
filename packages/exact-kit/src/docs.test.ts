import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

/** The docs the Exact ports are run by, from the repo root. */
const DOCS = [
  'docs/exact.md',
  'apps/heartseed-exact/AGENTS.md',
  'apps/hymnal-exact/AGENTS.md',
  'packages/exact-kit/lab/AGENTS.md',
];

/** The folders a doc's path may be written from, besides the root and the doc's own. */
const BASES = ['apps/heartseed-exact', 'apps/hymnal-exact', 'packages/exact-kit'];

/** Paths the docs write that are not the repo's: Exact's own guide in its clone, and the module Exact generates. */
const ELSEWHERE = ['docs/start-here.md', 'app.contract.d.ts'];

/** A backtick span that reads as a repo path: a folder and a file, or a file with an extension, no spaces. */
const PATHLIKE = /^(?:[\w@.-]+\/)+[\w@.-]*$|^[\w-]+\.(?:md|ts|json|contract|mjs)$/u;

/** Every backtick span of `text` that reads as a path and is not a placeholder, an absolute or a home path. */
const pathsIn = (text: string) =>
  [...text.matchAll(/`([^`\n]+)`/gu)]
    .map((m) => m[1] ?? '')
    .filter((span) => PATHLIKE.test(span) && !/[<*~]/u.test(span) && !span.startsWith('/'))
    .filter(
      (span) =>
        !span.startsWith('.exact') && !span.startsWith('node_modules') && !ELSEWHERE.includes(span),
    );

/** A workspace package's `exports` keys (`.`, `./effect`), read from its folder's `package.json`. */
const PackageJson = Schema.Struct({
  name: Schema.String,
  exports: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * Whether `specifier` (`@manna/exact-kit/effect`) names a workspace package, `apps/<name>` or `packages/<name>`
 * (the ports and the kit are named for their folders), and one of its exports.
 */
const exported = (root: string, specifier: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const [scope = '', name = '', ...rest] = specifier.split('/');
    const found = yield* Effect.forEach(['apps', 'packages'], (top) =>
      Effect.gen(function* () {
        const file = path.join(root, top, name, 'package.json');
        if (!(yield* fs.exists(file))) return false;
        const pkg = yield* Effect.flatMap(
          fs.readFileString(file),
          Schema.decodeEffect(Schema.fromJsonString(PackageJson)),
        );
        const keys = Object.keys(pkg.exports ?? {});
        return (
          pkg.name === `${scope}/${name}` &&
          (rest.length === 0 || keys.includes(`./${rest.join('/')}`))
        );
      }),
    );
    return found.some(Boolean);
  });

describe('the Exact docs', () => {
  it.effect(
    'every path and package docs/exact.md and the AGENTS.md of the apps and the lab write is one of the repo',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = path.join(
          yield* path.fromFileUrl(new URL('.', import.meta.url)),
          '..',
          '..',
          '..',
        );
        const missing = yield* Effect.forEach(DOCS, (doc) =>
          Effect.gen(function* () {
            const text = yield* fs.readFileString(path.join(root, doc));
            const bases = ['', path.dirname(doc), ...BASES];
            const named = pathsIn(text);
            const files = yield* Effect.filter(
              named.filter((written) => !written.startsWith('@')),
              (written) =>
                Effect.map(
                  Effect.forEach(bases, (base) => fs.exists(path.join(root, base, written))),
                  (found) => !found.some(Boolean),
                ),
            );
            const specifiers = yield* Effect.filter(
              named.filter((written) => written.startsWith('@')),
              (written) => Effect.map(exported(root, written), (found) => !found),
            );
            return [...files, ...specifiers].map((written) => `${doc}: ${written}`);
          }),
        );
        expect(missing.flat()).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
