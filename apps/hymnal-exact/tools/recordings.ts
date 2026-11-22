/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noRuntimeTypeof, node/no-process-env -- a host script that reads its port from `PORT`, as Exact starts an app's server, and names its checkout's own port from its real directory: Bun's own server, the stand-in for the recordings' bucket that `test`, `verify` and the drives start (app.json's `commands.server`, `tools/drive-player.ts`); it never runs in the data module. */

/**
 * The recordings' bucket, as a test meets it: `GET` and `HEAD` of
 * `/audio/<set>/sdah/<n>.mp3`, with byte ranges as the bucket answers them,
 * on `127.0.0.1:$PORT` (the checkout's own port by default). Two
 * generated recordings stand in for every hymn's: a short one of
 * `SHORT_SECONDS`, and for hymn `LONG_HYMN` one as long as its timing
 * (`LONG_SECONDS`), so a stanza choice has lines to cut. Both are digital
 * silence (every sample at rest), so nothing a test plays can sound. Hymn
 * `MISSING_HYMN` has no recording: 404, as the bucket answers a key it
 * does not hold; so has every hymn's recording a semitone down
 * (`REFUSED_SET`), for the player's fall back to the printed key; every
 * other key's set is served as the printed one. Hymn `SLOW_HYMN`'s is
 * served late. `bun tools/recordings.ts --port` prints this checkout's
 * own port (`checkoutPort`), the one its drives use.
 */

import { join } from 'node:path';

import { checkoutPort as portOf } from '@manna/exact-kit/port';

export const SHORT_SECONDS = 6;
export const LONG_HYMN = 2;
export const LONG_SECONDS = 240;
export const MISSING_HYMN = 13;
/** The key set the fixture holds none of: a semitone down from the first set (`keySet('warm-1', -1)`). */
export const REFUSED_SET = 'warm-1-down1';
/** Hymn `SLOW_HYMN`'s recording is served `SLOW_MS` late, so a test sees the player wait on its load (player.test.contract). */
export const SLOW_HYMN = 4;
export const SLOW_MS = 3000;

const RATE = 8000;

/**
 * A mono 8-bit PCM WAV of `seconds` of silence: its header's fields in
 * order (a chunk name, or a little-endian number of 2 or 4 bytes), then
 * every sample at rest (0x80, the middle of an unsigned byte).
 */
export const silence = (seconds: number): Uint8Array => {
  const samples = RATE * seconds;
  const header: ReadonlyArray<string | readonly [number, 2 | 4]> = [
    'RIFF',
    [36 + samples, 4],
    'WAVEfmt ',
    [16, 4],
    [1, 2],
    [1, 2],
    [RATE, 4],
    [RATE, 4],
    [1, 2],
    [8, 2],
    'data',
    [samples, 4],
  ];
  const head = header.flatMap((field) =>
    typeof field === 'string'
      ? [...field].map((char) => char.charCodeAt(0))
      : Array.from({ length: field[1] }, (_, byte) => (field[0] >>> (8 * byte)) & 0xff),
  );
  const bytes = new Uint8Array(head.length + samples).fill(0x80);
  bytes.set(head);
  return bytes;
};

const short = silence(SHORT_SECONDS);
const long = silence(LONG_SECONDS);

/** The hymn a key names, when it is a recording's key of a set the fixture holds. */
const hymnOf = (path: string): number | undefined => {
  const found = /^\/audio\/([a-z0-9-]+)\/sdah\/([1-9]\d*)\.mp3$/u.exec(path);
  return found === null || found[1] === REFUSED_SET ? undefined : Number(found[2]);
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'range',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges',
};

/** The answer to `request` for `body`, a byte range of it when the request asks one. */
const served = (request: Request, body: Uint8Array): Response => {
  const headers = { ...CORS, 'content-type': 'audio/wav', 'accept-ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/u.exec(request.headers.get('range') ?? '');
  if (range === null)
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...headers, 'content-length': `${body.length}` },
    });
  const last = body.length - 1;
  const from = range[1] === '' ? Math.max(0, body.length - Number(range[2])) : Number(range[1]);
  const to = range[2] === '' || range[1] === '' ? last : Math.min(Number(range[2]), last);
  if (from > to || from > last)
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'content-range': `bytes */${body.length}` },
    });
  const part = body.subarray(from, to + 1);
  return new Response(request.method === 'HEAD' ? null : part, {
    status: 206,
    headers: {
      ...headers,
      'content-length': `${part.length}`,
      'content-range': `bytes ${from}-${to}/${body.length}`,
    },
  });
};

/** The fixture's answer to `request`. */
export const answer = (request: Request): Response => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const hymn = hymnOf(new URL(request.url).pathname);
  if (hymn === undefined || hymn === MISSING_HYMN || hymn > 695)
    return new Response('not found', { status: 404, headers: CORS });
  return served(request, hymn === LONG_HYMN ? long : short);
};

/** The server's answer to `request`: the fixture's, `SLOW_MS` late for hymn `SLOW_HYMN`. */
const late = (request: Request): Response | Promise<Response> =>
  hymnOf(new URL(request.url).pathname) === SLOW_HYMN
    ? Bun.sleep(SLOW_MS).then(() => answer(request))
    : answer(request);

/**
 * This checkout's own fixture port, in 4790–5789 as Exact gives a declared
 * fixture's (one per real app directory, `@manna/exact-kit/port`'s
 * `checkoutPort`), so the runs of two checkouts never meet on one port;
 * `bun run exact` names its origin in `HYMNAL_RECORDINGS` for `test`,
 * `verify` and `agent`, and the build's keyed grant for 4797 moves to it,
 * as a development build moves a loopback grant.
 */
export const checkoutPort = (): number => portOf(join(import.meta.dir, '..'));

if (import.meta.main && process.argv.includes('--port')) console.log(checkoutPort());
else if (import.meta.main) {
  const port = Number(process.env.PORT ?? checkoutPort());
  Bun.serve({ hostname: '127.0.0.1', port, fetch: late });
  console.log(`[recordings] listening port=${port}`);
}
