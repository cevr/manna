/**
 * Init CLI Command
 *
 * `manna init` - Initialize all databases in ~/.bible/
 *
 * Downloads pre-built databases from GitHub:
 * - bible.db: KJV text, Strong's concordance, cross-references
 * - hymnal.db: 695 SDA hymns and 225 liturgical readings
 * - egw-paragraphs.db: too large to host — prints sync instructions
 */

import {
  BIBLE_ARTIFACT_RELEASE,
  CorpusSupply,
  type CorpusSupplyReceipt,
  Target,
  topicsReleaseSource,
} from '@manna/core/corpus-supply';
import {
  layerNativeBibleArtifacts,
  layerNativeTopicsArtifacts,
  type NativeFileArtifactSource,
} from '@manna/core/corpus-supply/bun';
import { Config, Console, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { HttpClient, HttpClientResponse } from 'effect/http';

import { packagedDataCandidates } from '~/src/lib/paths';
import { initializeWebster } from './webster.js';
import {
  checkSqliteRefresh,
  SqliteRefreshRefused,
  withSqliteRefresh,
} from '../lib/sqlite-refresh.js';

class InitError extends Schema.TaggedError<InitError>()('InitError', {
  cause: Schema.Unknown,
}) {}

const GITHUB_RAW = 'https://raw.githubusercontent.com/cevr/manna/main';

const DBS = {
  hymnal: {
    name: 'hymnal.db',
    url: `${GITHUB_RAW}/packages/core/data/hymnal.db`,
    description: 'SDA Hymnal (695 hymns and 225 readings)',
    size: '~21 MiB',
  },
} as const;

const force = Flag.Boolean('force').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Re-download databases even if they exist'),
);

const downloadFile = (url: string, dest: string, label: string, refresh: boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* Console.log(`Downloading ${label}...`);
    const bytes = yield* HttpClient.get(url).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.arrayBuffer),
      Effect.mapError((cause) => InitError.make({ cause })),
    );
    if (refresh) yield* checkSqliteRefresh(dest);
    yield* fs.writeFile(dest, new Uint8Array(bytes));
  });

/** Hymnal acquisition is separate from other corpora so callers can supply an isolated destination. */
const ensureHymnal = Effect.fn('Init.ensureHymnal')(function* (
  destination: string,
  refresh: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const db = DBS.hymnal;
  if (!refresh && (yield* fs.exists(destination))) {
    yield* Console.log(`✓ ${db.name} (${db.description})`);
  } else {
    yield* downloadFile(db.url, destination, `${db.name} ${db.size}`, refresh);
    yield* Console.log(`✓ ${db.name} installed`);
  }
});

const artifactStatus = (receipt: CorpusSupplyReceipt): string => {
  if (receipt.activated.length > 0) return 'installed and verified';
  return 'ready';
};

/**
 * Resolve the bible and topics artifacts against one `CorpusSupply`
 * composition. The supply layer is built and provided here, at this
 * operation's own boundary, so the command handler never provides inline.
 */
const artifactSupply = (bibleDir: string, path: Path.Path) => {
  const bibleArtifacts = layerNativeBibleArtifacts({
    destination: path.join(bibleDir, 'bible.db'),
    sources: [{ kind: 'release', ...BIBLE_ARTIFACT_RELEASE }],
  });
  // Topics has no published release yet, so its sources are the local slots,
  // in the same precedence every host uses: the copy shipped inside the CLI
  // install, the workspace build `bun run build:topics` writes, and any copy
  // already installed under ~/.bible.
  const topicsArtifacts = layerNativeTopicsArtifacts({
    destination: path.join(bibleDir, 'topics.db'),
    sources: [
      // Resolved from the executable's own location first, so a binary copied
      // off the build machine still finds the artifact it ships with; the
      // build-time root is only the dev-mode fallback. Every candidate is
      // offered as its own source rather than one path being chosen here —
      // the supply pipeline already tries sources in order and skips the ones
      // that are absent, so there is no reason to duplicate that logic.
      ...packagedDataCandidates('topics.db').map((candidate): NativeFileArtifactSource => ({
        kind: 'packaged',
        path: candidate,
        label: 'packaged',
      })),
      // Only reachable when the CLI runs from the repo root; an installed
      // binary is invoked from arbitrary directories, which is why the
      // packaged slot above — not this one — is the install-owned source.
      {
        kind: 'workspace',
        path: path.resolve(process.cwd(), 'packages', 'core', 'data', 'topics.db'),
        label: 'workspace',
      },
      ...topicsReleaseSource(),
    ],
  });
  return CorpusSupply.layer.pipe(Layer.provide(Layer.merge(bibleArtifacts, topicsArtifacts)));
};

export const init = Command.make('init', { force }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    const bibleDir = path.join(home, '.bible');
    // Ensure ~/.bible/ exists
    if (!(yield* fs.exists(bibleDir))) {
      yield* fs.makeDirectory(bibleDir, { recursive: true });
      yield* Console.log(`Created ${bibleDir}`);
    }

    const refusals: string[] = [];
    const reportRefusal = (error: SqliteRefreshRefused) =>
      Console.error(`✗ ${error.message}`).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            refusals.push(error.destination);
          }),
        ),
      );
    const ensureArtifact = (name: 'bible' | 'topics') =>
      Effect.gen(function* () {
        const destination = path.join(bibleDir, `${name}.db`);
        let status = 'ready';
        // Default init fills missing slots without inspecting existing data.
        if (args.force || !(yield* fs.exists(destination))) {
          status = artifactStatus(
            yield* withSqliteRefresh(
              destination,
              args.force,
              CorpusSupply.use((corpus) =>
                corpus.ensure({
                  target: Target.file(name),
                  refresh: args.force,
                }),
              ),
            ),
          );
        }
        yield* Console.log(`✓ ${name}.db (${status})`);
      }).pipe(Effect.provide(artifactSupply(bibleDir, path)));
    yield* ensureArtifact('bible').pipe(Effect.catchTag('SqliteRefreshRefused', reportRefusal));
    // Topics remains optional for unavailable/rejected sources, but a WAL
    // refusal is an unsafe requested refresh and must fail the final command.
    yield* ensureArtifact('topics').pipe(
      Effect.catch((error) => {
        if (Schema.is(SqliteRefreshRefused)(error)) return reportRefusal(error);
        return Console.log('✗ topics.db — build it with:').pipe(
          Effect.andThen(Console.log('  bun run build:topics')),
        );
      }),
    );
    if (!args.force && (yield* fs.exists(path.join(bibleDir, 'webster.db')))) {
      yield* Console.log('✓ webster.db (ready)');
    } else {
      yield* initializeWebster({ directory: bibleDir, refresh: args.force }).pipe(
        Effect.catchTag('SqliteRefreshRefused', reportRefusal),
      );
    }

    // Download each database
    const hymnal = path.join(bibleDir, DBS.hymnal.name);
    yield* withSqliteRefresh(hymnal, args.force, ensureHymnal(hymnal, args.force)).pipe(
      Effect.catchTag('SqliteRefreshRefused', reportRefusal),
    );

    // EGW database status
    const egwDbPath = path.join(bibleDir, 'egw-paragraphs.db');
    if (yield* fs.exists(egwDbPath)) {
      yield* Console.log(`✓ egw-paragraphs.db (EGW writings)`);
    } else {
      yield* Console.log(`✗ egw-paragraphs.db — add publications with:`);
      yield* Console.log(`  manna egw download <CODE>`);
    }

    yield* Console.log(``);
    yield* Console.log(`Databases: ${bibleDir}`);
    if (refusals.length > 0)
      return yield* InitError.make({
        cause: `${refusals.length} database refresh(es) refused; see WAL recovery instructions above.`,
      });
  }),
);
