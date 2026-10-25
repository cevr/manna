// A ref under a root's alias (`ReviewRoot.aliases`): the lab's asks keep refs
// written while the checkout `manna` was the folder `bible-tools`, and each
// names the same file, folder and page as its `manna/` twin, on the server
// (`pathOf`) and on the page (`folderAt`, `docAt`, `videoAt`).

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Option, Path } from 'effect';
import {
  type ReviewFolder,
  type ReviewIndex,
  canonicalRef,
  docAt,
  folderAt,
  videoAt,
} from '../core/review.ts';
import { canonicalOf, pathOf, refOf } from './review.ts';

const roots = [
  { label: 'manna', path: '/m/manna/out', aliases: ['bible-tools'] },
  { label: 'rbf-arms-rig', path: '/m/.rifts/manna/rbf-arms-rig/out' },
];

/** A folder `ref` of the index with one document and one loose video. */
const folder = (ref: string): ReviewFolder => ({
  ref,
  title: Option.none(),
  blurb: Option.none(),
  mtime: 1,
  sets: [],
  videos: [{ ref: `${ref}/cut.mp4`, name: 'cut.mp4', size: 1, mtime: 1, phone: 'none' }],
  images: [],
  docs: [{ ref: `${ref}/notes.md`, name: 'notes.md', size: 1, mtime: 1 }],
});

describe('a ref under an alias', () => {
  it.effect(
    'names the file its twin under the label names, and a ref is written with the label',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const twin = pathOf(roots, 'manna/rbf-v3/docs/a.md', path);
        expect(twin).toEqual(Option.some('/m/manna/out/rbf-v3/docs/a.md'));
        expect(pathOf(roots, 'bible-tools/rbf-v3/docs/a.md', path)).toEqual(twin);
        expect(pathOf(roots, 'bible-tools/../../etc/passwd', path)).toEqual(Option.none());
        expect(refOf(roots, '/m/manna/out/rbf-v3/docs/a.md', path)).toEqual(
          Option.some('manna/rbf-v3/docs/a.md'),
        );
        expect(canonicalOf(roots, 'bible-tools/rbf-v3')).toBe('manna/rbf-v3');
        expect(canonicalOf(roots, 'bible-tools')).toBe('manna');
        // Only a label: a folder named like the alias under another root is its own.
        expect(canonicalOf(roots, 'rbf-arms-rig/bible-tools/a.md')).toBe(
          'rbf-arms-rig/bible-tools/a.md',
        );
        expect(canonicalOf(roots, 'bible-toolsy/a.md')).toBe('bible-toolsy/a.md');
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'names nothing when a real root has the alias as its label, or two roots claim it',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const real = [...roots, { label: 'bible-tools', path: '/old/bible-tools/out' }];
        expect(canonicalOf(real, 'bible-tools/rbf-v3')).toBe('bible-tools/rbf-v3');
        expect(pathOf(real, 'bible-tools/rbf-v3/a.md', path)).toEqual(
          Option.some('/old/bible-tools/out/rbf-v3/a.md'),
        );
        const twice = [...roots, { label: 'other', path: '/o/out', aliases: ['bible-tools'] }];
        expect(canonicalOf(twice, 'bible-tools/rbf-v3')).toBe('bible-tools/rbf-v3');
        expect(pathOf(twice, 'bible-tools/rbf-v3/a.md', path)).toEqual(Option.none());
      }).pipe(Effect.provide(BunServices.layer)),
  );

  test('opens the folder page, and an ask’s document and video, of its twin', () => {
    const index: ReviewIndex = {
      folders: [folder('manna/rbf-v3'), folder('rbf-arms-rig/arms')],
      // As the review's index sends them for `roots` (review.slow.test.ts).
      aliases: { 'bible-tools': 'manna' },
    };
    // The folder page `/sets/bible-tools%2Frbf-v3` looks its folder up by the ref in its address.
    expect(folderAt(index, 'bible-tools/rbf-v3')).toEqual(folderAt(index, 'manna/rbf-v3'));
    expect(Option.map(folderAt(index, 'bible-tools/rbf-v3'), (f) => f.ref)).toEqual(
      Option.some('manna/rbf-v3'),
    );
    expect(docAt(index, 'bible-tools/rbf-v3/notes.md')).toEqual(
      docAt(index, 'manna/rbf-v3/notes.md'),
    );
    expect(Option.isSome(docAt(index, 'bible-tools/rbf-v3/notes.md'))).toBe(true);
    expect(videoAt(index, 'bible-tools/rbf-v3/cut.mp4')).toEqual(
      videoAt(index, 'manna/rbf-v3/cut.mp4'),
    );
    expect(Option.isSome(videoAt(index, 'bible-tools/rbf-v3/cut.mp4'))).toBe(true);
    // An index with no aliases (an older server) reads a ref as it is.
    const plain: ReviewIndex = { folders: index.folders };
    expect(folderAt(plain, 'bible-tools/rbf-v3')).toEqual(Option.none());
    expect(canonicalRef({}, 'bible-tools/rbf-v3')).toBe('bible-tools/rbf-v3');
    expect(canonicalRef({ 'bible-tools': 'manna' }, 'toString/x')).toBe('toString/x');
  });
});
