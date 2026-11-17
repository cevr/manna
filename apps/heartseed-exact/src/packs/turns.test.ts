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

/** One call of the data host: its name, and whether it has given its value. */
interface Call {
  readonly name: string;
  answered: boolean;
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

  const pause = () => {
    const call = current;
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

  const fetcher = async (url: string) => {
    const owner = current;
    const name = new URL(url).pathname.split('/')[2] ?? '';
    const outcome = await new Promise<Outcome>((resolve) =>
      held.set(name, [
        ...(held.get(name) ?? []),
        (each) => {
          current = owner;
          resolve(each);
        },
      ]),
    );
    if (outcome === 'fail') return { status: 500, text: async () => 'Internal error' };
    return { status: 200, text: async () => JSON.stringify(made.get(name)) };
  };

  const storage = {
    fs: {
      readFile: async (path: string) => {
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path: string, bytes: Uint8Array) => {
        files.set(path, Uint8Array.from(bytes).buffer);
      },
    },
  };

  const { sources } = packSources({
    setting: 'http://127.0.0.1:4801',
    packs: NAMES.map(specOf),
    fetcher,
    pause,
  });

  /** A call started in a turn of its own, answered once its value is given. */
  const send = (name: string, run: () => Promise<PacksAnswer>) => {
    const call: Call = { name, answered: false };
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
  const ask = async (kept: string, force: boolean) => {
    let answer = await send('packsAsk', () => sources.packsAsk([kept, force, NOW], STORE, storage));
    answers.push(answer.kept);
    while (answer.more) {
      await turn();
      const last = answer.kept;
      answer = await send('packsWait', () => sources.packsWait([last]));
      answers.push(answer.kept);
    }
    return answer;
  };

  return {
    joined,
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

  it('bodies owed together are checked in the order they landed, a slow pack after a quick one', async () => {
    const host = hostOf();
    const asked = host.ask('', false);
    await drained();
    for (const name of ['xrefs', 'commentary', 'tags'])
      expect(host.release(name, 'well')).toBe(true);
    await drained();
    for (const name of ['lexicon', 'words']) expect(host.release(name, 'well')).toBe(true);
    await asked;
    const firstKept = host.answers
      .map((kept) => NAMES.filter((name) => keptIn(kept, name).version !== ''))
      .filter((names) => names.length > 0)
      .slice(0, 3);
    expect(firstKept).toEqual([
      ['xrefs'],
      ['commentary', 'xrefs'],
      ['commentary', 'tags', 'xrefs'],
    ]);
    expect(host.joined).toEqual([]);
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
