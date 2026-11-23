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
 * served late. A test steers it with `POST /control` (`controlled`): it
 * reads how often a recording was fetched, and refuses or cuts off a hymn's
 * recording until it is mended (downloads.test.contract). `bun
 * tools/recordings.ts --port` prints this checkout's own port
 * (`checkoutPort`), the one its drives use.
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
export const silence = (seconds: number): Uint8Array<ArrayBuffer> => {
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
const served = (request: Request, body: Uint8Array<ArrayBuffer>): Response => {
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

/**
 * What a test has asked of the fixture for this run (`POST /control`, the
 * contract test's `request` step): each recording's `GET`s counted by path,
 * and the hymns whose recording is refused (503) or cut off mid-body.
 */
export interface Control {
  readonly asked: Map<string, number>;
  /** The counts at the last `mark`: a count is of the `GET`s since. */
  readonly marked: Map<string, number>;
  readonly refused: Set<number>;
  readonly cut: Set<number>;
}

export const controlOf = (): Control => ({
  asked: new Map(),
  marked: new Map(),
  refused: new Set(),
  cut: new Set(),
});

/** A body that sends its first half, then breaks off, as a dropped connection does. */
const cutOff = (body: Uint8Array<ArrayBuffer>): Response =>
  new Response(
    new ReadableStream({
      start: (stream) => {
        stream.enqueue(body.subarray(0, Math.floor(body.length / 2)));
        stream.error('the connection dropped');
      },
    }),
    { headers: { ...CORS, 'content-type': 'audio/wav', 'content-length': `${body.length}` } },
  );

/** A control request's body: what to count or change, by the hymn or the path. */
export interface Ask {
  readonly action?: string;
  readonly hymn?: number;
  readonly path?: string;
  readonly is?: number;
}

/**
 * `POST /control`: `{"action": "count", "path": "/audio/…", "is": n}`
 * answers 200 when that path's `GET`s since the last `mark` number `n` and
 * 409 naming the count when not; `refuse` and `cut` make `hymn`'s next answers a 503 or a body
 * broken off halfway, and `mend` serves it whole again.
 */
const controlled = (request: Request, control: Control): Promise<Response> =>
  request.json().then((ask: Ask) => obeyed(ask, control));

/** What one control request does to the fixture, and its answer. */
const obeyed = (ask: Ask, control: Control): Response => {
  const hymn = ask.hymn ?? 0;
  if (ask.action === 'count') {
    const path = ask.path ?? '';
    const count = (control.asked.get(path) ?? 0) - (control.marked.get(path) ?? 0);
    return new Response(`${count}`, { status: count === ask.is ? 200 : 409, headers: CORS });
  }
  if (ask.action === 'mark') {
    control.marked.clear();
    for (const [path, count] of control.asked) control.marked.set(path, count);
    return new Response('ok', { headers: CORS });
  }
  if (ask.action === 'refuse') control.refused.add(hymn);
  else if (ask.action === 'cut') control.cut.add(hymn);
  else if (ask.action === 'mend') {
    control.refused.delete(hymn);
    control.cut.delete(hymn);
  } else return new Response('unknown action', { status: 400, headers: CORS });
  return new Response('ok', { headers: CORS });
};

/** The fixture's answer to `request`, under what the test asked of it. */
export const answer = (request: Request, control: Control = controlOf()): Response => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const { pathname } = new URL(request.url);
  const hymn = hymnOf(pathname);
  if (request.method === 'GET') control.asked.set(pathname, (control.asked.get(pathname) ?? 0) + 1);
  if (hymn === undefined || hymn === MISSING_HYMN || hymn > 695)
    return new Response('not found', { status: 404, headers: CORS });
  if (control.refused.has(hymn)) return new Response('unavailable', { status: 503, headers: CORS });
  const body = hymn === LONG_HYMN ? long : short;
  if (control.cut.has(hymn) && request.method === 'GET' && request.headers.get('range') === null)
    return cutOff(body);
  return served(request, body);
};

/** The server's answer to `request`: the control's, else the fixture's, `SLOW_MS` late for hymn `SLOW_HYMN`. */
export const serverOf =
  (control: Control = controlOf()) =>
  (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/control' && request.method === 'POST') return controlled(request, control);
    return hymnOf(pathname) === SLOW_HYMN
      ? Bun.sleep(SLOW_MS).then(() => answer(request, control))
      : answer(request, control);
  };

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
  const port = Number(process.env['PORT'] ?? checkoutPort());
  Bun.serve({ hostname: '127.0.0.1', port, fetch: serverOf() });
  console.log(`[recordings] listening port=${port}`);
}
