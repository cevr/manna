import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import { expect, it } from 'effect-bun-test';

const FOCUS_SITES: ReadonlyArray<readonly [file: string, call: string, reached: string]> = [
  [
    'ask/parts.tsx',
    'focusFor(target',
    "an ask's goTo: its index's entry and its Send with a question open, pressed and clicked below",
  ],
];

const FOCUS_CALL = /(\.focus|\bfocusFor)\s*\(\s*([\w.]*)/g;

const POPUP_FOCUS = /\b(initialFocus|finalFocus)=\{\s*\(\)\s*=>(?!\s*false\s*\})\s*\(?\s*([\w.]*)/g;

const HELPER = 'focus.ts';

const READS = 4;

const focusSites = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = import.meta.dir;
  const sources = (yield* fs.readDirectory(root, { recursive: true })).filter(
    (f) => /\.tsx?$/.test(f) && f !== HELPER && !/(^|\/)fixtures\/|\.test\.tsx?$/.test(f),
  );
  const sites = yield* Effect.forEach(
    sources,
    (file) =>
      Effect.map(fs.readFileString(path.join(root, file)), (source) => [
        ...[...source.matchAll(FOCUS_CALL)].map(
          ([, callee, first]) => `${file} ${callee}(${first}`,
        ),
        ...[...source.matchAll(POPUP_FOCUS)].map(
          ([, attr, first]) => `${file} ${attr}={() => ${first}`,
        ),
      ]),
    { concurrency: READS },
  );
  return sites.flat().toSorted();
});

it.effect.layer(BunServices.layer)(
  'every place in the lab that moves the focus is a named site, with its paths',
  () =>
    Effect.map(focusSites, (sites) =>
      expect(sites).toEqual(FOCUS_SITES.map(([file, call]) => `${file} ${call}`).toSorted()),
    ),
);
