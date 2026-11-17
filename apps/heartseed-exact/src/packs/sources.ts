/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch, effect/noNewPromise, effect/noThrowStatement -- Exact's data module answers a Promise and its app folder cannot import effect (docs/exact.md): each pack's one fetch with the host's `fetch` (its `exactTimeout` outside the DOM's RequestInit), a refused fetch or write is the network's or the disk's answer, not a defect, a call let go mid-job rethrows the host's AbortError once its job is owed again, a pack read once is held as its Promise, and the protocol itself is the pure `step`. */

/**
 * The one downloader every pack the reader keeps runs through (q126), as
 * `app.ts` registers its sources. The base is one function, `baseOf`:
 * egw.cvr.im on a plain launch, a loopback fixture's when a driver's launch
 * names one (`HEARTSEED_PACKS_BASE`). Each pack has its own machine, the
 * pure `step`, held here between calls. `packsAsk` is the Read tab shown
 * or Try again (Contract's `packsFetch` and `packsRetry`): it asks every
 * pack at once and joins any fetch in flight, each settled apart. It
 * answers as soon as one pack settles, with every pack's kept line as it
 * stands and `more` while any is still out; Contract then sends
 * `packsWait`, which answers at the next settle, until none is out. So a
 * pack's status is kept the moment it settles, whatever another's slow
 * fetch does. A fetch's answer may land after the call that made it has
 * answered, and on Hermes such a call's `scheduler.yield()` does not end
 * its turn; so a landing runs no check: a body waits as its pack's job,
 * and each call runs one job, in steps a turn each (`paced.ts`) from its
 * own turn, the data host getting a turn back before the write, and
 * answers once it is done. No turn nears the host's budget whatever a
 * pack's size: one turn over it refuses the whole call, every pack's
 * answer with it (`turns.test.ts`). Contract keeps every pack's version and check time in one `persist`
 * string from each answer, after each file is written. A pack's reader
 * (`packOf`) reads its kept file on first use per launch and version, and
 * a pack a fetch just wrote is held parsed, so it is never read again.
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import { inTurns, nextTurn, type Paced } from './paced';
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

/** A pack's work owed to the next ask's own turns: a body its fetch heard, to check and write, or its kept file, to read ahead. */
type Job =
  | {
      readonly _tag: 'Check';
      readonly id: number;
      readonly version: string;
      readonly now: number;
      readonly body: string;
      readonly storage: FileStorage;
    }
  | { readonly _tag: 'Read'; readonly mark: string; readonly storage: FileStorage };

/** One pack's launch: its machine, the pack held parsed, how often its file was read, its work owed, and what it has to tell the next answer. */
interface Entry {
  readonly spec: PackSpec<Versioned>;
  machine: Machine;
  held: { readonly mark: string; readonly pack: Promise<Versioned | undefined> } | undefined;
  reads: number;
  job: Job | undefined;
  /** When its job came to be owed, in the launch's count: the first owed is run first. */
  owedAt: number;
  /** Whether it settled since the last answer, which then answers at once. */
  news: boolean;
  /** Whether its fetch landed its first pack since the last answer. */
  landed: boolean;
}

/** Whether `entry` is still out: its fetch in flight, or its work owed. */
const isOut = (entry: Entry) => entry.machine.current !== 0 || entry.job !== undefined;

/** `body` checked by `spec`'s check a step a turn, a check that throws as a bad body; a pause that throws (the call let go) throws. */
const checkedIn = async (
  spec: PackSpec<Versioned>,
  body: string,
  pause: () => Promise<void>,
): Promise<Checked<Versioned>> => {
  await pause();
  return inTurns(safely(spec, body), pause);
};

/** `spec`'s check of `body`, a step that throws ending it as a bad body. */
function* safely(spec: PackSpec<Versioned>, body: string): Paced<Checked<Versioned>> {
  try {
    return yield* spec.check(body);
  } catch {
    return { _tag: 'Bad', fault: 'threw' };
  }
}

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
    held: undefined,
    reads: 0,
    job: undefined,
    owedAt: 0,
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

  /** The asks waiting for the next pack to land or settle. */
  let wakers: Array<() => void> = [];
  const wake = () => {
    const woken = wakers;
    wakers = [];
    for (const each of woken) each();
  };
  const woken = () =>
    new Promise<void>((resolve) => {
      wakers.push(resolve);
    });

  /** The launch's count of jobs owed, so the first owed is run first. */
  let owing = 0;
  const owe = (entry: Entry, job: Job) => {
    entry.job = job;
    entry.owedAt = ++owing;
  };

  /** `entry` settled if it is no longer out: news for the next answer. */
  const told = (entry: Entry) => {
    if (!isOut(entry)) entry.news = true;
  };

  /**
   * One fetch heard, in whatever turn its answer lands: a body is kept as
   * `entry`'s job for an ask's own turns, any other answer stepped at once.
   * It runs no check: the call that made the fetch may have answered by
   * then, and an answered call's yield does not end its turn.
   */
  const flown = async (
    entry: Entry,
    id: number,
    version: string,
    now: number,
    storage: FileStorage,
  ) => {
    const heard = await hear(entry, version);
    if (heard._tag === 'Body' && entry.machine.current === id && entry.machine.writing === '')
      owe(entry, { _tag: 'Check', id, version, now, body: heard.body, storage });
    else
      apply(entry, {
        _tag: 'Answered',
        id,
        now,
        heard: heard._tag === 'Body' ? { _tag: 'Refused' } : heard,
      });
    told(entry);
    wake();
  };

  /** A heard body checked a step a turn, written, and kept; whether its fetch landed the pack's first file. */
  const landing = async (entry: Entry, job: Extract<Job, { _tag: 'Check' }>) => {
    const { id, now, body, storage } = job;
    const checked = await checkedIn(entry.spec, body, pause);
    const write = apply(
      entry,
      { _tag: 'Answered', id, now, heard: { _tag: 'Body', body } },
      checked,
    ).find((command) => command._tag === 'Write');
    if (write?._tag === 'Write') {
      const ok = await written(entry, storage, write.body);
      apply(entry, { _tag: 'Wrote', id, now, ok });
      if (ok) entry.held = { mark: write.pack.version, pack: Promise.resolve(write.pack) };
    }
    if (job.version === '' && entry.machine.kept.version !== '') entry.landed = true;
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

  /** One pack asked: a fetch started (one in flight is joined), else its kept file owed a read ahead. */
  const askOne = async (
    entry: Entry,
    kept: string,
    force: boolean,
    now: number,
    storage: FileStorage,
  ) => {
    const found = entry.machine.loaded
      ? NOTHING_KEPT
      : keptOf(await fileVersion(entry.spec.file, storage), keptIn(kept, entry.spec.name));
    for (const command of apply(entry, { _tag: 'Ask', now, force, found }))
      if (command._tag === 'Fetch') void flown(entry, command.id, command.version, now, storage);
    const mark = entry.machine.kept.version;
    if (!isOut(entry) && mark !== '' && entry.held?.mark !== mark)
      owe(entry, { _tag: 'Read', mark, storage });
    told(entry);
  };

  /** `entry`'s job run in this call's own turns; a call let go mid-check leaves it owed to the next. */
  const work = async (entry: Entry) => {
    const job = entry.job;
    if (job === undefined) return;
    entry.job = undefined;
    try {
      if (job._tag === 'Read') await settled(entry, job.mark, job.storage);
      else await landing(entry, job);
    } catch (error) {
      entry.job ??= job;
      throw error;
    }
    told(entry);
    wake();
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
      more: entries.some(isOut),
    };
    for (const entry of entries) {
      entry.news = false;
      entry.landed = false;
    }
    return answer;
  };

  /**
   * The next answer: at once when a pack settled since the last one or none
   * is out; else the first owed pack's work (in the order the packs landed)
   * run in this call's own turns; else
   * at the next landing, whatever the others do. Work runs only from a
   * call's own turn, never after a wake, which may come in another call's
   * turn, and the call answers once that work is done: on Hermes a yield of
   * a call that has answered does not end its turn.
   */
  const nextAnswer = async (kept: string): Promise<PacksAnswer> => {
    if (!entries.some((entry) => entry.news)) {
      const owed = entries
        .filter((entry) => entry.job !== undefined)
        .reduce<Entry | undefined>(
          (first, entry) => (first === undefined || entry.owedAt < first.owedAt ? entry : first),
          undefined,
        );
      if (owed !== undefined) await work(owed);
      else if (entries.some(isOut)) await woken();
    }
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
      ): Promise<PacksAnswer> =>
        Promise.all(entries.map((entry) => askOne(entry, kept, force, now, storage))).then(() =>
          nextAnswer(kept),
        ),
      /** Contract's follow-up while an answer said `more`: the next pack's settle, or at once with none out. */
      packsWait: ([kept]: readonly [string]): Promise<PacksAnswer> => nextAnswer(kept),
    },
  };
};
