// A film's page reads its narration where the tools write it, by the film's
// id, through the page's HTTP client; a film with no timings yet is laid out
// on estimates, as the tools lay it out, and a timings file the page cannot
// fetch or read fails, naming it. A film is given only once the faces it
// draws in have been asked for (`pictureFaces`, which waits for none of them:
// what draws the film waits, `face.test.ts`), with its Rive rigs loaded into
// its caller's scope: closing it frees them, and a load that fails frees what
// it had acquired at once.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Layer, Scope } from 'effect';
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { createFilm } from '../canvas/film.ts';
import { armFilm, armRig, armScene } from '../canvas/fixtures/arm.ts';
import { countedRive } from '../canvas/fixtures/rive-counted.ts';
import { recorder, standInDom } from '../canvas/fixtures/stand-in.ts';
import type { PuppetSpec } from '../canvas/puppet.ts';
import { PuppetImages } from '../puppet/images.ts';
import { NO_TAKES, type Narrated, loadNarrated, narratedFilms, narrationUrls } from './narrated.ts';

const TIMINGS = '{"voice":"v","scenes":{}}';

/** A cut-out of one part on one bone: an 8 px square painted in a 16 px sheet. */
const BLOCK: PuppetSpec = {
  key: 'fixtures/block',
  size: [16, 16],
  parts: [{ name: 'body', png: 'block/body.png' }],
  skeleton: { bones: [{ name: 'spine', pivot: [8, 12], tip: [8, 4] }], skin: { body: ['spine'] } },
  origin: [8, 12],
};

/** The page's images read from memory, never fetched or decoded, and the PNGs asked for. */
const blockImages = () => {
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let y = 4; y < 12; y++)
    for (let x = 4; x < 12; x++) rgba.set([120, 80, 60, 255], (y * 16 + x) * 4);
  const read: Array<string> = [];
  const layer = Layer.succeed(
    PuppetImages,
    PuppetImages.of({
      read: (png) => Effect.sync(() => (read.push(png), { width: 16, height: 16, rgba })),
      paints: false,
    }),
  );
  return { read, layer };
};

/**
 * A client on a stand-in page: bun has no `location`, so a page-relative URL
 * is resolved against an origin here, as the browser resolves it against the
 * page's.
 */
const onPage = (client: HttpClient.HttpClient) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.mapRequest(client, HttpClientRequest.prependUrl('http://lab.slow.test')),
  );

/** A client that answers every URL with `status` and `body`, and notes the paths it was asked. */
const answering = (status: number, body = '') => {
  const asked: Array<string> = [];
  const client = HttpClient.make((request, url) => {
    asked.push(url.pathname);
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status })));
  });
  return { layer: onPage(client), asked };
};

/** A client whose every request fails on its way (the page offline). */
const offline = onPage(
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, description: 'offline' }),
      }),
    ),
  ),
);

describe('loadNarrated', () => {
  it.effect("reads the film's timings by its id, and names its master beside them", () => {
    const { layer, asked } = answering(200, TIMINGS);
    return Effect.gen(function* () {
      const narrated = yield* loadNarrated('rbf');
      expect(asked).toEqual(['/films/rbf/narration/timings.json']);
      expect(narrated).toEqual({
        timings: { voice: 'v', scenes: {} },
        audio: narrationUrls('rbf').audio,
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect('a film with no timings file yet is laid out on estimates, as the tools read it', () =>
    Effect.gen(function* () {
      expect((yield* loadNarrated('rbf')).timings).toEqual(NO_TAKES);
    }).pipe(Effect.provide(answering(404).layer)),
  );

  for (const [what, layer, why] of [
    ['a server error', answering(500).layer, 'status 500'],
    ['a file that is not timings', answering(200, '{"voice": 3}').layer, 'voice'],
    ['a fetch that fails', offline, 'offline'],
  ] as const)
    it.effect(`${what} fails, naming the film and the file and why, never estimates`, () =>
      Effect.gen(function* () {
        const failed = yield* Effect.flip(loadNarrated('rbf'));
        expect(failed).toMatchObject({
          _tag: 'NarrationUnreadable',
          film: 'rbf',
          url: '/films/rbf/narration/timings.json',
        });
        expect(failed.reason).toContain(why);
      }).pipe(Effect.provide(layer)),
    );
});

describe('narratedFilms', () => {
  it.live('a film is given only once its faces have been asked for: a slow ask holds it', () =>
    Effect.gen(function* () {
      const happened: Array<string> = [];
      const moduleAsked = yield* Deferred.make<boolean>();
      const facesAsked = yield* Deferred.make<boolean>();
      const toy = createFilm({
        fps: 30,
        title: 'toy',
        paper: { base: '#fff', tone: '#000', seed: 1 },
        shade: '#000',
        scenes: [{ id: 'one', say: 'A line.', draw: () => undefined }],
      });
      const films = narratedFilms(
        {
          rbf: () =>
            Effect.runPromise(
              Effect.as(Deferred.succeed(moduleAsked, true), { fps: 30, film: () => toy }),
            ),
        },
        Effect.andThen(
          Deferred.await(facesAsked),
          Effect.sync(() => happened.push('faces asked')),
        ),
        answering(404).layer,
      );
      const given = Effect.scoped(films.rbf).pipe(
        Effect.tap(() => Effect.sync(() => happened.push('film given'))),
      );
      const loading = yield* Effect.forkChild(given);
      // The film's module and its narration are in; its faces are not yet asked for.
      yield* Deferred.await(moduleAsked);
      yield* Effect.yieldNow;
      expect(happened).toEqual([]);
      yield* Deferred.succeed(facesAsked, true);
      expect(yield* Fiber.join(loading)).toBe(toy);
      expect(happened).toEqual(['faces asked', 'film given']);
    }),
  );

  it.live("a film's page is made at the rate its module declares, or its load dies", () =>
    Effect.gen(function* () {
      const toy = { title: 'toy', paper: { base: '#fff', tone: '#000', seed: 1 }, shade: '#000' };
      const scenes = [{ id: 'one', say: 'A line.', draw: () => undefined }];
      const films = narratedFilms(
        {
          // Handed its rate with its narration, as a film's `film.ts` spreads it.
          told: () =>
            Promise.resolve({
              fps: 24,
              film: (n: Narrated) => createFilm({ ...n, ...toy, scenes }),
            }),
          // A page made at a rate of its own.
          own: () =>
            Promise.resolve({
              fps: 24,
              film: (n: Narrated) => createFilm({ ...n, ...toy, scenes, fps: 30 }),
            }),
        },
        Effect.void,
        answering(404).layer,
      );
      const told = yield* Effect.scoped(films.told);
      expect([told.fps, told.placed[0]?.fps]).toEqual([24, 24]);
      const own = yield* Effect.exit(Effect.scoped(films.own));
      expect(Exit.hasDies(own)).toBe(true);
      expect(String(Exit.isFailure(own) && own.cause)).toContain(
        "own's film.ts makes its page at 30 fps, but declares 24 fps",
      );
    }),
  );

  /** A registry of the arm's film (its one rig loaded by `rive`) and a film whose second rig cannot load. */
  const armFilms = (rive: ReturnType<typeof countedRive>['layer']) =>
    narratedFilms(
      {
        arm: () => Promise.resolve({ fps: 30, film: () => armFilm([armScene('arm', 'webgl2')]) }),
        broken: () =>
          Promise.resolve({
            fps: 30,
            film: () => {
              const arm = armRig('webgl2');
              const leg = { ...arm, key: 'leg', source: { ...arm.source, artboard: 'Leg' } };
              return armFilm([
                armScene('arm', 'webgl2'),
                { id: 'leg', min: 4, rigs: { leg }, draw: () => {} },
              ]);
            },
          }),
      },
      Effect.void,
      answering(404).layer,
      rive,
    );

  it.live("each load's rigs are its caller's: closing the scope it was given frees them", () =>
    Effect.gen(function* () {
      const { counts, layer } = countedRive();
      const films = armFilms(layer);
      // Five mounts, each loading the film into a scope of its own and closing it as it goes.
      for (let mount = 0; mount < 5; mount++) {
        const scope = yield* Scope.make();
        const film = yield* Scope.provide(films.arm, scope);
        expect(film.rigs.declared.length).toBe(1);
        yield* Scope.close(scope, Exit.void);
      }
      expect(counts.files).toBe(5);
      expect(counts.unrefs).toBe(counts.files);
      expect(counts.deletes).toBe(counts.artboards);
    }),
  );

  it.live(
    'a load that fails frees what it had acquired, though its caller holds its scope open',
    () =>
      Effect.gen(function* () {
        const { counts, layer } = countedRive();
        const films = armFilms(layer);
        const scope = yield* Scope.make();
        const failed = yield* Effect.flip(Scope.provide(films.broken, scope));
        expect(failed).toMatchObject({ _tag: 'RigNameMissing', kind: 'artboard', name: 'Leg' });
        // The arm's file and the leg's were both loaded, and both are freed already.
        expect(counts.files).toBe(2);
        expect(counts.unrefs).toBe(2);
        expect(counts.deletes).toBe(counts.artboards);
        yield* Scope.close(scope, Exit.void);
      }),
  );

  it.live('a declared puppet loads with the film and draws', () =>
    Effect.gen(function* () {
      const { read, layer } = blockImages();
      const films = narratedFilms(
        {
          block: () =>
            Promise.resolve({
              fps: 30,
              film: () =>
                armFilm([
                  {
                    id: 'block',
                    min: 4,
                    timeline: {},
                    puppets: { block: BLOCK },
                    draw: (f) =>
                      f.puppet('block', { numbers: { spine: 10 }, root: [960, 540], scale: 1 }),
                  },
                ]),
            }),
        },
        Effect.void,
        answering(404).layer,
        countedRive().layer,
        layer,
      );
      yield* standInDom();
      const scope = yield* Scope.make();
      const film = yield* Scope.provide(films.block, scope);
      // Its one part was read as the film loaded, through the page's images, and a frame draws it.
      expect(read).toEqual(['block/body.png']);
      film.render(recorder().ctx, 1);
      // Closing the scope it was loaded into lets it go: a frame drawn after names it unloaded.
      yield* Scope.close(scope, Exit.void);
      expect(() => film.render(recorder().ctx, 1)).toThrow(
        'puppet "block" (fixtures/block) is not loaded',
      );
    }).pipe(Effect.scoped),
  );
});
