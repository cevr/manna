/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch, effect/noNewPromise -- Exact's data module answers a Promise and its app folder cannot import effect (docs/exact.md): the commentary's one fetch with the host's `fetch` (its `exactTimeout` outside the DOM's RequestInit), a refused fetch or write is the network's or the disk's answer, not a defect, the pack read once is held as its Promise, and the protocol itself is the pure `step`. */

/**
 * The commentary's data sources, as `app.ts` registers them. The pack's
 * address is one function, `packFrom(base)`: egw.cvr.im's on a plain
 * launch, a loopback fixture's when a driver's launch names one
 * (`HEARTSEED_COMMENTARY_BASE`). One launch's protocol is the pure `step`,
 * held here between calls: `commentaryAsk` is the Read tab shown or Try
 * again (Contract's `commentaryFetch` and `commentaryRetry`), joins the
 * fetch in flight if there is one, and answers what is kept once it
 * settles; Contract keeps the version and the check's time
 * (`persist`) from that answer, after the file is written. The reader's
 * sources read the kept file on first use per launch and version, and the
 * pack a fetch just wrote is held parsed, so it is never read again.
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import {
  checkPack,
  countsOf,
  readOf,
  versionAt,
  type CommentaryCounts,
  type CommentaryPack,
  type CommentaryRead,
} from './pack';
import {
  keptOf,
  NOTHING_KEPT,
  START,
  shownOf,
  step,
  type CommentaryState,
  type Heard,
  type Input,
  type Machine,
} from './step';

/** The kept pack, the only file the commentary writes. */
export const COMMENTARY_FILE = 'app:/data/commentary.json';

/** The pack's host on a plain launch. */
export const COMMENTARY_HOST = 'https://egw.cvr.im';

/** How long one fetch may take, headers and body, before it is a failed try. */
const FETCH_MS = 60_000;

/** The pack's address on `base`: its one source. A pack shipped another way is another function with the same answer. */
export const packFrom = (base: string): string => `${base}/api/commentary/pack`;

/** Where the pack comes from: a loopback fixture a driver's launch names, else egw.cvr.im. */
export const baseOf = (setting: string): string =>
  /^http:\/\/127\.0\.0\.1:\d{2,5}$/u.test(setting) ? setting : COMMENTARY_HOST;

/** What an ask answers: what is kept after it, whether the last try failed, and whether its fetch landed the first pack on the phone. */
export interface CommentaryAnswer {
  version: string;
  checkedAt: number;
  failed: boolean;
  landed: boolean;
}

/** Where the pack is fetched from, and whether that is a driver's fixture. */
export interface CommentaryBase {
  base: string;
  fixture: boolean;
}

/** What a fetch hands back, as much of the host's `Response` as the commentary reads. */
interface Fetched {
  readonly status: number;
  readonly text: () => Promise<string>;
}

/** Exact's `Store` argument, as much of it as names it: the commentary keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** The host's `fetch`, as the commentary calls it. */
type Fetcher = (url: string, init: RequestInit) => Promise<Fetched>;

/** What the sources are given: the base setting, and the host's fetch (the real one by default). */
export interface CommentaryOptions {
  readonly setting: string;
  readonly fetcher?: Fetcher;
}

const hostFetch: Fetcher = (url, init) => fetch(url, init);

/** The body's bytes, as the file keeps them. */
const bytesOf = (text: string) => new TextEncoder().encode(text);

/** The kept file's pack, or none: no file, a file that does not decode, or a pack that fails its checks. */
const packIn = async (storage: FileStorage): Promise<CommentaryPack | undefined> => {
  try {
    const bytes = await storage.fs.readFile(COMMENTARY_FILE);
    const checked = checkPack(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return checked._tag === 'Good' ? checked.pack : undefined;
  } catch {
    return undefined;
  }
};

/** The version the kept file names, from its head; empty with no file. */
const fileVersion = async (storage: FileStorage): Promise<string> => {
  try {
    const bytes = await storage.fs.readFile(COMMENTARY_FILE);
    return versionAt(
      new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(512, bytes.byteLength))),
    );
  } catch {
    return '';
  }
};

/** The commentary's sources, with one launch's protocol and pack. */
export const commentarySources = (options: CommentaryOptions) => {
  const base = baseOf(options.setting);
  const fetcher = options.fetcher ?? hostFetch;
  let machine: Machine = START;
  let flight: Promise<CommentaryAnswer> | undefined;
  let held:
    | { readonly mark: string; readonly pack: Promise<CommentaryPack | undefined> }
    | undefined;
  let reads = 0;

  const apply = (input: Input) => {
    const stepped = step(machine, input);
    machine = stepped.state;
    return stepped.commands;
  };

  const answerNow = (landed = false): CommentaryAnswer => ({
    version: machine.kept.version,
    checkedAt: machine.kept.checkedAt,
    failed: machine.failed,
    landed,
  });

  const hear = async (version: string): Promise<Heard> => {
    try {
      const headers: Record<string, string> =
        version === '' ? {} : { 'if-none-match': `"${version}"` };
      const answer = await fetcher(packFrom(base), {
        headers,
        cache: 'no-store',
        exactTimeout: FETCH_MS,
      } as RequestInit);
      if (answer.status === 304) return { _tag: 'Same' };
      if (answer.status !== 200) return { _tag: 'Status', status: answer.status };
      return { _tag: 'Body', body: await answer.text() };
    } catch {
      return { _tag: 'Refused' };
    }
  };

  const written = async (storage: FileStorage, body: string) => {
    try {
      await storage.fs.atomicWriteFile(COMMENTARY_FILE, bytesOf(body));
      return true;
    } catch {
      return false;
    }
  };

  const fetchOnce = async (
    id: number,
    version: string,
    now: number,
    storage: FileStorage,
  ): Promise<CommentaryAnswer> => {
    const heard = await hear(version);
    const write = apply({ _tag: 'Answered', id, now, heard }).find(
      (command) => command._tag === 'Write',
    );
    if (write?._tag === 'Write') {
      const ok = await written(storage, write.body);
      apply({ _tag: 'Wrote', id, now, ok });
      if (ok) held = { mark: write.pack.version, pack: Promise.resolve(write.pack) };
    }
    return answerNow(version === '' && machine.kept.version !== '');
  };

  /** The kept pack for `mark`, read from the file once per launch and mark; none for no mark. */
  const packFor = (mark: string, storage: FileStorage): Promise<CommentaryPack | undefined> => {
    if (mark === '') return Promise.resolve(undefined);
    if (held?.mark === mark) return held.pack;
    reads++;
    const pack = packIn(storage);
    held = { mark, pack };
    return pack;
  };

  /** Forgets a read that found no pack, so the next asks again. */
  const settled = async (mark: string, storage: FileStorage) => {
    const pack = await packFor(mark, storage);
    if (pack === undefined && held?.mark === mark) held = undefined;
    return pack;
  };

  return {
    /** How many times this launch read the kept file (a test's counter). */
    reads: () => reads,
    sources: {
      commentaryBase: (): CommentaryBase => ({ base, fixture: base !== COMMENTARY_HOST }),
      commentaryView: ([version, busy, failed, landed]: readonly [
        string,
        boolean,
        boolean,
        boolean,
      ]): CommentaryState => shownOf(version, busy, failed, landed),
      commentaryAsk: async (
        [version, checkedAt, force, now]: readonly [string, number, boolean, number],
        _store: ExactStore,
        storage: FileStorage,
      ): Promise<CommentaryAnswer> => {
        const found = machine.loaded
          ? NOTHING_KEPT
          : keptOf(await fileVersion(storage), { version, checkedAt });
        const commands = apply({ _tag: 'Ask', now, force, found });
        for (const command of commands)
          if (command._tag === 'Fetch')
            flight = fetchOnce(command.id, command.version, now, storage);
        if (machine.current !== 0 && flight !== undefined) return await flight;
        await settled(machine.kept.version, storage);
        return answerNow();
      },
      commentaryRead: async (
        [book, chapter, mark]: readonly [number, number, string],
        _store: ExactStore,
        storage: FileStorage,
      ): Promise<CommentaryRead> => readOf(await settled(mark, storage), book, chapter),
      commentaryCounts: async (
        [book, chapter, mark]: readonly [number, number, string],
        _store: ExactStore,
        storage: FileStorage,
      ): Promise<CommentaryCounts> => countsOf(await settled(mark, storage), book, chapter),
    },
  };
};
