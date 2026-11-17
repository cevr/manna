/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary, effect/noNewPromise, effect/noGlobals, effect/noTryCatch, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test holds each pack's answer as a Promise it releases, lets the host's queue run dry with a timer between events, and awaits each event in turn; a made-up pack's body that does not parse is a bad body, as the real checks say. */

/**
 * Each pack's status settles apart: the downloader's sources driven as
 * `features/packs.contract` drives them (its one newest-wins `packsFetched`,
 * `packsTook`, and `packsFollow` sending `packsWait` while an answer says
 * `more`), against a reference model of what each pack's line should say,
 * over generated runs where every pack's answer is held until the run lets
 * it go, in any order, well or not, with Try again pressed between. After
 * every event a pack whose answer landed is kept in `packsKept` and counted
 * by the line, whatever the others are doing; a pack once kept stays kept.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { versionOf } from '../commentary/pack';
import { seeded, type Random } from '../test/random';
import { sumOf } from '../text/sum';
import { sumPaced, type Paced } from './paced';
import { gettingLine, landedLine } from './shown';
import { packSources, type PacksAnswer } from './sources';
import type { PackSpec } from './spec';
import { keptIn, type Checked } from './step';

const NOW = Date.UTC(2026, 10, 17, 12);

const STORE = { forget: () => {} };

interface MadePack {
  readonly version: string;
  readonly words: ReadonlyArray<string>;
}

const madeOf = (words: ReadonlyArray<string>): MadePack => ({
  version: versionOf(words.length, sumOf(words.join('\n'))),
  words,
});

function* checkMade(body: string): Paced<Checked<MadePack>> {
  let pack: MadePack;
  try {
    pack = JSON.parse(body) as MadePack;
  } catch {
    return { _tag: 'Bad', fault: 'json' };
  }
  if (!Array.isArray(pack.words)) return { _tag: 'Bad', fault: 'fields' };
  yield undefined;
  const sum = yield* sumPaced(pack.words);
  return pack.version === versionOf(pack.words.length, sum)
    ? { _tag: 'Good', pack }
    : { _tag: 'Bad', fault: 'sum' };
}

/** A made-up pack named `name`, as the downloader takes it. */
const specOf = (name: string): PackSpec<MadePack> => ({
  name,
  path: `/api/${name}/pack`,
  file: `app:/data/${name}.json`,
  title: `the ${name}`,
  noun: name,
  waiting: `The ${name} are on their way.`,
  check: checkMade,
});

/** How a held answer goes when the run lets it go. */
type Outcome = 'well' | 'refuse' | 'fail';

/** A server that holds every request until the test lets it go, a pack's body by its path. */
const heldServer = (packs: ReadonlyMap<string, MadePack>) => {
  const held = new Map<string, Array<(outcome: Outcome) => void>>();
  let requests = 0;
  const fetcher = async (url: string, init: RequestInit) => {
    requests++;
    const name = new URL(url).pathname.split('/')[2] ?? '';
    const pack = packs.get(name);
    const outcome = await new Promise<Outcome>((resolve) =>
      held.set(name, [...(held.get(name) ?? []), resolve]),
    );
    if (outcome === 'refuse' || pack === undefined) throw new TypeError('Network request failed');
    if (outcome === 'fail') return { status: 500, text: async () => 'Internal error' };
    if (new Headers(init.headers).get('if-none-match') === `"${pack.version}"`)
      return { status: 304, text: async () => '' };
    return { status: 200, text: async () => JSON.stringify(pack) };
  };
  return {
    fetcher,
    requests: () => requests,
    /** Lets `name`'s oldest held request go with `outcome`; whether one was held. */
    release: (name: string, outcome: Outcome) => {
      const resolve = held.get(name)?.shift();
      resolve?.(outcome);
      return resolve !== undefined;
    },
  };
};

/** A storage like Exact's, whose reads of a file can be held until the test lets them go. */
const storageOf = () => {
  const files = new Map<string, ArrayBuffer>();
  const heldReads = new Map<string, Promise<void>>();
  return {
    files,
    /** Holds every read of `file` until the answer it gives is called. */
    holdReads: (file: string) => {
      let release = () => {};
      heldReads.set(
        file,
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      return () => {
        heldReads.delete(file);
        release();
      };
    },
    fs: {
      readFile: async (path: string) => {
        await heldReads.get(path);
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path: string, bytes: Uint8Array) => {
        files.set(path, Uint8Array.from(bytes).buffer);
      },
    },
  };
};

type Storage = ReturnType<typeof storageOf>;

/** One turn of the host's queue. */
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Lets every turn the host and Contract have queued run: the held answers and reads stay held. */
const drained = async () => {
  for (let each = 0; each < 12; each++) await turn();
};

/**
 * `features/packs.contract`'s members over `sources`: `packsKept`
 * (persisted, so a relaunch starts from it), `packsLanded` (a landing
 * added to one still shown), the one newest-wins `packsFetched` (a later
 * send forgets the reply of the one before), `packsTook`, and
 * `packsFollow`, whose `after(1, …)` sends `packsWait` a turn after an answer
 * that says `more` commits; `packsBusy` and `packsFailed` as the
 * contract derives them.
 */
const contractOf = (
  sources: ReturnType<typeof packSources>['sources'],
  storage: Storage,
  persisted = '',
) => {
  let kept = persisted;
  let landed = '';
  let answer: PacksAnswer | undefined;
  let sent = 0;
  let pending = false;
  let refused = false;

  const send = (call: () => Promise<PacksAnswer>) => {
    const id = ++sent;
    pending = true;
    refused = false;
    call().then(
      (reply) => {
        if (id !== sent) return;
        pending = false;
        answer = reply;
        kept = reply.kept;
        if (reply.landed !== '')
          landed = landed === '' ? reply.landed : `${landed} ${reply.landed}`;
        if (reply.more === true)
          setImmediate(() => {
            if (id === sent) send(() => withDataHost(() => sources.packsWait([kept])));
          });
      },
      () => {
        if (id !== sent) return;
        pending = false;
        refused = true;
      },
    );
  };

  const busy = () => pending || (answer?.more === true && !refused);
  const failed = () => refused || answer?.failed === true;
  return {
    fetch: (force: boolean) =>
      send(() => withDataHost(() => sources.packsAsk([kept, force, NOW], STORE, storage))),
    kept: () => kept,
    busy,
    shown: () => sources.packsView([kept, busy(), failed(), landed]),
    landedOver: () => {
      landed = '';
    },
  };
};

/** A launch over `names`' made-up packs, on a fresh storage or a kept one, with Contract's persisted line. */
const launched = (names: ReadonlyArray<string>, storage = storageOf(), persisted = '') => {
  const made = new Map(names.map((name, index) => [name, madeOf([name, `${index}`, 'ka lo'])]));
  const server = heldServer(made);
  const downloader = packSources({
    setting: 'http://127.0.0.1:4801',
    packs: names.map(specOf),
    fetcher: server.fetcher,
  });
  return {
    version: (name: string) => made.get(name)?.version ?? 'none',
    server,
    storage,
    contract: contractOf(downloader.sources, storage, persisted),
  };
};

describe('each pack settles apart', () => {
  it("a pack that lands shows saved while another's answer is held, and stays kept when that one fails", async () => {
    const { version, server, contract } = launched(['alpha', 'beta']);
    contract.fetch(false);
    await drained();
    expect(contract.shown()).toEqual({
      phase: 'fetching',
      missing: 2,
      foot: gettingLine([specOf('alpha'), specOf('beta')]),
      retry: false,
    });

    expect(server.release('beta', 'well')).toBe(true);
    await drained();
    expect(keptIn(contract.kept(), 'beta').version).toBe(version('beta'));
    expect(keptIn(contract.kept(), 'alpha').version).toBe('');
    expect(contract.busy()).toBe(true);
    expect(contract.shown()).toEqual({
      phase: 'fetching',
      missing: 1,
      foot: gettingLine([specOf('alpha')]),
      retry: false,
    });

    expect(server.release('alpha', 'refuse')).toBe(true);
    await drained();
    expect(keptIn(contract.kept(), 'beta').version).toBe(version('beta'));
    expect(contract.busy()).toBe(false);
    expect(contract.shown()).toEqual({ phase: 'failed', missing: 1, foot: '', retry: true });

    contract.landedOver();
    contract.fetch(true);
    await drained();
    expect(server.release('alpha', 'well')).toBe(true);
    await drained();
    expect(keptIn(contract.kept(), 'alpha').version).toBe(version('alpha'));
    expect(keptIn(contract.kept(), 'beta').version).toBe(version('beta'));
    expect(contract.busy()).toBe(true);
    expect(server.release('beta', 'well')).toBe(true);
    await drained();
    expect(contract.shown()).toEqual({
      phase: 'ready',
      missing: 0,
      foot: landedLine([specOf('alpha')]),
      retry: false,
    });
  });

  it('two packs landing apart are named together, in the packs’ order, while the landed line shows', async () => {
    const { server, contract } = launched(['alpha', 'beta', 'gamma']);
    contract.fetch(false);
    await drained();
    server.release('gamma', 'well');
    await drained();
    expect(contract.shown().foot).toBe(gettingLine([specOf('alpha'), specOf('beta')]));
    server.release('alpha', 'well');
    await drained();
    server.release('beta', 'refuse');
    await drained();
    expect(contract.shown()).toEqual({ phase: 'failed', missing: 1, foot: '', retry: true });
    contract.fetch(true);
    await drained();
    for (const name of ['alpha', 'gamma']) server.release(name, 'well');
    server.release('beta', 'well');
    await drained();
    expect(contract.shown().foot).toBe(
      landedLine([specOf('alpha'), specOf('beta'), specOf('gamma')]),
    );
  });

  it("a relaunch's first answer keeps the line of a pack whose file is still being read", async () => {
    const first = launched(['alpha', 'beta']);
    first.contract.fetch(false);
    await drained();
    first.server.release('alpha', 'well');
    first.server.release('beta', 'well');
    await drained();
    const persisted = first.contract.kept();
    expect(keptIn(persisted, 'beta').version).toBe(first.version('beta'));

    const again = launched(['alpha', 'beta'], first.storage, persisted);
    const release = again.storage.holdReads(specOf('beta').file);
    again.contract.fetch(false);
    await drained();
    expect(again.contract.busy()).toBe(true);
    expect(again.contract.kept()).toBe(persisted);
    expect(again.contract.shown()).toEqual({ phase: 'ready', missing: 0, foot: '', retry: false });
    release();
    await drained();
    expect(again.contract.kept()).toBe(persisted);
    expect(again.contract.busy()).toBe(false);
    expect(again.server.requests()).toBe(0);
  });

  /** What each pack's line should say: the reference model, one record a pack. */
  const modelOf = (names: ReadonlyArray<string>) => {
    const packs = new Map(
      names.map((name) => [name, { flying: true, kept: false, failed: false }]),
    );
    const each = (name: string) => packs.get(name) ?? { flying: false, kept: false, failed: false };
    return {
      flying: () => names.filter((name) => each(name).flying),
      /** `name`'s answer let go with `outcome`. */
      settle: (name: string, outcome: Outcome) => {
        packs.set(name, {
          flying: false,
          kept: each(name).kept || outcome === 'well',
          failed: outcome !== 'well',
        });
      },
      /** A showing (`force` false: a pack missing or failed fetches) or Try again (every pack not out). */
      ask: (force: boolean) => {
        for (const [name, pack] of packs)
          if (!pack.flying && (force || !pack.kept || pack.failed))
            packs.set(name, { ...pack, flying: true });
      },
      expected: (version: (name: string) => string) => {
        const missing = names.filter((name) => !each(name).kept).length;
        const busy = names.some((name) => each(name).flying);
        return {
          kept: names.map((name) => (each(name).kept ? version(name) : '')),
          busy,
          missing,
          phase: missing === 0 ? 'ready' : busy ? 'fetching' : 'failed',
        };
      },
    };
  };

  /** One generated run: packs held and let go in any order, one or two at once, well or not, Try again and a showing pressed between. */
  const run = async (random: Random) => {
    const names = ['alpha', 'beta', 'gamma', 'delta'].slice(0, 2 + random.below(3));
    const { version, server, contract } = launched(names);
    const model = modelOf(names);
    const log: Array<string> = [];
    contract.fetch(false);
    await drained();
    for (let event = 0; event < 14; event++) {
      const flying = model.flying();
      const roll = random.next();
      if (flying.length > 0 && roll < 0.8) {
        const first = random.below(flying.length);
        const together = flying.length > 1 && random.chance(0.4) ? 2 : 1;
        for (const name of [...flying, ...flying].slice(first, first + together)) {
          const outcome = random.pick<Outcome>(['well', 'well', 'refuse', 'fail']);
          log.push(`${name} ${outcome}`);
          expect(server.release(name, outcome)).toBe(true);
          model.settle(name, outcome);
        }
      } else {
        const force = roll < 0.9;
        log.push(force ? 'retry' : 'show');
        model.ask(force);
        contract.fetch(force);
      }
      await drained();
      const shown = contract.shown();
      expect({
        log,
        kept: names.map((name) => keptIn(contract.kept(), name).version),
        busy: contract.busy(),
        missing: shown.missing,
        phase: shown.phase,
      }).toEqual({ log, ...model.expected(version) });
    }
    for (const name of names) while (server.release(name, 'refuse')) await drained();
  };

  it('over generated runs, each pack’s line follows its own answer alone', async () => {
    for (let seed = 1; seed <= 40; seed++) await run(seeded(seed));
  });
});
