/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary, effect/noNewPromise, effect/noGlobals, effect/noTryCatch, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test plays the data host's turns with Promises it releases and a timer between events, and a made-up pack's body that does not parse is a bad body, as the real checks say. */

/**
 * Every step of a pack's check runs in a turn of a call still answering.
 * On Hermes a `scheduler.yield()` ends the turn only for an answer still
 * pending: after its answer has given its value it goes on at once (Exact's
 * prelude, `yieldTurn`), so a check's steps run there in one turn, which the
 * host refuses past its 100 ms, and the refused answer loses every pack's
 * line with it: a failed commentary answering first must not leave the
 * study packs' checks to run after it. The test plays those turns: a fetch's answer lands as the call
 * that made it, a yield goes on as its own call, and a yield of a call that
 * has answered, which would not end its turn, is counted.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { versionOf } from '../commentary/pack';
import { sumOf } from '../text/sum';
import { SLICE, sumPaced, type Paced } from './paced';
import { packSources, type PacksAnswer } from './sources';
import type { PackSpec } from './spec';
import { keptIn, type Checked } from './step';

const NOW = Date.UTC(2026, 10, 17, 12);
const STORE = { forget: () => {} };
const NAMES = ['commentary', 'lexicon', 'tags', 'words', 'xrefs'];

interface MadePack {
  readonly version: string;
  readonly words: ReadonlyArray<string>;
}

/** A pack whose sum takes a few of a check's steps. */
const madeOf = (name: string): MadePack => {
  const words = [name, 'ka'.repeat(SLICE)];
  return { version: versionOf(words.length, sumOf(words.join('\n'))), words };
};

function* checkMade(body: string): Paced<Checked<MadePack>> {
  let pack: MadePack;
  try {
    pack = JSON.parse(body) as MadePack;
  } catch {
    return { _tag: 'Bad', fault: 'json' };
  }
  yield undefined;
  const sum = yield* sumPaced(pack.words);
  return pack.version === versionOf(pack.words.length, sum)
    ? { _tag: 'Good', pack }
    : { _tag: 'Bad', fault: 'sum' };
}

const specOf = (name: string): PackSpec<MadePack> => ({
  name,
  path: `/api/${name}/pack`,
  file: `app:/data/${name}.json`,
  title: `the ${name}`,
  noun: name,
  waiting: `The ${name} are on their way.`,
  check: checkMade,
});

/** One call of the data host: its name, whether it has given its value, whether a newer send let it go before it did, and its last fetch's landing, which its next waits for. */
interface Call {
  readonly name: string;
  answered: boolean;
  letGo: boolean;
  landed: Promise<void>;
}

/** A host's turn ends between events. */
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const drained = async () => {
  for (let each = 0; each < 40; each++) await turn();
};

type Outcome = 'well' | 'fail';

/** The data host's turns, a server that holds each request until the test lets it go, and Contract's follow-up. */
const hostOf = () => {
  let current: Call | undefined;
  /** The calls whose yield went on at once, its turn not ended: one entry a step joined to the turn before. */
  const joined: Array<string> = [];
  const held = new Map<string, Array<(outcome: Outcome) => void>>();
  const files = new Map<string, ArrayBuffer>();
  const made = new Map(NAMES.map((name) => [name, madeOf(name)]));

  /** Exact's `scheduler.yield()`: refused in a call let go (its job owed again), at once in one that has answered, else a turn of its own. */
  const pause = () => {
    const call = current;
    if (call?.letGo === true)
      return Promise.reject(
        Object.assign(new Error('the answer was let go'), { name: 'AbortError' }),
      );
    if (call === undefined || call.answered) {
      joined.push(call?.name ?? 'none');
      return Promise.resolve();
    }
    return new Promise<void>((resolve) =>
      setImmediate(() => {
        current = call;
        resolve();
      }),
    );
  };

  /** A fetch lands as the call that made it, and only after that call's earlier fetches have: Exact hands the host a call's fetches one at a time, in the order made. */
  const fetcher = async (url: string) => {
    const owner = current;
    const name = new URL(url).pathname.split('/')[2] ?? '';
    const before = owner?.landed ?? Promise.resolve();
    const heard = new Promise<Outcome>((resolve) =>
      held.set(name, [...(held.get(name) ?? []), resolve]),
    );
    const landing = Promise.all([heard, before]).then(([each]) => each);
    if (owner !== undefined) owner.landed = landing.then(() => {});
    const outcome = await landing;
    current = owner;
    if (outcome === 'fail') return { status: 500, text: async () => 'Internal error' };
    return { status: 200, text: async () => JSON.stringify(made.get(name)) };
  };

  /** A storage step answers in a turn of its own, as the call that asked it. */
  const stepped = <T>(run: () => T) => {
    const owner = current;
    return new Promise<T>((resolve, reject) =>
      setImmediate(() => {
        current = owner;
        try {
          resolve(run());
        } catch (error) {
          reject(error);
        }
      }),
    );
  };
  const storage = {
    fs: {
      readFile: (path: string) =>
        stepped(() => {
          const file = files.get(path);
          if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
          return file;
        }),
      atomicWriteFile: (path: string, bytes: Uint8Array) =>
        stepped(() => {
          files.set(path, Uint8Array.from(bytes).buffer);
        }),
    },
  };

  const { sources } = packSources({
    setting: 'http://127.0.0.1:4801',
    packs: NAMES.map(specOf),
    fetcher,
    pause,
  });

  /** Each pack's latest call: a newer send lets the one before go, as Contract's newest-wins mutation does. */
  const latest = new Map<string, Call>();
  /** A call started in a turn of its own, answered once its value is given or a newer send of its pack lets it go. */
  const send = (pack: string, name: string, run: () => Promise<PacksAnswer>) => {
    const call: Call = { name, answered: false, letGo: false, landed: Promise.resolve() };
    const before = latest.get(pack);
    if (before !== undefined && !before.answered) before.letGo = true;
    latest.set(pack, call);
    current = call;
    const answer = withDataHost(run);
    const given = () => {
      call.answered = true;
    };
    answer.then(given, given);
    return answer;
  };

  /** Every answer's kept line, in the order they came. */
  const answers: Array<string> = [];
  /** Each pack's follow-up `packsWait`, in the order sent: a timer Contract arms, which a drive's frozen clock holds back. */
  const waits: Array<string> = [];
  /** One pack asked as its mutation sends it, and followed while its answer says `more`. */
  const askOne = async (name: string, kept: string, force: boolean) => {
    const asked = send(name, `packsAsk ${name}`, () =>
      sources.packsAsk([name, kept, force, NOW], STORE, storage),
    );
    let mine = latest.get(name);
    /** A call let go may end refused: Contract forgets its reply either way. */
    let answer = await asked.catch(() => undefined);
    for (;;) {
      if (latest.get(name) !== mine) return undefined;
      if (answer === undefined) throw new Error(`${name}: a call no newer send let go was refused`);
      answers.push(answer.kept);
      if (!answer.more) return answer;
      await turn();
      const last = answer.kept;
      waits.push(name);
      const waited = send(name, `packsWait ${name}`, () => sources.packsWait([name, last]));
      mine = latest.get(name);
      answer = await waited.catch(() => undefined);
    }
  };
  /** Every pack asked at once, a call each, as `packsFetch` and `packsRetry` send them: the last answer's kept line, and whether any pack's last try failed. */
  const ask = async (kept: string, force: boolean) => {
    const settled = await Promise.all(NAMES.map((name) => askOne(name, kept, force)));
    return {
      kept: answers.at(-1) ?? kept,
      failed: settled.some((answer) => answer?.failed === true),
      /** Whether a newer ask let any of these calls go before they settled. */
      overtaken: settled.some((answer) => answer === undefined),
    };
  };

  return {
    joined,
    waits,
    answers,
    ask,
    version: (name: string) => made.get(name)?.version ?? '',
    release: (name: string, outcome: Outcome) => {
      const resolve = held.get(name)?.shift();
      resolve?.(outcome);
      return resolve !== undefined;
    },
  };
};

describe('every step of a check runs in a turn of a call still answering', () => {
  it('the commentary fails first: the study packs are checked in turns of their own, kept, and Try again lands it', async () => {
    const host = hostOf();
    const asked = host.ask('', false);
    await drained();
    expect(host.release('commentary', 'fail')).toBe(true);
    await drained();
    for (const name of NAMES.slice(1)) {
      expect(host.release(name, 'well')).toBe(true);
      await drained();
    }
    const failed = await asked;
    expect({ joined: host.joined, failed: failed.failed }).toEqual({ joined: [], failed: true });
    for (const name of NAMES.slice(1))
      expect(keptIn(failed.kept, name).version).toBe(host.version(name));
    expect(keptIn(failed.kept, 'commentary').version).toBe('');

    const again = host.ask(failed.kept, true);
    await drained();
    for (const name of NAMES) {
      expect(host.release(name, 'well')).toBe(true);
      await drained();
    }
    const landed = await again;
    expect({ joined: host.joined, failed: landed.failed }).toEqual({ joined: [], failed: false });
    expect(keptIn(landed.kept, 'commentary').version).toBe(host.version('commentary'));
  });

  it('a slow pack holds back no other: each study pack is kept while the commentary is still held', async () => {
    const host = hostOf();
    const asked = host.ask('', false);
    await drained();
    for (const name of NAMES.slice(1)) expect(host.release(name, 'well')).toBe(true);
    await drained();
    const whileHeld = host.answers.at(-1) ?? '';
    expect(NAMES.filter((name) => keptIn(whileHeld, name).version !== '')).toEqual(NAMES.slice(1));
    expect(host.waits).toEqual([]);
    expect(host.release('commentary', 'well')).toBe(true);
    const answer = await asked;
    expect(keptIn(answer.kept, 'commentary').version).toBe(host.version('commentary'));
    expect(host.joined).toEqual([]);
  });

  it('Try again while every fetch is out joins them: the bodies are checked by the newer calls, in turns of their own', async () => {
    const host = hostOf();
    const first = host.ask('', false);
    await drained();
    const again = host.ask('', true);
    await drained();
    for (const name of NAMES) {
      expect(host.release(name, 'well')).toBe(true);
      await drained();
    }
    const [overtaken, landed] = await Promise.all([first, again]);
    expect({ overtaken: overtaken.overtaken, joined: host.joined }).toEqual({
      overtaken: true,
      joined: [],
    });
    for (const name of NAMES) expect(keptIn(landed.kept, name).version).toBe(host.version(name));
  });

  it('every pack lands at once: each is checked in turns of a call still answering', async () => {
    const host = hostOf();
    const asked = host.ask('', false);
    await drained();
    for (const name of NAMES) expect(host.release(name, 'well')).toBe(true);
    await drained();
    const answer = await asked;
    expect(host.joined).toEqual([]);
    for (const name of NAMES) expect(keptIn(answer.kept, name).version).toBe(host.version(name));
  });
});
