/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/noAsyncFunction, effect/preferMatchTagsExhaustive -- the current app's cache is imported once and run under its own fibers; the port's side is one plain loop over the store's commands over a disk of its own, as the data module's plain switch carries them out, and a broken rule throws naming its seed and history as JSON. */

/**
 * The port's store (`store.ts`) beside the current app's cache
 * (`apps/hymnal/src/offline/cache.ts`, imported, never copied), each over a
 * disk of its own: seeded histories of a save asked (the same hymn twice, its
 * key moved mid-save), Download all, a fetch finishing, failing or cut off,
 * Cancel, Delete and a relaunch at any step, each given to both. A fetch is
 * held open until the history finishes, fails or cuts it, so the order in
 * which the two take their queue is visible; every fetch the current cache
 * asks is a whole recording's first range, shorter than its `CHUNK`.
 *
 * After each step both hold the same saved recordings with the same bytes,
 * the same fetches out, and the same counts Downloads reads (saved, printed,
 * bytes, downloading, queued, failed, paused, storage, checking); and the
 * port's disk holds a recording only whole, and never two fetches of one
 * identity at once. A second property lets a cancelled fetch settle late and
 * a launch die between a body's arrival and its rename: the port then never
 * fetches one identity twice at once, never publishes a part, and a part
 * found at launch is removed and its save resumed.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Exit, Layer, References, Scope } from 'effect';

import { type Random, below, pick, seeded } from '../test/random.ts';
import {
  type Command,
  type File,
  type Identity,
  type Input,
  type Store,
  countsOf,
  empty,
  keyOf,
  partOf,
  pathOf,
  stepStore,
} from './store.ts';
import type * as CacheModule from '@manna/hymnal-app/offline/cache';

type Cache = typeof CacheModule;

/** Histories given to both: each Download all queues every hymn in the current cache, its workers passing the cancelled ones one by one, so a few dozen keep the part under its second. */
const HISTORIES = 30;
/** Histories the port alone walks, its cancelled fetches settling late. */
const LATE = 80;
const STEPS = 50;
const NUMBERS = [1, 2, 3, 4, 663];
const OFFSETS = [0, 0, 2, -3, 14];

/** The size of `id`'s recording, as the bucket serves it: under the current cache's `CHUNK`. */
const sizeOf = (id: Identity) => 300 + id.number * 3 + (id.offset + 5);

/** A recording's bytes: an ID3 head, as the current cache checks a first range. */
const bodyOf = (id: Identity) => {
  const bytes = new Uint8Array(sizeOf(id));
  bytes.set([73, 68, 51]);
  return bytes;
};

type Act =
  | { readonly _tag: 'enqueue'; readonly id: Identity }
  | { readonly _tag: 'all' }
  | { readonly _tag: 'finish'; readonly at: number }
  | { readonly _tag: 'fail'; readonly at: number }
  | { readonly _tag: 'cut'; readonly at: number }
  | { readonly _tag: 'empty'; readonly at: number }
  | { readonly _tag: 'cancel' }
  | { readonly _tag: 'delete' }
  | { readonly _tag: 'relaunch' };

const actOf = (random: Random): Act =>
  pick<() => Act>(random, [
    () => ({
      _tag: 'enqueue',
      id: { number: pick(random, NUMBERS), offset: pick(random, OFFSETS) },
    }),
    () => ({
      _tag: 'enqueue',
      id: { number: pick(random, NUMBERS), offset: pick(random, OFFSETS) },
    }),
    () => ({ _tag: 'all' }),
    () => ({ _tag: 'finish', at: below(random, 2) }),
    () => ({ _tag: 'finish', at: below(random, 2) }),
    () => ({ _tag: 'finish', at: below(random, 2) }),
    () => ({ _tag: 'fail', at: below(random, 2) }),
    () => ({ _tag: 'cut', at: below(random, 2) }),
    () => ({ _tag: 'empty', at: below(random, 2) }),
    () => ({ _tag: 'cancel' }),
    () => ({ _tag: 'delete' }),
    () => ({ _tag: 'relaunch' }),
  ])();

/** The port as its data module runs it: the store, its disk (path to size) and its fetches out. */
const portOf = (lateAborts: boolean) => {
  let store: Store = empty;
  const disk = new Map<string, number>();
  const out = new Map<number, Identity>();
  const aborted: Array<number> = [];
  const filesOf = (): ReadonlyArray<File> =>
    [...disk.entries()].map(([path, size]) => {
      const parts = path.split('/');
      return { storage: parts.at(-2) ?? '', name: parts.at(-1) ?? '', size };
    });
  const feed = (input: Input) => {
    const next = stepStore(store, input);
    store = next.store;
    for (const command of next.commands) obey(command);
  };
  const obey = (command: Command) => {
    switch (command._tag) {
      case 'list':
        pending.push({ _tag: 'indexed', files: filesOf() });
        return;
      case 'fetch':
        for (const each of out.values())
          if (keyOf(each) === keyOf(command.id))
            throw new Error(`two fetches of ${keyOf(command.id)}`);
        out.set(command.serial, command.id);
        return;
      case 'abort': {
        const id = out.get(command.serial);
        if (lateAborts || id === undefined) {
          aborted.push(command.serial);
          return;
        }
        out.delete(command.serial);
        pending.push({ _tag: 'fetchFailed', serial: command.serial, id, code: 'network' });
        return;
      }
      case 'publish': {
        const size = disk.get(partOf(command.id));
        if (size === undefined) throw new Error(`no part to publish for ${keyOf(command.id)}`);
        disk.delete(partOf(command.id));
        disk.set(pathOf(command.id), size);
        return;
      }
      case 'drop':
        disk.delete(partOf(command.id));
        return;
      case 'remove':
        disk.delete(pathOf(command.id));
        return;
      case 'removeFile':
        disk.delete(`app:/data/recordings/${command.storage}/${command.name}`);
        return;
      case 'removeOld':
        return;
      case 'protect':
        pending.push({ _tag: 'protected', ok: true });
        return;
    }
  };
  const pending: Array<Input> = [];
  const drain = () => {
    for (let input = pending.shift(); input !== undefined; input = pending.shift()) feed(input);
  };
  /** A fetch out lands: its body written whole to its part (as `exactBodyTo` does), an empty part, or nothing. */
  const land = (serial: number, how: 'finish' | 'fail' | 'cut' | 'empty') => {
    const id = out.get(serial);
    if (id === undefined) return;
    out.delete(serial);
    if (how === 'finish' || how === 'empty') {
      const bytes = how === 'finish' ? sizeOf(id) : 0;
      disk.set(partOf(id), bytes);
      feed({ _tag: 'fetched', serial, id, bytes });
    } else feed({ _tag: 'fetchFailed', serial, id, code: how === 'fail' ? 'network' : 'invalid' });
    drain();
  };
  return {
    store: () => store,
    disk,
    out,
    ask: (input: Input) => {
      feed(input);
      drain();
    },
    land,
    /** A fetch let go settles now: its rejection, as an abort answers. */
    settleAbort: () => {
      const serial = aborted.shift();
      if (serial === undefined) return;
      const id = out.get(serial);
      out.delete(serial);
      if (id !== undefined) feed({ _tag: 'fetchFailed', serial, id, code: 'network' });
      drain();
    },
    /** The module dies: what is out is gone, and a launch reads the disk. */
    relaunch: (afterBody: boolean) => {
      if (afterBody) {
        const first = [...out.values()][0];
        if (first !== undefined) disk.set(partOf(first), sizeOf(first));
      }
      out.clear();
      aborted.length = 0;
      pending.length = 0;
      feed({ _tag: 'launch' });
      drain();
    },
  };
};

/** Let the current cache's fibers run what the last change woke. */
const settle = Effect.forEach(Array.from({ length: 12 }), () => Effect.yieldNow, { discard: true });

/** The current cache over a disk of its own and a transport the history answers. */
const currentOf = (cache: Cache) =>
  Effect.gen(function* () {
    const entries = new Map<string, CacheModule.Entry>();
    const sizes = new Map<string, number>();
    const out: Array<{
      readonly id: CacheModule.Identity;
      readonly answer: Deferred.Deferred<CacheModule.Range, CacheModule.OfflineError>;
    }> = [];
    const media: (typeof CacheModule.Media)['Service'] = {
      list: Effect.sync(() => [...entries.values()]),
      size: (id) => Effect.sync(() => sizes.get(cache.identityKey(id)) ?? 0),
      append: (id, at, bytes) =>
        Effect.sync(() => {
          sizes.set(cache.identityKey(id), at + bytes.byteLength);
        }),
      save: (entry) =>
        Effect.sync(() => {
          entries.set(cache.identityKey(entry), entry);
        }),
      remove: (id) =>
        Effect.sync(() => {
          entries.delete(cache.identityKey(id));
          sizes.delete(cache.identityKey(id));
        }),
      removeOld: Effect.void,
      protect: Effect.void,
      local: (entry) => Effect.succeed(`local:${cache.identityKey(entry)}`),
    };
    const http: (typeof CacheModule.Http)['Service'] = {
      range: (id) =>
        Effect.gen(function* () {
          const answer = yield* Deferred.make<CacheModule.Range, CacheModule.OfflineError>();
          const job = { id, answer };
          out.push(job);
          return yield* Deferred.await(answer).pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                const at = out.indexOf(job);
                if (at >= 0) out.splice(at, 1);
              }),
            ),
          );
        }),
    };
    const parts = Layer.mergeAll(
      Layer.succeed(cache.Media, media),
      Layer.succeed(cache.Http, http),
    );
    let scope = yield* Scope.make();
    const build = Effect.gen(function* () {
      const context = yield* Layer.buildWithScope(Layer.provide(cache.offlineLayer, parts), scope);
      yield* settle;
      return Context.get(context, cache.Offline);
    });
    let offline = yield* build;
    return {
      entries,
      sizes,
      out,
      offline: () => offline,
      land: (at: number, how: 'finish' | 'fail' | 'cut' | 'empty') =>
        Effect.gen(function* () {
          const job = out[at];
          if (job === undefined) return;
          out.splice(at, 1);
          if (how === 'finish' || how === 'empty')
            yield* Deferred.succeed(job.answer, {
              at: 0,
              total: sizeOf(job.id),
              etag: '"e"',
              bytes: how === 'finish' ? bodyOf(job.id) : new Uint8Array(0),
            });
          else
            yield* Deferred.fail(
              job.answer,
              cache.OfflineError.make({ code: how === 'fail' ? 'network' : 'invalid' }),
            );
          yield* settle;
        }),
      relaunch: Effect.gen(function* () {
        yield* Scope.close(scope, Exit.void);
        out.length = 0;
        scope = yield* Scope.make();
        offline = yield* build;
      }),
      close: Effect.suspend(() => Scope.close(scope, Exit.void)),
    };
  });

/** What a broken rule names beside its history: a path, the identities, or the two sides' values. */
type Detail =
  | string
  | ReadonlyArray<string>
  | Readonly<Record<string, ReadonlyArray<string> | number | boolean>>;

/** The fetches out, by identity, in the order they were asked. */
const outOf = (ids: Iterable<Identity>) => [...ids].map(keyOf);

const history = (cache: Cache, seed: number) =>
  Effect.gen(function* () {
    const random = seeded(seed);
    const current = yield* currentOf(cache);
    const port = portOf(false);
    port.ask({ _tag: 'launch' });
    const acts: Array<Act> = [];
    for (let index = 0; index < STEPS; index += 1) {
      const act = actOf(random);
      acts.push(act);
      const fail = (rule: string, detail: Detail) => {
        throw new Error(JSON.stringify({ rule, seed, acts, detail }));
      };
      const offline = current.offline();
      switch (act._tag) {
        case 'enqueue':
          port.ask({ _tag: 'enqueue', id: act.id });
          yield* offline.enqueue(act.id);
          break;
        case 'all':
          port.ask({ _tag: 'all' });
          yield* offline.downloadAll;
          break;
        case 'finish':
        case 'fail':
        case 'cut':
        case 'empty': {
          const job = current.out[act.at];
          if (job === undefined) break;
          const serial = [...port.out.entries()].find(([, id]) => keyOf(id) === keyOf(job.id))?.[0];
          if (serial === undefined) fail('the same fetches out', outOf(port.out.values()));
          port.land(serial ?? 0, act._tag);
          yield* current.land(act.at, act._tag);
          break;
        }
        case 'cancel':
          port.ask({ _tag: 'cancel' });
          yield* offline.cancel;
          break;
        case 'delete':
          port.ask({ _tag: 'delete' });
          yield* offline.deleteAll;
          break;
        case 'relaunch':
          port.relaunch(false);
          yield* current.relaunch;
          break;
      }
      yield* settle;
      const ours = outOf(port.out.values()).toSorted();
      const same = () =>
        JSON.stringify(ours) ===
        JSON.stringify(current.out.map((each) => keyOf(each.id)).toSorted());
      for (let round = 0; round < 400 && !same(); round += 1) yield* settle;
      const store = port.store();
      const saved = Object.values(store.saved)
        .map((each) => `${keyOf(each)}:${each.bytes}`)
        .toSorted();
      const theirs = [...current.entries.values()]
        .filter((entry) => entry.complete)
        .map((entry) => `${keyOf(entry)}:${entry.bytes}`)
        .toSorted();
      if (JSON.stringify(saved) !== JSON.stringify(theirs)) fail('saved', { saved, theirs });
      const asked = current.out.map((each) => keyOf(each.id)).toSorted();
      if (JSON.stringify(ours) !== JSON.stringify(asked)) fail('fetches out', { ours, asked });
      const counts = countsOf(store);
      const snapshot = yield* current.offline().snapshot;
      for (const field of [
        'saved',
        'printed',
        'bytes',
        'active',
        'queued',
        'failed',
        'paused',
        'storage',
        'indexing',
      ] as const)
        if (counts[field] !== snapshot[field])
          fail(field, { ours: counts[field], theirs: snapshot[field] });
      for (const [path, size] of port.disk) {
        const saved =
          store.saved[
            path
              .split('/')
              .at(-1)
              ?.replace(/\.mp3$/u, '') ?? ''
          ];
        if (saved === undefined || size !== sizeOf(saved) || pathOf(saved) !== path)
          fail('every file on the disk is a whole saved recording', path);
      }
    }
    yield* current.close;
    return acts;
  });

describe('the saved recordings, as the current app’s cache', () => {
  it('holds every generated history of saves, fetches, cancels, deletes and relaunches to the cache', async () => {
    const cache: Cache = await import('@manna/hymnal-app/offline/cache');
    const seen = new Set<string>();
    const seeds = Array.from({ length: HISTORIES }, (_, index) => index + 1);
    await Effect.runPromise(
      Effect.forEach(
        seeds,
        (seed) =>
          Effect.map(history(cache, seed), (acts) => {
            for (const act of acts) seen.add(act._tag);
          }),
        { discard: true },
      ).pipe(Effect.provideService(References.MinimumLogLevel, 'None')),
    );
    expect([...seen].toSorted()).toEqual([
      'all',
      'cancel',
      'cut',
      'delete',
      'empty',
      'enqueue',
      'fail',
      'finish',
      'relaunch',
    ]);
  });

  it('never fetches one identity twice at once nor publishes a part, as a cancelled fetch settles late and a launch dies after a body', () => {
    let resumed = 0;
    let waited = 0;
    for (let seed = 1; seed <= LATE; seed += 1) {
      const random = seeded(seed * 7919);
      const port = portOf(true);
      port.ask({ _tag: 'launch' });
      for (let index = 0; index < STEPS; index += 1) {
        const act = actOf(random);
        const roll = below(random, 6);
        if (roll === 0) port.settleAbort();
        if (act._tag === 'enqueue') port.ask({ _tag: 'enqueue', id: act.id });
        else if (act._tag === 'all') port.ask({ _tag: 'all' });
        else if (act._tag === 'cancel') port.ask({ _tag: 'cancel' });
        else if (act._tag === 'delete') port.ask({ _tag: 'delete' });
        else if (act._tag === 'relaunch') {
          const body = port.out.size > 0 && roll < 3;
          port.relaunch(body);
          if (body && Object.keys(port.store().resume).length > 0) resumed += 1;
        } else {
          const serial = [...port.out.keys()][act.at];
          if (serial !== undefined) port.land(serial, act._tag);
        }
        const store = port.store();
        if (store.running.some((run) => !run.started)) waited += 1;
        for (const [path, size] of port.disk) {
          expect(path.endsWith('.mp3')).toBe(true);
          const [number, offset] = (path.split('/').at(-1) ?? '')
            .replace(/\.mp3$/u, '')
            .split('_')
            .map(Number);
          expect(size).toBe(sizeOf({ number: number ?? 0, offset: offset ?? 0 }));
        }
        for (const saved of Object.values(store.saved))
          expect(port.disk.get(pathOf(saved))).toBe(saved.bytes);
      }
    }
    expect(resumed).toBeGreaterThan(0);
    expect(waited).toBeGreaterThan(0);
  });
});
