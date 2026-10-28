/** One scoped queue owns durable recording publication. Media bytes never enter settings. */
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Layer,
  Option,
  Queue,
  Schema,
  type Stream,
  SubscriptionRef,
} from 'effect';
import * as Semaphore from 'effect/Semaphore';
import { soundingOffset } from '~/remote';
import { RECORDING_SET } from '@manna/hymnal/recordings';

/** A later immutable recording set must not resolve files from an earlier set. */
export const storageName = `hymnal-recordings-${RECORDING_SET}-v1`;
export const recordingStorage = (name: string) => /^hymnal-recordings-[a-z0-9-]+-v\d+$/.test(name);

export const Identity = Schema.Struct({
  number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 695 })),
  offset: Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 6 })),
});
export type Identity = typeof Identity.Type;
export const Entry = Schema.Struct({
  ...Identity.fields,
  bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  total: Schema.Int.check(Schema.isGreaterThan(0)),
  etag: Schema.String,
  complete: Schema.Boolean,
});
export type Entry = typeof Entry.Type;
export class OfflineError extends Schema.TaggedError<OfflineError>()('OfflineError', {
  code: Schema.Literals(['network', 'storage', 'invalid']),
}) {}
export const identityKey = (id: Identity) => `${id.number}_${soundingOffset(id.offset)}`;
export const CHUNK = 2 * 1024 * 1024;

/** Platform media storage: append at an exact offset; save commits metadata atomically. */
export class Media extends Context.Service<
  Media,
  {
    readonly list: Effect.Effect<readonly Entry[], OfflineError>;
    readonly size: (id: Identity) => Effect.Effect<number, OfflineError>;
    readonly append: (
      id: Identity,
      at: number,
      bytes: Uint8Array,
    ) => Effect.Effect<void, OfflineError>;
    readonly save: (entry: Entry) => Effect.Effect<void, OfflineError>;
    readonly remove: (id: Identity) => Effect.Effect<void, OfflineError>;
    readonly removeOld: Effect.Effect<void, OfflineError>;
    readonly protect: Effect.Effect<void, OfflineError>;
    readonly local: (entry: Entry) => Effect.Effect<string, OfflineError>;
  }
>()('hymnal/offline/Media') {}

export interface Range {
  readonly at: number;
  readonly total: number;
  readonly etag: string;
  readonly bytes: Uint8Array;
}
export class Http extends Context.Service<
  Http,
  {
    readonly range: (id: Identity, at: number, end: number) => Effect.Effect<Range, OfflineError>;
  }
>()('hymnal/offline/Http') {}

export interface Snapshot {
  readonly saved: number;
  readonly printed: number;
  readonly bytes: number;
  readonly active: number;
  readonly queued: number;
  readonly partialBytes: number;
  readonly failed: number;
  readonly paused: boolean;
  readonly storage: boolean;
  readonly indexing: boolean;
}
export const empty: Snapshot = {
  saved: 0,
  printed: 0,
  bytes: 0,
  active: 0,
  queued: 0,
  partialBytes: 0,
  failed: 0,
  paused: false,
  storage: false,
  indexing: true,
};
export class Offline extends Context.Service<
  Offline,
  {
    readonly enqueue: (id: Identity) => Effect.Effect<void>;
    readonly shown: (number: number) => Effect.Effect<void>;
    readonly downloadAll: Effect.Effect<void>;
    readonly cancel: Effect.Effect<void>;
    readonly deleteAll: Effect.Effect<void, OfflineError>;
    readonly invalidate: (id: Identity) => Effect.Effect<void, OfflineError>;
    readonly local: (id: Identity) => Effect.Effect<Option.Option<string>>;
    readonly snapshot: Effect.Effect<Snapshot>;
    readonly changes: Stream.Stream<Snapshot>;
  }
>()('hymnal/offline/Offline') {}

interface Job {
  readonly id: Identity;
  readonly epoch: number;
  readonly cancelled: Deferred.Deferred<boolean>;
  active: boolean;
}
export const mediaHeader = (b: Uint8Array) =>
  (b[0] === 73 && b[1] === 68 && b[2] === 51) || (b[0] === 255 && ((b[1] ?? 0) & 224) === 224);

export const offlineLayer = Layer.effect(Offline)(
  Effect.gen(function* () {
    const media = yield* Media;
    const http = yield* Http;
    const scope = yield* Effect.scope;
    let viewing = 0;
    const mutex = yield* Semaphore.make(1);
    const queue = yield* Queue.unbounded<Job>();
    const state = yield* SubscriptionRef.make(empty);
    const entries = new Map<string, Entry>();
    const jobs = new Map<string, Job>();
    const failed = new Map<string, Identity>();
    const resume = new Map<string, Identity>();
    const touched = new Set<string>();
    let epoch = 0;
    let paused = false;
    let storage = false;
    let indexing = true;
    const publish = Effect.suspend(() => {
      const rows = [...entries.values()];
      const done = rows.filter((e) => e.complete);
      const active = [...jobs.values()].filter((j) => j.active).length;
      return SubscriptionRef.set(state, {
        saved: done.length,
        printed: done.filter((e) => e.offset === 0).length,
        bytes: done.reduce((n, e) => n + e.bytes, 0),
        active,
        queued: jobs.size - active,
        partialBytes: rows.filter((e) => !e.complete).reduce((n, e) => n + e.bytes, 0),
        failed: failed.size,
        paused,
        storage,
        indexing,
      });
    });
    const owns = (job: Job) => job.epoch === epoch && jobs.get(identityKey(job.id)) === job;
    // Cancellation cannot cut a platform write in half and race a later delete.
    const locked = <A, E>(work: Effect.Effect<A, E>) =>
      mutex.withPermit(work).pipe(Effect.uninterruptible);
    const cancelOwned = Effect.gen(function* () {
      viewing++;
      epoch++;
      paused = true;
      for (const [key, job] of jobs) {
        resume.set(key, job.id);
        yield* Deferred.succeed(job.cancelled, true);
      }
      jobs.clear();
      yield* publish;
    });
    const cancel = locked(cancelOwned);
    const indexed = yield* Deferred.make<boolean>();
    // Index discovery never holds playback or the mutation lock. A key touched
    // since startup belongs to the current session, not this older disk view.
    yield* Effect.gen(function* () {
      const rows = yield* media.list;
      for (const row of rows) {
        const key = identityKey(row);
        if (touched.has(key)) continue;
        const size = yield* media.size(row);
        yield* locked(
          Effect.gen(function* () {
            if (touched.has(key)) return;
            if (row.complete && (row.bytes !== row.total || size !== row.bytes)) {
              failed.set(key, row);
              yield* media.remove(row);
            } else {
              entries.set(key, row);
              if (!row.complete) {
                resume.set(key, row);
                paused = true;
              }
            }
            yield* publish;
          }),
        );
      }
    }).pipe(
      Effect.catchCause(() =>
        locked(
          Effect.gen(function* () {
            storage = true;
            yield* cancelOwned;
          }),
        ),
      ),
      Effect.ensuring(
        Effect.suspend(() => {
          indexing = false;
          return publish.pipe(Effect.andThen(Deferred.succeed(indexed, true)));
        }),
      ),
      Effect.forkScoped,
    );
    const run = Effect.fn('Offline.save')(function* (job: Job) {
      const key = identityKey(job.id);
      const start = yield* locked(
        Effect.gen(function* () {
          if (!owns(job)) return false;
          job.active = true;
          const row = entries.get(key);
          if ((yield* media.size(job.id)) !== (row?.bytes ?? 0)) {
            yield* media.remove(job.id);
            entries.delete(key);
          }
          yield* publish;
          return true;
        }),
      );
      if (!start) return;
      let complete = false;
      let restarted = false;
      while (!complete && owns(job)) {
        const previous = entries.get(key);
        if (previous?.complete) break;
        const at = previous?.bytes ?? 0;
        const response = yield* http.range(job.id, at, at + CHUNK - 1);
        complete = yield* locked(
          Effect.gen(function* () {
            if (!owns(job)) return true;
            // Invalidation may remove a partial while this range is in flight.
            // Restart instead of appending past a now-missing prefix.
            if (entries.get(key) !== previous) return false;
            // A changed entity never receives bytes from its former version.
            if (
              previous &&
              (response.etag !== previous.etag ||
                response.total !== previous.total ||
                response.at !== at)
            ) {
              yield* media.remove(job.id);
              entries.delete(key);
              if (restarted) return yield* OfflineError.make({ code: 'invalid' });
              restarted = true;
              yield* publish;
              return false;
            }
            const size = response.bytes.byteLength;
            if (
              response.at !== at ||
              size === 0 ||
              size > CHUNK ||
              response.total <= at ||
              at + size > response.total ||
              !/^"[^"\r\n]+"$/.test(response.etag) ||
              (at === 0 && !mediaHeader(response.bytes))
            )
              return yield* OfflineError.make({ code: 'invalid' });
            const entry: Entry = {
              ...job.id,
              bytes: at + size,
              total: response.total,
              etag: response.etag,
              complete: at + size === response.total,
            };
            yield* media.append(job.id, at, response.bytes);
            if ((yield* media.size(job.id)) !== entry.bytes)
              return yield* OfflineError.make({ code: 'storage' });
            yield* media.save(entry);
            storage = false;
            entries.set(key, entry);
            resume.delete(key);
            yield* publish;
            return entry.complete;
          }),
        );
      }
    });
    const work = (job: Job) =>
      Effect.raceFirst(run(job), Deferred.await(job.cancelled).pipe(Effect.asVoid)).pipe(
        Effect.catchCause((cause) =>
          locked(
            Effect.gen(function* () {
              if (!owns(job)) return;
              const error = Option.getOrUndefined(Cause.findErrorOption(cause));
              failed.set(identityKey(job.id), job.id);
              if (error?.code === 'storage') {
                storage = true;
                yield* cancelOwned;
              }
              yield* Effect.logWarning('offline.save.failed').pipe(
                Effect.annotateLogs({
                  hymn: job.id.number,
                  offset: job.id.offset,
                  code: error?.code ?? 'defect',
                }),
              );
            }),
          ),
        ),
        Effect.ensuring(
          locked(
            Effect.gen(function* () {
              if (owns(job)) jobs.delete(identityKey(job.id));
              yield* publish;
            }),
          ),
        ),
      );
    for (let n = 0; n < 2; n++)
      yield* Effect.forever(Queue.take(queue).pipe(Effect.flatMap(work))).pipe(Effect.forkScoped);
    const add = Effect.fn('Offline.enqueue')(function* (input: Identity) {
      const id = { number: input.number, offset: soundingOffset(input.offset) };
      if (!Schema.is(Identity)(id)) return;
      const key = identityKey(id);
      touched.add(key);
      if (entries.get(key)?.complete || jobs.has(key)) return;
      const job: Job = { id, epoch, cancelled: yield* Deferred.make<boolean>(), active: false };
      jobs.set(key, job);
      failed.delete(key);
      yield* Queue.offer(queue, job);
    });
    const invalidate = Effect.fn('Offline.invalidate')(function* (id: Identity) {
      touched.add(identityKey(id));
      entries.delete(identityKey(id));
      failed.set(identityKey(id), id);
      yield* media.remove(id).pipe(Effect.ensuring(publish));
    });
    return Offline.of({
      shown: (number) =>
        Effect.gen(function* () {
          const owner = ++viewing;
          if (number < 1 || number > 695) return;
          yield* Effect.sleep('750 millis').pipe(
            Effect.andThen(
              Effect.suspend(() => {
                if (owner !== viewing) return Effect.void;
                return locked(add({ number, offset: 0 }).pipe(Effect.andThen(publish)));
              }),
            ),
            Effect.forkIn(scope),
          );
        }),
      enqueue: (id) => locked(add(id).pipe(Effect.andThen(publish))),
      downloadAll: Deferred.await(indexed).pipe(
        Effect.andThen(media.protect),
        Effect.andThen(
          locked(
            Effect.gen(function* () {
              storage = false;
              paused = false;
              const retries = [...resume.values(), ...failed.values()];
              resume.clear();
              for (const id of retries) yield* add(id);
              for (let number = 1; number <= 695; number++) yield* add({ number, offset: 0 });
              yield* publish;
            }),
          ),
        ),
        Effect.catchCause(() =>
          locked(
            Effect.gen(function* () {
              storage = true;
              yield* cancelOwned;
            }),
          ),
        ),
      ),
      cancel,
      deleteAll: cancel.pipe(
        Effect.andThen(
          locked(
            Effect.gen(function* () {
              // Include failed writes and orphaned bytes discovered by platform listing.
              const disk = yield* media.list;
              for (const row of new Map(
                [...entries.values(), ...disk].map((row) => [identityKey(row), row]),
              ).values()) {
                touched.add(identityKey(row));
                yield* media.remove(row);
                entries.delete(identityKey(row));
              }
              entries.clear();
              yield* media.removeOld;
              failed.clear();
              resume.clear();
              storage = false;
              paused = false;
              yield* publish;
            }).pipe(Effect.ensuring(publish)),
          ),
        ),
      ),
      invalidate: (id) => locked(invalidate(id)),
      local: (id) =>
        locked(
          Effect.gen(function* () {
            const row = entries.get(identityKey(id));
            if (!row?.complete) return Option.none<string>();
            return yield* Effect.gen(function* () {
              if ((yield* media.size(id)) !== row.bytes)
                return yield* OfflineError.make({ code: 'storage' });
              return Option.some(yield* media.local(row));
            }).pipe(
              Effect.catch(() =>
                invalidate(id).pipe(
                  Effect.as(Option.none<string>()),
                  Effect.orElseSucceed(() => Option.none<string>()),
                ),
              ),
            );
          }),
        ),
      snapshot: SubscriptionRef.get(state),
      changes: SubscriptionRef.changes(state),
    });
  }),
);
