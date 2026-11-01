/* oxlint-disable effect/noNewPromise -- the stand-in for One's FileSystem answers in Promises, as the host API the native adapter wraps once in Effect.tryPromise. */
/**
 * The phone's saved recordings across a later recording set: `warm-2` moves
 * hymn 663 alone, so every other hymn's saved file stays found, 663's file
 * saved from `warm-1` is never played as its new recording, and Delete frees
 * them all. The native adapter runs over a synthetic filesystem laid out as
 * the app saved it before `warm-2` (one `warm-1` storage); no media is fetched.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect';
import { expect, it } from 'effect-bun-test';
import { One } from 'one';
import { Entry, Http, Media, Offline, offlineLayer } from './cache';
import { mediaLayer } from './media.native';

const SUPPORT = 'file:///support/';
const WARM_0 = `${SUPPORT}hymnal-recordings-warm-0-v1/`;
const WARM_1 = `${SUPPORT}hymnal-recordings-warm-1-v1/`;
const WARM_2 = `${SUPPORT}hymnal-recordings-warm-2-v1/`;
/** A saved file's bytes: an ID3 header, then the set's own byte. */
const audio = (mark: number) => Uint8Array.of(73, 68, 51, mark, mark, mark, mark, mark);
const encode = Schema.encodeSync(Schema.fromJsonString(Entry));

/** The part of `One.FileSystem` the native adapter calls, in memory. */
const disk = () => {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>([SUPPORT]);
  const slash = (uri: string) => uri.replace(/\/?$/, '/');
  const children = (uri: string) => {
    const dir = slash(uri);
    const inside = (path: string) =>
      path !== dir &&
      path.startsWith(dir) &&
      !path.slice(dir.length).replace(/\/$/, '').includes('/');
    return [
      ...[...dirs].filter(inside).map((path) => ({
        uri: path,
        name: path.slice(dir.length, -1),
        isDirectory: true,
      })),
      ...[...files.keys()].filter(inside).map((path) => ({
        uri: path,
        name: path.slice(dir.length),
        isDirectory: false,
      })),
    ];
  };
  class File {
    constructor(readonly uri: string) {}
    text() {
      return Promise.resolve(new TextDecoder().decode(files.get(this.uri)));
    }
    write(text: string) {
      files.set(this.uri, new TextEncoder().encode(text));
      return Promise.resolve();
    }
    move(to: File) {
      files.set(to.uri, files.get(this.uri) ?? new Uint8Array());
      files.delete(this.uri);
      return Promise.resolve();
    }
    create() {
      files.set(this.uri, new Uint8Array());
    }
    open(mode: string) {
      const uri = this.uri;
      if (mode === 'truncate') files.set(uri, new Uint8Array());
      return {
        offset: 0,
        writeBytes(bytes: Uint8Array) {
          const old = files.get(uri) ?? new Uint8Array();
          const next = new Uint8Array(Math.max(old.length, this.offset + bytes.length));
          next.set(old);
          next.set(bytes, this.offset);
          files.set(uri, next);
          return Promise.resolve();
        },
        readBytes(count: number) {
          return Promise.resolve((files.get(uri) ?? new Uint8Array()).slice(0, count));
        },
        close() {},
      };
    }
  }
  const fs = {
    File,
    FileMode: { ReadOnly: 'read', ReadWrite: 'readwrite', Truncate: 'truncate' },
    Paths: { availableDiskSpace: 2 ** 40 },
    getDirectories: () => ({ applicationSupport: SUPPORT }),
    makeDirectory: (uri: string) => Promise.resolve(void dirs.add(slash(uri))),
    readDirectory: (uri: string) => Promise.resolve(children(uri)),
    getInfo: (uri: string) =>
      Promise.resolve({
        exists: files.has(uri) || dirs.has(slash(uri)),
        size: files.get(uri)?.length,
      }),
    delete: (uri: string) => {
      for (const path of [...files.keys()])
        if (path === uri || path.startsWith(slash(uri))) files.delete(path);
      for (const path of [...dirs]) if (path.startsWith(slash(uri))) dirs.delete(path);
      return Promise.resolve();
    },
  };
  /** A complete saved recording, as the adapter writes it, in `storage`. */
  const saved = (storage: string, number: number, mark: number) => {
    dirs.add(storage);
    const bytes = audio(mark);
    files.set(`${storage}${number}_0.mp3`, bytes);
    files.set(
      `${storage}${number}_0.json`,
      new TextEncoder().encode(
        encode({
          number,
          offset: 0,
          bytes: bytes.length,
          total: bytes.length,
          etag: `"${mark}"`,
          complete: true,
        }),
      ),
    );
  };
  Object.assign(One, { FileSystem: fs });
  return { files, saved };
};

/** R2 for hymn 663 in its new set: the bytes marked 2. */
const fetched: number[] = [];
const http = Layer.succeed(
  Http,
  Http.of({
    range: (id, at) =>
      Effect.sync(() => {
        fetched.push(id.number);
        const bytes = audio(2);
        return { at, total: bytes.length, etag: '"2"', bytes: bytes.slice(at) };
      }),
  }),
);
const settled = (cache: typeof Offline.Service) =>
  cache.changes.pipe(
    Stream.filter((s) => !s.indexing && s.active + s.queued === 0),
    Stream.take(1),
    Stream.runDrain,
  );

it.effect('a later set keeps the saved recordings of the hymns it does not move', () => {
  const d = disk();
  d.saved(WARM_1, 1, 1);
  d.saved(WARM_1, 663, 1);
  fetched.length = 0;
  return Effect.gen(function* () {
    const cache = yield* Offline;
    yield* settled(cache);
    expect((yield* cache.snapshot).saved).toBe(1);
    expect(yield* cache.local({ number: 1, offset: 0 })).toEqual(Option.some(`${WARM_1}1_0.mp3`));
    expect(Option.isNone(yield* cache.local({ number: 663, offset: 0 }))).toBe(true);

    yield* cache.enqueue({ number: 663, offset: 0 });
    yield* settled(cache);
    expect(fetched).toEqual([663]);
    expect(yield* cache.local({ number: 663, offset: 0 })).toEqual(
      Option.some(`${WARM_2}663_0.mp3`),
    );
    expect(d.files.get(`${WARM_2}663_0.mp3`)).toEqual(audio(2));
    expect((yield* cache.snapshot).saved).toBe(2);

    yield* cache.deleteAll;
    expect([...d.files.keys()]).toEqual([]);
    expect((yield* cache.snapshot).saved).toBe(0);
  }).pipe(Effect.provide(offlineLayer.pipe(Layer.provide(mediaLayer), Layer.provide(http))));
});

it.effect('clean-up frees an old set only once no hymn reads it', () => {
  const d = disk();
  d.saved(WARM_0, 5, 0);
  d.saved(WARM_1, 1, 1);
  d.saved(WARM_1, 663, 1);
  d.saved(WARM_2, 663, 2);
  return Effect.gen(function* () {
    const media = yield* Media;
    expect((yield* media.list).map((row) => [row.number, row.etag])).toEqual([
      [1, '"1"'],
      [663, '"2"'],
    ]);
    yield* media.removeOld;
    expect([...d.files.keys()].toSorted()).toEqual([
      `${WARM_1}1_0.json`,
      `${WARM_1}1_0.mp3`,
      `${WARM_2}663_0.json`,
      `${WARM_2}663_0.mp3`,
    ]);
  }).pipe(Effect.provide(mediaLayer));
});
