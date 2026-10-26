/**
 * The site end to end, in one process: a publish runs as the publisher runs
 * it (`publishTo` over the desk client), its requests answered by the desk's
 * policy (`respondDesk`) over a bucket in memory, and the site's policy
 * (`respond`) answers a reader's requests over the same bucket. A version's
 * files are real files in a temporary folder.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Redacted, Schema, type Scope } from 'effect';
import {
  HttpClient,
  type HttpClientRequest,
  HttpClientResponse,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';

import { respondDesk } from './desk.ts';
import { deskClient, publishTo } from './desk-client.ts';
import { FilmManifestJson, type VersionName } from './manifest.ts';
import { memoryBucket } from './memory-bucket.ts';
import { type Material, type MaterialFile, publication, sitePages } from './publish.ts';
import { respond, type Shelf } from './respond.ts';

const SECRET = 'the-desk-secret';

const sha256Of = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

/** A web request as the desk's Worker would see it, from the client's request. */
const toWeb = (request: HttpClientRequest.HttpClientRequest, url: URL) => {
  const init: RequestInit = { method: request.method, headers: request.headers };
  if (request.body._tag === 'Uint8Array') init.body = new Uint8Array(request.body.body);
  return new Request(url, init);
};

/** A bucket, the desk over it reached in process, and publishing through it. */
const world = (partBytes = 1024 * 1024) =>
  Effect.gen(function* () {
    // A request body may be twice a part, so a page goes whole and a larger video only in parts.
    const bucket = memoryBucket(2 * partBytes);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const http = HttpClient.make((request, url) =>
      respondDesk(bucket.store, SECRET, HttpServerRequest.fromWeb(toWeb(request, url))).pipe(
        Effect.map((response) =>
          HttpClientResponse.fromWeb(request, HttpServerResponse.toWeb(response)),
        ),
      ),
    );
    const desk = yield* deskClient(
      { url: 'https://desk.test', token: Redacted.make(SECRET) },
      partBytes,
    ).pipe(Effect.provideService(HttpClient.HttpClient, http));

    const fileOf = Effect.fn('test.file')(function* (
      name: string,
      text: string,
      ext: MaterialFile['ext'],
    ) {
      const bytes = new TextEncoder().encode(text);
      const file = path.join(dir, name);
      yield* fs.writeFile(file, bytes);
      return { file, sha256: sha256Of(bytes), bytes: bytes.length, ext } satisfies MaterialFile;
    });

    const material = Effect.fn('test.material')(function* (
      film: string,
      version: VersionName,
      at: string,
      seed: string,
      panels: ReadonlyArray<string> = [],
      videoText = `video ${film} ${version} ${seed}`,
    ) {
      return {
        film,
        title: `Title of ${film}`,
        version,
        at,
        day: at.slice(0, 10),
        video: yield* fileOf(`${film}-${version}-${seed}.mp4`, videoText, 'mp4'),
        poster: yield* fileOf(
          `${film}-${version}-${seed}.jpg`,
          `poster ${film} ${version} ${seed}`,
          'jpg',
        ),
        panels: yield* Effect.forEach(panels, (beat) =>
          Effect.map(
            fileOf(`${film}-${beat}-${seed}.jpg`, `panel ${beat} ${seed}`, 'jpg'),
            (image) => ({
              beat,
              image,
            }),
          ),
        ),
      } satisfies Material;
    });

    const publish = (each: Material, dryRun = false) => publishTo(desk, each, dryRun);

    return { bucket, http, material, publish };
  });

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

/** The links a page lists that match `pattern`, in its order. */
const links = (html: string, pattern: RegExp): ReadonlyArray<string> =>
  [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1] ?? '')
    .filter((href) => pattern.test(href));

/** A test over the platform, its temporary folder gone when it ends. */
const local = <A, E>(
  name: string,
  body: () => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>,
) => it.effect(name, () => Effect.scoped(body()).pipe(Effect.provide(BunServices.layer)));

describe('the index', () => {
  local('lists only the films with a published version, the newest first', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      yield* publish(yield* material('older', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      yield* publish(yield* material('newer', 'render', '2026-10-24T10:00:00.000Z', 'a'));
      // A manifest with nothing published in it lists nothing.
      const empty = yield* Schema.encodeEffect(FilmManifestJson)({
        film: 'empty',
        title: 'Title of empty',
        versions: [],
      });
      bucket.objects.set('empty/manifest.json', {
        bytes: new TextEncoder().encode(empty),
        sha256: Option.none(),
      });
      yield* publish(yield* material('older', 'board', '2026-10-21T10:00:00.000Z', 'b'));
      const index = yield* ask(bucket.shelf, '/');
      expect(index.status).toBe(200);
      expect(links(index.text, /^\/[a-z-]+\/$/)).toEqual(['/newer/', '/older/']);
      expect(index.text).not.toContain('Title of empty');
      expect(index.text).toContain('21 Oct 2026');
    }),
  );
});

describe("a film's folder", () => {
  local('lists its versions newest first, each once', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      yield* publish(
        yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold', 'milk']),
      );
      yield* publish(yield* material('film', 'final', '2026-10-22T10:00:00.000Z', 'a'));
      yield* publish(yield* material('film', 'render', '2026-10-21T10:00:00.000Z', 'a'));
      const folder = yield* ask(bucket.shelf, '/film/');
      expect(folder.status).toBe(200);
      expect(links(folder.text, /^\/film\/[a-z]+\/$/)).toEqual([
        '/film/final/',
        '/film/render/',
        '/film/board/',
      ]);
    }),
  );

  local('answers with or without its trailing slash', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      yield* publish(yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      expect((yield* ask(bucket.shelf, '/film')).status).toBe(200);
      expect((yield* ask(bucket.shelf, '/film/board')).status).toBe(200);
    }),
  );
});

describe('a re-published version', () => {
  local('replaces the one before it, with its new date and files, and the old files go', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      const first = yield* publish(
        yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold']),
      );
      const again = yield* publish(
        yield* material('film', 'board', '2026-10-25T10:00:00.000Z', 'b', ['cold']),
      );
      expect(again.plan.manifest.versions.map((version) => version.name)).toEqual(['board']);
      const oldFiles = first.plan.uploads.map((upload) => upload.key);
      const newFiles = again.plan.uploads.map((upload) => upload.key);
      const page = yield* ask(bucket.shelf, '/film/board/');
      for (const key of newFiles) expect(page.text).toContain(`/${key}`);
      for (const key of oldFiles) {
        expect(page.text).not.toContain(`/${key}`);
        expect((yield* ask(bucket.shelf, `/${key}`)).status).toBe(404);
      }
      expect([...again.pruned].sort()).toEqual([...oldFiles].sort());
      expect(page.text).toContain('25 Oct 2026');
      const folder = yield* ask(bucket.shelf, '/film/');
      expect(links(folder.text, /^\/film\/[a-z]+\/$/)).toEqual(['/film/board/']);
      expect(folder.text).not.toContain('20 Oct 2026');
    }),
  );

  local('uploads only the files the bucket does not hold already', () =>
    Effect.gen(function* () {
      const { material, publish } = yield* world();
      yield* publish(yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold']));
      const same = yield* publish(
        yield* material('film', 'board', '2026-10-21T10:00:00.000Z', 'a', ['cold']),
      );
      expect(same.held.size).toBe(same.plan.uploads.length);
      expect(same.pruned).toEqual([]);
    }),
  );

  test('names each file by its bytes, so a changed file never keeps an old name', () => {
    const file = (name: string, text: string): MaterialFile => ({
      file: `/here/${name}`,
      sha256: sha256Of(new TextEncoder().encode(text)),
      bytes: text.length,
      ext: 'mp4',
    });
    const of = (video: MaterialFile): Material => ({
      film: 'film',
      title: 'Film',
      version: 'board',
      at: '2026-10-20T10:00:00.000Z',
      day: '2026-10-20',
      video,
      poster: { ...file('poster', 'poster'), ext: 'jpg' },
      panels: [],
    });
    const keys = (material: Material) =>
      publication([], material).uploads.map((upload) => upload.key);
    expect(keys(of(file('a', 'one')))).toEqual(keys(of(file('b', 'one'))));
    expect(keys(of(file('a', 'one')))[0]).not.toBe(keys(of(file('a', 'two')))[0]);
    expect(
      keys(of(file('a', 'one'))).every((key) => /^film\/board\/[0-9a-f]{16}\.(mp4|jpg)$/.test(key)),
    ).toBe(true);
  });
});

describe('a dry run', () => {
  local('plans the version and writes nothing', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      const planned = yield* publish(
        yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'),
        true,
      );
      expect(planned.plan.uploads.length).toBe(2);
      expect(bucket.objects.size).toBe(0);
    }),
  );
});

describe('the Board page', () => {
  local('plays the video on a phone and shows the kept panels in order, each with its beat', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      const published = yield* publish(
        yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a', [
          'cold',
          'milk',
          'stones',
        ]),
      );
      const page = yield* ask(bucket.shelf, '/film/board/');
      expect(page.text).toMatch(
        /<video controls playsinline preload="metadata" poster="\/film\/board\/[0-9a-f]{16}\.jpg"/,
      );
      expect(
        [...page.text.matchAll(/<figcaption>([^<]+)<\/figcaption>/g)].map((m) => m[1]),
      ).toEqual(['cold', 'milk', 'stones']);
      expect(published.plan.path).toBe('/film/board/');
    }),
  );
});

describe('what the site does not hold', () => {
  local('answers an unknown film, version or path with 404', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      yield* publish(yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
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
        const answer = yield* ask(bucket.shelf, path);
        expect([path, answer.status]).toEqual([path, 404]);
        expect(answer.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      }
    }),
  );

  local('takes GET and HEAD only', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      yield* publish(yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      const post = yield* ask(bucket.shelf, '/', { method: 'POST' });
      expect(post.status).toBe(405);
      const head = yield* ask(bucket.shelf, '/film/', { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.body.length).toBe(0);
    }),
  );
});

describe('a video', () => {
  local('answers a Range with 206 and exactly those bytes', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      const published = yield* publish(
        yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'),
      );
      const key = published.plan.manifest.versions.map((each) => each.video.key).join('');
      const whole = yield* ask(bucket.shelf, `/${key}`);
      expect(whole.status).toBe(200);
      expect(whole.headers.get('accept-ranges')).toBe('bytes');
      expect(whole.headers.get('content-type')).toBe('video/mp4');
      expect(whole.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      const size = whole.body.length;

      const part = yield* ask(bucket.shelf, `/${key}`, { headers: { range: 'bytes=2-5' } });
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe(`bytes 2-5/${size}`);
      expect(part.headers.get('content-length')).toBe('4');
      expect(part.body).toEqual(whole.body.slice(2, 6));

      const tail = yield* ask(bucket.shelf, `/${key}`, { headers: { range: 'bytes=-3' } });
      expect(tail.status).toBe(206);
      expect(tail.body).toEqual(whole.body.slice(size - 3));

      const open = yield* ask(bucket.shelf, `/${key}`, {
        headers: { range: `bytes=${size - 2}-` },
      });
      expect(open.headers.get('content-range')).toBe(`bytes ${size - 2}-${size - 1}/${size}`);

      const past = yield* ask(bucket.shelf, `/${key}`, { headers: { range: `bytes=${size}-` } });
      expect(past.status).toBe(416);
      expect(past.headers.get('content-range')).toBe(`bytes */${size}`);
    }),
  );

  local('larger than a part, goes up in parts and reads back whole', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world(16 * 1024);
      const text = 'video bytes '.repeat(6 * 1024);
      const published = yield* publish(
        yield* material('film', 'final', '2026-10-20T10:00:00.000Z', 'a', [], text),
      );
      const key = published.plan.manifest.versions.map((each) => each.video.key).join('');
      expect((yield* ask(bucket.shelf, `/${key}`)).text).toBe(text);
    }),
  );
});

describe('the desk', () => {
  local('answers nothing without the secret', () =>
    Effect.gen(function* () {
      const { bucket } = yield* world();
      for (const authorization of ['', 'Bearer wrong', `Bearer ${SECRET}x`, SECRET]) {
        const response = yield* respondDesk(
          bucket.store,
          SECRET,
          HttpServerRequest.fromWeb(
            new Request('https://desk.test/objects/film/index.html', {
              method: 'PUT',
              headers: { authorization },
              body: 'x',
            }),
          ),
        );
        expect([authorization, response.status]).toEqual([authorization, 401]);
      }
      expect(bucket.objects.size).toBe(0);
    }),
  );
});

describe('the manifest', () => {
  local('read back, draws the very pages publish wrote', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      yield* publish(
        yield* material('one', 'board', '2026-10-20T10:00:00.000Z', 'a', ['cold', 'milk']),
      );
      yield* publish(yield* material('two', 'render', '2026-10-21T10:00:00.000Z', 'a'));
      yield* publish(yield* material('one', 'final', '2026-10-22T10:00:00.000Z', 'a'));
      const entries = [...bucket.objects.entries()];
      const manifests = yield* Effect.forEach(
        entries.filter(([key]) => key.endsWith('/manifest.json')),
        ([, held]) => Schema.decodeEffect(FilmManifestJson)(new TextDecoder().decode(held.bytes)),
      );
      const written = new Map(
        entries
          .filter(([key]) => key.endsWith('.html'))
          .map(([key, held]) => [key, new TextDecoder().decode(held.bytes)] as const),
      );
      expect(sitePages(manifests)).toEqual(written);
    }),
  );
});

describe('search engines', () => {
  local('are asked to stay out, on every page and in robots.txt', () =>
    Effect.gen(function* () {
      const { bucket, material, publish } = yield* world();
      yield* publish(yield* material('film', 'board', '2026-10-20T10:00:00.000Z', 'a'));
      const robots = yield* ask(bucket.shelf, '/robots.txt');
      expect(robots.text).toBe('User-agent: *\nDisallow: /\n');
      for (const path of ['/', '/film/', '/film/board/', '/robots.txt']) {
        const answer = yield* ask(bucket.shelf, path);
        expect(answer.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      }
      expect((yield* ask(bucket.shelf, '/')).text).toContain(
        '<meta name="robots" content="noindex, nofollow"',
      );
    }),
  );
});
