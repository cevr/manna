/* oxlint-disable effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, eslint/no-await-in-loop -- OPFS adapter: keep writable-stream close/abort and DOMException handling at the host boundary; every public operation enters Effect.tryPromise. */
/** Browser media lives in OPFS, apart from the HTTP cache and synchronous settings. */
import { Effect, Layer, Schema } from 'effect';
import { Entry, identityKey, Media, OfflineError, type Identity } from './cache';

const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => OfflineError.make({ code: 'storage' }) });
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Entry));
const encode = Schema.encodeSync(Schema.fromJsonString(Entry));
export const mediaLayer = Layer.effect(Media)(
  Effect.gen(function* () {
    const urls = new Map<string, string>();
    const root = () =>
      navigator.storage
        .getDirectory()
        .then((dir) => dir.getDirectoryHandle('hymnal-recordings-v1', { create: true }));
    const file = async (id: Identity, suffix: string, create = false) =>
      (await root()).getFileHandle(`${identityKey(id)}.${suffix}`, { create });
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const url of urls.values()) URL.revokeObjectURL(url);
      }),
    );
    return Media.of({
      list: call(async () => {
        const found = new Map<string, Entry>();
        const dir = await root();
        for await (const [name, handle] of dir.entries()) {
          const match = /^(\d+)_(0|-?[1-6])\.(json|bin)$/.exec(name);
          if (!match || handle.kind !== 'file') continue;
          const id = { number: Number(match[1]), offset: Number(match[2]) };
          const key = identityKey(id);
          if (!found.has(key))
            found.set(key, { ...id, bytes: 0, total: 1, etag: '', complete: false });
          if (match[3] === 'json') {
            const text = await (await dir.getFileHandle(name)).getFile().then((f) => f.text());
            const row = decode(text);
            if (row._tag === 'Some' && identityKey(row.value) === key) found.set(key, row.value);
          }
        }
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
          const writer = await (
            await file(id, 'bin', true)
          ).createWritable({ keepExistingData: at > 0 });
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
          const dir = await root();
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
          const old = urls.get(key);
          if (old) return old;
          const url = URL.createObjectURL(blob.slice(0, blob.size, 'audio/mpeg'));
          urls.set(key, url);
          return url;
        }),
    });
  }),
);
