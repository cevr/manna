/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noTernary, node/no-process-env -- a host script: Bun's own server over the built folder, by the host's one rule (`src/web/served.ts`); it never runs in the data module. */

/**
 * The built site (`bun run build:web`, `dist/`) served as plain files by
 * the one rule a host must have (`servedFor`): a file at the path, else its
 * folder's `index.html`, else `404.html` with status 404. HTML is sent
 * `no-cache`; a file whose name carries its digest (`name-<hash>.js`)
 * `immutable` for a year; every other file `no-cache` with an ETag, so a
 * warm load revalidates it. A body is sent brotli or gzip compressed when
 * the request accepts it, as a host compresses. `bun tools/web/serve.ts
 * [dir] [--port n]` listens on 127.0.0.1 (the app's port, 8766, unless
 * `--port` or `PORT` names another).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { isPublic, servedFor } from '../../src/web/served.ts';

const TYPES = new Map(
  Object.entries({
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json',
    plan: 'application/octet-stream',
    txt: 'text/plain; charset=utf-8',
    wasm: 'application/wasm',
    svg: 'image/svg+xml',
    png: 'image/png',
  }),
);
const COMPRESSED = new Set(['html', 'js', 'css', 'json', 'plan', 'txt', 'svg', 'wasm']);

/** Every public file under `dir`, relative to it. */
export const filesOf = (dir: string): Set<string> =>
  new Set(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
      .filter(isPublic),
  );

/**
 * The cache rule of `file`: HTML and undigested files revalidate; a digest
 * in the name keeps for a year. The bundler's digest is eight base64url
 * characters, `-` and `_` among them (`presence-glue-AGqduZL-.js`).
 */
export const cacheOf = (file: string): string =>
  /-[A-Za-z0-9_-]{8}\.(js|css|wasm)$/u.test(file)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

/** A server of `dir` on `port`; its `stop` ends it. */
export const serveBuilt = (dir: string, port: number) => {
  const files = filesOf(dir);
  const bodies = new Map<
    string,
    {
      raw: Uint8Array<ArrayBuffer>;
      br: Uint8Array<ArrayBuffer>;
      gzip: Uint8Array<ArrayBuffer>;
      tag: string;
    }
  >();
  const bodyOf = (file: string) => {
    const kept = bodies.get(file);
    if (kept) return kept;
    const raw = new Uint8Array(readFileSync(join(dir, file)));
    const body = {
      raw,
      br: brotliCompressSync(raw),
      gzip: gzipSync(raw, { level: 9 }),
      tag: `"${new Bun.CryptoHasher('sha256').update(raw).digest('hex').slice(0, 16)}"`,
    };
    bodies.set(file, body);
    return body;
  };
  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    fetch: (request) => {
      const { file, status } = servedFor(files, new URL(request.url).pathname);
      const kind = file.split('.').at(-1) ?? '';
      const body = bodyOf(file);
      const headers = new Headers({
        'content-type': TYPES.get(kind) ?? 'application/octet-stream',
        'cache-control': cacheOf(file),
        etag: body.tag,
        vary: 'accept-encoding',
      });
      if (status === 200 && request.headers.get('if-none-match') === body.tag)
        return new Response(null, { status: 304, headers });
      const accepts = request.headers.get('accept-encoding') ?? '';
      const encoding = !COMPRESSED.has(kind)
        ? ''
        : accepts.includes('br')
          ? 'br'
          : accepts.includes('gzip')
            ? 'gzip'
            : '';
      if (encoding !== '') headers.set('content-encoding', encoding);
      const sent = encoding === 'br' ? body.br : encoding === 'gzip' ? body.gzip : body.raw;
      return new Response(request.method === 'HEAD' ? null : sent, { status, headers });
    },
  });
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--port');
  const port = Number(at >= 0 ? args[at + 1] : (process.env['PORT'] ?? 8766));
  const dir = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--port') ?? 'dist';
  const server = serveBuilt(join(process.cwd(), dir), port);
  console.log(`[web] serving dir=${dir} url=http://127.0.0.1:${server.port}/`);
}
