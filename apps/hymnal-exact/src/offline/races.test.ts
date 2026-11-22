/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, eslint/no-await-in-loop, effect/noThrowStatement, effect/noNewError, effect/noTestLifecycleHooks, effect/noNewPromise -- the data module's saves and plays run over Exact's `storage.fs` and the global `fetch`, here a host whose list and renames the test answers when it chooses, as a slow host does; each answer is awaited a turn at a time, the stand-ins reject by throwing as the host's calls do, and the real fetch is put back after each test. */

/**
 * The saved recordings while the host's calls are still out, as the
 * verifier's probe (vb-131 `offline-races.ts`) holds them: the launch's
 * list and a save's rename each answered later, at a step the generated
 * history picks.
 *
 * - Delete while the list is out removes every recording the list then
 *   finds, as the current Delete reads the disk beside its entries; a new
 *   launch over the same disk finds none.
 * - A recording is offered to the player, and counted saved, only once the
 *   host has answered its rename: never a path the disk does not hold; a
 *   rename refused leaves it failed with no part, a Delete before the
 *   rename lands removes it, and once every call is answered the store's
 *   saved recordings are the disk's whole files.
 * - A Play before the list is read, offline, plays a saved hymn from its
 *   file and tells an unsaved one it needs a connection; the device's event
 *   asked while its file is looked up steps after it, as asked.
 */

import { afterEach, describe, expect, it } from 'bun:test';

import { book } from '../hymns/book.ts';
import { BUCKET, playerSources } from '../player/sources.ts';
import { below, pick, seeded } from '../test/random.ts';
import { type RecordingFiles, offlineSources } from './sources.ts';
import { type Identity, ROOT, partOf, pathOf } from './store.ts';

const SIZE = 3000;
const KEPT = { get: () => null };
const NUMBERS = [1, 2, 3, 100, 260];
const OFFSETS = [0, 2];

/** A host whose list of the recordings' root, and whose renames, wait for the test's answer when held. */
const hostOf = () => {
  const files = new Map<string, number>();
  const lists: Array<() => void> = [];
  const renames: Array<(ok: boolean) => void> = [];
  const hold = { list: false, rename: false };
  const under = (path: string) =>
    [...files.keys()]
      .filter((each) => each.startsWith(`${path}/`))
      .map((each) => each.slice(path.length + 1).split('/')[0] ?? '');
  const storage: RecordingFiles = {
    fs: {
      mkdir: async () => undefined,
      readdir: async (path) => {
        if (path === ROOT && hold.list) await new Promise<void>((resolve) => lists.push(resolve));
        return [...new Set(under(path))];
      },
      stat: async (path) => {
        const size = files.get(path);
        if (size !== undefined) return { size, isDirectory: false };
        if (under(path).length > 0) return { size: 0, isDirectory: true };
        throw new Error(`no file ${path}`);
      },
      rename: async (from, to) => {
        if (hold.rename) {
          const ok = await new Promise<boolean>((resolve) => renames.push(resolve));
          if (!ok) throw new Error(`rename refused ${from}`);
        }
        const size = files.get(from);
        if (size === undefined) throw new Error(`no file ${from}`);
        files.delete(from);
        files.set(to, size);
      },
      rm: async (path) => {
        files.delete(path);
      },
    },
  };
  return { files, storage, lists, renames, hold };
};

type Host = ReturnType<typeof hostOf>;

/** The global `fetch`, answering every recording whole into its part, or failing every one while offline. */
const serve = (host: Host, online: () => boolean) => {
  globalThis.fetch = (async (_input: string, init: RequestInit & { exactBodyTo?: string }) => {
    if (!online()) throw new Error('offline');
    if (init.exactBodyTo !== undefined) host.files.set(init.exactBodyTo, SIZE);
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg', 'content-length': String(SIZE) }),
      exactBodyTo: init.exactBodyTo === undefined ? null : { path: init.exactBodyTo, bytes: SIZE },
    };
  }) as unknown as typeof fetch;
};

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

/** A launch of the store and the player over `host`, as the data module runs them. */
const launch = (host: Host) => {
  const saved = offlineSources(BUCKET, false, []);
  const player = playerSources(book, [], BUCKET, saved.offline);
  const ask = (kind: string) => saved.sources.offlineStep([kind, 0, 0], KEPT, host.storage);
  const playerStep = (kind: string, value: number) =>
    player.playerStep([kind, 0, 0, value, ''], KEPT, host.storage);
  const event = (kind: string, load: number) =>
    player.playerStep([kind, load, 0, 0, ''], KEPT, host.storage);
  return { saved, ask, view: () => ask('view'), playerStep, event };
};

/** A few turns of the event loop: the module's answered calls run on. */
const turns = async (count = 60) => {
  for (let turn = 0; turn < count; turn += 1) await Promise.resolve();
};

const whole = (host: Host) =>
  [...host.files.keys()].filter((path) => path.endsWith('.mp3')).toSorted();

describe('Delete while the launch’s list is out', () => {
  it('removes every recording the list finds, and a new launch over the disk finds none', async () => {
    const random = seeded(31);
    for (let index = 0; index < 40; index += 1) {
      const host = hostOf();
      serve(host, () => true);
      const ids: Array<Identity> = [];
      for (let count = 1 + below(random, 4); count > 0; count -= 1)
        ids.push({ number: pick(random, NUMBERS), offset: pick(random, OFFSETS) });
      for (const id of ids) host.files.set(random() < 0.8 ? pathOf(id) : partOf(id), SIZE);
      host.hold.list = true;
      const run = launch(host);
      expect(run.view().indexing).toBe(true);
      if (random() < 0.5) await run.playerStep('play', ids[0]?.number ?? 1);
      run.ask('delete');
      host.hold.list = false;
      for (const release of host.lists.splice(0)) release();
      await turns();
      expect({ index, saved: run.view().saved, files: [...host.files.keys()] }).toEqual({
        index,
        saved: 0,
        files: [],
      });
      const again = launch(host);
      again.view();
      await turns();
      expect(again.view().saved).toBe(0);
    }
  });
});

/** One act of a save's history while its rename is the host's. */
type Act =
  | { readonly _tag: 'enqueue'; readonly id: Identity }
  | { readonly _tag: 'rename'; readonly ok: boolean }
  | { readonly _tag: 'cancel' }
  | { readonly _tag: 'delete' };

const actOf = (random: () => number): Act =>
  pick<() => Act>(random, [
    () => ({
      _tag: 'enqueue',
      id: { number: pick(random, NUMBERS), offset: pick(random, OFFSETS) },
    }),
    () => ({
      _tag: 'enqueue',
      id: { number: pick(random, NUMBERS), offset: pick(random, OFFSETS) },
    }),
    () => ({ _tag: 'rename', ok: true }),
    () => ({ _tag: 'rename', ok: true }),
    () => ({ _tag: 'rename', ok: false }),
    () => ({ _tag: 'cancel' }),
    () => ({ _tag: 'delete' }),
  ])();

/** One act taken: a save asked, the oldest rename answered, a cancel or a Delete. */
const take = (run: ReturnType<typeof launch>, host: Host, act: Act, seen: Set<string>) => {
  if (act._tag === 'enqueue') return run.saved.offline.enqueue(act.id);
  if (act._tag !== 'rename') return run.ask(act._tag);
  const release = host.renames.shift();
  if (release === undefined) return undefined;
  release(act.ok);
  seen.add(act.ok ? 'a rename done' : 'a rename refused');
  return undefined;
};

/** The paths the store offers the player, over every identity the histories ask. */
const offeredBy = (run: ReturnType<typeof launch>) =>
  NUMBERS.flatMap((number) =>
    OFFSETS.map((offset) => run.saved.offline.localOf({ number, offset })),
  )
    .filter((path) => path !== '')
    .toSorted();

describe('a save’s rename the host answers later', () => {
  it('offers a recording, and counts it saved, only once the host has renamed it into place', async () => {
    const random = seeded(47);
    const seen = new Set<string>();
    for (let history = 0; history < 30; history += 1) {
      const host = hostOf();
      serve(host, () => true);
      const run = launch(host);
      run.view();
      await turns();
      host.hold.rename = true;
      const acts: Array<Act> = [];
      for (let index = 0; index < 12; index += 1) {
        const act = actOf(random);
        acts.push(act);
        take(run, host, act, seen);
        await turns();
        const view = run.view();
        if (host.renames.length > 0) seen.add('a rename out');
        const offered = offeredBy(run);
        expect({ acts, offered, onDisk: offered.filter((path) => host.files.has(path)) }).toEqual({
          acts,
          offered,
          onDisk: offered,
        });
        expect({ acts, saved: view.saved }).toEqual({ acts, saved: offered.length });
        if (host.renames.length > 0)
          expect({ acts, working: view.working }).toEqual({ acts, working: true });
      }
      host.hold.rename = false;
      for (let left = host.renames.shift(); left !== undefined; left = host.renames.shift())
        left(true);
      await turns(200);
      expect({ acts, offered: offeredBy(run) }).toEqual({ acts, offered: whole(host) });
      expect({
        acts,
        parts: [...host.files.keys()].filter((path) => path.endsWith('.part')),
      }).toEqual({
        acts,
        parts: [],
      });
    }
    expect([...seen].toSorted()).toEqual(['a rename done', 'a rename out', 'a rename refused']);
  });
});

describe('a Play before the launch’s list is read', () => {
  it('offline, plays a saved hymn from its file, and tells an unsaved one it needs a connection', async () => {
    for (const number of NUMBERS) {
      const host = hostOf();
      serve(host, () => false);
      host.files.set(pathOf({ number, offset: 0 }), SIZE);
      host.hold.list = true;
      const run = launch(host);
      expect(run.view().indexing).toBe(true);
      await run.playerStep('online', 0);
      const [played, playing] = await Promise.all([
        run.playerStep('play', number),
        run.event('playing', 1),
      ]);
      expect({ number, phase: played.phase, src: played.src }).toEqual({
        number,
        phase: 'loading',
        src: pathOf({ number, offset: 0 }),
      });
      expect({ number, after: playing.phase }).toEqual({ number, after: 'playing' });
      const other = NUMBERS.find((each) => each !== number) ?? 1;
      const missing = await run.playerStep('play', other);
      expect({ other, phase: missing.phase }).toEqual({ other, phase: 'failed' });
      host.hold.list = false;
      for (const release of host.lists.splice(0)) release();
      await turns();
      expect(run.view().saved).toBe(1);
    }
  });
});
