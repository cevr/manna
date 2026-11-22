/* oxlint-disable effect/noNullish, effect/noNewPromise, effect/noTernary, effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch, effect/noKnownValueWidening, eslint/no-await-in-loop -- Exact's data module cannot import effect (docs/exact.md): the store's commands are carried out on the host's `storage.fs` and `fetch` (its `exactBodyTo` outside the DOM's RequestInit), each started and not awaited, as the module's background work, and a rejected call is the store's answer, not a defect. */

/**
 * The saved recordings as the data module runs them: one store (`store.ts`)
 * per launch, its commands carried out on the app's files under
 * `app:/data/recordings` and on the recordings' origin, and its answers fed
 * back in. A save fetches the whole recording into its part file with
 * `exactBodyTo` (the host writes it only once the body is complete; a reply
 * that is not 2xx, a cut-off body or an abort leaves it untouched), checks
 * the reply is a recording of the size it said, and renames it into place.
 *
 * The store starts with the first ask that brings the host's storage (a
 * play, the Downloads leaf), reading the folders once. `offlineStep` answers
 * Downloads' view (`kind` `view`, `all`, `cancel`, `delete`, `shown` and
 * `open` for the page the reader rests on); the player asks it where a
 * hymn's recording is saved (`localOf`), queues the save of what it plays
 * (`enqueue`) and drops a saved file that would not play (`invalidate`).
 *
 * Download all first makes the folders and asks the app's own module to
 * keep them out of the device's backup (`backup.exclude`, the current
 * `backup.ios.ts`): a host whose module has no such handler logs that it
 * could not and goes on.
 */

import { estimateMegabytes } from '@manna/hymnal-app/offline/estimate';
import {
  CANCEL,
  CONFIRM,
  CONFIRM_QUESTION,
  DELETE,
  DOWNLOAD_ALL,
  INDEXING,
  KEEP,
  PAUSED,
  PROGRESS_LABEL,
  RECORDINGS,
  activeLabel,
  activeText,
  busyOf,
  estimateText,
  failureOf,
  progressText,
  sizeLabel,
  sizeText,
} from '@manna/hymnal-app/offline/words';
import { readStorages } from '@manna/hymnal-app/offline/identity';

import { recordingAt } from '../player/sources.ts';
import {
  type Command,
  type File,
  type Identity,
  type Input,
  type Store,
  FOLDERS,
  ROOT,
  countsOf,
  empty,
  bytesOf,
  localOf,
  normal,
  partOf,
  pathOf,
  stepStore,
} from './store.ts';

/** The calls of Exact's `storage` the store makes, on the app's own files. */
export interface RecordingFiles {
  readonly fs: {
    readonly mkdir: (path: string) => Promise<unknown>;
    readonly readdir: (path: string) => Promise<ReadonlyArray<string>>;
    readonly stat: (
      path: string,
    ) => Promise<{ readonly size: number; readonly isDirectory: boolean }>;
    readonly rename: (from: string, to: string) => Promise<unknown>;
    readonly rm: (path: string) => Promise<unknown>;
  };
}

/** The app's own module, as the data module reaches it: present on a host that ships one. */
export interface AppModule {
  readonly available?: boolean;
  readonly later?: (request: Readonly<Record<string, string>>) => Promise<unknown>;
}

/** Exact's kept values, which the store does not read. */
interface KeptValues {
  readonly get: (name: string) => string | null;
}

/** What `fetch` answers with `exactBodyTo`: the bytes written, and the reply's headers. */
interface Written {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { readonly get: (name: string) => string | null };
  readonly exactBodyTo?: { readonly bytes: number } | null;
}

/** What Downloads shows, as the current `Downloads.tsx` draws it from the cache's snapshot. */
export interface DownloadsView {
  readonly serial: number;
  readonly printed: number;
  readonly progress: string;
  readonly sizeLabel: string;
  readonly sizeText: string;
  readonly busy: boolean;
  /** Whether a save, the folders' check or Download all's start is under way: the leaf asks again while it is. */
  readonly working: boolean;
  readonly activeLabel: string;
  readonly activeText: string;
  readonly indexing: boolean;
  readonly paused: boolean;
  /** Why saves stopped, when some failed or storage is out; empty while none did. */
  readonly failure: string;
  readonly estimate: string;
  readonly saved: number;
  readonly bytes: number;
  /** Every fixed line and name the leaf draws, the current `words.ts`'s. */
  readonly words: DownloadsWords;
}

export interface DownloadsWords {
  readonly label: string;
  readonly of: number;
  readonly indexing: string;
  readonly paused: string;
  readonly all: string;
  readonly cancel: string;
  readonly remove: string;
  readonly question: string;
  readonly confirm: string;
  readonly keep: string;
}

const WORDS: DownloadsWords = {
  label: PROGRESS_LABEL,
  of: RECORDINGS,
  indexing: INDEXING,
  paused: PAUSED,
  all: DOWNLOAD_ALL,
  cancel: CANCEL,
  remove: DELETE,
  question: CONFIRM_QUESTION,
  confirm: CONFIRM,
  keep: KEEP,
};

/** A reply is a recording: audio of the size it said (the fixture's silence is WAV, the bucket's MP3, as the current `http.ts` asks `audio/mpeg`). */
const recordingReply = (reply: Written, fixture: boolean): boolean => {
  const type = reply.headers.get('content-type') ?? '';
  const audio = type.startsWith('audio/mpeg') || (fixture && type.startsWith('audio/wav'));
  const said = Number(reply.headers.get('content-length') ?? Number.NaN);
  const bytes = reply.exactBodyTo?.bytes ?? 0;
  return reply.ok && audio && bytes > 0 && (!Number.isFinite(said) || said === bytes);
};

/** The store over `origin`'s recordings, the hymns timed by `timing` for the estimate. */
export const offlineSources = (
  origin: string,
  fixture: boolean,
  timing: ReadonlyArray<readonly [number, string]>,
) => {
  let store: Store = empty;
  let serial = 0;
  let files: RecordingFiles | undefined;
  let module: AppModule | undefined;
  let estimate: string | undefined;
  const fetches = new Map<number, AbortController>();
  const note = (event: string, detail: string) => {
    console.log(`[offline] ${event} ${detail}`);
  };
  const feed = (input: Input) => {
    if (files === undefined) return;
    const next = stepStore(store, input);
    store = next.store;
    serial += 1;
    for (const command of next.commands) carry(command);
  };
  /** The disk's changes, one at a time and in the store's order: a Delete of every saved file never fills the host's storage queue (256 waiting, `full`). */
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = <A>(work: () => Promise<A>): Promise<A> => {
    const done = turn.then(work, work);
    turn = done.catch(() => undefined);
    return done;
  };
  const quietly = (work: () => Promise<unknown>, event: string, path: string) => {
    inTurn(work).catch(() => note(event, `path=${path}`));
  };
  const list = async (): Promise<ReadonlyArray<File>> => {
    const fs = files?.fs;
    if (fs === undefined) return [];
    const found: Array<File> = [];
    let storages: ReadonlyArray<string> = [];
    try {
      storages = await fs.readdir(ROOT);
    } catch {
      return [];
    }
    for (const storage of storages) {
      if (!readStorages.includes(storage)) continue;
      const names = await fs.readdir(`${ROOT}/${storage}`).catch(() => []);
      for (const name of names) {
        const stat = await fs.stat(`${ROOT}/${storage}/${name}`).catch(() => undefined);
        if (stat !== undefined && !stat.isDirectory) found.push({ storage, name, size: stat.size });
      }
    }
    return found;
  };
  const download = async (at: number, id: Identity) => {
    const controller = new AbortController();
    fetches.set(at, controller);
    try {
      await files?.fs.mkdir(partOf(id).replace(/\/[^/]+$/u, ''));
      const init = { exactBodyTo: partOf(id), signal: controller.signal };
      const reply: Written = await fetch(recordingAt(origin, id.number, id.offset), init);
      if (recordingReply(reply, fixture))
        feed({ _tag: 'fetched', serial: at, id, bytes: reply.exactBodyTo?.bytes ?? 0 });
      else feed({ _tag: 'fetchFailed', serial: at, id, code: 'invalid' });
    } catch {
      feed({ _tag: 'fetchFailed', serial: at, id, code: 'network' });
    } finally {
      fetches.delete(at);
    }
  };
  const protect = async () => {
    const fs = files?.fs;
    if (fs === undefined) return false;
    for (const folder of FOLDERS) await fs.mkdir(folder);
    if (module?.available !== true || module.later === undefined) {
      note('backup.unavailable', 'op=backup.exclude');
      return true;
    }
    try {
      await module.later({ op: 'backup.exclude', path: ROOT });
    } catch {
      note('backup.failed', `path=${ROOT}`);
    }
    return true;
  };
  const removeOld = async () => {
    const fs = files?.fs;
    if (fs === undefined) return;
    const storages = await fs.readdir(ROOT).catch(() => []);
    for (const storage of storages) {
      const folder = `${ROOT}/${storage}`;
      if (!readStorages.includes(storage)) {
        for (const name of await fs.readdir(folder)) await fs.rm(`${folder}/${name}`);
        await fs.rm(folder);
      }
    }
  };
  const carry = (command: Command) => {
    const fs = files?.fs;
    switch (command._tag) {
      case 'list':
        list().then(
          (found) => feed({ _tag: 'indexed', files: found }),
          () => feed({ _tag: 'indexed', files: [] }),
        );
        return;
      case 'fetch':
        void download(command.serial, command.id);
        return;
      case 'abort':
        fetches.get(command.serial)?.abort();
        return;
      case 'publish':
        if (fs !== undefined)
          inTurn(() => fs.rename(partOf(command.id), pathOf(command.id))).then(
            () => feed({ _tag: 'published', serial: command.serial, id: command.id, ok: true }),
            () => {
              note('publish.failed', `path=${pathOf(command.id)}`);
              feed({ _tag: 'published', serial: command.serial, id: command.id, ok: false });
            },
          );
        return;
      case 'drop':
        if (fs !== undefined)
          quietly(() => fs.rm(partOf(command.id)), 'drop.failed', partOf(command.id));
        return;
      case 'remove':
        if (fs !== undefined)
          quietly(() => fs.rm(pathOf(command.id)), 'remove.failed', pathOf(command.id));
        return;
      case 'removeFile': {
        const path = `${ROOT}/${command.storage}/${command.name}`;
        if (fs !== undefined) quietly(() => fs.rm(path), 'remove.failed', path);
        return;
      }
      case 'removeOld':
        quietly(removeOld, 'removeOld.failed', ROOT);
        return;
      case 'protect':
        protect().then(
          (ok) => feed({ _tag: 'protected', ok }),
          () => feed({ _tag: 'protected', ok: false }),
        );
        return;
    }
  };
  /** The store started with the host's storage, once: its folders read. */
  const start = (storage: RecordingFiles | undefined, native: AppModule | null | undefined) => {
    if (native !== undefined && native !== null) module = native;
    if (files !== undefined || storage === undefined) return;
    files = storage;
    feed({ _tag: 'launch' });
  };
  const view = (): DownloadsView => {
    const counts = countsOf(store);
    const told = estimate ?? estimateText(estimateMegabytes(timing));
    estimate = told;
    return {
      serial,
      printed: counts.printed,
      progress: progressText(counts),
      sizeLabel: sizeLabel(counts),
      sizeText: sizeText(counts),
      busy: busyOf(counts),
      working:
        busyOf(counts) ||
        counts.indexing ||
        store.protecting !== undefined ||
        store.waiting.length > 0 ||
        store.publishing.length > 0,
      activeLabel: activeLabel(counts),
      activeText: activeText(counts),
      indexing: counts.indexing,
      paused: counts.paused,
      failure: counts.failed > 0 || counts.storage ? failureOf(counts) : '',
      estimate: told,
      saved: counts.saved,
      bytes: counts.bytes,
      words: WORDS,
    };
  };
  const asks: Readonly<Record<string, (number: number) => Input | undefined>> = {
    view: () => undefined,
    all: () => ({ _tag: 'all' }),
    cancel: () => ({ _tag: 'cancel' }),
    delete: () => ({ _tag: 'delete' }),
    shown: (number) => ({ _tag: 'shown', number }),
    open: (number) => ({ _tag: 'open', number }),
  };
  return {
    offline: {
      start,
      localOf: (id: Identity) => localOf(store, id) ?? '',
      /**
       * Before the launch's list is read, a play asks the disk for its own
       * recording, as the current `local` reads its entry without waiting
       * on the whole index: a whole file there is saved now.
       */
      lookup: async (id: Identity): Promise<void> => {
        const fs = files?.fs;
        const normalized = normal(id);
        if (fs === undefined || normalized === undefined || !store.indexing) return;
        if (localOf(store, normalized) !== undefined) return;
        try {
          const told = await fs.stat(pathOf(normalized));
          if (!told.isDirectory && told.size > 0)
            feed({ _tag: 'found', saved: { ...normalized, bytes: told.size } });
        } catch {
          note('lookup.none', `path=${pathOf(normalized)}`);
        }
      },
      enqueue: (id: Identity) => feed({ _tag: 'enqueue', id }),
      verify: (id: Identity) => {
        const path = localOf(store, id);
        const bytes = bytesOf(store, id);
        const fs = files?.fs;
        if (path === undefined || bytes === undefined || fs === undefined) return;
        fs.stat(path).then(
          (found) => {
            if (found.size !== bytes) feed({ _tag: 'invalidate', id });
          },
          () => feed({ _tag: 'invalidate', id }),
        );
      },
    },
    sources: {
      offlineStep: (
        [kind, number]: readonly [string, number, number],
        _store: KeptValues,
        storage: RecordingFiles,
        native?: AppModule | null,
      ): DownloadsView => {
        start(storage, native);
        const input = asks[kind]?.(number);
        if (input !== undefined) feed(input);
        return view();
      },
    },
  };
};

/** The store as the player reaches it. */
export type Offline = ReturnType<typeof offlineSources>['offline'];
