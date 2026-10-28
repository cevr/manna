/* oxlint-disable effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, eslint/no-await-in-loop -- One filesystem adapter: close native file handles and check storage invariants within the same Promise operation, wrapped once by Effect.tryPromise. */
/** Native media uses application support, never the platform's evictable cache. */
import { Effect, Layer, Option, Schema } from 'effect';
import { One } from 'one';
import {
  CHUNK,
  Entry,
  Identity,
  identityKey,
  mediaHeader,
  Media,
  OfflineError,
  recordingStorage,
  storageName,
} from './cache';
import { protectDirectory } from './backup';

const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => OfflineError.make({ code: 'storage' }) });
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Entry));
const encode = Schema.encodeSync(Schema.fromJsonString(Entry));
export const mediaLayer = Layer.sync(Media, () => {
  const fs = One.FileSystem;
  let protectedDirectory = false;
  let base = Option.none<string>();
  // Resolve the native directory within an operation's typed Promise boundary.
  // A missing filesystem must not prevent the online player from starting.
  const root = () =>
    Option.match(base, {
      onSome: (uri) => uri,
      onNone: () => {
        const uri = `${fs.getDirectories().applicationSupport.replace(/\/$/, '')}/${storageName}/`;
        base = Option.some(uri);
        return uri;
      },
    });
  const path = (id: Identity, ext: string) => `${root()}${identityKey(id)}.${ext}`;
  const ready = async () => {
    await fs.makeDirectory(root(), true);
    if (!protectedDirectory) {
      protectDirectory(root());
      for (const file of await fs.readDirectory(fs.getDirectories().applicationSupport))
        if (file.isDirectory && recordingStorage(file.name)) protectDirectory(file.uri);
      protectedDirectory = true;
    }
  };
  return Media.of({
    protect: call(async () => {
      await ready();
      if (fs.Paths.availableDiskSpace < 2 * CHUNK) throw OfflineError.make({ code: 'storage' });
    }),
    removeOld: call(async () => {
      const parent = fs.getDirectories().applicationSupport;
      for (const file of await fs.readDirectory(parent))
        if (file.isDirectory && file.name !== storageName && recordingStorage(file.name))
          await fs.delete(file.uri);
    }),
    list: call(async () => {
      await ready();
      const found = new Map<string, Entry>();
      for (const file of await fs.readDirectory(root())) {
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
        const info = await fs.getInfo(file.uri);
        if ((info.size ?? 0) !== at || fs.Paths.availableDiskSpace < bytes.length)
          throw OfflineError.make({ code: 'storage' });
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
          if (!mediaHeader(await handle.readBytes(3))) throw OfflineError.make({ code: 'storage' });
        } finally {
          handle.close();
        }
        return file.uri;
      }),
  });
});
