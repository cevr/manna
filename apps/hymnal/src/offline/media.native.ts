/* oxlint-disable effect/noAsyncFunction, effect/noTryCatch, eslint/no-await-in-loop -- One filesystem adapter: close native file handles in the same Promise operation as their read/write, wrapped once by Effect.tryPromise. */
/** Native media uses application support, never the platform's evictable cache. */
import { Effect, Layer, Schema } from 'effect';
import { One } from 'one';
import { Entry, Identity, identityKey, Media, OfflineError, storageName } from './cache';

const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => OfflineError.make({ code: 'storage' }) });
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Entry));
const encode = Schema.encodeSync(Schema.fromJsonString(Entry));
export const mediaLayer = Layer.sync(Media, () => {
  const fs = One.FileSystem;
  const root = `${fs.getDirectories().applicationSupport.replace(/\/$/, '')}/${storageName}/`;
  const path = (id: Identity, ext: string) => `${root}${identityKey(id)}.${ext}`;
  const ready = () => fs.makeDirectory(root, true);
  return Media.of({
    list: call(async () => {
      await ready();
      const found = new Map<string, Entry>();
      for (const file of await fs.readDirectory(root)) {
        const match = /^(\d+)_(0|-?[1-6])\.(json|mp3)$/.exec(file.name);
        if (!match) continue;
        const id = { number: Number(match[1]), offset: Number(match[2]) };
        if (!Schema.is(Identity)(id)) continue;
        const key = identityKey(id);
        if (!found.has(key))
          found.set(key, { ...id, bytes: 0, total: 1, etag: '', complete: false });
        if (match[3] === 'json') {
          const row = decode(await new fs.File(file.uri).text());
          if (row._tag === 'Some' && identityKey(row.value) === key) found.set(key, row.value);
        }
      }
      return [...found.values()];
    }),
    size: (id) => call(async () => (await fs.getInfo(path(id, 'mp3'))).size ?? 0),
    append: (id, at, bytes) =>
      call(async () => {
        await ready();
        const file = new fs.File(path(id, 'mp3'));
        if (!(await fs.getInfo(file.uri)).exists) file.create();
        let mode: typeof fs.FileMode.ReadWrite | typeof fs.FileMode.Truncate =
          fs.FileMode.ReadWrite;
        if (at === 0) mode = fs.FileMode.Truncate;
        const handle = file.open(mode);
        try {
          handle.offset = at;
          await handle.writeBytes(bytes);
        } finally {
          handle.close();
        }
      }),
    save: (entry) =>
      call(async () => {
        const temp = new fs.File(path(entry, 'pending'));
        await temp.write(encode(entry));
        await temp.move(new fs.File(path(entry, 'json')), { overwrite: true });
      }),
    remove: (id) =>
      call(async () => {
        for (const ext of ['json', 'mp3', 'pending']) {
          const uri = path(id, ext);
          if ((await fs.getInfo(uri)).exists) await fs.delete(uri);
        }
      }),
    local: (entry) =>
      call(async () => {
        const file = new fs.File(path(entry, 'mp3'));
        const handle = file.open(fs.FileMode.ReadOnly);
        try {
          await handle.readBytes(1);
        } finally {
          handle.close();
        }
        return file.uri;
      }),
  });
});
