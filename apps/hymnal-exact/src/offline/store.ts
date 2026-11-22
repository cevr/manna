/* oxlint-disable effect/noNullish, effect/noTernary, effect/noKnownValueWidening -- Exact's data module cannot import effect (docs/exact.md), so no Option or Match: what is absent is undefined, and each rule branches plainly. */

/**
 * The saved recordings as one pure step, the current app's cache
 * (`apps/hymnal/src/offline/cache.ts`, which `store.model.test.ts` runs
 * beside it): `stepStore(store, input)` answers the next store and the
 * commands the data module carries out on its files and the network.
 *
 * A recording is kept under the current app's identity, the hymn and the
 * sounding offset of its key (`identityKey`), in the storage of the set it
 * plays from (`storageFor`), under `app:/data/recordings/`, never the cache.
 * It is published only whole: its body is fetched into a part file
 * (`fetch(url, {exactBodyTo})`, which writes the file only once the body is
 * complete), and one rename makes it the recording. One queue owns the
 * saves, two at a time, in the order they were asked, as the current
 * cache's two workers take its queue; an identity saved or queued is not
 * queued again, and a fetch of an identity let go (a cancel, a delete) is
 * waited out before another of it starts, so no identity is ever fetched
 * twice at once.
 *
 * A launch lists the files (`launch`, then `indexed`): a whole recording is
 * saved, a part file is removed and its save left to resume (the current
 * cache resumes a partial recording's range; a part here has no range to
 * go on from, so its save starts over), and a file the host left behind
 * mid-download is removed. A stray (a hymn's file in a storage it no longer
 * plays from) is never listed, and Delete frees it, as it frees every
 * storage no hymn reads. Asks before the list is read wait for it, and
 * Download all waits for the folders to be made and kept out of the backup
 * (`protect`), each dropped when a cancel came first.
 */

import * as identity from '@manna/hymnal-app/offline/identity';
import type { Counts as Lines } from '@manna/hymnal-app/offline/words';
import { soundingOffset } from '@manna/hymnal-app/remote';

/** A saved recording's identity: the hymn and its key, in semitones from the printed one. */
export interface Identity {
  readonly number: number;
  readonly offset: number;
}

/** A recording saved whole: its identity and its size in bytes. */
export interface Saved extends Identity {
  readonly bytes: number;
}

/** A save asked: numbered, with the cancel's epoch it was asked in. */
export interface Job {
  readonly serial: number;
  readonly id: Identity;
  readonly epoch: number;
}

/** A save a worker took: its fetch is out, or waits on a fetch of its identity let go. */
interface Running extends Job {
  readonly started: boolean;
}

/** An ask that waits on the list or the folders. */
type Waiting =
  | { readonly _tag: 'add'; readonly id: Identity; readonly epoch: number }
  | { readonly _tag: 'all'; readonly epoch: number };

export type Code = 'network' | 'invalid' | 'storage';

export interface Store {
  readonly saved: Readonly<Record<string, Saved>>;
  /** The saves owned, by identity: queued or running. */
  readonly jobs: Readonly<Record<string, Job>>;
  /** Every save in the order asked, a cancelled one among them until a worker passes it. */
  readonly queue: ReadonlyArray<Job>;
  readonly running: ReadonlyArray<Running>;
  /** Fetches let go that have not settled, by serial, with their identity's key. */
  readonly dying: ReadonlyArray<{ readonly serial: number; readonly key: string }>;
  readonly failed: Readonly<Record<string, Identity>>;
  readonly resume: Readonly<Record<string, Identity>>;
  /** Identities asked or changed since the launch: the list leaves them as they are. */
  readonly touched: ReadonlyArray<string>;
  readonly waiting: ReadonlyArray<Waiting>;
  readonly epoch: number;
  /** The page shown last, and its turn: a cancel or another page drops its save. */
  readonly viewing: number;
  readonly shown: { readonly owner: number; readonly number: number } | undefined;
  readonly serials: number;
  readonly paused: boolean;
  readonly storage: boolean;
  readonly indexing: boolean;
  /** Download all waits for the folders: the epoch it was asked in. */
  readonly protecting: number | undefined;
}

export type Input =
  | { readonly _tag: 'launch' }
  | { readonly _tag: 'indexed'; readonly files: ReadonlyArray<File> }
  | { readonly _tag: 'enqueue'; readonly id: Identity }
  | { readonly _tag: 'shown'; readonly number: number }
  | { readonly _tag: 'open'; readonly number: number }
  | { readonly _tag: 'all' }
  | { readonly _tag: 'protected'; readonly ok: boolean }
  | { readonly _tag: 'cancel' }
  | { readonly _tag: 'delete' }
  | {
      readonly _tag: 'fetched';
      readonly serial: number;
      readonly id: Identity;
      readonly bytes: number;
    }
  | {
      readonly _tag: 'fetchFailed';
      readonly serial: number;
      readonly id: Identity;
      readonly code: Code;
    }
  | { readonly _tag: 'invalidate'; readonly id: Identity };

/** A file the launch found: its storage, its name and its size. */
export interface File {
  readonly storage: string;
  readonly name: string;
  readonly size: number;
}

export type Command =
  | { readonly _tag: 'list' }
  | { readonly _tag: 'fetch'; readonly serial: number; readonly id: Identity }
  | { readonly _tag: 'abort'; readonly serial: number }
  | { readonly _tag: 'publish'; readonly id: Identity }
  | { readonly _tag: 'drop'; readonly id: Identity }
  | { readonly _tag: 'remove'; readonly id: Identity }
  | { readonly _tag: 'removeFile'; readonly storage: string; readonly name: string }
  | { readonly _tag: 'removeOld' }
  | { readonly _tag: 'protect' };

/** How many saves run at once: the current cache's two workers. */
export const WORKERS = 2;
/** How many hymns have a printed-key recording to save. */
export const HYMNS = 695;
/** Where the saved recordings live. */
export const ROOT = 'app:/data/recordings';

export const keyOf = (id: Identity): string => identity.identityKey(id);
/** The folder a hymn's saves live in. */
export const folderOf = (id: Identity): string => `${ROOT}/${identity.storageFor(id.number)}`;
/** Where `id`'s whole recording is. */
export const pathOf = (id: Identity): string => `${folderOf(id)}/${keyOf(id)}.mp3`;
/** Where `id`'s body is fetched to before its rename. */
export const partOf = (id: Identity): string => `${folderOf(id)}/${keyOf(id)}.part`;
/** The folders the saves are kept in. */
export const FOLDERS: ReadonlyArray<string> = identity.readStorages.map(
  (storage) => `${ROOT}/${storage}`,
);

/** `id` as the current cache keeps it: the key's sounding offset; none when out of range. */
export const normal = (id: Identity): Identity | undefined => {
  if (!Number.isInteger(id.number) || id.number < 1 || id.number > HYMNS) return undefined;
  if (!Number.isInteger(id.offset)) return undefined;
  return { number: id.number, offset: soundingOffset(id.offset) };
};

export const empty: Store = {
  saved: {},
  jobs: {},
  queue: [],
  running: [],
  dying: [],
  failed: {},
  resume: {},
  touched: [],
  waiting: [],
  epoch: 0,
  viewing: 0,
  shown: undefined,
  serials: 0,
  paused: false,
  storage: false,
  indexing: true,
  protecting: undefined,
};

/** What a file the launch found is: a whole recording, a part, a stray or the host's leftover. */
export const classify = (
  file: File,
):
  | { readonly _tag: 'whole'; readonly saved: Saved }
  | { readonly _tag: 'part'; readonly id: Identity }
  | { readonly _tag: 'stray' }
  | { readonly _tag: 'junk' } => {
  if (!identity.recordingStorage(file.storage) || !identity.readStorages.includes(file.storage))
    return { _tag: 'stray' };
  if (identity.stray(file.storage, file.name)) return { _tag: 'stray' };
  const found = /^(\d+)_(0|-?[1-6])\.(mp3|part)$/u.exec(file.name);
  if (found === null) return { _tag: 'junk' };
  const id = normal({ number: Number(found[1]), offset: Number(found[2]) });
  if (id === undefined || keyOf(id) !== `${found[1]}_${found[2]}`) return { _tag: 'junk' };
  if (found[3] === 'part') return { _tag: 'part', id };
  return { _tag: 'whole', saved: { ...id, bytes: file.size } };
};

type Step = { readonly store: Store; readonly commands: ReadonlyArray<Command> };

const without = <A>(record: Readonly<Record<string, A>>, key: string): Record<string, A> => {
  const { [key]: _gone, ...rest } = record;
  return rest;
};

const owns = (store: Store, job: Job): boolean =>
  job.epoch === store.epoch && store.jobs[keyOf(job.id)]?.serial === job.serial;

const touch = (store: Store, key: string): Store =>
  store.touched.includes(key) ? store : { ...store, touched: [...store.touched, key] };

/** Saves asked in order, as the current cache's `add`: none for an identity saved or queued. */
const addAll = (store: Store, inputs: Iterable<Identity>): Store => {
  const jobs: Record<string, Job> = { ...store.jobs };
  const failed: Record<string, Identity> = { ...store.failed };
  const queue = [...store.queue];
  const touched = new Set(store.touched);
  let { serials } = store;
  for (const input of inputs) {
    const id = normal(input);
    if (id === undefined) continue;
    touched.add(keyOf(id));
    const key = keyOf(id);
    if (store.saved[key] !== undefined || jobs[key] !== undefined) continue;
    serials += 1;
    const job: Job = { serial: serials, id, epoch: store.epoch };
    jobs[key] = job;
    delete failed[key];
    queue.push(job);
  }
  return { ...store, serials, jobs, failed, queue, touched: [...touched] };
};

const add = (store: Store, input: Identity): Store => addAll(store, [input]);

/** Every save let go, as the current cache's cancel: each owned is left to resume, the fetches out aborted. */
const cancelOwned = (store: Store, commands: Array<Command>): Store => {
  const resume: Record<string, Identity> = { ...store.resume };
  for (const [key, job] of Object.entries(store.jobs)) resume[key] = job.id;
  const dying = [...store.dying];
  for (const run of store.running)
    if (run.started) {
      dying.push({ serial: run.serial, key: keyOf(run.id) });
      commands.push({ _tag: 'abort', serial: run.serial });
    }
  return {
    ...store,
    viewing: store.viewing + 1,
    shown: undefined,
    epoch: store.epoch + 1,
    paused: true,
    resume,
    jobs: {},
    running: [],
    dying,
    waiting: [],
  };
};

/** The workers take the queue in order: a save let go is passed, one already saved ends at once. */
const pump = (store: Store, commands: Array<Command>): Store => {
  const running = [...store.running];
  let jobs = store.jobs;
  let at = 0;
  while (running.length < WORKERS && at < store.queue.length) {
    const job = store.queue[at];
    at += 1;
    if (job === undefined || !owns({ ...store, jobs }, job)) continue;
    const key = keyOf(job.id);
    if (store.saved[key] !== undefined) {
      jobs = without(jobs, key);
      continue;
    }
    const started = !store.dying.some((each) => each.key === key);
    running.push({ ...job, started });
    if (started) commands.push({ _tag: 'fetch', serial: job.serial, id: job.id });
  }
  if (at === 0) return store;
  return { ...store, jobs, running, queue: store.queue.slice(at) };
};

/** A fetch let go has settled: its part is dropped, and a save of its identity that waited on it starts. */
const settled = (store: Store, serial: number, commands: Array<Command>): Store => {
  const gone = store.dying.find((each) => each.serial === serial);
  if (gone === undefined) return store;
  const dying = store.dying.filter((each) => each.serial !== serial);
  const running = store.running.map((run) => {
    if (run.started || keyOf(run.id) !== gone.key || dying.some((each) => each.key === gone.key))
      return run;
    commands.push({ _tag: 'fetch', serial: run.serial, id: run.id });
    return { ...run, started: true };
  });
  return { ...store, dying, running };
};

/**
 * The asks that waited on the list, once it is read, each dropped when a
 * cancel came after it: a save is queued, Download all makes the folders
 * first (one at a time; another asked meanwhile adds nothing to it).
 */
const flush = (store: Store, commands: Array<Command>): Store => {
  if (store.indexing) return store;
  let next: Store = { ...store, waiting: [] };
  for (const ask of store.waiting) {
    if (ask.epoch !== next.epoch) continue;
    if (ask._tag === 'add') next = add(next, ask.id);
    else if (next.protecting === undefined) {
      next = { ...next, protecting: ask.epoch };
      commands.push({ _tag: 'protect' });
    }
  }
  return next;
};

/** Download all, the folders kept: the saves to resume and those that failed first, then every printed key from the first hymn. */
const downloadAll = (store: Store): Store =>
  addAll({ ...store, storage: false, paused: false, resume: {} }, [
    ...Object.values(store.resume),
    ...Object.values(store.failed),
    ...Array.from({ length: HYMNS }, (_, at) => ({ number: at + 1, offset: 0 })),
  ]);

/** The launch's list read: whole recordings saved, parts removed and left to resume, the host's leftovers removed. */
const indexed = (store: Store, files: ReadonlyArray<File>, commands: Array<Command>): Store => {
  let next: Store = store;
  for (const file of files) {
    const kind = classify(file);
    if (kind._tag === 'stray') continue;
    if (kind._tag === 'junk') {
      commands.push({ _tag: 'removeFile', storage: file.storage, name: file.name });
      continue;
    }
    const id = kind._tag === 'whole' ? kind.saved : kind.id;
    const key = keyOf(id);
    if (next.touched.includes(key)) continue;
    if (kind._tag === 'part') {
      commands.push({ _tag: 'drop', id });
      if (next.saved[key] === undefined)
        next = { ...next, resume: { ...next.resume, [key]: id }, paused: true };
      continue;
    }
    if (kind.saved.bytes <= 0) {
      commands.push({ _tag: 'remove', id });
      next = { ...next, failed: { ...next.failed, [key]: id } };
      continue;
    }
    next = {
      ...next,
      saved: { ...next.saved, [key]: kind.saved },
      resume: without(next.resume, key),
    };
  }
  return { ...next, indexing: false };
};

/** A running save's answer: its job, when one owned it. */
const finished = (store: Store, serial: number) => {
  const run = store.running.find((each) => each.serial === serial && each.started);
  if (run === undefined) return undefined;
  const key = keyOf(run.id);
  return {
    run,
    key,
    owned: owns(store, run),
    store: {
      ...store,
      running: store.running.filter((each) => each.serial !== serial),
      jobs: owns(store, run) ? without(store.jobs, key) : store.jobs,
    },
  };
};

/** Every save and saved file removed, as the current cache's Delete: a cancel first, then each file and every storage no hymn reads. */
const deleteAll = (store: Store, commands: Array<Command>): Store => {
  const cancelled = cancelOwned(store, commands);
  for (const saved of Object.values(cancelled.saved)) commands.push({ _tag: 'remove', id: saved });
  commands.push({ _tag: 'removeOld' });
  return {
    ...cancelled,
    touched: [...new Set([...cancelled.touched, ...Object.keys(cancelled.saved)])],
    saved: {},
    failed: {},
    resume: {},
    storage: false,
    paused: false,
  };
};

/** A save asked, or held until the launch's list is read, as the current cache's `enqueue` waits for its index. */
const asked = (store: Store, id: Identity): Store =>
  store.indexing
    ? { ...store, waiting: [...store.waiting, { _tag: 'add', id, epoch: store.epoch }] }
    : add(store, id);

/** A fetch's body written whole to its part: the recording published, when a save owns it. */
const fetched = (
  store: Store,
  input: Extract<Input, { readonly _tag: 'fetched' }>,
  commands: Array<Command>,
): Store => {
  const done = finished(store, input.serial);
  if (done === undefined) {
    commands.push(...dropOf(store, input.id));
    return settled(store, input.serial, commands);
  }
  if (!done.owned) {
    commands.push({ _tag: 'drop', id: done.run.id });
    return done.store;
  }
  if (!(input.bytes > 0)) {
    commands.push({ _tag: 'drop', id: done.run.id });
    return { ...done.store, failed: { ...done.store.failed, [done.key]: done.run.id } };
  }
  commands.push({ _tag: 'publish', id: done.run.id });
  return {
    ...done.store,
    storage: false,
    saved: { ...done.store.saved, [done.key]: { ...done.run.id, bytes: input.bytes } },
    failed: without(done.store.failed, done.key),
    resume: without(done.store.resume, done.key),
  };
};

/** A fetch failed or was cut off: nothing published, its save failed (storage stops them all). */
const fetchFailed = (
  store: Store,
  input: Extract<Input, { readonly _tag: 'fetchFailed' }>,
  commands: Array<Command>,
): Store => {
  const done = finished(store, input.serial);
  if (done === undefined) {
    commands.push(...dropOf(store, input.id));
    return settled(store, input.serial, commands);
  }
  commands.push({ _tag: 'drop', id: done.run.id });
  if (!done.owned) return done.store;
  const failed = { ...done.store, failed: { ...done.store.failed, [done.key]: done.run.id } };
  if (input.code !== 'storage') return failed;
  return { ...cancelOwned(failed, commands), storage: true };
};

/** A saved recording that would not play, as the current cache's `invalidate`: removed, and failed. */
const invalidated = (store: Store, input: Identity, commands: Array<Command>): Store => {
  const id = normal(input);
  if (id === undefined) return store;
  const key = keyOf(id);
  commands.push({ _tag: 'remove', id });
  return {
    ...touch(store, key),
    saved: without(store.saved, key),
    failed: { ...store.failed, [key]: id },
  };
};

const next = (store: Store, input: Input, commands: Array<Command>): Store => {
  switch (input._tag) {
    case 'launch':
      commands.push({ _tag: 'list' });
      return empty;
    case 'indexed':
      return flush(indexed(store, input.files, commands), commands);
    case 'enqueue':
      return asked(store, input.id);
    case 'shown':
      return {
        ...store,
        viewing: store.viewing + 1,
        shown: { owner: store.viewing + 1, number: input.number },
      };
    case 'open': {
      const { shown } = store;
      if (shown === undefined || shown.number !== input.number || shown.owner !== store.viewing)
        return store;
      return asked({ ...store, shown: undefined }, { number: input.number, offset: 0 });
    }
    case 'all':
      return flush(
        { ...store, waiting: [...store.waiting, { _tag: 'all', epoch: store.epoch }] },
        commands,
      );
    case 'protected': {
      const epoch = store.protecting;
      if (epoch === undefined) return store;
      const freed = { ...store, protecting: undefined };
      if (!input.ok) return { ...cancelOwned(freed, commands), storage: true };
      return epoch === freed.epoch ? downloadAll(freed) : freed;
    }
    case 'cancel':
      return cancelOwned(store, commands);
    case 'delete':
      return deleteAll(store, commands);
    case 'fetched':
      return fetched(store, input, commands);
    case 'fetchFailed':
      return fetchFailed(store, input, commands);
    case 'invalidate':
      return invalidated(store, input.id, commands);
    default:
      return store;
  }
};

/** A fetch no save owns settled: its part is dropped, unless a fetch of its identity is out now and owns that part. */
const dropOf = (store: Store, id: Identity): ReadonlyArray<Command> =>
  store.running.some((run) => run.started && keyOf(run.id) === keyOf(id))
    ? []
    : [{ _tag: 'drop', id }];

/** The store after `input`, the workers given what they can take, and the commands it gives. */
export const stepStore = (store: Store, input: Input): Step => {
  const commands: Array<Command> = [];
  const moved = pump(next(store, input, commands), commands);
  return { store: moved, commands };
};

/** What Downloads reads of the store, as the current cache's snapshot: the counts its lines read, and what it shows beside them. */
export type Counts = Lines &
  Readonly<Record<'failed', number> & Record<'paused' | 'indexing', boolean>>;

/** The bytes the parts hold: none counted, as a save fetches its body whole and the host writes it only once complete. */
const WHOLE = 0;

export const countsOf = (store: Store): Counts => {
  const saved = Object.values(store.saved);
  const owned = Object.keys(store.jobs).length;
  const active = store.running.filter((run) => owns(store, run)).length;
  return {
    saved: saved.length,
    printed: saved.filter((each) => each.offset === 0).length,
    bytes: saved.reduce((sum, each) => sum + each.bytes, 0),
    active,
    queued: owned - active,
    partialBytes: WHOLE,
    failed: Object.keys(store.failed).length,
    paused: store.paused,
    storage: store.storage,
    indexing: store.indexing,
  };
};

/** Where a play of `id` sounds from: its whole saved recording, or none to stream it. */
export const localOf = (store: Store, id: Identity): string | undefined => {
  const normalized = normal(id);
  if (normalized === undefined) return undefined;
  return store.saved[keyOf(normalized)] === undefined ? undefined : pathOf(normalized);
};

/** The size `id`'s saved recording was written at; none when it is not saved. */
export const bytesOf = (store: Store, id: Identity): number | undefined => {
  const normalized = normal(id);
  return normalized === undefined ? undefined : store.saved[keyOf(normalized)]?.bytes;
};
