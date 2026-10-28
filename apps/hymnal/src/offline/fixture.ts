/** Synthetic external boundaries for controlled storage/HTTP schedules. No media is fetched. */
import { Effect, Layer } from 'effect';
import {
  type Entry,
  Http,
  Media,
  OfflineError,
  identityKey,
  mediaHeader,
  offlineLayer,
  type Identity,
  type Range,
} from './cache';

export const fake = () => {
  const entries = new Map<string, Entry>();
  const files = new Map<string, Uint8Array>();
  const calls: { id: Identity; at: number }[] = [];
  const control = {
    readFails: false,
    writeFails: false,
    saveFails: false,
    networkFails: false,
    networkFailsAt: -1,
    removeFails: false,
    removeFailNumber: -1,
    total: 12,
    chunk: 12,
    etag: '"v1"',
    active: 0,
    maxActive: 0,
    before: (_id: Identity, _at: number): Effect.Effect<void> => Effect.void,
    writing: Effect.void,
    listing: Effect.void,
  };
  const fail = () => OfflineError.make({ code: 'storage' });
  const media = Layer.succeed(
    Media,
    Media.of({
      removeOld: Effect.void,
      protect: Effect.void,
      list: Effect.suspend(() => control.listing).pipe(
        Effect.andThen(Effect.sync(() => [...entries.values()])),
      ),
      size: (id) => Effect.sync(() => files.get(identityKey(id))?.length ?? 0),
      append: (id, at, bytes) =>
        Effect.gen(function* () {
          if (control.writeFails) return yield* fail();
          if (at > 0 && (files.get(identityKey(id))?.length ?? 0) !== at) return yield* fail();
          const data = new Uint8Array(at + bytes.length);
          data.set(files.get(identityKey(id))?.subarray(0, at) ?? []);
          data.set(bytes, at);
          files.set(identityKey(id), data);
          yield* control.writing;
        }),
      save: (entry) =>
        Effect.gen(function* () {
          if (control.saveFails) return yield* fail();
          entries.set(identityKey(entry), entry);
        }),
      remove: (id) =>
        Effect.gen(function* () {
          if (control.removeFails || id.number === control.removeFailNumber) return yield* fail();
          entries.delete(identityKey(id));
          files.delete(identityKey(id));
        }),
      local: (entry) =>
        Effect.gen(function* () {
          if (control.readFails) return yield* fail();
          if (!mediaHeader(files.get(identityKey(entry)) ?? new Uint8Array())) return yield* fail();
          return `file:///synthetic/${identityKey(entry)}`;
        }),
    }),
  );
  const http = Layer.succeed(
    Http,
    Http.of({
      range: Effect.fn('Fake.range')(function* (id, at, _end): Effect.fn.Return<
        Range,
        OfflineError
      > {
        calls.push({ id, at });
        control.active++;
        control.maxActive = Math.max(control.maxActive, control.active);
        return yield* Effect.gen(function* () {
          yield* control.before(id, at);
          if (control.networkFails || at === control.networkFailsAt)
            return yield* OfflineError.make({ code: 'network' });
          const bytes = new Uint8Array(Math.min(control.chunk, control.total - at));
          if (at === 0) {
            bytes[0] = 255;
            bytes[1] = 251;
          }
          return { at, total: control.total, etag: control.etag, bytes };
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              control.active--;
            }),
          ),
        );
      }),
    }),
  );
  return {
    entries,
    files,
    calls,
    control,
    media,
    http,
    layer: offlineLayer.pipe(Layer.provide(media), Layer.provide(http)),
  };
};
