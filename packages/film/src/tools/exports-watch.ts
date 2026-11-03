import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  type Layer,
  Option,
  Path,
  Schedule,
  Schema,
} from 'effect';

class ExportsChanged extends Schema.TaggedError<ExportsChanged>()('ExportsChanged', {
  files: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the exports of ${this.files.join(', ')} changed: the lab starts again to resolve them`;
  }
}

const EXPORTS_EVERY = Duration.seconds(3);

const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    workspaces: Schema.optionalKey(Schema.Array(Schema.String)),
    exports: Schema.optionalKey(Schema.Json),
  }),
);
const readPackage = Schema.decodeUnknownOption(PackageJson);
const writeJson = Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Json));

const exportsOf = (pkg: { readonly exports?: Schema.Json }): Option.Option<string> =>
  Option.flatMap(Option.fromUndefinedOr(pkg.exports), writeJson);

type Exports = ReadonlyMap<string, Option.Option<string>>;

const AGAIN = Duration.millis(250);

const readOne = (file: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readFileString(file).pipe(
      Effect.map((text) => Option.map(readPackage(text), exportsOf)),
      Effect.orElseSucceed(() => Option.none<Option.Option<string>>()),
    ),
  );

const readSettled = (file: string) =>
  Effect.flatMap(readOne(file), (read) =>
    Option.match(read, {
      onSome: () => Effect.succeed(read),
      onNone: () => Effect.andThen(Effect.sleep(AGAIN), readOne(file)),
    }),
  );

const workspacePackages = Effect.fn('exports.packages')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const own = path.join(root, 'package.json');
  const text = yield* fs.readFileString(own);
  const patterns = Option.getOrElse(
    Option.flatMap(readPackage(text), (p) => Option.fromUndefinedOr(p.workspaces)),
    () => [],
  );
  const named = yield* Effect.forEach(patterns, (pattern) => {
    const dir = path.join(root, pattern.replace(/\/\*$/, ''));
    if (!pattern.endsWith('/*')) return Effect.succeed([path.join(dir, 'package.json')]);
    return fs.readDirectory(dir).pipe(
      Effect.map((names) => names.toSorted().map((n) => path.join(dir, n, 'package.json'))),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    );
  });
  const files = yield* Effect.filter(named.flat(), (f) =>
    fs.exists(f).pipe(Effect.orElseSucceed(() => false)),
  );
  return [own, ...files];
});

const readExports = (files: ReadonlyArray<string>) =>
  Effect.map(
    Effect.forEach(files, (file) => Effect.map(readSettled(file), (read) => [file, read] as const)),
    (read) => new Map(read),
  );

const changedIn = (
  was: Exports,
  now: ReadonlyMap<string, Option.Option<Option.Option<string>>>,
): ReadonlyArray<string> =>
  Arr.filter([...now.keys()], (file) => {
    const said = (exports: Option.Option<string>) => Option.getOrElse(exports, () => '');
    const before = said(Option.flatten(Option.fromUndefinedOr(was.get(file))));
    return Option.exists(
      Option.flatten(Option.fromUndefinedOr(now.get(file))),
      (read) => said(read) !== before,
    );
  });

interface ExportsRead {
  readonly root: string;
  readonly files: ReadonlyArray<string>;
  readonly first: Exports;
}

export const exportsNow = Effect.fn('exports.now')(function* (root: string) {
  const files = yield* workspacePackages(root);
  const read = yield* readExports(files);
  const first: Exports = new Map(Arr.map([...read], ([file, r]) => [file, Option.flatten(r)]));
  yield* Effect.log(`[lab] exports.watch files=${files.length}`);
  return { root, files, first } satisfies ExportsRead;
});

export const watchExports = Effect.fn('exports.watch')(function* (
  read: ExportsRead,
  every: Duration.Input = EXPORTS_EVERY,
) {
  const path = yield* Path.Path;
  const pass = Effect.gen(function* () {
    const changed = changedIn(read.first, yield* readExports(read.files));
    if (changed.length === 0) return;
    return yield* ExportsChanged.make({ files: changed.map((f) => path.relative(read.root, f)) });
  });
  return yield* pass.pipe(Effect.repeat(Schedule.spaced(every)), Effect.andThen(Effect.never));
});

export const workspaceRoot = Effect.fn('exports.root')(function* (from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let dir = path.resolve(from);
  for (;;) {
    const text = yield* fs
      .readFileString(path.join(dir, 'package.json'))
      .pipe(Effect.orElseSucceed(() => ''));
    if (
      Option.exists(readPackage(text), (p) => Option.isSome(Option.fromUndefinedOr(p.workspaces)))
    )
      return Option.some(dir);
    const up = path.dirname(dir);
    if (up === dir) return Option.none<string>();
    dir = up;
  }
});

interface RelaunchService {
  readonly relaunch: (why: string) => Effect.Effect<never>;
}

export class Relaunch extends Context.Service<Relaunch, RelaunchService>()(
  '@manna/film/tools/Relaunch',
) {}

const isExportsChanged = Schema.is(ExportsChanged);

export const relaunchOnExportsChange = <A, E, R, ROut, E2, RIn>(
  lab: Effect.Effect<A, E | ExportsChanged, R>,
  held: Layer.Layer<ROut, E2, RIn>,
) =>
  lab.pipe(
    Effect.scoped,
    Effect.provide(held),
    Effect.catchIf(isExportsChanged, (changed) =>
      Effect.flatMap(Relaunch, (r) => r.relaunch(changed.message)),
    ),
  );
