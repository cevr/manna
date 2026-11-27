/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, eslint/no-await-in-loop, effect/noThrowStatement, effect/noNewError, effect/noTestLifecycleHooks, effect/noNewPromise, effect/noKnownValueWidening -- the data module's saves run over Exact's `storage.fs` and the global `fetch`, here an in-memory disk and a stand-in answering each recording's address as the host would; the test awaits the module's background work as the host's event loop runs it, a turn at a time; the disk and the stand-in reject as the host's calls do, by throwing, and the real fetch is put back after each test. *

/**
 * The saved recordings as the data module runs them (`sources.ts`): Download
 * all saves every printed-key recording whole and renames each into place,
 * a refused or cut-off reply saves nothing and says so, the launch reads
 * the folders (a part left mid-download removed and its save resumed, the
 * host's leftovers removed), the backup op is asked where the app's module
 * has it, and the player plays a saved recording first, as the current
 * `localOver` finds it, streaming the same recording from the place when
 * the file will not play, and queues the save of what it plays, as
 * `savingOn` does.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import * as estimate from '@manna/hymnal-app/offline/estimate';
import * as identity from '@manna/hymnal-app/offline/identity';
import * as words from '@manna/hymnal-app/offline/words';

import type * as EstimateDecl from './decl/estimate';
import type * as IdentityDecl from './decl/identity';
import type * as WordsDecl from './decl/words';
import { RECORDINGS, holdsSaved, later } from '../../modules/web/index.js';
import { book } from '../hymns/book.testing.ts';
import { BUCKET, playerSources, recordingAt } from '../player/sources.ts';
import { type AppModule, type RecordingFiles, offlineSources } from './sources.ts';
import { ROOT, partOf, pathOf } from './store.ts';

/** The current modules the port reads, each held to the declaration Exact's type check reads. */
export const declared = {
  estimate: { estimateMegabytes: estimate.estimateMegabytes } satisfies typeof EstimateDecl,
  identity: {
    storageOf: identity.storageOf,
    storageFor: identity.storageFor,
    readStorages: identity.readStorages,
    stray: identity.stray,
    recordingStorage: identity.recordingStorage,
    identityKey: identity.identityKey,
  } satisfies typeof IdentityDecl,
  words: {
    RECORDINGS: words.RECORDINGS,
    PROGRESS_LABEL: words.PROGRESS_LABEL,
    progressText: words.progressText,
    sizeLabel: words.sizeLabel,
    sizeText: words.sizeText,
    busyOf: words.busyOf,
    activeLabel: words.activeLabel,
    activeText: words.activeText,
    INDEXING: words.INDEXING,
    PAUSED: words.PAUSED,
    failureOf: words.failureOf,
    estimateText: words.estimateText,
    DOWNLOAD_ALL: words.DOWNLOAD_ALL,
    CANCEL: words.CANCEL,
    DELETE: words.DELETE,
    CONFIRM_QUESTION: words.CONFIRM_QUESTION,
    CONFIRM: words.CONFIRM,
    KEEP: words.KEEP,
  } satisfies typeof WordsDecl,
};

const QUEUE = 256;

const diskOf = () => {
  const files = new Map<string, number>();
  const folders = new Set<string>();
  const parent = (path: string) => path.replace(/\/[^/]+$/u, '');
  const children = (path: string) =>
    [...new Set([...files.keys(), ...folders])]
      .filter((each) => parent(each) === path)
      .map((each) => each.slice(path.length + 1));
  /** A change waits its turn in the host's storage queue, which refuses one more past `QUEUE` waiting (Exact's `full`, LLP 1097). */
  let waiting = 0;
  const queued = async (work: () => void) => {
    if (waiting >= QUEUE) throw Object.assign(new Error('storage refused: full'), { code: 'full' });
    waiting += 1;
    await Promise.resolve();
    waiting -= 1;
    work();
  };
  const storage: RecordingFiles = {
    fs: {
      mkdir: async (path) => {
        for (let at = path; at.startsWith(ROOT); at = parent(at)) folders.add(at);
      },
      readdir: async (path) => {
        if (!folders.has(path)) throw new Error(`no folder ${path}`);
        return children(path);
      },
      stat: async (path) => {
        const size = files.get(path);
        if (size === undefined && !folders.has(path)) throw new Error(`no file ${path}`);
        return { size: size ?? 0, isDirectory: size === undefined };
      },
      rename: (from, to) =>
        queued(() => {
          const size = files.get(from);
          if (size === undefined) throw new Error(`no file ${from}`);
          files.delete(from);
          files.set(to, size);
        }),
      rm: (path) =>
        queued(() => {
          files.delete(path);
          folders.delete(path);
        }),
    },
  };
  const put = (path: string, size: number) => {
    void storage.fs.mkdir(parent(path));
    files.set(path, size);
  };
  /** Once no change has waited in the queue for 50 turns: the disk as the module left it. */
  const idle = async () => {
    for (let turn = 0, still = 0; turn < 20000 && still < 50; turn += 1) {
      still = waiting === 0 ? still + 1 : 0;
      await Promise.resolve();
    }
  };
  return { files, storage, put, idle };
};

/** How the stand-in answers one recording's address. */
type Reply = 'whole' | 'refused' | 'cut' | 'short' | 'html';

const SIZE = 3000;

/** The global `fetch`, answering each recording as `replyOf` says and counting the asks. */
const serve = (
  disk: ReturnType<typeof diskOf>,
  replyOf: (url: string) => Reply = () => 'whole',
) => {
  const asked: Array<string> = [];
  globalThis.fetch = (async (input: string, init: RequestInit & { exactBodyTo?: string }) => {
    const url = String(input);
    asked.push(url);
    const reply = replyOf(url);
    if (reply === 'cut') throw new Error('the body was cut off');
    const ok = reply !== 'refused';
    const type = reply === 'html' ? 'text/html' : 'audio/mpeg';
    const said = reply === 'short' ? SIZE + 1 : SIZE;
    if (ok && init.exactBodyTo !== undefined) disk.put(init.exactBodyTo, SIZE);
    return {
      ok,
      status: ok ? 200 : 503,
      headers: new Headers({ 'content-type': type, 'content-length': String(said) }),
      exactBodyTo:
        ok && init.exactBodyTo !== undefined ? { path: init.exactBodyTo, bytes: SIZE } : null,
    };
  }) as unknown as typeof fetch;
  return asked;
};

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

/** Turns of the event loop until the saves have settled. */
const settled = async (
  step: () => ReturnType<ReturnType<typeof offlineSources>['sources']['offlineStep']>,
) => {
  for (let turn = 0; turn < 20000; turn += 1) {
    const view = step();
    await Promise.resolve();
    if (!view.working && turn > 50) return step();
  }
  throw new Error('the saves never settled');
};

/** Two hymns' line timing, in the encoding the current timeline decodes, for the estimate. */
const timing: ReadonlyArray<readonly [number, string]> = [
  [1, '568181,3,4|1,18861,10227;1,10227,10228;1,10228,8522'],
  [2, '517241,4,4|1,22278,6212;1,6212,6202'],
];

const KEPT = { get: () => null };

/** A launch of the module over `disk`, with or without the app's backup op. */
const launch = (disk: ReturnType<typeof diskOf>, native?: AppModule) => {
  const saved = offlineSources(BUCKET, false, timing);
  const ask = (kind: string, number = 0) =>
    saved.sources.offlineStep([kind, number, 0], KEPT, disk.storage, native);
  return { saved, ask, view: () => ask('view') };
};

describe('the saved recordings, as the data module keeps them', () => {
  it('Download all saves every printed-key recording whole, asks the backup op, and leaves no part', async () => {
    const disk = diskOf();
    const asked = serve(disk);
    const backups: Array<Readonly<Record<string, string>>> = [];
    const native: AppModule = {
      available: true,
      later: async (request) => {
        backups.push(request);
        return {};
      },
    };
    const run = launch(disk, native);
    await settled(run.view);
    run.ask('all');
    const view = await settled(run.view);
    expect(view.printed).toBe(words.RECORDINGS);
    expect(view.progress).toBe(words.progressText({ printed: words.RECORDINGS }));
    expect(view.bytes).toBe(SIZE * words.RECORDINGS);
    expect(view.failure).toBe('');
    expect(backups).toEqual([{ op: 'backup.exclude', path: ROOT }, { op: 'recordings.saved' }]);
    expect(asked.length).toBe(words.RECORDINGS);
    expect(new Set(asked).size).toBe(words.RECORDINGS);
    await disk.idle();
    expect([...disk.files.keys()].filter((path) => path.endsWith('.part'))).toEqual([]);
    expect(disk.files.get(pathOf({ number: 1, offset: 0 }))).toBe(SIZE);
    expect(view.estimate).toBe(words.estimateText(estimate.estimateMegabytes(timing)));
  });

  it('goes on without the backup op where the app has no module for it', async () => {
    const disk = diskOf();
    serve(disk);
    const run = launch(disk);
    run.ask('all');
    const view = await settled(run.view);
    expect(view.printed).toBe(words.RECORDINGS);
  });

  it('on the web the app’s module marks nothing, as the current app’s backup marks nothing off iOS', async () => {
    expect(await later({ op: 'backup.exclude', path: ROOT })).toEqual({ excluded: false });
  });

  it('tells the app’s module recordings.saved once a launch, only once a file is saved', async () => {
    const heard = (asked: Array<string>): AppModule => ({
      available: true,
      later: async (request) => {
        asked.push(String(request['op']));
        return {};
      },
    });
    const none: Array<string> = [];
    const empty = diskOf();
    serve(empty, () => 'refused');
    const quiet = launch(empty, heard(none));
    quiet.ask('all');
    await settled(quiet.view);
    expect(none.filter((op) => op === 'recordings.saved')).toEqual([]);

    const saving: Array<string> = [];
    const disk = diskOf();
    serve(disk);
    const run = launch(disk, heard(saving));
    run.ask('all');
    await settled(run.view);
    expect(saving.filter((op) => op === 'recordings.saved')).toEqual(['recordings.saved']);

    const relaunched: Array<string> = [];
    const again = launch(disk, heard(relaunched));
    await settled(again.view);
    expect(relaunched).toEqual(['recordings.saved']);
  });

  it('on the web the page module holds a saved recording by an .mp3 in a folder of the store’s root, not by a part', async () => {
    const readdirOf =
      (tree: Readonly<Record<string, ReadonlyArray<string>>>) =>
      async (path: string): Promise<ReadonlyArray<string>> => {
        const names = tree[path];
        if (names === undefined) throw new Error(`no folder ${path}`);
        return names;
      };
    const folder = pathOf({ number: 1, offset: 0 }).replace(/\/[^/]+$/u, '');
    const name = pathOf({ number: 1, offset: 0 }).slice(folder.length + 1);
    const part = partOf({ number: 1, offset: 0 }).slice(folder.length + 1);
    const storage = folder.slice(ROOT.length + 1);
    expect(RECORDINGS).toBe(ROOT);
    expect(await holdsSaved(readdirOf({}))).toBe(false);
    expect(await holdsSaved(readdirOf({ [ROOT]: [storage], [folder]: [] }))).toBe(false);
    expect(await holdsSaved(readdirOf({ [ROOT]: [storage], [folder]: [part] }))).toBe(false);
    expect(await holdsSaved(readdirOf({ [ROOT]: ['gone', storage], [folder]: [name] }))).toBe(true);
    expect(await later({ op: 'recordings.saved' })).toEqual({ read: true });
  });

  it('saves nothing of a refused, cut-off, short or non-audio reply, says so, and Download all retries', async () => {
    const disk = diskOf();
    const bad: Readonly<Record<string, Reply>> = {
      [recordingAt(BUCKET, 2)]: 'refused',
      [recordingAt(BUCKET, 3)]: 'cut',
      [recordingAt(BUCKET, 4)]: 'short',
      [recordingAt(BUCKET, 5)]: 'html',
    };
    let failing = true;
    serve(disk, (url) => (failing ? (bad[url] ?? 'whole') : 'whole'));
    const run = launch(disk);
    run.ask('all');
    const failed = await settled(run.view);
    expect(failed.printed).toBe(words.RECORDINGS - 4);
    expect(failed.failure).toBe(words.failureOf({ storage: false }));
    await disk.idle();
    for (const number of [2, 3, 4, 5]) {
      expect(disk.files.has(pathOf({ number, offset: 0 }))).toBe(false);
      expect(disk.files.has(partOf({ number, offset: 0 }))).toBe(false);
    }
    failing = false;
    run.ask('all');
    const retried = await settled(run.view);
    expect(retried.printed).toBe(words.RECORDINGS);
    expect(retried.failure).toBe('');
  });

  it('reads the folders at launch: a whole file is saved, a part is removed and resumed, a leftover removed', async () => {
    const disk = diskOf();
    disk.put(pathOf({ number: 7, offset: 0 }), SIZE);
    disk.put(partOf({ number: 8, offset: 0 }), 10);
    disk.put(`${pathOf({ number: 9, offset: 0 })}.exact-staging`, 10);
    const asked = serve(disk);
    const run = launch(disk);
    const view = await settled(run.view);
    expect(view.printed).toBe(1);
    expect(view.paused).toBe(true);
    await disk.idle();
    expect(disk.files.has(partOf({ number: 8, offset: 0 }))).toBe(false);
    expect(disk.files.has(`${pathOf({ number: 9, offset: 0 })}.exact-staging`)).toBe(false);
    expect(asked).toEqual([]);
    expect(run.saved.offline.localOf({ number: 7, offset: 0 })).toBe(
      pathOf({ number: 7, offset: 0 }),
    );
    expect(run.saved.offline.localOf({ number: 8, offset: 0 })).toBe('');
  });

  it('Delete removes every saved file, and a cancel stops the saves it owns', async () => {
    const disk = diskOf();
    serve(disk);
    const run = launch(disk);
    run.ask('all');
    run.ask('cancel');
    const cancelled = await settled(run.view);
    expect(cancelled.printed).toBeLessThan(words.RECORDINGS);
    run.ask('delete');
    const deleted = await settled(run.view);
    expect(deleted.saved).toBe(0);
    await disk.idle();
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('Delete after every recording is saved removes every file, the host’s storage queue never full', async () => {
    const disk = diskOf();
    serve(disk);
    const run = launch(disk);
    run.ask('all');
    expect((await settled(run.view)).printed).toBe(words.RECORDINGS);
    await disk.idle();
    expect(disk.files.size).toBeGreaterThan(QUEUE);
    run.ask('delete');
    expect((await settled(run.view)).saved).toBe(0);
    await disk.idle();
    expect([...disk.files.keys()]).toEqual([]);
  });
});

describe('the player over the saved recordings, as the current localOver and savingOn', () => {
  const playerOver = (disk: ReturnType<typeof diskOf>) => {
    const saved = offlineSources(BUCKET, false, timing);
    const player = playerSources(book, timing, BUCKET, saved.offline);
    const step = (kind: string, id: number, value: number) =>
      player.playerStep([kind, id, 0, value, ''], KEPT, disk.storage);
    const view = () => saved.sources.offlineStep(['view', 0, 0], KEPT, disk.storage);
    return { step, view };
  };

  it('plays a saved recording from its file, and streams the same one from the place when the file will not play', async () => {
    const disk = diskOf();
    disk.put(pathOf({ number: 1, offset: 0 }), SIZE);
    serve(disk);
    const run = playerOver(disk);
    await settled(run.view);
    const played = await run.step('play', 0, 1);
    expect(played.src).toBe(pathOf({ number: 1, offset: 0 }));
    await run.step('loaded', played.load, 120);
    await run.step('time', played.load, 30);
    const failed = await run.step('failed', played.load, 0);
    expect(failed.src).toBe(recordingAt(BUCKET, 1));
    expect(failed.from).toBe(30);
    const view = await settled(run.view);
    expect(view.printed).toBe(1);
    await disk.idle();
    expect(disk.files.get(pathOf({ number: 1, offset: 0 }))).toBe(SIZE);
  });

  it('queues the save of a recording it streams, once', async () => {
    const disk = diskOf();
    const asked = serve(disk);
    const run = playerOver(disk);
    await settled(run.view);
    const played = await run.step('play', 0, 2);
    expect(played.src).toBe(recordingAt(BUCKET, 2));
    await run.step('pause', 0, 0);
    await run.step('play', 0, 2);
    const view = await settled(run.view);
    expect(view.printed).toBe(1);
    expect(asked).toEqual([recordingAt(BUCKET, 2)]);
  });

  it('offline, a recording not saved fails as with no connection, and a saved one plays', async () => {
    const disk = diskOf();
    disk.put(pathOf({ number: 1, offset: 0 }), SIZE);
    serve(disk);
    const run = playerOver(disk);
    await settled(run.view);
    await run.step('online', 0, 0);
    const unsaved = await run.step('play', 0, 2);
    expect(unsaved.phase).toBe('failed');
    const saved = await run.step('play', 0, 1);
    expect(saved.src).toBe(pathOf({ number: 1, offset: 0 }));
  });
});
