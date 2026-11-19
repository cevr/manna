import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';

/** One's route types, which its dev server writes in the router root of an app the Exact port links, and git ignores. */
const ROUTE_TYPES = 'app/routes.d.ts';

/** Where they wait while Exact runs: a dot name, which Exact's staging of a package's declarations passes over. */
const ASIDE = 'app/.routes.d.ts.exact-kit';

/** The app's own manifest, read for the workspace packages it links. */
const Manifest = Schema.fromJsonString(
  Schema.Struct({ dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)) }),
);

/** Puts `aside` back at `file`, unless a dev server wrote `file` again meanwhile: then the newer one stays and `aside` goes. */
const restore = (file: string, aside: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (yield* fs.exists(file)) return yield* fs.remove(aside);
    return yield* fs.rename(aside, file);
  }).pipe(Effect.ignore);

/**
 * Sets aside, until the scope closes, the route types One wrote in each workspace package the app in `appDir` links.
 * Exact stages every declaration file in a linked package's folder, whatever its exports name, and these import
 * `one`, whose declarations alone take the app past Exact's 64 MiB cap. They go back when the run ends, fails or
 * is interrupted.
 */
export const routeTypesAside = (appDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifest = yield* fs
      .readFileString(path.join(appDir, 'package.json'))
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Manifest)), Effect.option);
    const linked = Object.entries(
      Option.match(manifest, { onNone: () => ({}), onSome: (m) => m.dependencies ?? {} }),
    )
      .filter(([, version]) => version.startsWith('workspace:'))
      .map(([name]) => name);
    yield* Effect.forEach(linked, (name) =>
      Effect.gen(function* () {
        const root = yield* Effect.option(fs.realPath(path.join(appDir, 'node_modules', name)));
        if (Option.isNone(root)) return;
        const file = path.join(root.value, ROUTE_TYPES);
        const aside = path.join(root.value, ASIDE);
        const moved = yield* fs.rename(file, aside).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
        if (!moved) return;
        yield* Effect.addFinalizer(() => restore(file, aside));
        yield* Console.error(
          `exact-kit: ${file}, One's route types, is set aside while Exact runs (its import of one passes Exact's 64 MiB declarations cap) and put back after`,
        );
      }),
    );
  });
