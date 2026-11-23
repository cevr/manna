/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, node/no-process-env -- a host script: Bun's own server standing in for egw.cvr.im's commentary pack, on this checkout's own port (read from `PORT`, as a drive starts it), steered by the drive's own JSON; it never runs in the data module. */

/**
 * egw.cvr.im's `GET /api/commentary/pack` as a drive meets it, on
 * `127.0.0.1:$PORT`: a made-up pack (no commentary's text) with its
 * `ETag`, and `304` for an `If-None-Match` naming its version; and its
 * `GET /api/study/<name>`, the study packs built from the assets, always
 * well (`studyServed`), so every pack the app asks for lands. The drive
 * steers it over `POST /fixture` (`{ "pack": "first"|"relinked"|"second", "reply":
 * "well"|"fail"|"cut"|"sum", "times": n, "holdMs": n }`: which pack it
 * serves, how answers go wrong (a `500`, a body cut short, or one with a
 * changed character) and for how many before it answers well again (0 for
 * all), and how long each answer is held), and reads what it heard at
 * `GET /fixture/heard`. Refused is the server stopped. `bun
 * tools/commentary-fixture.ts --port` prints this checkout's own port.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import type { CommentaryPack } from '../src/commentary/pack';

const app = join(import.meta.dir, '..');

/** A file of the app, by its path from the app's folder (the commentary's tests read the sources' text). */
export const appText = (path: string): string => readFileSync(join(app, path), 'utf8');

/**
 * This checkout's own fixture port, in 4790–5789 by its real directory, as
 * the hymnal's `checkoutPort` and Exact's declared fixtures choose one, so
 * the drives of two checkouts never meet on a port.
 */
export const checkoutPort = (): number =>
  4790 +
  (Number.parseInt(
    new Bun.CryptoHasher('sha256').update(realpathSync(app)).digest('hex').slice(0, 8),
    16,
  ) %
    1000);

/** The two packs the fixture serves, and a pack's body as sent. */
export interface FixturePacks {
  readonly first: CommentaryPack;
  /** `first` with its verse 14 note moved to verse 15, the notes the same. */
  readonly relinked: CommentaryPack;
  readonly second: CommentaryPack;
  readonly bodyOf: (pack: CommentaryPack) => string;
}

/** The tests' preload (`setup.ts`), which the pack's sum reaches through the text module, and the modules loaded after it. */
const loadPreload = () => import('./setup');
const loadPacks = () => import('../src/test/commentary-packs');
const loadRandom = () => import('../src/test/random');

/**
 * The fixture's two made-up packs, John 1 noted in each: under the chapter
 * (verse 0), verse 1, and verse 14 (one note in the first, three in the
 * second).
 */
export const fixturePacks = async (): Promise<FixturePacks> => {
  await loadPreload();
  const { bodyOf, madePack, packOf } = await loadPacks();
  const { seeded } = await loadRandom();
  const packFor = (seed: number, extra: number, last = 14): CommentaryPack => {
    const made = madePack(seeded(seed), 30);
    const notes = [
      ...made.notes,
      ...Array.from(
        { length: 3 + extra },
        (_, index) => [`5BC ${1100 + index}.1`, `ka lo mi ${seed} ${index}`] as const,
      ),
    ];
    const first = made.count;
    return packOf(notes, {
      ...made.verses,
      '43.1': [
        [0, [first]],
        [1, [first + 1]],
        [last, Array.from({ length: 1 + extra }, (_, index) => first + 2 + index)],
      ],
    });
  };
  return { first: packFor(41, 0), relinked: packFor(41, 0, 15), second: packFor(42, 2), bodyOf };
};

/** A study pack as the fixture serves it. */
interface StudyServed {
  readonly version: string;
  readonly body: string;
}

/**
 * The study packs egw.cvr.im serves at `/api/study/<name>`, built as
 * `tools/study.ts` builds them but from the assets `bible.db` is built from,
 * so every checkout can serve them: always well, `304` for their version.
 */
const studyServed = async (): Promise<Record<string, StudyServed>> => {
  await loadPreload();
  const { assetSource, studyBodies } = await import('./study');
  const { buildStudy } = await import('../src/study/build');
  const { corpus } = await import('./kjv');
  return Object.fromEntries(
    studyBodies(buildStudy(assetSource()), corpus()).map(({ name, version, body }) => [
      name,
      { version, body },
    ]),
  );
};

/** How the fixture answers now. */
interface Mode {
  pack: 'first' | 'relinked' | 'second';
  reply: 'well' | 'fail' | 'cut' | 'sum';
  /** How many answers go wrong before the fixture answers well again; 0 for every one. */
  times: number;
  holdMs: number;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'if-none-match, content-type',
  'access-control-expose-headers': 'etag',
};

/** A fixture over `packs`: its answer to a request, and what it heard. */
const fixture = (packs: FixturePacks) => {
  const mode: Mode = { pack: 'first', reply: 'well', times: 0, holdMs: 0 };
  const heard: Array<{ tag: string }> = [];
  const studyBodies = studyServed();

  /** This answer's reply: the mode's, counted down to `well` when it is for a number of times. */
  const replyNow = () => {
    const reply = mode.reply;
    if (reply !== 'well' && mode.times > 0) {
      mode.times--;
      if (mode.times === 0) mode.reply = 'well';
    }
    return reply;
  };

  const pack = async (request: Request): Promise<Response> => {
    const served = packs[mode.pack];
    const tag = request.headers.get('if-none-match') ?? '';
    heard.push({ tag });
    const reply = replyNow();
    if (mode.holdMs > 0) await Bun.sleep(mode.holdMs);
    const head = { ...CORS, etag: `"${served.version}"`, 'cache-control': 'public, max-age=3600' };
    if (reply === 'fail') return new Response('Internal error', { status: 500, headers: CORS });
    if (reply === 'well' && tag === `"${served.version}"`)
      return new Response(null, { status: 304, headers: head });
    const body = packs.bodyOf(served);
    const json = { ...head, 'content-type': 'application/json' };
    if (reply === 'cut') return new Response(body.slice(0, body.length >> 1), { headers: json });
    if (reply === 'sum')
      return new Response(body.replace('"notes":[["', '"notes":[["x'), { headers: json });
    return new Response(body, { headers: json });
  };

  const study = async (request: Request, name: string): Promise<Response> => {
    const served = (await studyBodies)[name];
    if (served === undefined) return new Response('not found', { status: 404, headers: CORS });
    const head = { ...CORS, etag: `"${served.version}"`, 'cache-control': 'public, max-age=3600' };
    if (request.headers.get('if-none-match') === `"${served.version}"`)
      return new Response(null, { status: 304, headers: head });
    return new Response(served.body, { headers: { ...head, 'content-type': 'application/json' } });
  };

  const answer = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (path === '/api/commentary/pack' && request.method === 'GET') return pack(request);
    if (path.startsWith('/api/study/') && request.method === 'GET')
      return study(request, path.slice('/api/study/'.length));
    if (path === '/fixture' && request.method === 'POST') {
      Object.assign(mode, (await request.json()) as Partial<Mode>);
      return Response.json(mode);
    }
    if (path === '/fixture/heard') return Response.json(heard);
    return new Response('not found', { status: 404, headers: CORS });
  };

  return answer;
};

if (import.meta.main && process.argv.includes('--port')) console.log(checkoutPort());
else if (import.meta.main) {
  const port = Number(process.env['PORT'] ?? checkoutPort());
  Bun.serve({ hostname: '127.0.0.1', port, fetch: fixture(await fixturePacks()) });
  console.log(`[commentary-fixture] listening port=${port}`);
}
