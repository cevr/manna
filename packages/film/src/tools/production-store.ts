import {
  Array as Arr,
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import {
  type MoveForward,
  type OwnerWord,
  type ProductionFile,
  type ProductionId,
  aimedWord,
  currentVersion,
  moveForward,
  newProduction,
  ProductionFile as ProductionFileSchema,
  withFiled,
  withSaid,
} from '../core/production.ts';
import type { VersionMoved, WordUnaimed } from '../core/refusals.ts';
import { ReviewManifest } from '../core/review.ts';
import { repoJson } from '../core/schema.ts';
import { FileInvalid } from './errors.ts';
import { ContentStore, type Manifest, type StoreError, writeWhole } from './content-store.ts';

const ProductionFileJson = repoJson(ProductionFileSchema);

const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const ledgerOf = (production: ProductionId) =>
  ProductionFileJson.check(
    Schema.makeFilter(
      (file) =>
        file.production === production ||
        `it holds the production ${file.production}, not ${production}, the one its file is named for`,
    ),
  );

class ProductionKept extends Schema.TaggedError<ProductionKept>()('ProductionKept', {
  production: Schema.String,
}) {
  override get message() {
    return `${this.production} already has a ledger: film production show ${this.production}`;
  }
}

class VersionUnknown extends Schema.TaggedError<VersionUnknown>()('VersionUnknown', {
  production: Schema.String,
  version: Schema.Int,
  current: Schema.Int,
}) {
  override get message() {
    return `${this.production} has no v${this.version} (v1 to v${this.current})`;
  }
}

class ProductionUnkept extends Schema.TaggedError<ProductionUnkept>()('ProductionUnkept', {
  production: Schema.String,
}) {
  override get message() {
    return `${this.production} keeps no ledger: start it (\`film production new ${this.production}\`), or name one \`film production list\` lists`;
  }
}

interface Start {
  readonly title: string;
  readonly film: Option.Option<string>;
  readonly blurb: Option.Option<string>;
  readonly first: string;
  readonly at: number;
}

interface ProductionStoreService {
  readonly list: Effect.Effect<ReadonlyArray<ProductionFile>, StoreError>;
  readonly read: (
    production: ProductionId,
  ) => Effect.Effect<Option.Option<ProductionFile>, StoreError>;
  readonly modify: <E>(
    production: ProductionId,
    change: (current: ProductionFile) => Result.Result<ProductionFile, E>,
  ) => Effect.Effect<ProductionFile, E | StoreError>;
  readonly attempt: <A, E>(
    production: ProductionId,
    change: (current: ProductionFile) => Result.Result<readonly [A, ProductionFile], E>,
  ) => Effect.Effect<A, E | StoreError>;
  readonly start: (
    production: ProductionId,
    start: Start,
  ) => Effect.Effect<ProductionFile, ProductionKept | StoreError>;
  readonly forward: (
    production: ProductionId,
    move: MoveForward,
    at: number,
  ) => Effect.Effect<ProductionFile, VersionMoved | StoreError>;
  readonly say: (
    production: ProductionId,
    said: OwnerWord,
  ) => Effect.Effect<ProductionFile, WordUnaimed | StoreError>;
  readonly file: (
    production: ProductionId,
    set: string,
    version: number,
  ) => Effect.Effect<ProductionFile, VersionUnknown | StoreError>;
  readonly stamp: (
    production: ProductionId,
    version: Option.Option<number>,
    at: number,
  ) => Effect.Effect<Stamp, ProductionUnkept | VersionUnknown | StoreError>;
  readonly publish: (
    folder: string,
    production: ProductionId,
    version: Option.Option<number>,
    at: number,
  ) => Effect.Effect<void, ProductionUnkept | VersionUnknown | FileInvalid | StoreError>;
}

export class ProductionStore extends Context.Service<ProductionStore, ProductionStoreService>()(
  '@manna/film/tools/ProductionStore',
) {
  static readonly layer = Layer.effect(
    ProductionStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const dir = yield* Config.String('FILMS_PRODUCTIONS').pipe(
        Config.withDefault(path.resolve('productions')),
      );

      const manifest = (production: ProductionId): Manifest<ProductionFile> => ({
        file: path.join(dir, `${production}.json`),
        codec: ledgerOf(production),
        empty: newProduction(production, production, 0),
      });

      const kept = (production: ProductionId) => fs.exists(manifest(production).file);

      const read = (production: ProductionId) =>
        Effect.flatMap(kept(production), (is) =>
          Effect.when(store.read(manifest(production)), Effect.succeed(is)),
        );

      const list = Effect.gen(function* () {
        if (!(yield* fs.exists(dir))) return [];
        const names = (yield* fs.readDirectory(dir)).filter((n) => n.endsWith('.json')).toSorted();
        const files = yield* Effect.forEach(names, (name) =>
          store.read(manifest(name.slice(0, -'.json'.length))).pipe(
            Effect.asSome,
            Effect.catchTag('FileInvalid', (invalid) =>
              Effect.as(
                Effect.logWarning(
                  `production.ledger.invalid file=${name} reason=${quoted(invalid.message)}`,
                ),
                Option.none<ProductionFile>(),
              ),
            ),
          ),
        );
        return Arr.getSomes(files);
      });

      const stamp = (production: ProductionId, version: Option.Option<number>, at: number) =>
        Effect.gen(function* () {
          const ledger = yield* read(production);
          if (Option.isNone(ledger)) return yield* ProductionUnkept.make({ production });
          const opened = currentVersion(ledger.value);
          const unopened = Option.filter(version, (n) => n < 1 || n > opened);
          if (Option.isSome(unopened))
            return yield* VersionUnknown.make({
              production,
              version: unopened.value,
              current: opened,
            });
          return { production, version, published: at } satisfies Stamp;
        });

      const modify = <E>(
        production: ProductionId,
        change: (current: ProductionFile) => Result.Result<ProductionFile, E>,
      ) => store.modify(manifest(production), change);

      return ProductionStore.of({
        list,
        read,
        modify,
        attempt: (production, change) =>
          store.transact(manifest(production), (current) => Effect.fromResult(change(current))),
        start: (production, start) =>
          Effect.gen(function* () {
            if (Option.isSome(yield* read(production)))
              return yield* ProductionKept.make({ production });
            return yield* modify(production, () =>
              Result.succeed({
                ...newProduction(production, start.title, start.at, start.film),
                blurb: start.blurb,
                versions: [{ at: start.at, title: start.first, because: Option.none() }],
              }),
            );
          }),
        forward: (production, move, at) =>
          modify(production, (current) => moveForward(current, move, at)),
        say: (production, said) =>
          modify(production, (current) =>
            Result.map(aimedWord(said), (word) => withSaid(current, word)),
          ),
        file: (production, set, version) =>
          modify(production, (current) => {
            const n = currentVersion(current);
            if (version < 1 || version > n)
              return Result.fail(VersionUnknown.make({ production, version, current: n }));
            return Result.succeed(withFiled(current, { set, version }));
          }),
        stamp,
        publish: (folder, production, version, at) =>
          Effect.gen(function* () {
            const file = path.join(folder, 'review.json');
            const given = yield* stamp(production, version, at);
            const text = yield* stampManifest(file, yield* fs.readFileString(file), given);
            yield* writeWhole(fs, file, (partial) => fs.writeFileString(partial, text));
          }),
      });
    }),
  );
}

const ManifestJson = repoJson(Schema.JsonObject);

export interface Stamp {
  readonly production: ProductionId;
  readonly version: Option.Option<number>;
  readonly published: number;
}

export const stampedManifest = <J extends Readonly<Record<string, Schema.Json>>>(
  json: J,
  stamp: Stamp,
) => {
  const { version: _was, ...rest } = json;
  return {
    ...rest,
    production: stamp.production,
    ...Option.match(stamp.version, { onNone: () => ({}), onSome: (version) => ({ version }) }),
    published: stamp.published,
  };
};

const stampManifest = (file: string, text: string, stamp: Stamp) =>
  Effect.gen(function* () {
    const invalid = (issue: Schema.SchemaError) =>
      FileInvalid.make({ file, reason: issue.message });
    const json = yield* Schema.decodeEffect(ManifestJson)(text).pipe(Effect.mapError(invalid));
    const stamped = stampedManifest(json, stamp);
    yield* Schema.decodeEffect(ReviewManifest)(stamped).pipe(Effect.mapError(invalid));
    return yield* Schema.encodeEffect(ManifestJson)(stamped).pipe(Effect.mapError(invalid));
  });
