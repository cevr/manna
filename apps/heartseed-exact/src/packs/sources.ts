/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch, effect/noNewPromise -- Exact's data module answers a Promise and its app folder cannot import effect (docs/exact.md): each pack's one fetch with the host's `fetch` (its `exactTimeout` outside the DOM's RequestInit), a refused fetch or write is the network's or the disk's answer, not a defect, a pack read once is held as its Promise, and the protocol itself is the pure `step`. */

/**
 * The one downloader every pack the reader keeps runs through (q126), as
 * `app.ts` registers its sources. The base is one function, `baseOf`:
 * egw.cvr.im on a plain launch, a loopback fixture's when a driver's launch
 * names one (`HEARTSEED_PACKS_BASE`). Each pack has its own machine, the
 * pure `step`, held here between calls. `packsAsk` is the Read tab shown
 * or Try again (Contract's `packsFetch` and `packsRetry`): it asks every
 * pack at once, joins any fetch in flight, and answers once all settle;
 * Contract keeps every pack's version and check time in one `persist`
 * string from that answer, after each file is written. A pack's reader
 * (`packOf`) reads its kept file on first use per launch and version, and
 * a pack a fetch just wrote is held parsed, so it is never read again.
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import { packShownOf, packsShownOf, type PacksState, type PackState } from './shown';
import { versionAt, type PackSpec } from './spec';
import {
  keptIn,
  keptOf,
  keptWith,
  NOTHING_KEPT,
  START,
  step,
  type Heard,
  type Input,
  type Machine,
  type Versioned,
} from './step';

/** Every pack's host on a plain launch. */
export const PACKS_HOST = 'https://egw.cvr.im';

/** How long one fetch may take, headers and body, before it is a failed try. */
const FETCH_MS = 60_000;

/** Where the packs come from: a loopback fixture a driver's launch names, else egw.cvr.im. */
export const baseOf = (setting: string): string =>
  /^http:\/\/127\.0\.0\.1:\d{2,5}$/u.test(setting) ? setting : PACKS_HOST;

/** What an ask answers: every pack's kept version and check time (`keptWith`), whether any pack's last try failed, and the names of those whose fetch landed their first pack on the phone. */
export interface PacksAnswer {
  kept: string;
  failed: boolean;
  landed: string;
}

/** Where the packs are fetched from, and whether that is a driver's fixture. */
export interface PacksBase {
  base: string;
  fixture: boolean;
}

/** What a fetch hands back, as much of the host's `Response` as the downloader reads. */
interface Fetched {
  readonly status: number;
  readonly text: () => Promise<string>;
}

/** Exact's `Store` argument, as much of it as names it: the downloader keeps nothing there. */
export interface ExactStore {
  readonly forget: (name: string) => void;
}

/** The host's `fetch`, as the downloader calls it. */
type Fetcher = (url: string, init: RequestInit) => Promise<Fetched>;

/** What the sources are given: the base setting, the packs, and the host's fetch (the real one by default). */
export interface PacksOptions {
  readonly setting: string;
  readonly packs: ReadonlyArray<PackSpec<Versioned>>;
  readonly fetcher?: Fetcher;
}

const hostFetch: Fetcher = (url, init) => fetch(url, init);

/** The body's bytes, as the file keeps them. */
const bytesOf = (text: string) => new TextEncoder().encode(text);

/** One pack's launch: its machine, its fetch in flight, the pack held parsed, how often its file was read. */
interface Entry {
  readonly spec: PackSpec<Versioned>;
  machine: Machine;
  flight: Promise<boolean> | undefined;
  held: { readonly mark: string; readonly pack: Promise<Versioned | undefined> } | undefined;
  reads: number;
}

/** The kept file's pack, or none: no file, a file that does not decode, or a pack that fails its checks. */
const packIn = async (
  spec: PackSpec<Versioned>,
  storage: FileStorage,
): Promise<Versioned | undefined> => {
  try {
    const bytes = await storage.fs.readFile(spec.file);
    const checked = spec.check(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return checked._tag === 'Good' ? checked.pack : undefined;
  } catch {
    return undefined;
  }
};

/** The version the kept file names, from its head; empty with no file. */
const fileVersion = async (file: string, storage: FileStorage): Promise<string> => {
  try {
    const bytes = await storage.fs.readFile(file);
    return versionAt(
      new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(512, bytes.byteLength))),
    );
  } catch {
    return '';
  }
};

/** The downloader's sources over `options.packs`, with one launch's machines and packs. */
export const packSources = (options: PacksOptions) => {
  const base = baseOf(options.setting);
  const fetcher = options.fetcher ?? hostFetch;
  const entries: ReadonlyArray<Entry> = options.packs.map((spec) => ({
    spec,
    machine: START,
    flight: undefined,
    held: undefined,
    reads: 0,
  }));
  const named = new Map(entries.map((entry) => [entry.spec.name, entry]));

  const apply = (entry: Entry, input: Input) => {
    const stepped = step(entry.machine, input, entry.spec.check);
    entry.machine = stepped.state;
    return stepped.commands;
  };

  const hear = async (entry: Entry, version: string): Promise<Heard> => {
    try {
      const headers: Record<string, string> =
        version === '' ? {} : { 'if-none-match': `"${version}"` };
      const answer = await fetcher(`${base}${entry.spec.path}`, {
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

  const written = async (entry: Entry, storage: FileStorage, body: string) => {
    try {
      await storage.fs.atomicWriteFile(entry.spec.file, bytesOf(body));
      return true;
    } catch {
      return false;
    }
  };

  /** One fetch to its end; whether it landed the pack's first file. */
  const fetchOnce = async (
    entry: Entry,
    id: number,
    version: string,
    now: number,
    storage: FileStorage,
  ): Promise<boolean> => {
    const heard = await hear(entry, version);
    const write = apply(entry, { _tag: 'Answered', id, now, heard }).find(
      (command) => command._tag === 'Write',
    );
    if (write?._tag === 'Write') {
      const ok = await written(entry, storage, write.body);
      apply(entry, { _tag: 'Wrote', id, now, ok });
      if (ok) entry.held = { mark: write.pack.version, pack: Promise.resolve(write.pack) };
    }
    return version === '' && entry.machine.kept.version !== '';
  };

  /** The kept pack for `mark`, read from the file once per launch and mark; none for no mark. */
  const packFor = (entry: Entry, mark: string, storage: FileStorage) => {
    if (mark === '') return Promise.resolve(undefined);
    if (entry.held?.mark === mark) return entry.held.pack;
    entry.reads++;
    const pack = packIn(entry.spec, storage);
    entry.held = { mark, pack };
    return pack;
  };

  /** The pack for `mark`, a read that found none forgotten so the next asks again. */
  const settled = async (entry: Entry, mark: string, storage: FileStorage) => {
    const pack = await packFor(entry, mark, storage);
    if (pack === undefined && entry.held?.mark === mark) entry.held = undefined;
    return pack;
  };

  /** One pack asked: a fetch started or joined and awaited, else its kept pack read ahead; whether its first file landed. */
  const askOne = async (
    entry: Entry,
    kept: string,
    force: boolean,
    now: number,
    storage: FileStorage,
  ): Promise<boolean> => {
    const found = entry.machine.loaded
      ? NOTHING_KEPT
      : keptOf(await fileVersion(entry.spec.file, storage), keptIn(kept, entry.spec.name));
    for (const command of apply(entry, { _tag: 'Ask', now, force, found }))
      if (command._tag === 'Fetch')
        entry.flight = fetchOnce(entry, command.id, command.version, now, storage);
    if (entry.machine.current !== 0 && entry.flight !== undefined) return await entry.flight;
    await settled(entry, entry.machine.kept.version, storage);
    return false;
  };

  const wordsOf = (names: string) =>
    names.split(' ').flatMap((name) => {
      const entry = named.get(name);
      return entry === undefined ? [] : [entry.spec];
    });

  return {
    /** How many times this launch read `name`'s kept file (a test's counter). */
    reads: (name: string) => named.get(name)?.reads ?? 0,
    /** The kept pack `spec` names for `mark` (its kept version), or none: a pack's reader. */
    packOf: <P extends Versioned>(
      spec: PackSpec<P>,
      mark: string,
      storage: FileStorage,
    ): Promise<P | undefined> => {
      const entry = named.get(spec.name);
      return entry === undefined
        ? Promise.resolve(undefined)
        : (settled(entry, mark, storage) as Promise<P | undefined>);
    },
    sources: {
      packsBase: (): PacksBase => ({ base, fixture: base !== PACKS_HOST }),
      packsView: ([kept, busy, failed, landed]: readonly [
        string,
        boolean,
        boolean,
        string,
      ]): PacksState =>
        packsShownOf(
          entries
            .filter((entry) => keptIn(kept, entry.spec.name).version === '')
            .map((entry) => entry.spec),
          busy,
          failed,
          wordsOf(landed),
        ),
      packView: ([name, kept, busy, failed]: readonly [
        string,
        string,
        boolean,
        boolean,
      ]): PackState => {
        const entry = named.get(name);
        const words = entry?.spec ?? { name, title: name, noun: name, waiting: '' };
        return packShownOf(words, keptIn(kept, name).version, busy, failed);
      },
      packsAsk: async (
        [kept, force, now]: readonly [string, boolean, number],
        _store: ExactStore,
        storage: FileStorage,
      ): Promise<PacksAnswer> => {
        const landed = await Promise.all(
          entries.map((entry) => askOne(entry, kept, force, now, storage)),
        );
        return {
          kept: entries.reduce(
            (text, entry) => keptWith(text, entry.spec.name, entry.machine.kept),
            kept,
          ),
          failed: entries.some((entry) => entry.machine.failed),
          landed: entries
            .filter((_, index) => landed[index])
            .map((entry) => entry.spec.name)
            .join(' '),
        };
      },
    },
  };
};
