import type { ReviewRoot } from '@manna/film/tools';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

const FORMER_NAMES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([['manna', ['bible']]]);

const FORMER_LABELS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['manna', ['bible-tools']],
]);

const sameRepository = (name: string, named: string) =>
  named === name ||
  [...FORMER_NAMES].some(([now, before]) => {
    const names = [now, ...before];
    return names.includes(name) && names.includes(named);
  });

const RootPackage = Schema.fromJsonString(Schema.Struct({ name: Schema.String }));

const packageName = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = yield* fs.readFileString(path.join(dir, 'package.json'));
    return (yield* Schema.decodeEffect(RootPackage)(text)).name;
  }).pipe(Effect.option);

const foldersIn = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
    return names.map((name) => path.join(dir, name));
  });

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

export const checkoutRootsOf = (repo: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const name = yield* packageName(repo);
    if (Option.isNone(name)) return [];
    const parent = path.dirname(repo);
    const elsewhere = yield* foldersIn(path.join(parent, '.rifts', path.basename(repo)));
    const candidates = [...new Set([...(yield* foldersIn(parent)), ...elsewhere])];
    const source = yield* sourceOf(repo);
    const isSource = (dir: string) =>
      Effect.map(fs.realPath(dir).pipe(Effect.option), (real) =>
        Option.exists(source, (made) => Option.contains(real, made)),
      );
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
