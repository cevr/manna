/* oxlint-disable effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, eslint/no-await-in-loop -- OPFS adapter: keep writable-stream close/abort and DOMException handling at the host boundary; every public operation enters Effect.tryPromise. */
import { Effect, Layer, Schema } from 'effect';
import {
  Entry,
  Identity,
  identityKey,
  mediaHeader,
  Media,
  OfflineError,
  readStorages,
  recordingStorage,
  storageFor,
  stray,
} from './cache';

const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => OfflineError.make({ code: 'storage' }) });
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Entry));
const encode = Schema.encodeSync(Schema.fromJsonString(Entry));
export const mediaLayer = Layer.effect(Media)(
  Effect.gen(function* () {
    const urls = new Map<string, string>();
    const root = (storage: string) =>
      navigator.storage
        .getDirectory()
        .then((dir) => dir.getDirectoryHandle(storage, { create: true }));
    const file = async (id: Identity, suffix: string, create = false) =>
      (await root(storageFor(id.number))).getFileHandle(`${identityKey(id)}.${suffix}`, {
        create,
      });
    const listIn = async (storage: string, found: Map<string, Entry>) => {
      const dir = await root(storage);
      for await (const [name, handle] of dir.entries()) {
        if (stray(storage, name)) continue;
        const match = /^(\d+)_(0|-?[1-6])\.(json|bin)$/.exec(name);
        if (!match || handle.kind !== 'file') continue;
        const id = { number: Number(match[1]), offset: Number(match[2]) };
        if (!Schema.is(Identity)(id)) continue;
        const key = identityKey(id);
        if (!found.has(key))
          found.set(key, { ...id, bytes: 0, total: 1, etag: '', complete: false });
        if (match[3] === 'json') {
          const text = await (await dir.getFileHandle(name)).getFile().then((f) => f.text());
          const row = decode(text);
          if (row._tag === 'Some' && identityKey(row.value) === key) found.set(key, row.value);
        }
      }
    };
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const url of urls.values()) URL.revokeObjectURL(url);
      }),
    );
    return Media.of({
      protect: call(async () => {
        if (navigator.storage.persist) await navigator.storage.persist();
      }),
      removeOld: call(async () => {
        const parent = await navigator.storage.getDirectory();
        for await (const [storage, handle] of parent.entries()) {
          if (handle.kind !== 'directory' || !recordingStorage(storage)) continue;
          if (!readStorages.includes(storage)) {
            await parent.removeEntry(storage, { recursive: true });
            continue;
          }
          const dir = await parent.getDirectoryHandle(storage);
          const strays: string[] = [];
          for await (const name of dir.keys()) if (stray(storage, name)) strays.push(name);
          for (const name of strays) await dir.removeEntry(name);
        }
      }),
      list: call(async () => {
        const found = new Map<string, Entry>();
        for (const storage of readStorages) await listIn(storage, found);
        return [...found.values()];
      }),
      size: (id) =>
        call(async () => {
          try {
            return (await (await file(id, 'bin')).getFile()).size;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'NotFoundError') return 0;
            throw error;
          }
        }),
      append: (id, at, bytes) =>
        call(async () => {
          const target = await file(id, 'bin', true);
          if ((await target.getFile()).size !== at) throw OfflineError.make({ code: 'storage' });
          const writer = await target.createWritable({ keepExistingData: at > 0 });
          try {
            await writer.seek(at);
            await writer.write(new Uint8Array(bytes));
            await writer.truncate(at + bytes.length);
            await writer.close();
          } catch (error) {
            await writer.abort();
            throw error;
          }
        }),
      save: (entry) =>
        call(async () => {
          const writer = await (await file(entry, 'json', true)).createWritable();
          try {
            await writer.write(encode(entry));
            await writer.close();
          } catch (error) {
            await writer.abort();
            throw error;
          }
        }),
      remove: (id) =>
        call(async () => {
          const key = identityKey(id);
          const url = urls.get(key);
          if (url) URL.revokeObjectURL(url);
          urls.delete(key);
          const dir = await root(storageFor(id.number));
          for (const ext of ['json', 'bin']) {
            try {
              await dir.removeEntry(`${key}.${ext}`);
            } catch (error) {
              if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
            }
          }
        }),
      local: (entry) =>
        call(async () => {
          const key = identityKey(entry);
          const blob = await (await file(entry, 'bin')).getFile();
          if (blob.size !== entry.bytes) throw OfflineError.make({ code: 'storage' });
          if (!mediaHeader(new Uint8Array(await blob.slice(0, 3).arrayBuffer())))
            throw OfflineError.make({ code: 'storage' });
          const old = urls.get(key);
          if (old) return old;
          const url = URL.createObjectURL(blob.slice(0, blob.size, 'audio/mpeg'));
          urls.set(key, url);
          return url;
        }),
    });
  }),
);
