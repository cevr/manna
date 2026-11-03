import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { ManifestJson, type RecordingManifest } from '@manna/hymnal/recording-manifest';
import { Console, Data, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command } from 'effect/cli';

import { audioUploadCommand } from './command.ts';
import { HashBun } from './hash-bun.ts';
import { holds, unquote } from './plan.ts';
import { TargetR2Writes } from './r2.ts';
import type { TargetObject } from './stores.ts';
import { Hash, Target } from './stores.ts';
import {
  SET_CACHE_CONTROL,
  UploadItem,
  manifestRefusals,
  planUpload,
  setPrefix,
} from './upload-plan.ts';

export class UploadRefused extends Schema.TaggedError<UploadRefused>()('UploadRefused', {
  reasons: Schema.Array(Schema.String),
}) {
  override get message() {
    return `audio upload refused:\n  ${this.reasons.join('\n  ')}`;
  }
}

export class UploadIncomplete extends Schema.TaggedError<UploadIncomplete>()('UploadIncomplete', {
  failed: Schema.Finite,
  conflict: Schema.Finite,
  verified: Schema.Finite,
  of: Schema.Finite,
}) {
  override get message() {
    return `audio upload incomplete: failed=${this.failed} conflict=${this.conflict} verified=${this.verified}/${this.of}; run it again to resume, and for a conflict render the hymn into a later set`;
  }
}

type Outcome = Data.TaggedEnum<{
  Kept: { readonly hymn: number };
  Uploaded: { readonly hymn: number };
  Conflict: { readonly hymn: number };
  Failed: { readonly hymn: number };
}>;
const Outcome = Data.taggedEnum<Outcome>();

const sha256Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
};

const readManifest = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(dir, 'manifest.json');
    const text = yield* fs
      .readFileString(file)
      .pipe(Effect.mapError((e) => UploadRefused.make({ reasons: [`${file}: ${e.message}`] })));
    const manifest = yield* Schema.decodeEffect(ManifestJson)(text).pipe(
      Effect.mapError((e) => UploadRefused.make({ reasons: [`${file}: ${e.message}`] })),
    );
    const reasons = manifestRefusals(manifest);
    if (reasons.length > 0) return yield* UploadRefused.make({ reasons });
    return manifest;
  });

const readHymn = (dir: string, hymn: RecordingManifest['hymns'][number]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hash = yield* Hash;
    const file = path.join(dir, hymn.file);
    const bytes = yield* fs
      .readFile(file)
      .pipe(Effect.mapError((e) => `${hymn.file}: ${e.message}`));
    const sha = sha256Hex(bytes);
    if (sha !== hymn.sha256)
      return yield* Effect.fail(`${hymn.file}: sha256 ${sha}, manifest ${hymn.sha256}`);
    const md5 = hash.md5(bytes);
    if (md5 !== hymn.md5 || bytes.byteLength !== hymn.bytes)
      return yield* Effect.fail(
        `${hymn.file}: md5 ${md5} size ${bytes.byteLength}, manifest ${hymn.md5} size ${hymn.bytes}`,
      );
    return bytes;
  });

const checkFiles = (dir: string, manifest: RecordingManifest) =>
  Effect.gen(function* () {
    const misses = yield* Effect.forEach(
      manifest.hymns,
      (hymn) =>
        readHymn(dir, hymn).pipe(
          Effect.as(Option.none<string>()),
          Effect.catch((reason) => Effect.succeedSome(reason)),
        ),
      { concurrency: 4 },
    );
    const reasons = misses.flatMap((miss) => Option.toArray(miss));
    if (reasons.length > 0) return yield* UploadRefused.make({ reasons });
  });

const failed = (hymn: number, reason: string) =>
  Console.log(`failed ${hymn} ${reason.replaceAll('\n', ' ')}`).pipe(
    Effect.as(Outcome.Failed({ hymn })),
  );

const put = (dir: string, item: Extract<UploadItem, { readonly _tag: 'Upload' }>) =>
  Effect.gen(function* () {
    const target = yield* Target;
    const { hymn, key } = item;
    const bytes = yield* readHymn(dir, hymn);
    const stored = yield* target
      .put(key, bytes, { contentType: 'audio/mpeg', cacheControl: SET_CACHE_CONTROL })
      .pipe(Effect.mapError((e) => e.message));
    if (!holds(stored, hymn.bytes, hymn.md5))
      return yield* Effect.fail(
        `r2 stored etag ${unquote(stored.etag)} size ${stored.size}, expected ${hymn.md5} size ${hymn.bytes}`,
      );
    yield* Console.log(`upload ${hymn.hymn} ${hymn.bytes}`);
    return Outcome.Uploaded({ hymn: hymn.hymn });
  }).pipe(Effect.catch((reason) => failed(item.hymn.hymn, reason)));

const act = (dir: string) => (item: UploadItem) =>
  UploadItem.$match(item, {
    Keep: ({ hymn }) => Effect.succeed(Outcome.Kept({ hymn: hymn.hymn })),
    Upload: (upload) => put(dir, upload),
    Conflict: ({ hymn, key, held }) =>
      Console.log(
        `conflict ${hymn.hymn} r2 holds ${key} as etag ${unquote(held.etag)} size ${held.size}, the set has md5 ${hymn.md5} size ${hymn.bytes}: render the hymn into a later set`,
      ).pipe(Effect.as(Outcome.Conflict({ hymn: hymn.hymn }))),
  });

const count = (outcomes: ReadonlyArray<Outcome>, tag: Outcome['_tag']) =>
  outcomes.filter((outcome) => outcome._tag === tag).length;

const verify = (manifest: RecordingManifest) =>
  Effect.gen(function* () {
    const target = yield* Target;
    const listed = yield* target
      .list(setPrefix(manifest.set))
      .pipe(
        Effect.catchTag('StoreFailed', (error) =>
          Console.log(`failed verify ${error.message}`).pipe(
            Effect.as(new Map<string, TargetObject>()),
          ),
        ),
      );
    return planUpload(manifest, listed).filter(UploadItem.$is('Keep')).length;
  });

const summary = (
  mode: 'run' | 'dry-run',
  manifest: RecordingManifest,
  n: { kept: number; uploaded: number; conflict: number; failed: number; verified: number },
) =>
  Console.log(
    `audio-upload ${mode} set=${manifest.set} kept ${n.kept} uploaded ${n.uploaded} conflict ${n.conflict} failed ${n.failed} verified ${n.verified}/${manifest.hymns.length}`,
  );

export const dryRun = (set: string) =>
  Effect.gen(function* () {
    const dir = (yield* Path.Path).resolve(set);
    const manifest = yield* readManifest(dir);
    yield* checkFiles(dir, manifest);
    const bytes = manifest.hymns.reduce((total, h) => total + h.bytes, 0);
    yield* Console.log(
      `would upload ${manifest.hymns.length} hymns, ${bytes} bytes, unless R2 holds them`,
    );
    yield* summary('dry-run', manifest, {
      kept: 0,
      uploaded: 0,
      conflict: 0,
      failed: 0,
      verified: 0,
    });
  });

export const run = (set: string) =>
  Effect.gen(function* () {
    const dir = (yield* Path.Path).resolve(set);
    const manifest = yield* readManifest(dir);
    yield* checkFiles(dir, manifest);
    const target = yield* Target;
    const listed = yield* target.list(setPrefix(manifest.set));
    const outcomes = yield* Effect.forEach(planUpload(manifest, listed), act(dir), {
      concurrency: 4,
    });
    const verified = yield* verify(manifest);
    const n = {
      kept: count(outcomes, 'Kept'),
      uploaded: count(outcomes, 'Uploaded'),
      conflict: count(outcomes, 'Conflict'),
      failed: count(outcomes, 'Failed'),
      verified,
    };
    yield* summary('run', manifest, n);
    if (verified !== manifest.hymns.length || n.conflict + n.failed > 0)
      return yield* UploadIncomplete.make({
        failed: n.failed,
        conflict: n.conflict,
        verified,
        of: manifest.hymns.length,
      });
  });

const audioUpload = audioUploadCommand.pipe(
  Command.withHandler(({ set, dryRun: dry }) => {
    if (dry) return dryRun(set).pipe(Effect.provide(HashBun));
    return run(set).pipe(Effect.provide(Layer.merge(HashBun, TargetR2Writes)));
  }),
);

if (import.meta.main)
  Command.run(audioUpload, { version: '1.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
