# Bible corpus builds and installation

`bun run --cwd packages/core sync:bible`, `sync:bible:force`, and
`manna sync [--force]` build the workspace Bible database from bundled JSON
assets. The default output is `packages/core/data/bible.db`. Both entry points
call `defaultBibleSyncPaths` and `syncBible` in
`packages/core/src/sync/bible-sync.ts`.

A build does not update an installed database. The builder has no runtime
destination or HOME/USERPROFILE lookup. Without `--force`, an existing workspace
database stays unchanged. A rebuild stages the canonical schema in `.building`
and moves it into the workspace output after installation succeeds.

Installation is explicit. `manna init` consumes `BIBLE_ARTIFACT_RELEASE` through
`ensureArtifacts` in `packages/cli/src/commands/init.ts`. It fetches the pinned
GitHub release asset. It does not consume the local Bible build output. This
change leaves init's source selection, validation, and replacement policy intact.

## Build and sync audit

The table records source inspection. The regression tests measure isolated
filesystem effects with synthetic data. No full corpus build, real model load,
native compilation, or owner database access is needed for these guards.

| Entry point                                                              | Output and HOME effects                                                                                                                                       | Disposition                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core `sync:bible`, `sync:bible:force`; CLI `manna sync [--force]`        | Workspace `data/bible.db` only; no runtime copy                                                                                                               | Fixed in `bible-sync.ts`. Scratch-home tests cover force, existing output, HOME/USERPROFILE/neither, and installed sentinel bytes.                                                                                  |
| Scripts `build:topics`                                                   | Workspace `packages/core/data/topics.db` by default. Bible and writings inputs can default to HOME/.bible; `topics-compiler/lookups.ts` opens them read-only. | No implicit installation. Explicit `--out` is the operator's destination.                                                                                                                                           |
| Scripts `build:webster`                                                  | Workspace `webster.db` and manifest; `webster-compiler/compile.ts` rejects output inside HOME/.bible.                                                         | Preserve the existing guard. `initializeWebster` belongs to explicit init installation.                                                                                                                             |
| Scripts `build:vectors`                                                  | Workspace `vectors.bvi`, `.part`, and checkpoint. `vector-compiler/source.ts` reads writings read-only.                                                       | `vector-compiler/paths.ts` supplies `packages/core/node_modules/.cache/bible-models` to the build embedder. `BIBLE_MODEL_CACHE` still overrides it. The normal CLI embedder still falls back to HOME/.bible/models. |
| CLI `build` (`packages/cli/scripts/build.ts`)                            | Workspace `bin/manna`, package/bin data assets, ONNX dylibs, and package `node_modules/.bin/manna`                                                            | Workspace staging only; no implicit HOME installation.                                                                                                                                                              |
| Core `scripts/build-native.sh`                                           | Workspace `dist-native`; Zig caches default to `packages/core/node_modules/.cache/zig/{global,local}`                                                         | Fixed cache defaults. Explicit `ZIG_GLOBAL_CACHE_DIR` and `ZIG_LOCAL_CACHE_DIR` remain supported independently. The fake-toolchain test copies the script and uses scratch artifacts only.                          |
| CLI `process-bible-data.ts`, `process-tske.ts`, `scrape-margin-notes.ts` | Bundled core source assets                                                                                                                                    | Workspace outputs; no data regeneration in this fix.                                                                                                                                                                |
| `manna egw sync`, `manna egw download`                                   | Acquire and install writings into runtime storage                                                                                                             | Explicit runtime installation. A repository build must not invoke these commands.                                                                                                                                   |
| CLI `scripts/backfill-book-classification.ts`                            | Updates HOME/.bible/egw-paragraphs.db unless dry-run                                                                                                          | Explicit runtime maintenance, outside package builds. Follow-up: require an explicit database destination and a safe maintenance contract before using it as build tooling.                                         |
| Hymnal                                                                   | No build/sync entry in core, CLI, or scripts at this unit's base; runtime reader `core/src/hymnal/service-bun.ts`, installer in init                          | Generation is owned by the separate hymndb unit and must remain workspace-only.                                                                                                                                     |
| Study (`core/src/study/service-bun.ts`, CLI `commands/study.ts`)         | Bible is immutable/read-only. Writings opens read-write for schema initialization. Bundle output uses caller paths.                                           | No repository corpus build/sync entry. Follow-up: review the runtime writings initialization contract. This is not a universally read-only service.                                                                 |

Build defaults must not write to HOME-derived runtime or cache locations,
including third-party caches. An explicit cache override or output path is the
operator's selected location. A checkout inside the user's home remains a valid
workspace. This boundary is not a generic filesystem sandbox.

## Owner release procedure

These are owner release actions, separate from this source fix. Do not run them
as part of its tests.

1. In an isolated workspace, create scratch HOME and a separate Bun transpiler
   cache. Build and validate the full corpus there:

   ```sh
   biblebuild_scratch_home=$(mktemp -d /tmp/biblebuild-home.XXXXXX)
   biblebuild_bun_cache=$(mktemp -d /tmp/biblebuild-bun-cache.XXXXXX)
   HOME="$biblebuild_scratch_home" BUN_RUNTIME_TRANSPILER_CACHE_PATH="$biblebuild_bun_cache" bun run --cwd packages/core sync:bible:force
   ```

2. Record the SHA-256 digest and exact byte length of that final `bible.db`.
   Keep the bytes and metadata together. The database includes installation
   time, so do not rebuild it after hashing and assume the digest is unchanged.
   A workflow artifact can transport review bytes. Init needs a stable release
   asset.

3. Publish `bible.db` as an asset on a new immutable release in `cevr/manna`.
   For example, the owner can replace each placeholder and run:

   ```sh
   gh release create <new-tag> packages/core/data/bible.db --repo cevr/manna --title <title> --notes-file <release-notes-file>
   ```

   Use a new `db-<version>` tag. Do not replace the existing db-v2 asset under
   its old digest.

4. In a separate owner-controlled release change, update
   `BIBLE_ARTIFACT_RELEASE` in
   `packages/core/src/corpus-supply/file-artifact.ts`: release URL, revision,
   `sha256:<hex>` digest, and exact byte length. The unchanged source pin for
   this unit is db-v2 at
   `https://github.com/cevr/manna/releases/download/db-v2/bible.db`, with size
   156,291,072 bytes.

5. Ship the pin through the normal CLI distribution. The user explicitly runs
   `manna init` to install, or its existing `--force` option when replacement is
   intended. This unit does not assert fresh-home init success; the initfresh
   unit owns that verification. It adds no installer or artifact fallback.
