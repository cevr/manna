/* oxlint-disable effect/noNodeBuiltinImport -- the stand-ins and the oracle hash with node's crypto, apart from the Digest the job uses. */

/**
 * The copy job over a real temporary cache, a Hugging Face stand-in that
 * answers by URL, and a bucket stand-in that keeps objects with their MD5 as
 * ETag. The list is five made-up files: two nested paths, `LICENSE`, a
 * generated `am_michael.bin` pack served as its rows, and `vocab.json`.
 *
 * It catches a fill that refetches, keeps a bad file or a `.partial`, or
 * skips the voice's check; a run that calls R2 after a failed fill; an
 * overwrite on conflict; a put answer trusted without its MD5; a failed put
 * that stops the others; a verify that counts outcomes instead of listing;
 * and a dry run that asks for the bucket. It misses Hugging Face's and R2's
 * own answers (`./r2.test.ts` holds R2's) and the 83 MB.
 */
import { createHash } from 'node:crypto';

import { BunCrypto, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, FileSystem, Layer, Option, Path, Result } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';

import { AM_MICHAEL } from '../../src/natural/manifest.ts';
import type { ModelFile } from '../../src/natural/module.ts';
import { dryRun, run } from './job.ts';
import { CACHE_CONTROL, CONTENT_TYPE, PREFIX, keyOf } from './plan.ts';
import type { MirrorObject } from './plan.ts';
import { VOICE_ROWS, sourceOf } from './source.ts';
import { StoreFailed, Target } from './stores.ts';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const md5 = (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex');
const encode = (text: string) => new TextEncoder().encode(text);

const bytesOf = (size: number, seed: number) =>
  Uint8Array.from({ length: size }, (_, at) => (at * 31 + seed) % 251);

const flipped = (bytes: Uint8Array) => {
  const copy = Uint8Array.from(bytes);
  const middle = Math.floor(copy.byteLength / 2);
  copy[middle] = (copy[middle] ?? 0) ^ 0xff;
  return copy;
};

const ROWS = 510;
const COLUMNS = 256;

/** Small values, each exactly an fp32, so the rows are short text. */
const VALUES = Float32Array.from({ length: ROWS * COLUMNS }, (_, at) => (((at * 7) % 33) - 16) / 8);

/** The pack of `values`: little-endian fp32, row after row. */
const packOf = (values: Float32Array) => {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, at) => view.setFloat32(at * 4, value, true));
  return out;
};

/** The rows as `voices/<name>.json` holds them, with an `embedding` beside them, `drop` left out. */
const rowsOf = (values: Float32Array, drop: number) => {
  const entries = ['"embedding":[0.5,-0.25]'];
  for (let row = 1; row <= ROWS; row++) {
    if (row === drop) continue;
    entries.push(`"${row}":[${values.subarray((row - 1) * COLUMNS, row * COLUMNS).join(',')}]`);
  }
  return encode(`{${entries.join(',')}}`);
};

const changedValues = Float32Array.from(VALUES);
changedValues[1234] = (changedValues[1234] ?? 0) + 1;

const VOICE = {
  good: rowsOf(VALUES, 0),
  changed: rowsOf(changedValues, 0),
  missing: rowsOf(VALUES, 300),
};

const GOODS = new Map<string, Uint8Array>([
  ['A.mlmodelc/model.mil', bytesOf(300, 3)],
  ['A.mlmodelc/weights/weight.bin', bytesOf(2000, 5)],
  ['LICENSE', bytesOf(50, 7)],
  [AM_MICHAEL.path, packOf(VALUES)],
  ['vocab.json', bytesOf(7, 11)],
]);

const goodOf = (path: string) => GOODS.get(path) ?? new Uint8Array();

const FILES: ReadonlyArray<ModelFile> = [...GOODS].map(([path, bytes]) => ({
  path,
  bytes: bytes.byteLength,
  sha256: sha256(bytes),
}));
const PATHS = FILES.map((file) => file.path);
const KEYS = PATHS.map(keyOf);
const TOTAL = FILES.reduce((sum, file) => sum + file.bytes, 0);

/** Where the copy reads a path: the voice's rows for `am_michael.bin`, `ANE/<path>` for the rest. */
const urlOf = (path: string) => {
  if (path === AM_MICHAEL.path) return VOICE_ROWS;
  return sourceOf(path);
};

type HubState = 'good' | 'bad' | 'down' | 'changed' | 'missing';

/** Hugging Face's stand-in: each ask logged, each path answered as its state says. */
const hubOf = (asked: Array<string>, states: ReadonlyMap<string, HubState>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        asked.push(url.toString());
        const path = Option.fromUndefinedOr(PATHS.find((each) => urlOf(each) === url.toString()));
        if (Option.isNone(path)) {
          return HttpClientResponse.fromWeb(request, new Response('', { status: 404 }));
        }
        const state = states.get(path.value) ?? 'good';
        const voice = path.value === AM_MICHAEL.path;
        const body = (): Uint8Array => {
          if (state === 'changed') return VOICE.changed;
          if (state === 'missing') return VOICE.missing;
          if (voice && state === 'good') return VOICE.good;
          if (voice) return VOICE.changed;
          if (state === 'bad') return flipped(goodOf(path.value));
          return goodOf(path.value);
        };
        if (state === 'down') {
          return HttpClientResponse.fromWeb(request, new Response('', { status: 503 }));
        }
        return HttpClientResponse.fromWeb(request, new Response(Uint8Array.from(body())));
      }),
    ),
  );

interface Put {
  readonly key: string;
  readonly contentType: string;
  readonly cacheControl: string;
  readonly bytes: Uint8Array;
}

/** The bucket's stand-in and the faults a case sets on it. */
interface Bucket {
  readonly objects: Map<string, Uint8Array>;
  readonly calls: Array<string>;
  readonly puts: Array<Put>;
  /** Paths whose put is refused. */
  readonly refuse: Set<string>;
  /** Paths whose put stores the bytes but answers a wrong ETag. */
  readonly lie: Set<string>;
  /** Paths whose put answers the right size and ETag but keeps nothing. */
  readonly drop: Set<string>;
  /** Listings (0 the first of a run) that fail. */
  readonly failLists: Set<number>;
}

const bucketOf = (): Bucket => ({
  objects: new Map(),
  calls: [],
  puts: [],
  refuse: new Set(),
  lie: new Set(),
  drop: new Set(),
  failLists: new Set(),
});

const targetOf = (bucket: Bucket) => {
  let lists = 0;
  return Layer.succeed(
    Target,
    Target.of({
      list: (prefix) =>
        Effect.suspend(() => {
          bucket.calls.push(`list ${prefix}`);
          const n = lists++;
          if (bucket.failLists.has(n))
            return Effect.fail(StoreFailed.make({ reason: 'listing refused' }));
          const listed = new Map<string, MirrorObject>();
          for (const [key, bytes] of bucket.objects)
            if (key.startsWith(prefix))
              listed.set(key, { size: bytes.byteLength, etag: `"${md5(bytes)}"` });
          return Effect.succeed(listed);
        }),
      put: (key, bytes, metadata) =>
        Effect.suspend(() => {
          bucket.calls.push(`put ${key}`);
          bucket.puts.push({ key, ...metadata, bytes: Uint8Array.from(bytes) });
          const path = key.slice(PREFIX.length);
          if (bucket.refuse.has(path))
            return Effect.fail(StoreFailed.make({ reason: 'put refused' }));
          if (!bucket.drop.has(path)) bucket.objects.set(key, Uint8Array.from(bytes));
          if (bucket.lie.has(path)) return Effect.succeed({ size: bytes.byteLength, etag: '"0"' });
          return Effect.succeed({ size: bytes.byteLength, etag: `"${md5(bytes)}"` });
        }),
    }),
  );
};

const platform = Layer.mergeAll(BunServices.layer, BunCrypto.layerDigest);

/** Run a job, keeping what it printed and how it ended. */
const exec = <A, E, R>(program: Effect.Effect<A, E, R>, layer: Layer.Layer<R>) => {
  const lines: Array<string> = [];
  const console = { ...globalThis.console, log: (line: string) => void lines.push(line) };
  return program.pipe(
    Effect.provide(layer),
    Effect.provideService(Console.Console, console),
    Effect.result,
    Effect.map((result) => ({ lines, result, last: lines.at(-1) ?? '' })),
  );
};

/** A run's failure as its fields, `{}` when it succeeded. */
const failureOf = <A, E extends object>(result: Result.Result<A, E>) =>
  Result.match(result, { onSuccess: () => ({}), onFailure: (error) => ({ ...error }) });

/** A run over `bucket` and a hub in `states`, its asks kept in `asked`. */
const runOver = (
  cache: string,
  bucket: Bucket,
  asked: Array<string>,
  states: ReadonlyMap<string, HubState> = new Map(),
) => exec(run(cache, FILES), Layer.mergeAll(platform, hubOf(asked, states), targetOf(bucket)));

/** The cache's state: each path's bytes good, other or absent, and any `.partial` left. */
const cacheOf = (cache: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const held: Record<string, string> = {};
    for (const each of PATHS) {
      const at = path.join(cache, each);
      if (yield* fs.exists(`${at}.partial`)) held[`${each}.partial`] = 'left';
      if (!(yield* fs.exists(at))) continue;
      held[each] = 'other';
      if (sha256(yield* fs.readFile(at)) === sha256(goodOf(each))) held[each] = 'good';
    }
    return held;
  });

const allGood = Object.fromEntries(PATHS.map((path) => [path, 'good']));

interface Counts {
  readonly fetched: number;
  readonly kept: number;
  readonly uploaded: number;
  readonly conflict: number;
  readonly failed: number;
  readonly verified: number;
}

const runLine = (n: Counts) =>
  `models-copy run files=5 bytes=${TOTAL} fetched=${n.fetched} target=kept ${n.kept} uploaded ${n.uploaded} conflict ${n.conflict} failed ${n.failed} verified ${n.verified}/5`;

const temp = Effect.flatMap(FileSystem.FileSystem, (fs) =>
  fs.makeTempDirectoryScoped({ prefix: 'models-copy-' }),
);

describe('the copy', () => {
  it.effect(
    'fetches and checks every file, uploads each with the mirror’s headers, and verifies them; a rerun fetches nothing and keeps all',
    () =>
      Effect.gen(function* () {
        const cache = yield* temp;
        const bucket = bucketOf();
        const asked: Array<string> = [];
        const first = yield* runOver(cache, bucket, asked);
        const counts = {
          fetched: 5,
          kept: 0,
          uploaded: 5,
          conflict: 0,
          failed: 0,
          verified: 5,
          of: 5,
        };
        expect(Result.getOrThrow(first.result)).toEqual(counts);
        expect(first.last).toBe(runLine(counts));
        expect(asked).toEqual(PATHS.map(urlOf));
        expect(bucket.calls[0]).toBe(`list ${PREFIX}`);
        expect(bucket.calls.at(-1)).toBe(`list ${PREFIX}`);
        expect(bucket.puts.map((put) => put.key).toSorted()).toEqual(KEYS.toSorted());
        for (const put of bucket.puts) {
          expect(put.contentType).toBe(CONTENT_TYPE);
          expect(put.cacheControl).toBe(CACHE_CONTROL);
          expect(sha256(put.bytes)).toBe(sha256(goodOf(put.key.slice(PREFIX.length))));
        }
        expect(first.lines).toContain(`upload ${AM_MICHAEL.path} 522240`);
        expect(yield* cacheOf(cache)).toEqual(allGood);

        const again: Array<string> = [];
        const before = bucket.puts.length;
        const second = yield* runOver(cache, bucket, again);
        const kept = {
          fetched: 0,
          kept: 5,
          uploaded: 0,
          conflict: 0,
          failed: 0,
          verified: 5,
          of: 5,
        };
        expect(Result.getOrThrow(second.result)).toEqual(kept);
        expect(second.last).toBe(runLine(kept));
        expect(again).toEqual([]);
        expect(bucket.puts.length).toBe(before);
      }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect(
    'never puts a key R2 holds with other bytes, and fails the run while the rest land',
    () =>
      Effect.gen(function* () {
        const cache = yield* temp;
        const bucket = bucketOf();
        const other = flipped(goodOf('LICENSE'));
        bucket.objects.set(keyOf('LICENSE'), other);
        bucket.objects.set('kokoro/000000000000/LICENSE', other);
        bucket.objects.set(`${PREFIX}stray.bin`, other);
        const done = yield* runOver(cache, bucket, []);
        const counts = {
          fetched: 5,
          kept: 0,
          uploaded: 4,
          conflict: 1,
          failed: 0,
          verified: 4,
          of: 5,
        };
        expect(Result.isFailure(done.result)).toBe(true);
        expect(failureOf(done.result)).toMatchObject({ _tag: 'CopyIncomplete', ...counts });
        expect(done.last).toBe(runLine(counts));
        expect(bucket.puts.map((put) => put.key)).not.toContain(keyOf('LICENSE'));
        expect(bucket.objects.get(keyOf('LICENSE'))).toEqual(other);
        expect(bucket.objects.get('kokoro/000000000000/LICENSE')).toEqual(other);
        expect(bucket.objects.get(`${PREFIX}stray.bin`)).toEqual(other);
        expect(done.lines.some((line) => line.startsWith('conflict LICENSE '))).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect('fails a refused put alone while the others land, and a rerun puts it alone', () =>
    Effect.gen(function* () {
      const cache = yield* temp;
      const bucket = bucketOf();
      bucket.refuse.add('A.mlmodelc/model.mil');
      const done = yield* runOver(cache, bucket, []);
      const counts = {
        fetched: 5,
        kept: 0,
        uploaded: 4,
        conflict: 0,
        failed: 1,
        verified: 4,
        of: 5,
      };
      expect(failureOf(done.result)).toMatchObject({ _tag: 'CopyIncomplete', ...counts });
      expect(done.last).toBe(runLine(counts));
      expect(bucket.puts.map((put) => put.key).toSorted()).toEqual(KEYS.toSorted());
      expect(done.lines).toContain('failed A.mlmodelc/model.mil r2: put refused');

      bucket.refuse.clear();
      bucket.puts.length = 0;
      const resumed = yield* runOver(cache, bucket, []);
      const healed = {
        fetched: 0,
        kept: 4,
        uploaded: 1,
        conflict: 0,
        failed: 0,
        verified: 5,
        of: 5,
      };
      expect(Result.getOrThrow(resumed.result)).toEqual(healed);
      expect(resumed.last).toBe(runLine(healed));
      expect(bucket.puts.map((put) => put.key)).toEqual([keyOf('A.mlmodelc/model.mil')]);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect(
    'counts a put whose answer lies about its ETag as failed, though the second listing verifies it',
    () =>
      Effect.gen(function* () {
        const cache = yield* temp;
        const bucket = bucketOf();
        bucket.lie.add('vocab.json');
        const done = yield* runOver(cache, bucket, []);
        const counts = {
          fetched: 5,
          kept: 0,
          uploaded: 4,
          conflict: 0,
          failed: 1,
          verified: 5,
          of: 5,
        };
        expect(failureOf(done.result)).toMatchObject({ _tag: 'CopyIncomplete', ...counts });
        expect(done.last).toBe(runLine(counts));
        expect(
          done.lines.some((line) => line.startsWith('failed vocab.json r2 stored etag 0 size 7')),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect(
    'verifies by listing again: a put R2 answered but did not keep, or a failed second listing, verifies nothing it cannot see',
    () =>
      Effect.gen(function* () {
        const cache = yield* temp;
        const bucket = bucketOf();
        bucket.drop.add('LICENSE');
        const dropped = yield* runOver(cache, bucket, []);
        const counts = {
          fetched: 5,
          kept: 0,
          uploaded: 5,
          conflict: 0,
          failed: 0,
          verified: 4,
          of: 5,
        };
        expect(failureOf(dropped.result)).toMatchObject({ _tag: 'CopyIncomplete', ...counts });
        expect(dropped.last).toBe(runLine(counts));

        const unlisted = bucketOf();
        unlisted.failLists.add(1);
        const blind = yield* runOver(cache, unlisted, []);
        const none = {
          fetched: 0,
          kept: 0,
          uploaded: 5,
          conflict: 0,
          failed: 0,
          verified: 0,
          of: 5,
        };
        expect(failureOf(blind.result)).toMatchObject({ _tag: 'CopyIncomplete', ...none });
        expect(blind.last).toBe(runLine(none));
        expect(blind.lines).toContain('failed verify r2: listing refused');
      }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect('fails a refused first listing before any put', () =>
    Effect.gen(function* () {
      const cache = yield* temp;
      const bucket = bucketOf();
      bucket.failLists.add(0);
      const done = yield* runOver(cache, bucket, []);
      expect(failureOf(done.result)).toMatchObject({
        _tag: 'StoreFailed',
        reason: 'listing refused',
      });
      expect(bucket.calls).toEqual([`list ${PREFIX}`]);
      expect(yield* cacheOf(cache)).toEqual(allGood);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  const faults: ReadonlyArray<readonly [string, string, HubState]> = [
    ['flipped bytes', 'A.mlmodelc/weights/weight.bin', 'bad'],
    ['a 503', 'LICENSE', 'down'],
    ['a voice whose rows changed a value', AM_MICHAEL.path, 'changed'],
    ['a voice with a row missing', AM_MICHAEL.path, 'missing'],
  ];
  for (const [name, broken, state] of faults) {
    it.effect(`stops the fill at ${name}, keeps nothing of it, and makes no R2 call`, () =>
      Effect.gen(function* () {
        const cache = yield* temp;
        const bucket = bucketOf();
        const asked: Array<string> = [];
        const done = yield* runOver(cache, bucket, asked, new Map([[broken, state]]));
        expect(Result.isFailure(done.result)).toBe(true);
        expect(bucket.calls).toEqual([]);
        const upTo = PATHS.indexOf(broken);
        expect(asked).toEqual(PATHS.slice(0, upTo + 1).map(urlOf));
        expect(yield* cacheOf(cache)).toEqual(
          Object.fromEntries(PATHS.slice(0, upTo).map((path) => [path, 'good'])),
        );
        if (state !== 'down') {
          expect(failureOf(done.result)).toMatchObject({ _tag: 'FileMismatch', path: broken });
        }

        const healed = yield* runOver(cache, bucket, asked);
        expect(Result.isSuccess(healed.result)).toBe(true);
        expect(asked.slice(upTo + 1)).toEqual(PATHS.slice(upTo).map(urlOf));
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect('refetches a cached file whose bytes changed, and keeps the rest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cache = yield* temp;
      const bucket = bucketOf();
      yield* runOver(cache, bucket, []);
      const voice = path.join(cache, AM_MICHAEL.path);
      yield* fs.writeFile(voice, goodOf(AM_MICHAEL.path).subarray(1));
      const asked: Array<string> = [];
      const done = yield* runOver(cache, bucket, asked);
      expect(asked).toEqual([VOICE_ROWS]);
      expect(done.last).toBe(
        runLine({ fetched: 1, kept: 5, uploaded: 0, conflict: 0, failed: 0, verified: 5 }),
      );
      expect(yield* cacheOf(cache)).toEqual(allGood);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

describe('the dry run', () => {
  it.effect('fills and checks the cache with no bucket in reach, and prints its line', () =>
    Effect.gen(function* () {
      const cache = yield* temp;
      const asked: Array<string> = [];
      const first = yield* exec(
        dryRun(cache, FILES),
        Layer.merge(platform, hubOf(asked, new Map())),
      );
      expect(Result.getOrThrow(first.result)).toEqual({ fetched: 5, of: 5, bytes: TOTAL });
      expect(first.last).toBe(`models-copy dry-run files=5 bytes=${TOTAL} fetched=5 target=unread`);
      expect(asked).toEqual(PATHS.map(urlOf));
      expect(yield* cacheOf(cache)).toEqual(allGood);

      const again = yield* exec(dryRun(cache, FILES), Layer.merge(platform, hubOf([], new Map())));
      expect(again.last).toBe(`models-copy dry-run files=5 bytes=${TOTAL} fetched=0 target=unread`);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect('fails when the fill does, before its line', () =>
    Effect.gen(function* () {
      const cache = yield* temp;
      const done = yield* exec(
        dryRun(cache, FILES),
        Layer.merge(platform, hubOf([], new Map([[AM_MICHAEL.path, 'missing']]))),
      );
      expect(Result.isFailure(done.result)).toBe(true);
      expect(done.lines.some((line) => line.startsWith('models-copy'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
