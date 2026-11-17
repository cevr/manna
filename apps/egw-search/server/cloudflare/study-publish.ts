/**
 * `bun run study:publish [--dry-run]`: build the reader's study packs from
 * `bible.db` and upload them to the R2 bucket the Worker serves them from
 * (`../study-api.ts`, `StudyPackFiles`).
 *
 * `bible.db` lives on the owner's Mac alone, so no deploy can build the
 * packs: this is run there, after a rebuild of `bible.db` or a change to
 * the packs' builder. The packs are built by
 * `apps/heartseed-exact/tools/study.ts` into a scratch directory, each is
 * checked to name its version in its head, uploaded under `<name>.json`,
 * and then asked of egw.cvr.im with its version, which must answer 304.
 * A dry run builds and checks, and uploads nothing, so it needs no
 * credentials. A real run writes with the owner's Alchemy Cloudflare
 * profile, which must allow R2 object writes.
 */
import * as r2 from '@distilled.cloud/cloudflare/r2';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { AuthProviders } from 'alchemy/Auth';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Console, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { SecureRandom } from 'effect/crypto';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { STUDY_NAMES } from '../api.js';
import { studyKey, studyVersionAt, type StudyName } from '../study-api.js';
import { DOMAIN } from './site.ts';

/** The bucket `StudyPackFiles` names. */
const BUCKET = 'heartseed-study-packs';

/** A step of the publish that failed, by what it said. */
export class StudyPublishFailed extends Schema.TaggedError<StudyPublishFailed>()(
  'StudyPublishFailed',
  { message: Schema.String },
) {}

/** A built pack, ready to upload. */
export interface BuiltStudy {
  readonly name: StudyName;
  readonly key: string;
  readonly version: string;
  readonly body: string;
}

/** The packs `directory` holds, each with the version its head names; a pack whose head names none fails the run. */
export const builtIn = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const built: Array<BuiltStudy> = [];
    for (const name of STUDY_NAMES) {
      const key = studyKey(name);
      const path = `${directory}/${key}`;
      if (!(yield* fs.exists(path))) continue;
      const body = yield* fs.readFileString(path);
      const version = yield* Effect.fromOption(studyVersionAt(body)).pipe(
        Effect.mapError(() =>
          StudyPublishFailed.make({ message: `study ${name}: its head names no version` }),
        ),
      );
      built.push({ name, key, version, body });
    }
    return built;
  });

/** Builds the packs from `bible.db` into `directory` with the app's own builder. */
const build = (directory: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const app = path.join(import.meta.dir, '..', '..', '..', 'heartseed-exact');
    const spawner = yield* ChildProcessSpawner;
    const code = yield* spawner.exitCode(
      ChildProcess.make(
        'bun',
        ['--preload', './tools/setup.ts', 'tools/study.ts', '--out', directory],
        { cwd: app, stdout: 'inherit', stderr: 'inherit', forceKillAfter: '5 seconds' },
      ),
    );
    if (code !== 0)
      return yield* StudyPublishFailed.make({ message: `study: the build exited ${code}` });
  });

/** What egw.cvr.im's answer to a pack's version says. */
const servedAs = (status: number) => {
  if (status === 304) return 'the same version';
  return `status ${status}`;
};

/** Uploads each pack, then asks egw.cvr.im for it by its version. */
const upload = (built: ReadonlyArray<BuiltStudy>) =>
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const put = yield* r2.uploadBucketObject;
    for (const pack of built) {
      yield* put({
        accountId,
        bucketName: BUCKET,
        objectName: pack.key,
        body: new TextEncoder().encode(pack.body),
        contentType: 'application/json',
        cacheControl: 'no-cache',
      });
      yield* Console.log(`study ${pack.name} uploaded ${pack.version}`);
    }
    const client = yield* HttpClient.HttpClient;
    for (const pack of built) {
      const answer = yield* client.execute(
        HttpClientRequest.get(`https://${DOMAIN}/api/study/${pack.name}`).pipe(
          HttpClientRequest.setHeader('if-none-match', `"${pack.version}"`),
        ),
      );
      yield* Console.log(`study ${pack.name} served ${servedAs(answer.status)}`);
    }
  });

/** The packs built into a scratch directory and checked, each printed. */
const prepared = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'study-' });
  yield* build(directory);
  const built = yield* builtIn(directory);
  for (const pack of built)
    yield* Console.log(`study ${pack.name} ${pack.version} ${pack.body.length} chars`);
  return built;
}).pipe(Effect.scoped);

/** R2 and egw.cvr.im behind the owner's profile, built only for a real run; Alchemy's profile reads draw on a `SecureRandom`, Web Crypto's here. */
const CloudflareWrites = Cloudflare.CloudflareApiLive().pipe(
  Layer.provide(Layer.succeed(AuthProviders, AuthProviders.of({}))),
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
);

const studyPublish = Command.make('study-publish', {
  dryRun: Flag.Boolean('dry-run').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Build and check the packs; upload nothing'),
  ),
}).pipe(
  Command.withDescription("Build the reader's study packs from bible.db and upload them to R2"),
  Command.withHandler(({ dryRun }) => {
    if (dryRun)
      return prepared.pipe(Effect.andThen(Console.log('study: a dry run, nothing uploaded')));
    return prepared.pipe(Effect.flatMap(upload), Effect.provide(CloudflareWrites));
  }),
);

if (import.meta.main)
  Command.run(studyPublish, { version: '1.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
