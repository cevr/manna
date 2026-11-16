/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary, effect/noNewPromise, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test awaits each answer in turn, as the host asks them, over a stand-in server (its held answer a Promise the test releases) and a storage that answers at once. */

/**
 * The commentary's sources as Exact calls them: each call starts inside
 * `withDataHost`, on the call's time alone, over a stand-in server and a
 * storage like Exact's. The base is egw.cvr.im unless a loopback fixture is
 * named; a first fetch lands the pack whole; a `304` keeps it; two asks at
 * once make one request; a failed answer or write keeps what was there; a
 * relaunch reads the kept file; the reader reads the file once per launch
 * and version, and a pack just fetched not at all.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { appText } from '../../tools/commentary-fixture';
import { bodyOf, madePack } from '../test/commentary-packs';
import { seeded, type Random } from '../test/random';
import { readOf, type CommentaryPack } from './pack';
import {
  baseOf,
  COMMENTARY_FILE,
  COMMENTARY_HOST,
  commentarySources,
  packFrom,
  type CommentaryAnswer,
} from './sources';
import { GETTING_LINE, LANDED_LINE, LANDED_MS, shownOf, WAITING_LINE, WEEK } from './step';

const NOW = Date.UTC(2026, 10, 16, 12);

/** Exact's store, which the commentary keeps nothing in. */
const STORE = { forget: () => {} };

/** A made-up pack with at least one note, so a changed character has a note to change. */
const notedPack = (random: Random, most: number): CommentaryPack => {
  for (;;) {
    const pack = madePack(random, most);
    if (pack.count > 0) return pack;
  }
};

/** What the stand-in server does with the next request. */
type Reply = 'well' | 'refuse' | 'fail' | 'cut' | 'flip';

/** A server holding `pack`, answering each request by the next reply asked of it (else `well`), and counting what it heard. */
const serverOf = (first: CommentaryPack) => {
  let pack = first;
  const replies: Array<Reply> = [];
  const heard: Array<{ url: string; tag: string }> = [];
  let held: Promise<void> = Promise.resolve();
  const fetcher = async (url: string, init: RequestInit) => {
    const tag = new Headers(init.headers).get('if-none-match') ?? '';
    heard.push({ url, tag });
    await held;
    const reply = replies.shift() ?? 'well';
    if (reply === 'refuse') throw new TypeError('Network request failed');
    if (reply === 'fail') return { status: 500, text: async () => 'Internal error' };
    if (reply === 'well' && tag === `"${pack.version}"`)
      return { status: 304, text: async () => '' };
    const body = bodyOf(pack);
    if (reply === 'cut') return { status: 200, text: async () => body.slice(0, body.length >> 1) };
    if (reply === 'flip')
      return { status: 200, text: async () => body.replace('"notes":[["', '"notes":[["x') };
    return { status: 200, text: async () => body };
  };
  return {
    fetcher,
    heard,
    next: (...more: Array<Reply>) => replies.push(...more),
    publish: (next: CommentaryPack) => {
      pack = next;
    },
    hold: () => {
      let release = () => {};
      held = new Promise((resolve) => {
        release = resolve;
      });
      return () => release();
    },
  };
};

/** A storage like Exact's: no file is `ENOENT`; a write may be refused. */
const storageOf = () => {
  const files = new Map<string, ArrayBuffer>();
  let refuseWrites = false;
  let reads = 0;
  return {
    files,
    reads: () => reads,
    refuseWrites: (on: boolean) => {
      refuseWrites = on;
    },
    fs: {
      readFile: async (path: string) => {
        reads++;
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path: string, bytes: Uint8Array) => {
        if (refuseWrites) throw Object.assign(new Error('refused'), { code: 'EIO' });
        files.set(path, Uint8Array.from(bytes).buffer);
      },
    },
  };
};

type Storage = ReturnType<typeof storageOf>;
type Sources = ReturnType<typeof commentarySources>['sources'];

/** The persisted values Contract keeps from a fetch's answer. */
interface Persisted {
  version: string;
  checkedAt: number;
}

/** A fetch call as Contract sends it, started inside the data host; Contract keeps its answer. */
const ask = async (
  sources: Sources,
  storage: Storage,
  kept: Persisted,
  now: number,
  force = false,
): Promise<CommentaryAnswer> => {
  const answer = await withDataHost(() =>
    sources.commentaryAsk([kept.version, kept.checkedAt, force, now], STORE, storage),
  );
  kept.version = answer.version;
  kept.checkedAt = answer.checkedAt;
  return answer;
};

const fileText = (storage: Storage) => {
  const file = storage.files.get(COMMENTARY_FILE);
  return file === undefined ? undefined : new TextDecoder().decode(file);
};

const launch = (server: ReturnType<typeof serverOf>, setting = 'http://127.0.0.1:4801') =>
  commentarySources({ setting, fetcher: server.fetcher });

describe('the base', () => {
  it('is egw.cvr.im unless a loopback fixture is named', () => {
    expect(baseOf('')).toBe(COMMENTARY_HOST);
    expect(baseOf('https://example.com')).toBe(COMMENTARY_HOST);
    expect(baseOf('http://127.0.0.1:4801/x')).toBe(COMMENTARY_HOST);
    expect(baseOf('http://127.0.0.1:4801')).toBe('http://127.0.0.1:4801');
    expect(packFrom(COMMENTARY_HOST)).toBe('https://egw.cvr.im/api/commentary/pack');
    expect(commentarySources({ setting: '' }).sources.commentaryBase()).toEqual({
      base: COMMENTARY_HOST,
      fixture: false,
    });
  });
});

describe('the download', () => {
  it('lands a first pack whole, keeps it across a relaunch, and asks again a week on with its version', async () => {
    const random = seeded(31);
    const first = notedPack(random, 20);
    const server = serverOf(first);
    const storage = storageOf();
    const kept: Persisted = { version: '', checkedAt: 0 };
    const answer = await ask(launch(server).sources, storage, kept, NOW);
    expect(answer).toEqual({ version: first.version, checkedAt: NOW, failed: false, landed: true });
    expect(fileText(storage)).toBe(bodyOf(first));
    expect(server.heard).toEqual([{ url: 'http://127.0.0.1:4801/api/commentary/pack', tag: '' }]);

    const again = launch(server);
    expect(await ask(again.sources, storage, kept, NOW + 6 * 24 * 3600 * 1000)).toEqual({
      version: first.version,
      checkedAt: NOW,
      failed: false,
      landed: false,
    });
    expect(server.heard.length).toBe(1);

    const later = launch(server);
    const week = NOW + WEEK + 1;
    expect((await ask(later.sources, storage, kept, week)).checkedAt).toBe(week);
    expect(server.heard.at(-1)).toEqual({ url: expect.any(String), tag: `"${first.version}"` });
    expect(fileText(storage)).toBe(bodyOf(first));

    const second = notedPack(random, 20);
    server.publish(second);
    const next = launch(server);
    const answered = await ask(next.sources, storage, kept, week + WEEK + 1, true);
    expect(answered.version).toBe(second.version);
    expect(answered.landed).toBe(false);
    expect(fileText(storage)).toBe(bodyOf(second));
  });

  it('makes one request for asks at once, and every ask hears its answer', async () => {
    const pack = notedPack(seeded(32), 10);
    const server = serverOf(pack);
    const storage = storageOf();
    const { sources } = launch(server);
    const release = server.hold();
    const asks = [
      ask(sources, storage, { version: '', checkedAt: 0 }, NOW),
      ask(sources, storage, { version: '', checkedAt: 0 }, NOW, true),
      ask(sources, storage, { version: '', checkedAt: 0 }, NOW),
    ];
    await Promise.resolve();
    release();
    const answers = await Promise.all(asks);
    expect(server.heard.length).toBe(1);
    for (const answer of answers) expect(answer.version).toBe(pack.version);
  });

  it('keeps what was there when an answer fails or a write is refused, and the next ask fetches', async () => {
    const random = seeded(33);
    const first = notedPack(random, 10);
    const server = serverOf(first);
    for (const reply of ['refuse', 'fail', 'cut', 'flip'] as const) {
      const storage = storageOf();
      const { sources } = launch(server);
      const kept: Persisted = { version: '', checkedAt: 0 };
      server.next(reply);
      expect(await ask(sources, storage, kept, NOW)).toEqual({
        version: '',
        checkedAt: 0,
        failed: true,
        landed: false,
      });
      expect(storage.files.size).toBe(0);
      expect((await ask(sources, storage, kept, NOW)).version).toBe(first.version);
    }

    const storage = storageOf();
    const kept: Persisted = { version: '', checkedAt: 0 };
    await ask(launch(server).sources, storage, kept, NOW);
    const second = notedPack(random, 10);
    server.publish(second);
    const { sources } = launch(server);
    server.next('cut');
    const failed = await ask(sources, storage, kept, NOW + WEEK + 1);
    expect(failed).toEqual({ version: first.version, checkedAt: NOW, failed: true, landed: false });
    expect(fileText(storage)).toBe(bodyOf(first));
    expect(
      await withDataHost(() => sources.commentaryRead([1, 1, kept.version], STORE, storage)),
    ).toEqual(readOf(first, 1, 1));
    storage.refuseWrites(true);
    expect((await ask(sources, storage, kept, NOW + WEEK + 2)).failed).toBe(true);
    expect(fileText(storage)).toBe(bodyOf(first));
    storage.refuseWrites(false);
    expect((await ask(sources, storage, kept, NOW + WEEK + 3)).version).toBe(second.version);
  });
});

describe('the reader', () => {
  it('reads the kept file once per launch and version, and a pack it just fetched not at all', async () => {
    const random = seeded(34);
    const first = notedPack(random, 20);
    const server = serverOf(first);
    const storage = storageOf();
    const kept: Persisted = { version: '', checkedAt: 0 };
    const fetching = launch(server);
    expect(
      await withDataHost(() => fetching.sources.commentaryCounts([1, 1, ''], STORE, storage)),
    ).toEqual({ have: false, verses: [] });
    await ask(fetching.sources, storage, kept, NOW);
    const readsAfterFetch = storage.reads();
    for (const key of Object.keys(first.verses)) {
      const [book, chapter] = key.split('.').map(Number) as [number, number];
      expect(
        await withDataHost(() =>
          fetching.sources.commentaryRead([book, chapter, kept.version], STORE, storage),
        ),
      ).toEqual(readOf(first, book, chapter));
    }
    expect(storage.reads()).toBe(readsAfterFetch);

    const relaunched = launch(server);
    const before = storage.reads();
    await Promise.all(
      [1, 2, 3].map((chapter) =>
        withDataHost(() =>
          relaunched.sources.commentaryCounts([43, chapter, kept.version], STORE, storage),
        ),
      ),
    );
    expect(relaunched.reads()).toBe(1);
    expect(storage.reads()).toBe(before + 1);
  });

  it('reads no pack before a pack is kept, and answers a pack again once one lands', async () => {
    const storage = storageOf();
    const pack = notedPack(seeded(35), 10);
    const { sources } = launch(serverOf(pack));
    expect(await withDataHost(() => sources.commentaryRead([1, 1, 'x'], STORE, storage))).toEqual({
      have: false,
      verses: [],
    });
    const kept: Persisted = { version: '', checkedAt: 0 };
    await ask(sources, storage, kept, NOW);
    expect(
      (await withDataHost(() => sources.commentaryRead([1, 1, kept.version], STORE, storage))).have,
    ).toBe(true);
  });
});

describe('the line', () => {
  it("shows the plan's words, and the landed line for LANDED_MS, the contract's after", () => {
    expect(shownOf('', false, false, false)).toEqual({
      phase: 'none',
      version: '',
      line: WAITING_LINE,
      foot: GETTING_LINE,
      retry: false,
    });
    expect(shownOf('', true, true, false).phase).toBe('fetching');
    expect(shownOf('', false, true, false)).toEqual({
      phase: 'failed',
      version: '',
      line: WAITING_LINE,
      foot: '',
      retry: true,
    });
    for (const [busy, failed] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const)
      expect(shownOf('3-0000abcd', busy, failed, false)).toEqual({
        phase: 'ready',
        version: '3-0000abcd',
        line: '',
        foot: '',
        retry: false,
      });
    expect(shownOf('3-0000abcd', false, false, true).foot).toBe(LANDED_LINE);
    expect(appText('features/commentary.contract')).toContain(
      `after(${LANDED_MS}, commentaryLandedOver)`,
    );
  });
});

describe('the data host', () => {
  it('no commentary module reads the clock, draws a random number or arms a timer', () => {
    for (const path of ['pack.ts', 'step.ts', 'sources.ts'])
      expect(appText(`src/commentary/${path}`)).not.toMatch(
        /Date\.now|new Date\(|Math\.random|performance\.now|setTimeout|setInterval/u,
      );
  });
});
