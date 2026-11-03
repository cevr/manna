import {
  BIBLE_ARTIFACT_RELEASE,
  CorpusSupply,
  CorpusSupplyInput,
  type CorpusSupplyReceipt,
  Target,
  type SqliteRefreshRefused,
  topicsReleaseSource,
} from '@manna/core/corpus-supply';
import {
  layerNativeBibleArtifacts,
  layerNativeTopicsArtifacts,
  type NativeFileArtifactSource,
  checkSqliteRefresh,
} from '@manna/core/corpus-supply/bun';
import { hymnalIsIndexed, hymnalNeedsIndexes } from '@manna/core/hymnal/bun';
import { Config, Console, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import { CliError, Command, Flag } from 'effect/cli';
import { HttpClient, HttpClientResponse } from 'effect/http';

import { packagedDataCandidates } from '~/src/lib/paths';
import { initializeWebster } from './webster.js';
import { withSqliteRefresh } from '../lib/sqlite-refresh.js';

class InitError extends Schema.TaggedError<InitError>()('InitError', {
  cause: Schema.Unknown,
}) {}

const GITHUB_RAW = 'https://raw.githubusercontent.com/cevr/manna/main';

const DBS = {
  hymnal: {
    name: 'hymnal.db',
    url: `${GITHUB_RAW}/packages/core/data/hymnal.db`,
    description: 'SDA Hymnal (695 hymns and 225 readings)',
    size: '~22 MiB',
  },
} as const;

const force = Flag.Boolean('force').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Re-download databases even if they exist'),
);

const downloadFile = (url: string, dest: string, label: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const building = `${dest}.building`;
    let staged = false;
    const install = Effect.gen(function* () {
      yield* Console.log(`Downloading ${label}...`);
      const bytes = yield* HttpClient.get(url).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.arrayBuffer),
        Effect.mapError((cause) => InitError.make({ cause })),
      );
      yield* fs.remove(building, { force: true });
      yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(building, { flag: 'wx' });
          staged = true;
          yield* file.writeAll(new Uint8Array(bytes));
        }),
      );
      if (!(yield* hymnalIsIndexed(building))) {
        yield* Console.error(
          `✗ the downloaded ${label} is not an indexed hymnal database; kept the one in place`,
        );
        return yield* InitError.make({ cause: `${url} is not an indexed hymnal database` });
      }
      yield* checkSqliteRefresh(dest);
      yield* fs.rename(building, dest);
      staged = false;
    });
    yield* install.pipe(
      Effect.onError(() => {
        if (staged) return fs.remove(building, { force: true }).pipe(Effect.ignore);
        return Effect.void;
      }),
    );
  });

const ensureHymnal = Effect.fn('Init.ensureHymnal')(function* (
  destination: string,
  refresh: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const db = DBS.hymnal;
  const kept = !refresh && (yield* fs.exists(destination));
  const stale = kept && (yield* hymnalNeedsIndexes(destination));
  if (kept && !stale) {
    yield* Console.log(`✓ ${db.name} (${db.description})`);
  } else {
    if (stale) yield* Console.log(`↻ ${db.name} has no indexes; replacing it`);
    yield* downloadFile(db.url, destination, `${db.name} ${db.size}`);
    yield* Console.log(`✓ ${db.name} installed`);
  }
});

const artifactStatus = (receipt: CorpusSupplyReceipt): string => {
  if (receipt.activated.length > 0) return 'installed and verified';
  return 'ready';
};

const artifactSupply = (bibleDir: string, path: Path.Path) => {
  const bibleArtifacts = layerNativeBibleArtifacts({
    destination: path.join(bibleDir, 'bible.db'),
    sources: [{ kind: 'release', ...BIBLE_ARTIFACT_RELEASE }],
  });
  const topicsArtifacts = layerNativeTopicsArtifacts({
    destination: path.join(bibleDir, 'topics.db'),
    sources: [
      ...packagedDataCandidates('topics.db').map((candidate): NativeFileArtifactSource => ({
        kind: 'packaged',
        path: candidate,
        label: 'packaged',
      })),
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

const ensureArtifact = (
  bibleDir: string,
  path: Path.Path,
  name: 'bible' | 'topics',
  refresh: boolean,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const destination = path.join(bibleDir, `${name}.db`);
    if (!refresh && (yield* fs.exists(destination))) return 'ready';
    return artifactStatus(
      yield* withSqliteRefresh(
        destination,
        refresh,
        CorpusSupply.use((corpus) =>
          corpus.ensure(CorpusSupplyInput.make({ target: Target.file(name), refresh })),
        ),
      ),
    );
  }).pipe(Effect.provide(artifactSupply(bibleDir, path)));

export const init = Command.make('init', { force }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    const bibleDir = path.join(home, '.bible');
    if (!(yield* fs.exists(bibleDir))) {
      yield* fs.makeDirectory(bibleDir, { recursive: true });
      yield* Console.log(`Created ${bibleDir}`);
    }

    let refusals = 0;
    const reportRefusal = (error: SqliteRefreshRefused) =>
      Console.error(`✗ ${error.message}`).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            refusals++;
          }),
        ),
      );
    yield* ensureArtifact(bibleDir, path, 'bible', args.force).pipe(
      Effect.flatMap((status) => Console.log(`✓ bible.db (${status})`)),
      Effect.catchTag('SqliteRefreshRefused', reportRefusal),
    );
    const topicsLines = yield* ensureArtifact(bibleDir, path, 'topics', args.force).pipe(
      Effect.map((status) => [`✓ topics.db (${status})`]),
      Effect.catchTag('SqliteRefreshRefused', (error) => reportRefusal(error).pipe(Effect.as([]))),
      Effect.orElseSucceed(() => ['✗ topics.db — build it with:', '  bun run build:topics']),
    );
    if (!args.force && (yield* fs.exists(path.join(bibleDir, 'webster.db')))) {
      yield* Console.log('✓ webster.db (ready)');
    } else {
      yield* initializeWebster({ directory: bibleDir, refresh: args.force }).pipe(
        Effect.catchTag('SqliteRefreshRefused', reportRefusal),
      );
    }

    yield* Effect.forEach(topicsLines, (line) => Console.log(line), { discard: true });

    const hymnal = path.join(bibleDir, DBS.hymnal.name);
    yield* withSqliteRefresh(hymnal, args.force, ensureHymnal(hymnal, args.force)).pipe(
      Effect.catchTag('SqliteRefreshRefused', reportRefusal),
    );

    const egwDbPath = path.join(bibleDir, 'egw-paragraphs.db');
    if (yield* fs.exists(egwDbPath)) {
      yield* Console.log(`✓ egw-paragraphs.db (EGW writings)`);
    } else {
      yield* Console.log(`✗ egw-paragraphs.db — add publications with:`);
      yield* Console.log(`  manna egw download <CODE>`);
    }

    yield* Console.log(``);
    yield* Console.log(`Databases: ${bibleDir}`);
    if (refusals > 0)
      return yield* CliError.UserError.make({
        cause: `${refusals} database refresh(es) refused; see WAL recovery instructions above.`,
      });
  }),
);
