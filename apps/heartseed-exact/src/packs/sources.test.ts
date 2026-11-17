/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary, effect/noNewPromise, effect/noGlobals, effect/noTryCatch, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the test awaits each answer in turn, as the host asks them, over a stand-in server (its held answer a Promise the test releases, a made-up pack's body written with `JSON.stringify`) and a storage that answers at once. */

/**
 * The one downloader's sources as Exact calls them, with the commentary
 * and a made-up second pack: each call starts inside `withDataHost`, on
 * the call's time alone, over a stand-in server and a storage like
 * Exact's. The base is egw.cvr.im unless a loopback fixture is named; a
 * first fetch lands a pack whole; a `304` keeps it; two asks at once make
 * one request a pack; a failed answer or write keeps what was there; one
 * pack failing does not keep another from landing, and the one status
 * counts what is missing; a relaunch reads the kept file; the reader reads
 * the file once per launch and version, and a pack just fetched not at all.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { appText } from '../../tools/commentary-fixture';
import { readOf, versionOf, type CommentaryPack } from '../commentary/pack';
import { COMMENTARY, commentarySources } from '../commentary/sources';
import { bodyOf, madePack } from '../test/commentary-packs';
import { seeded, type Random } from '../test/random';
import { sumOf } from '../text/sum';
import { LANDED_MS, landedLine, gettingLine, type PackWords } from './shown';
import { baseOf, PACKS_HOST, packSources, type PacksAnswer } from './sources';
import type { PackSpec } from './spec';
import { keptIn, WEEK, type Checked } from './step';

const NOW = Date.UTC(2026, 10, 16, 12);

/** Exact's store, which the downloader keeps nothing in. */
const STORE = { forget: () => {} };

/** A second, made-up pack: words, versioned by their count and sum. */
interface WordsPack {
  readonly version: string;
  readonly words: ReadonlyArray<string>;
}

const wordsPack = (words: ReadonlyArray<string>): WordsPack => ({
  version: versionOf(words.length, sumOf(words.join('\n'))),
  words,
});

const checkWords = (body: string): Checked<WordsPack> => {
  try {
    const pack = JSON.parse(body) as WordsPack;
    return Array.isArray(pack.words) &&
      pack.version === versionOf(pack.words.length, sumOf(pack.words.join('\n')))
      ? { _tag: 'Good', pack }
      : { _tag: 'Bad', fault: 'sum' };
  } catch {
    return { _tag: 'Bad', fault: 'json' };
  }
};

const WORDS: PackSpec<WordsPack> = {
  name: 'words',
  path: '/api/words/pack',
  file: 'app:/data/words.json',
  title: 'the words',
  noun: 'Words',
  waiting: 'The words are still on their way.',
  check: checkWords,
};

/** A made-up pack with at least one note, so a changed character has a note to change. */
const notedPack = (random: Random, most: number): CommentaryPack => {
  for (;;) {
    const pack = madePack(random, most);
    if (pack.count > 0) return pack;
  }
};

/** What the stand-in server does with the next request for a pack. */
type Reply = 'well' | 'refuse' | 'fail' | 'cut' | 'flip';

/** A server holding a body per path, answering each request by the next reply asked of that path (else `well`), and counting what it heard. */
const serverOf = (first: CommentaryPack, words = wordsPack(['alpha', 'beta'])) => {
  const bodies = new Map<string, { version: string; body: string }>();
  const publish = (pack: CommentaryPack) =>
    bodies.set(COMMENTARY.path, { version: pack.version, body: bodyOf(pack) });
  const publishWords = (pack: WordsPack) =>
    bodies.set(WORDS.path, { version: pack.version, body: JSON.stringify(pack) });
  publish(first);
  publishWords(words);
  const replies = new Map<string, Array<Reply>>();
  const heard: Array<{ url: string; tag: string }> = [];
  let held: Promise<void> = Promise.resolve();
  const fetcher = async (url: string, init: RequestInit) => {
    const tag = new Headers(init.headers).get('if-none-match') ?? '';
    heard.push({ url, tag });
    await held;
    const path = new URL(url).pathname;
    const reply = replies.get(path)?.shift() ?? 'well';
    const served = bodies.get(path);
    if (reply === 'refuse' || served === undefined) throw new TypeError('Network request failed');
    if (reply === 'fail') return { status: 500, text: async () => 'Internal error' };
    if (reply === 'well' && tag === `"${served.version}"`)
      return { status: 304, text: async () => '' };
    const { body } = served;
    if (reply === 'cut') return { status: 200, text: async () => body.slice(0, body.length >> 1) };
    if (reply === 'flip')
      return { status: 200, text: async () => body.replace('"notes":[["', '"notes":[["x') };
    return { status: 200, text: async () => body };
  };
  return {
    fetcher,
    heard,
    commentaryHeard: () => heard.filter((each) => each.url.endsWith(COMMENTARY.path)),
    next: (path: string, ...more: Array<Reply>) =>
      replies.set(path, [...(replies.get(path) ?? []), ...more]),
    publish,
    publishWords,
    hold: () => {
      let release = () => {};
      held = new Promise((resolve) => {
        release = resolve;
      });
      return () => release();
    },
  };
};

type Server = ReturnType<typeof serverOf>;

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

/** One launch: the downloader over `packs`, and the commentary's reader over it. */
const launch = (
  server: Server,
  packs: ReadonlyArray<PackSpec<CommentaryPack> | PackSpec<WordsPack>> = [COMMENTARY],
  setting = 'http://127.0.0.1:4801',
) => {
  const downloader = packSources({ setting, packs, fetcher: server.fetcher });
  return { ...downloader, reader: commentarySources(downloader) };
};

type Launch = ReturnType<typeof launch>;

/** What Contract persists: every pack's line. */
interface Persisted {
  kept: string;
}

/** A fetch call as Contract sends it, started inside the data host; Contract keeps its answer. */
const ask = async (
  launched: Launch,
  storage: Storage,
  persisted: Persisted,
  now: number,
  force = false,
): Promise<PacksAnswer> => {
  const answer = await withDataHost(() =>
    launched.sources.packsAsk([persisted.kept, force, now], STORE, storage),
  );
  persisted.kept = answer.kept;
  return answer;
};

const kept = (persisted: Persisted, name = 'commentary') => keptIn(persisted.kept, name);

const fileText = (storage: Storage, file = COMMENTARY.file) => {
  const bytes = storage.files.get(file);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
};

describe('the base', () => {
  it('is egw.cvr.im unless a loopback fixture is named', () => {
    expect(baseOf('')).toBe(PACKS_HOST);
    expect(baseOf('https://example.com')).toBe(PACKS_HOST);
    expect(baseOf('http://127.0.0.1:4801/x')).toBe(PACKS_HOST);
    expect(baseOf('http://127.0.0.1:4801')).toBe('http://127.0.0.1:4801');
    expect(packSources({ setting: '', packs: [COMMENTARY] }).sources.packsBase()).toEqual({
      base: PACKS_HOST,
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
    const persisted: Persisted = { kept: '' };
    const answer = await ask(launch(server), storage, persisted, NOW);
    expect(answer).toEqual({
      kept: `commentary ${first.version} ${NOW}`,
      failed: false,
      landed: 'commentary',
    });
    expect(fileText(storage)).toBe(bodyOf(first));
    expect(server.heard).toEqual([{ url: 'http://127.0.0.1:4801/api/commentary/pack', tag: '' }]);

    const again = await ask(launch(server), storage, persisted, NOW + 6 * 24 * 3600 * 1000);
    expect(again).toEqual({ kept: answer.kept, failed: false, landed: '' });
    expect(server.heard.length).toBe(1);

    const week = NOW + WEEK + 1;
    await ask(launch(server), storage, persisted, week);
    expect(kept(persisted)).toEqual({ version: first.version, checkedAt: week });
    expect(server.heard.at(-1)).toEqual({ url: expect.any(String), tag: `"${first.version}"` });
    expect(fileText(storage)).toBe(bodyOf(first));

    const second = notedPack(random, 20);
    server.publish(second);
    const answered = await ask(launch(server), storage, persisted, week + WEEK + 1, true);
    expect(kept(persisted).version).toBe(second.version);
    expect(answered.landed).toBe('');
    expect(fileText(storage)).toBe(bodyOf(second));
  });

  it('makes one request a pack for asks at once, and every ask hears its answer', async () => {
    const pack = notedPack(seeded(32), 10);
    const server = serverOf(pack);
    const storage = storageOf();
    const launched = launch(server, [COMMENTARY, WORDS]);
    const release = server.hold();
    const asks = [
      ask(launched, storage, { kept: '' }, NOW),
      ask(launched, storage, { kept: '' }, NOW, true),
      ask(launched, storage, { kept: '' }, NOW),
    ];
    await Promise.resolve();
    release();
    const answers = await Promise.all(asks);
    expect(server.heard.length).toBe(2);
    for (const answer of answers) {
      expect(keptIn(answer.kept, 'commentary').version).toBe(pack.version);
      expect(keptIn(answer.kept, 'words').version).not.toBe('');
    }
  });

  it('keeps what was there when an answer fails or a write is refused, and the next ask fetches', async () => {
    const random = seeded(33);
    const first = notedPack(random, 10);
    const server = serverOf(first);
    for (const reply of ['refuse', 'fail', 'cut', 'flip'] as const) {
      const storage = storageOf();
      const launched = launch(server);
      const persisted: Persisted = { kept: '' };
      server.next(COMMENTARY.path, reply);
      expect(await ask(launched, storage, persisted, NOW)).toEqual({
        kept: '',
        failed: true,
        landed: '',
      });
      expect(storage.files.size).toBe(0);
      await ask(launched, storage, persisted, NOW);
      expect(kept(persisted).version).toBe(first.version);
    }

    const storage = storageOf();
    const persisted: Persisted = { kept: '' };
    await ask(launch(server), storage, persisted, NOW);
    const second = notedPack(random, 10);
    server.publish(second);
    const launched = launch(server);
    server.next(COMMENTARY.path, 'cut');
    const failed = await ask(launched, storage, persisted, NOW + WEEK + 1);
    expect(failed).toEqual({
      kept: `commentary ${first.version} ${NOW}`,
      failed: true,
      landed: '',
    });
    expect(fileText(storage)).toBe(bodyOf(first));
    expect(
      await withDataHost(() =>
        launched.reader.commentaryRead([1, 1, first.version], STORE, storage),
      ),
    ).toEqual(readOf(first, 1, 1));
    storage.refuseWrites(true);
    expect((await ask(launched, storage, persisted, NOW + WEEK + 2)).failed).toBe(true);
    expect(fileText(storage)).toBe(bodyOf(first));
    storage.refuseWrites(false);
    await ask(launched, storage, persisted, NOW + WEEK + 3);
    expect(kept(persisted).version).toBe(second.version);
  });
});

describe('every pack in one go', () => {
  it('lands what it can when one pack fails, says one status for what is missing, and the next ask fetches only that', async () => {
    const random = seeded(36);
    const first = notedPack(random, 10);
    const words = wordsPack(['alpha', 'beta', 'gamma']);
    const server = serverOf(first, words);
    const storage = storageOf();
    const launched = launch(server, [COMMENTARY, WORDS]);
    const persisted: Persisted = { kept: '' };
    const view = (busy: boolean, failed: boolean, landed: string) =>
      launched.sources.packsView([persisted.kept, busy, failed, landed]);

    expect(view(false, false, '')).toEqual({
      phase: 'none',
      missing: 2,
      foot: "Getting Ellen White's commentary and the words…",
      retry: false,
    });
    server.next(WORDS.path, 'cut');
    const partial = await ask(launched, storage, persisted, NOW);
    expect(partial.failed).toBe(true);
    expect(partial.landed).toBe('commentary');
    expect(kept(persisted).version).toBe(first.version);
    expect(kept(persisted, 'words').version).toBe('');
    expect(storage.files.has(WORDS.file)).toBe(false);
    expect(view(false, true, partial.landed)).toEqual({
      phase: 'failed',
      missing: 1,
      foot: '',
      retry: true,
    });
    expect(view(true, true, '')).toEqual({
      phase: 'fetching',
      missing: 1,
      foot: 'Getting the words…',
      retry: false,
    });
    expect(launched.sources.packView(['commentary', persisted.kept, false, true])).toEqual({
      phase: 'ready',
      version: first.version,
      line: '',
      retry: false,
    });
    expect(launched.sources.packView(['words', persisted.kept, false, true])).toEqual({
      phase: 'failed',
      version: '',
      line: WORDS.waiting,
      retry: true,
    });

    const before = server.heard.length;
    const retried = await ask(launched, storage, persisted, NOW + 1000, true);
    expect(server.heard.slice(before).map((each) => new URL(each.url).pathname)).toEqual([
      COMMENTARY.path,
      WORDS.path,
    ]);
    expect(server.heard.at(-2)?.tag).toBe(`"${first.version}"`);
    expect(retried).toEqual({
      kept: `commentary ${first.version} ${NOW + 1000}\nwords ${words.version} ${NOW + 1000}`,
      failed: false,
      landed: 'words',
    });
    expect(view(false, false, retried.landed)).toEqual({
      phase: 'ready',
      missing: 0,
      foot: 'Words is on this phone now.',
      retry: false,
    });
    expect(view(false, false, '').foot).toBe('');
  });

  it('offline at the first launch: every pack missing, nothing written, and Try again lands them all', async () => {
    const first = notedPack(seeded(37), 10);
    const server = serverOf(first);
    const storage = storageOf();
    const launched = launch(server, [COMMENTARY, WORDS]);
    const persisted: Persisted = { kept: '' };
    server.next(COMMENTARY.path, 'refuse');
    server.next(WORDS.path, 'refuse');
    expect(await ask(launched, storage, persisted, NOW)).toEqual({
      kept: '',
      failed: true,
      landed: '',
    });
    expect(storage.files.size).toBe(0);
    expect(launched.sources.packsView([persisted.kept, false, true, ''])).toEqual({
      phase: 'failed',
      missing: 2,
      foot: '',
      retry: true,
    });
    expect(
      await withDataHost(() => launched.reader.commentaryCounts([43, 1, ''], STORE, storage)),
    ).toEqual({ have: false, verses: [] });
    const landed = await ask(launched, storage, persisted, NOW, true);
    expect(landed.landed).toBe('commentary words');
    expect(launched.sources.packsView([persisted.kept, false, false, landed.landed]).foot).toBe(
      'Commentary and Words are on this phone now.',
    );
  });
});

describe('the reader', () => {
  it('reads the kept file once per launch and version, and a pack it just fetched not at all', async () => {
    const random = seeded(34);
    const first = notedPack(random, 20);
    const server = serverOf(first);
    const storage = storageOf();
    const persisted: Persisted = { kept: '' };
    const fetching = launch(server);
    expect(
      await withDataHost(() => fetching.reader.commentaryCounts([1, 1, ''], STORE, storage)),
    ).toEqual({ have: false, verses: [] });
    await ask(fetching, storage, persisted, NOW);
    const mark = kept(persisted).version;
    const readsAfterFetch = storage.reads();
    for (const key of Object.keys(first.verses)) {
      const [book, chapter] = key.split('.').map(Number) as [number, number];
      expect(
        await withDataHost(() =>
          fetching.reader.commentaryRead([book, chapter, mark], STORE, storage),
        ),
      ).toEqual(readOf(first, book, chapter));
    }
    expect(storage.reads()).toBe(readsAfterFetch);

    const relaunched = launch(server);
    const before = storage.reads();
    await Promise.all(
      [1, 2, 3].map((chapter) =>
        withDataHost(() => relaunched.reader.commentaryCounts([43, chapter, mark], STORE, storage)),
      ),
    );
    expect(relaunched.reads('commentary')).toBe(1);
    expect(storage.reads()).toBe(before + 1);
  });

  it('reads no pack before a pack is kept, and answers a pack again once one lands', async () => {
    const storage = storageOf();
    const pack = notedPack(seeded(35), 10);
    const launched = launch(serverOf(pack));
    expect(
      await withDataHost(() => launched.reader.commentaryRead([1, 1, 'x'], STORE, storage)),
    ).toEqual({ have: false, verses: [] });
    const persisted: Persisted = { kept: '' };
    await ask(launched, storage, persisted, NOW);
    expect(
      (
        await withDataHost(() =>
          launched.reader.commentaryRead([1, 1, kept(persisted).version], STORE, storage),
        )
      ).have,
    ).toBe(true);
  });
});

describe('the line', () => {
  it("shows the plan's words for the commentary, and the landed line for LANDED_MS, the contract's after", () => {
    const words: ReadonlyArray<PackWords> = [COMMENTARY];
    expect(gettingLine(words)).toBe("Getting Ellen White's commentary…");
    expect(landedLine(words)).toBe('Commentary is on this phone now.');
    expect(COMMENTARY.waiting).toBe(
      'The commentary is still on its way. It needs a connection once, then it works offline.',
    );
    const { sources } = packSources({ setting: '', packs: [COMMENTARY] });
    expect(sources.packsView(['', false, false, ''])).toEqual({
      phase: 'none',
      missing: 1,
      foot: "Getting Ellen White's commentary…",
      retry: false,
    });
    for (const [busy, failed] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      expect(sources.packsView(['commentary 3-0000abcd 5', busy, failed, ''])).toEqual({
        phase: 'ready',
        missing: 0,
        foot: '',
        retry: false,
      });
      expect(sources.packView(['commentary', 'commentary 3-0000abcd 5', busy, failed])).toEqual({
        phase: 'ready',
        version: '3-0000abcd',
        line: '',
        retry: false,
      });
    }
    expect(appText('features/packs.contract')).toContain(`after(${LANDED_MS}, packsLandedOver)`);
  });
});

describe('the data host', () => {
  it('no pack module reads the clock, draws a random number or arms a timer', () => {
    for (const path of [
      'packs/step.ts',
      'packs/shown.ts',
      'packs/spec.ts',
      'packs/sources.ts',
      'commentary/pack.ts',
      'commentary/sources.ts',
    ])
      expect(appText(`src/${path}`)).not.toMatch(
        /Date\.now|new Date\(|Math\.random|performance\.now|setTimeout|setInterval/u,
      );
  });
});
