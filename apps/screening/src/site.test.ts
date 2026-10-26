/**
 * The site at its two seams: what publishing a version plans to write
 * (`publication`), and what the Worker answers over the bucket once it is
 * written (`respond`). The bucket is a map here; a test publishes into it
 * the way the publisher does (the files, then the texts) and asks for pages
 * and files over HTTP.
 */
import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';

import { FilmManifestJson, type FilmManifest, type VersionName } from './manifest.ts';
import { type Material, type MaterialFile, publication, sitePages } from './publish.ts';
import { respond, type Shelf } from './respond.ts';

/** A gathered file whose bytes are `text`: its sha256 is the hash of those bytes. */
const fileOf = (name: string, text: string, ext: MaterialFile['ext']): MaterialFile => {
  const bytes = new TextEncoder().encode(text);
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  BYTES.set(name, bytes);
  return { file: name, sha256, bytes: bytes.length, ext };
};

/** The gathered files' bytes, by their path here. */
const BYTES = new Map<string, Uint8Array>();

const material = (
  film: string,
  version: VersionName,
  at: string,
  seed: string,
  panels: ReadonlyArray<string> = [],
): Material => ({
  film,
  title: `Title of ${film}`,
  version,
  at,
  day: at.slice(0, 10),
  video: fileOf(`/here/${film}-${version}-${seed}.mp4`, `video ${film} ${version} ${seed}`, 'mp4'),
  poster: fileOf(
    `/here/${film}-${version}-${seed}.jpg`,
    `poster ${film} ${version} ${seed}`,
    'jpg',
  ),
  panels: panels.map((beat) => ({
    beat,
    image: fileOf(`/here/${film}-${beat}-${seed}.jpg`, `panel ${beat} ${seed}`, 'jpg'),
  })),
});

/** A bucket in memory, written as the publisher writes it. */
const bucket = () => {
  const objects = new Map<string, Uint8Array>();
  const decode = Schema.decodeUnknownSync(FilmManifestJson);
  const manifests = (): ReadonlyArray<FilmManifest> =>
    [...objects.entries()]
      .filter(([key]) => key.endsWith('/manifest.json'))
      .map(([, bytes]) => decode(new TextDecoder().decode(bytes)));
  const publish = (each: Material) => {
    const plan = publication(manifests(), each);
    for (const upload of plan.uploads)
      objects.set(upload.key, BYTES.get(upload.file) ?? new Uint8Array());
    for (const text of plan.texts) objects.set(text.key, new TextEncoder().encode(text.text));
    return plan;
  };
  const shelf: Shelf = {
    head: (key) =>
      Effect.succeed(
        Option.map(Option.fromNullishOr(objects.get(key)), (bytes) => ({
          size: bytes.length,
          etag: `"${key}"`,
        })),
      ),
    get: (key, span) =>
      Effect.succeed(
        Option.map(Option.fromNullishOr(objects.get(key)), (bytes) => ({
          head: { size: bytes.length, etag: `"${key}"` },
          body: Option.match(span, {
            onNone: () => bytes,
            onSome: ({ offset, length }) => bytes.slice(offset, offset + length),
          }),
        })),
      ),
  };
  return { objects, manifests, publish, shelf };
};

const ask = (
  shelf: Shelf,
  path: string,
  init: { readonly method?: string; readonly headers?: Record<string, string> } = {},
) =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(
      new Request(`https://films.test${path}`, {
        method: init.method ?? 'GET',
        headers: init.headers,
      }),
    );
    const response = HttpServerResponse.toWeb(yield* respond(shelf, request));
    const body = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()));
    return {
      status: response.status,
      headers: response.headers,
      body,
      text: new TextDecoder().decode(body),
    };
  });

/** The film links a page lists, in its order. */
const links = (html: string, pattern: RegExp): ReadonlyArray<string> =>
  [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1] ?? '')
    .filter((href) => pattern.test(href));

describe('the index', () => {
  it.effect('lists only the films with a published version, the newest first', () =>
    Effect.gen(function* () {
      const site = bucket();
      site.publish(material('older', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      site.publish(material('newer', 'render', '2026-10-24T10:00:00.000Z', 'a'));
      // A manifest with nothing published in it lists nothing.
      site.objects.set(
        'empty/manifest.json',
        new TextEncoder().encode(
          yield* Schema.encodeEffect(FilmManifestJson)({
            film: 'empty',
            title: 'Title of empty',
            versions: [],
          }),
        ),
      );
      site.publish(material('older', 'board', '2026-10-21T10:00:00.000Z', 'b'));
      const index = yield* ask(site.shelf, '/');
      expect(index.status).toBe(200);
      expect(links(index.text, /^\/[a-z-]+\/$/)).toEqual(['/newer/', '/older/']);
      expect(index.text).not.toContain('Title of empty');
      expect(index.text).toContain('21 Oct 2026');
    }),
  );
});

describe("a film's folder", () => {
  it.effect('lists its versions newest first, each once', () =>
    Effect.gen(function* () {
      const site = bucket();
      site.publish(material('film', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold', 'milk']));
      site.publish(material('film', 'final', '2026-10-22T10:00:00.000Z', 'a'));
      site.publish(material('film', 'render', '2026-10-21T10:00:00.000Z', 'a'));
      const folder = yield* ask(site.shelf, '/film/');
      expect(folder.status).toBe(200);
      expect(links(folder.text, /^\/film\/[a-z]+\/$/)).toEqual([
        '/film/final/',
        '/film/render/',
        '/film/board/',
      ]);
    }),
  );

  it.effect('answers with or without its trailing slash', () =>
    Effect.gen(function* () {
      const site = bucket();
      site.publish(material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      expect((yield* ask(site.shelf, '/film')).status).toBe(200);
      expect((yield* ask(site.shelf, '/film/board')).status).toBe(200);
    }),
  );
});

describe('a re-published version', () => {
  it.effect('replaces the one before it, with its new date and files', () =>
    Effect.gen(function* () {
      const site = bucket();
      const first = site.publish(
        material('film', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold']),
      );
      const again = site.publish(
        material('film', 'board', '2026-10-25T10:00:00.000Z', 'b', ['cold']),
      );
      expect(again.manifest.versions.map((version) => version.name)).toEqual(['board']);
      const page = yield* ask(site.shelf, '/film/board/');
      const [oldVideo] = first.manifest.versions.map((version) => version.video.key);
      const [newVideo] = again.manifest.versions.map((version) => version.video.key);
      expect(newVideo).not.toBe(oldVideo);
      expect(page.text).toContain(`/${newVideo}`);
      expect(page.text).not.toContain(`/${oldVideo}`);
      expect(page.text).toContain('25 Oct 2026');
      const folder = yield* ask(site.shelf, '/film/');
      expect(links(folder.text, /^\/film\/[a-z]+\/$/)).toEqual(['/film/board/']);
      expect(folder.text).not.toContain('20 Oct 2026');
    }),
  );

  test('names each file by its bytes, so a changed file never keeps an old name', () => {
    const a = publication([], material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
    const b = publication([], material('film', 'board', '2026-10-20T10:00:00.000Z', 'b'));
    const same = publication([], material('film', 'board', '2026-10-21T10:00:00.000Z', 'a'));
    const keys = (plan: typeof a) => plan.uploads.map((upload) => upload.key);
    expect(keys(a)).toEqual(keys(same));
    expect(keys(a).filter((key) => keys(b).includes(key))).toEqual([]);
    expect(keys(a).every((key) => /^film\/board\/[0-9a-f]{16}\.(mp4|jpg)$/.test(key))).toBe(true);
  });
});

describe('the Board page', () => {
  it.effect(
    'plays the video on a phone and shows the kept panels in order, each with its beat',
    () =>
      Effect.gen(function* () {
        const site = bucket();
        const plan = site.publish(
          material('film', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold', 'milk', 'stones']),
        );
        const page = yield* ask(site.shelf, '/film/board/');
        expect(page.text).toMatch(
          /<video controls playsinline preload="metadata" poster="\/film\/board\/[0-9a-f]{16}\.jpg"/,
        );
        expect(
          [...page.text.matchAll(/<figcaption>([^<]+)<\/figcaption>/g)].map((m) => m[1]),
        ).toEqual(['cold', 'milk', 'stones']);
        expect(plan.path).toBe('/film/board/');
      }),
  );
});

describe('what the site does not hold', () => {
  it.effect('answers an unknown film, version or path with 404', () =>
    Effect.gen(function* () {
      const site = bucket();
      site.publish(material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      for (const path of [
        '/nothing/',
        '/film/render/',
        '/film/teaser/',
        '/film/manifest.json',
        '/film/board/index.html',
        '/index.html',
        '/film/board/0123456789abcdef.mp4',
        '/film/board/x/y',
        '/Film/',
      ]) {
        const answer = yield* ask(site.shelf, path);
        expect([path, answer.status]).toEqual([path, 404]);
        expect(answer.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      }
    }),
  );

  it.effect('takes GET and HEAD only', () =>
    Effect.gen(function* () {
      const site = bucket();
      site.publish(material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      const post = yield* ask(site.shelf, '/', { method: 'POST' });
      expect(post.status).toBe(405);
      const head = yield* ask(site.shelf, '/film/', { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.body.length).toBe(0);
    }),
  );
});

describe('a video', () => {
  it.effect('answers a Range with 206 and exactly those bytes', () =>
    Effect.gen(function* () {
      const site = bucket();
      const plan = site.publish(material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      const video = plan.manifest.versions.map((each) => each.video)[0] ?? { key: '', bytes: 0 };
      const whole = yield* ask(site.shelf, `/${video.key}`);
      expect(whole.status).toBe(200);
      expect(whole.headers.get('accept-ranges')).toBe('bytes');
      expect(whole.headers.get('content-type')).toBe('video/mp4');
      expect(whole.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      const size = whole.body.length;

      const part = yield* ask(site.shelf, `/${video.key}`, { headers: { range: 'bytes=2-5' } });
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe(`bytes 2-5/${size}`);
      expect(part.headers.get('content-length')).toBe('4');
      expect(part.body).toEqual(whole.body.slice(2, 6));

      const tail = yield* ask(site.shelf, `/${video.key}`, { headers: { range: 'bytes=-3' } });
      expect(tail.status).toBe(206);
      expect(tail.body).toEqual(whole.body.slice(size - 3));

      const open = yield* ask(site.shelf, `/${video.key}`, {
        headers: { range: `bytes=${size - 2}-` },
      });
      expect(open.headers.get('content-range')).toBe(`bytes ${size - 2}-${size - 1}/${size}`);

      const past = yield* ask(site.shelf, `/${video.key}`, {
        headers: { range: `bytes=${size}-` },
      });
      expect(past.status).toBe(416);
      expect(past.headers.get('content-range')).toBe(`bytes */${size}`);
    }),
  );
});

describe('the manifest', () => {
  test('read back, draws the very pages publish wrote', () => {
    const site = bucket();
    site.publish(material('one', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold', 'milk']));
    site.publish(material('two', 'render', '2026-10-21T10:00:00.000Z', 'a'));
    site.publish(material('one', 'final', '2026-10-22T10:00:00.000Z', 'a'));
    const written = new Map(
      [...site.objects.entries()]
        .filter(([key]) => key.endsWith('.html'))
        .map(([key, bytes]) => [key, new TextDecoder().decode(bytes)] as const),
    );
    expect(sitePages(site.manifests())).toEqual(written);
  });
});

describe('search engines', () => {
  it.effect('are asked to stay out, on every page and in robots.txt', () =>
    Effect.gen(function* () {
      const site = bucket();
      site.publish(material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      const robots = yield* ask(site.shelf, '/robots.txt');
      expect(robots.text).toBe('User-agent: *\nDisallow: /\n');
      for (const path of ['/', '/film/', '/film/board/', '/robots.txt']) {
        const answer = yield* ask(site.shelf, path);
        expect(answer.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      }
      expect((yield* ask(site.shelf, '/')).text).toContain(
        '<meta name="robots" content="noindex, nofollow"',
      );
    }),
  );
});
