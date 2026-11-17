/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch, effect/noNewPromise -- Exact's data module answers a Promise and its app folder cannot import effect (docs/exact.md): each pack's one fetch with the host's `fetch` (its `exactTimeout` outside the DOM's RequestInit), a refused fetch or write is the network's or the disk's answer, not a defect, a pack read once is held as its Promise, and the protocol itself is the pure `step`. */

/**
 * The one downloader every pack the reader keeps runs through (q126), as
 * `app.ts` registers its sources. The base is one function, `baseOf`:
 * egw.cvr.im on a plain launch, a loopback fixture's when a driver's launch
 * names one (`HEARTSEED_PACKS_BASE`). Each pack has its own machine, the
 * pure `step`, held here between calls. `packsAsk` is the Read tab shown
 * or Try again (Contract's `packsFetch` and `packsRetry`): it asks every
 * pack at once and joins any fetch in flight, each settled apart
 * (whatever throws in one is that pack's failed try). It answers as soon
 * as one pack settles, with every pack's kept line as it stands and
 * `more` while any is still out; Contract then sends `packsWait`, which
 * answers at the next settle, until none is out. So a pack's status is
 * kept the moment it settles, whatever another's slow fetch does. A body is checked in steps a turn each (`paced.ts`), and the data host
 * gets a turn back before its write, so no turn of the call nears the
 * host's budget whatever a pack's size: one turn over it refuses the whole
 * call, every pack's answer with it. Contract keeps every pack's version and check time in one `persist`
 * string from each answer, after each file is written. A pack's reader
 * (`packOf`) reads its kept file on first use per launch and version, and
 * a pack a fetch just wrote is held parsed, so it is never read again.
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import { inTurns, nextTurn } from './paced';
import { packShownOf, packsShownOf, type PacksState, type PackState } from './shown';
import { versionAt, type PackSpec } from './spec';
import {
  keptIn,
  keptOf,
  keptWith,
  NOTHING_KEPT,
  START,
  step,
  type Checked,
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

/** What an ask answers: every pack's kept version and check time (`keptWith`), whether any pack's last try failed, the names of those whose fetch landed their first pack on the phone since the last answer, and whether any pack is still out (Contract then waits for the next with `packsWait`). */
export interface PacksAnswer {
  kept: string;
  failed: boolean;
  landed: string;
  more: boolean;
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
  /** What ends a turn between a check's steps and before a write (`nextTurn`, the host's `scheduler.yield()`, by default). */
  readonly pause?: () => Promise<void>;
}

const hostFetch: Fetcher = (url, init) => fetch(url, init);

/** The body's bytes, as the file keeps them. */
const bytesOf = (text: string) => new TextEncoder().encode(text);

/** One pack's launch: its machine, its fetch in flight, the pack held parsed, how often its file was read, its asks still out, and what it has to tell the next answer. */
interface Entry {
  readonly spec: PackSpec<Versioned>;
  machine: Machine;
  flight: Promise<boolean> | undefined;
  held: { readonly mark: string; readonly pack: Promise<Versioned | undefined> } | undefined;
  reads: number;
  /** This pack's asks not yet settled, the latest last. */
  out: Array<Promise<void>>;
  /** Whether it settled since the last answer, which then answers at once. */
  news: boolean;
  /** Whether its fetch landed its first pack since the last answer. */
  landed: boolean;
}

/** `body` checked by `spec`'s check a step a turn, a check that throws as a bad body. */
const checkedIn = async (
  spec: PackSpec<Versioned>,
  body: string,
  pause: () => Promise<void>,
): Promise<Checked<Versioned>> => {
  try {
    await pause();
    return await inTurns(spec.check(body), pause);
  } catch {
    return { _tag: 'Bad', fault: 'threw' };
  }
};

/** The kept file's pack, or none: no file, a file that does not decode, or a pack that fails its checks. */
const packIn = async (
  spec: PackSpec<Versioned>,
  storage: FileStorage,
  pause: () => Promise<void>,
): Promise<Versioned | undefined> => {
  try {
    const bytes = await storage.fs.readFile(spec.file);
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const checked = await checkedIn(spec, body, pause);
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
  const pause = options.pause ?? nextTurn;
  const entries: ReadonlyArray<Entry> = options.packs.map((spec) => ({
    spec,
    machine: START,
    flight: undefined,
    held: undefined,
    reads: 0,
    out: [],
    news: false,
    landed: false,
  }));
  const named = new Map(entries.map((entry) => [entry.spec.name, entry]));

  /** `input` stepped, a body's check already run in turns (`checked`); none is run inside the step. */
  const apply = (entry: Entry, input: Input, checked?: Checked<Versioned>) => {
    const stepped = step(
      entry.machine,
      input,
      (): Checked<Versioned> => checked ?? { _tag: 'Bad', fault: 'unchecked' },
    );
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
      await pause();
      await storage.fs.atomicWriteFile(entry.spec.file, bytesOf(body));
      return true;
    } catch {
      return false;
    }
  };

  /** One fetch to its end, its body checked a step a turn; whether it landed the pack's first file. */
  const fetched = async (
    entry: Entry,
    id: number,
    version: string,
    now: number,
    storage: FileStorage,
  ): Promise<boolean> => {
    const heard = await hear(entry, version);
    const checked =
      heard._tag === 'Body' ? await checkedIn(entry.spec, heard.body, pause) : undefined;
    const write = apply(entry, { _tag: 'Answered', id, now, heard }, checked).find(
      (command) => command._tag === 'Write',
    );
    if (write?._tag === 'Write') {
      const ok = await written(entry, storage, write.body);
      apply(entry, { _tag: 'Wrote', id, now, ok });
      if (ok) entry.held = { mark: write.pack.version, pack: Promise.resolve(write.pack) };
    }
    return version === '' && entry.machine.kept.version !== '';
  };

  /** `fetched`, settled apart: whatever throws in one pack's fetch is that try's failure (a refusal), and no other pack's. */
  const fetchOnce = async (
    entry: Entry,
    id: number,
    version: string,
    now: number,
    storage: FileStorage,
  ): Promise<boolean> => {
    try {
      return await fetched(entry, id, version, now, storage);
    } catch {
      apply(entry, { _tag: 'Answered', id, now, heard: { _tag: 'Refused' } });
      if (entry.machine.current === id && entry.machine.writing !== '')
        apply(entry, { _tag: 'Wrote', id, now, ok: false });
      return false;
    }
  };

  /** The kept pack for `mark`, read from the file once per launch and mark; none for no mark. */
  const packFor = (entry: Entry, mark: string, storage: FileStorage) => {
    if (mark === '') return Promise.resolve(undefined);
    if (entry.held?.mark === mark) return entry.held.pack;
    entry.reads++;
    const pack = packIn(entry.spec, storage, pause);
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

  /** `asked`, counted out of `entry` until it settles; then `entry` has news for the next answer. */
  const track = (entry: Entry, asked: Promise<boolean>) => {
    const done: Promise<void> = asked
      .catch(() => false)
      .then((landed) => {
        entry.out = entry.out.filter((each) => each !== done);
        entry.news = true;
        if (landed) entry.landed = true;
      });
    entry.out.push(done);
  };

  /** Every pack as it stands: the kept line of each this launch has read (`kept`'s for the rest), and what is news since the last answer, now told. */
  const answerOf = (kept: string): PacksAnswer => {
    const answer = {
      kept: entries
        .filter((entry) => entry.machine.loaded)
        .reduce((text, entry) => keptWith(text, entry.spec.name, entry.machine.kept), kept),
      failed: entries.some((entry) => entry.machine.failed),
      landed: entries
        .filter((entry) => entry.landed)
        .map((entry) => entry.spec.name)
        .join(' '),
      more: entries.some((entry) => entry.out.length > 0),
    };
    for (const entry of entries) {
      entry.news = false;
      entry.landed = false;
    }
    return answer;
  };

  /** The next answer: at once when a pack settled since the last one or none is out, else at the next pack's settle, whatever the others do. */
  const nextAnswer = async (kept: string): Promise<PacksAnswer> => {
    const out = entries.flatMap((entry) => entry.out);
    if (out.length > 0 && !entries.some((entry) => entry.news)) await Promise.race(out);
    return answerOf(kept);
  };

  /** The specs `names` lists, in the packs' own order. */
  const wordsOf = (names: string) => {
    const listed = new Set(names.split(' '));
    return entries.filter((entry) => listed.has(entry.spec.name)).map((entry) => entry.spec);
  };

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
      packsAsk: (
        [kept, force, now]: readonly [string, boolean, number],
        _store: ExactStore,
        storage: FileStorage,
      ): Promise<PacksAnswer> => {
        for (const entry of entries) track(entry, askOne(entry, kept, force, now, storage));
        return nextAnswer(kept);
      },
      /** Contract's follow-up while an answer said `more`: the next pack's settle, or at once with none out. */
      packsWait: ([kept]: readonly [string]): Promise<PacksAnswer> => nextAnswer(kept),
    },
  };
};
