// The checkouts of this repository on this machine, so the lab's review sees
// the renders of each (`checkoutRoots`, cli.ts). A checkout is a folder whose
// root `package.json` names the same package as this one's (or a name it
// had, `FORMER_NAMES`): the folders
// beside it (worktrees, or the Rifts beside a Rift), and the Rifts made from
// it (`<p>/.rifts/<name>/<rift>` for `<p>/<name>`), when there are some. A
// say on a set writes its catalogue, so two kinds of checkout are left out of
// a lab's review: every warm source but the lab's own (a folder `<p>/<name>`
// with `<p>/.rifts/<name>` beside it, kept clean for its Rifts; a folder in a
// `.rifts` folder is a Rift, never a warm source, even with Rifts of its
// own), and, when the lab's checkout is a git worktree, the checkout it was
// made from (git's main worktree, another checkout's work). A folder's name
// says nothing.

import type { ReviewRoot } from '@bible/film/tools';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

/**
 * The root package names a checkout of this repository has had, each with
 * the ones before it: a checkout not yet brought up to date (a Rift on an
 * older commit) still names its root package `bible`, and is still one.
 */
const FORMER_NAMES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([['manna', ['bible']]]);

/**
 * The labels a checkout's refs were written under before its folder took
 * its name (`ReviewRoot.aliases`): the lab's asks keep refs to the folder
 * `manna` written while it was `bible-tools`.
 */
const FORMER_LABELS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['manna', ['bible-tools']],
]);

/** Whether root packages named `name` and `named` are checkouts of one repository, by its names now or before. */
const sameRepository = (name: string, named: string) =>
  named === name ||
  [...FORMER_NAMES].some(([now, before]) => {
    const names = [now, ...before];
    return names.includes(name) && names.includes(named);
  });

/** The one field of a root `package.json` a checkout is known by. */
const RootPackage = Schema.fromJsonString(Schema.Struct({ name: Schema.String }));

/** The package `dir`'s root `package.json` names; none without a readable one. */
const packageName = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = yield* fs.readFileString(path.join(dir, 'package.json'));
    return (yield* Schema.decodeEffect(RootPackage)(text)).name;
  }).pipe(Effect.option);

/** The folders in `dir`, as paths; none when it cannot be read. */
const foldersIn = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
    return names.map((name) => path.join(dir, name));
  });

/**
 * The checkout `dir` was made from when it is a git worktree of another
 * (`git worktree add`): git's main worktree, the folder holding the common
 * git folder its `.git` file's `gitdir` names (by that folder's
 * `commondir`), by its real path; none for a main worktree or a Rift,
 * whose `.git` is a folder.
 */
const sourceOf = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const link = yield* fs.readFileString(path.join(dir, '.git'));
    const admin = path.resolve(
      dir,
      yield* Effect.fromOption(Option.fromNullishOr(/^gitdir: (.+)$/m.exec(link)?.[1])),
    );
    const common = path.resolve(
      admin,
      (yield* fs.readFileString(path.join(admin, 'commondir'))).trim(),
    );
    return yield* fs.realPath(path.dirname(common));
  }).pipe(Effect.option);

/**
 * The renders (`apps/animations/out`) of every checkout of the repository at
 * `repo` that has some, this one's included, each labelled by its folder's
 * name, sorted by it, less every warm source but `repo` and the checkout
 * `repo` was made from (`sourceOf`): a say on a set writes its catalogue.
 */
export const checkoutRootsOf = (repo: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const name = yield* packageName(repo);
    if (Option.isNone(name)) return [];
    const parent = path.dirname(repo);
    // A warm source's Rifts, and a Rift's own when Rifts were made from it: the folders
    // of `<p>/.rifts/<name>`, when it is there.
    const elsewhere = yield* foldersIn(path.join(parent, '.rifts', path.basename(repo)));
    const candidates = [...new Set([...(yield* foldersIn(parent)), ...elsewhere])];
    const source = yield* sourceOf(repo);
    const isSource = (dir: string) =>
      Effect.map(fs.realPath(dir).pipe(Effect.option), (real) =>
        Option.exists(source, (made) => Option.contains(real, made)),
      );
    // A warm source: `<p>/<name>` with its Rifts' folder, `<p>/.rifts/<name>`, beside it,
    // and not itself a Rift (`<q>/.rifts/<repo>/<name>`), which can have Rifts of its own.
    const isWarm = (dir: string) =>
      Effect.map(
        fs
          .exists(path.join(path.dirname(dir), '.rifts', path.basename(dir)))
          .pipe(Effect.orElseSucceed(() => false)),
        (rifted) => rifted && path.basename(path.dirname(path.dirname(dir))) !== '.rifts',
      );
    const leftOut = (dir: string) =>
      Effect.zipWith(isSource(dir), isWarm(dir), (made, warm) => made || (warm && dir !== repo));
    const checkouts = yield* Effect.filter(candidates, (dir) =>
      Effect.zipWith(
        packageName(dir),
        leftOut(dir),
        (named, left) => !left && Option.exists(named, (n) => sameRepository(name.value, n)),
      ),
    );
    // A root labelled as another's alias wins over it (`aliasesOf`).
    const roots = checkouts
      .map((dir): ReviewRoot => {
        const label = path.basename(dir);
        return {
          label,
          path: path.join(dir, 'apps', 'animations', 'out'),
          aliases: FORMER_LABELS.get(label) ?? [],
        };
      })
      .toSorted((a, b) => a.label.localeCompare(b.label));
    return yield* Effect.filter(roots, (root) =>
      fs.exists(root.path).pipe(Effect.orElseSucceed(() => false)),
    );
  });
