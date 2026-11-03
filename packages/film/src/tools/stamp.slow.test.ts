import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import {
  Boolean as Bool,
  Context,
  Effect,
  Equal,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { ChildProcessSpawner } from 'effect/process';
import { boardFilm } from '../canvas/board.ts';
import { type Film, type Frame, createFilm } from '../canvas/film.ts';
import { recorder, withDom } from '../canvas/fixtures/stand-in.ts';
import { type BoardFile, BoardName, emptyBoard } from '../core/board.ts';
import { type Placed, layout } from '../core/layout.ts';
import { estimate, hashText } from '../core/narration.ts';
import { TimingsJson, type VoiceTiming } from '../core/schema.ts';
import { secondsAt } from '../core/time.ts';
import { narratedFilms } from '../player/narrated.ts';
import { unmeasured } from '../core/voiced.ts';
import { beatSegments } from './segments.ts';
import { ContentStore } from './content-store.ts';
import { FilmRepo, importFilmModule, placeFilm } from './film-repo.ts';
import { scenesLocatedHere } from './read-cli.ts';
import { type Keyed, Stamps } from './stamp.ts';
import { sceneFixture } from './scene-sources/testing.ts';

class Films extends Context.Service<Films, string>()('test/Films') {}

const fixtureOver = <E, R>(spawner: Layer.Layer<never, E, R>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
      return Stamps.layer.pipe(
        Layer.provide(spawner),
        Layer.provideMerge(scenesLocatedHere),
        Layer.provide(FilmRepo.layer(films)),
        Layer.provide(ContentStore.layer),
        Layer.merge(Layer.succeed(Films, films)),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

const outsideACheckout = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(128)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    ),
  ),
);

const fixture = fixtureOver(outsideACheckout);
const placed = Result.getOrThrow(
  layout(
    [
      { id: 'hand', min: 2 },
      { id: 'beta', min: 2 },
      { id: 'built', min: 2 },
      { id: 'plain', min: 2, enter: { kind: 'fade', dur: 0.5 } },
    ],
    { voice: '', scenes: {} },
    30,
  ),
);

const film = (films: string, path: Path.Path): Keyed => ({
  paths: { name: 'f', dir: path.join(films, 'f') },
  timings: { voice: '', scenes: {} },
});

const changed = (before: Record<string, string>, after: Record<string, string>) =>
  Object.keys(before).filter((id) => before[id] !== after[id]);

const loadScript = (file: string): Promise<{ readonly ground: string }> => import(file);

const cardFills = (ground: string): ReadonlyArray<unknown> => {
  const one = Result.getOrThrow(
    layout([{ id: 'plain', say: 'Hi.', min: 2 }], { voice: '', scenes: {} }, 30),
  );
  const f: Film = Schema.decodeSync(Schema.Any)({
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 2,
    title: 'probe',
    look: {
      card: {
        style: {
          ground,
          type: { family: 'x', size: 60, color: '#f2e9d7' },
          payoffScale: 2.5,
          payoffColor: '#e6b347',
        },
      },
    },
    placed: one,
    render: () => {},
  });
  const board: BoardFile = {
    ...emptyBoard('f'),
    panels: [
      {
        id: 'plain.start',
        beat: BoardName.make('plain'),
        at: BoardName.make('start'),
        tries: [],
        text: { _tag: 'Card', payoff: 'Hi' },
      },
    ],
  };
  const r = recorder(1920, 1080);
  withDom(() => boardFilm(f, board, new Map(), false).render(r.ctx, 1));
  return r.fills.map((fill) => fill.style);
};

describe.concurrent('beat keys wherever the beat sits', () => {
  const laidWith = (seconds: number) =>
    Effect.gen(function* () {
      const films = yield* Films;
      const path = yield* Path.Path;
      const moved = Result.getOrThrow(
        layout(
          [
            { id: 'hand', min: seconds },
            { id: 'beta', min: 2 },
            { id: 'built', min: 2 },
            { id: 'plain', min: 2, enter: { kind: 'fade', dur: 0.5 } },
          ],
          { voice: '', scenes: {} },
          30,
        ),
      );
      const keys = yield* (yield* Stamps).scenes(film(films, path), moved);
      return { scenes: Object.fromEntries(keys.keys), beats: Object.fromEntries(keys.beats) };
    });

  it.effect(
    'a beat lasting longer changes its own, and every later scene key, but no later beat key',
    () =>
      Effect.gen(function* () {
        const before = yield* laidWith(2);
        const after = yield* laidWith(5);
        expect(changed(before.scenes, after.scenes)).toEqual(['hand', 'beta', 'built', 'plain']);
        expect(changed(before.beats, after.beats)).toEqual(['hand']);
      }).pipe(Effect.provide(fixture)),
  );

  it.effect('a beat entered on a transition holds the beat before it as laid out', () =>
    Effect.gen(function* () {
      const films = yield* Films;
      const path = yield* Path.Path;
      const stamps = yield* Stamps;
      const laid = (built: number) =>
        Result.getOrThrow(
          layout(
            [
              { id: 'hand', min: 2 },
              { id: 'beta', min: 2 },
              { id: 'built', min: built },
              { id: 'plain', min: 2, enter: { kind: 'fade', dur: 0.5 } },
            ],
            { voice: '', scenes: {} },
            30,
          ),
        );
      const one = (yield* stamps.scenes(film(films, path), laid(2))).beats;
      const two = (yield* stamps.scenes(film(films, path), laid(5))).beats;
      expect([...one].filter(([id, key]) => two.get(id) !== key).map(([id]) => id)).toEqual([
        'built',
        'plain',
      ]);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect(
    "a length edited in the script re-keys every beat: a value the script derives from it sets another beat's card",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const films = yield* Films;
        const scriptOf = (tail: number) => `export const script = [
  { id: 'hand', say: 'Hi.', tail: ${tail} },
  { id: 'beta', say: 'Hi.' },
  { id: 'built', say: 'Hi.' },
  { id: 'plain', say: 'Hi.' },
];

/** The cards' ground, picked by the first beat's tail. */
export const ground = ['#112233', '#445566'][script[0]!.tail]!;
`;
        const index = path.join(films, 'f', 'scenes', 'index.ts');
        yield* fs.writeFileString(
          index,
          `import { ground } from '../script.ts';\n${yield* fs.readFileString(index)}export const look = { ground };\n`,
        );
        const beatsWith = (tail: number) =>
          Effect.gen(function* () {
            yield* fs.writeFileString(path.join(films, 'f', 'script.ts'), scriptOf(tail));
            return Object.fromEntries(
              (yield* (yield* Stamps).scenes(film(films, path), placed)).beats,
            );
          });
        const was = yield* beatsWith(0);
        const now = yield* beatsWith(1);
        expect(changed(was, now)).toEqual(['hand', 'beta', 'built', 'plain']);

        const groundOf = (tail: number) =>
          Effect.gen(function* () {
            const file = path.join(films, `script-${tail}.ts`);
            yield* fs.writeFileString(file, scriptOf(tail));
            return (yield* Effect.promise(() => loadScript(file))).ground;
          });
        expect(cardFills(yield* groundOf(1))).not.toEqual(cardFills(yield* groundOf(0)));
      }).pipe(Effect.provide(fixture)),
  );
});

const takeOf = (spoken: string, duration: number): VoiceTiming => ({
  hash: hashText(spoken),
  file: 'take.flac',
  duration,
  words: unmeasured(estimate(spoken)),
  source: 'elevenlabs',
});

const compensated = (durations: readonly [number, number], fps: number) => {
  const scenes = [
    { id: 'hand', say: 'Hi.', lead: 0, tail: 0 },
    { id: 'beta', say: 'Hi.', lead: 0, tail: 0 },
    { id: 'built', min: 10 },
  ];
  const timings = {
    voice: 'v',
    scenes: { hand: takeOf('Hi.', durations[0]), beta: takeOf('Hi.', durations[1]) },
  };
  const placed = Result.getOrThrow(layout(scenes, timings, fps));
  const film = createFilm({
    fps,
    title: 'probe',
    paper: { base: '#fff', tone: '#000', seed: 1 },
    shade: '#000',
    timings,
    scenes: scenes.map((s) => ({
      ...s,
      draw: (f: Frame) => {
        f.ctx.fillStyle = Bool.match(f.t >= 0.5, {
          onTrue: () => '#445566',
          onFalse: () => '#112233',
        });
        f.ctx.fillRect(0, 0, 10, 10);
      },
    })),
  });
  return { placed, film };
};

const COMPENSATED = [
  { fps: 24, was: [0, 86, 163], now: [0, 98, 163], end: 403, half: 12 },
  { fps: 30, was: [0, 108, 204], now: [0, 123, 204], end: 504, half: 15 },
  { fps: 30000 / 1001, was: [0, 108, 204], now: [0, 123, 204], end: 503, half: 15 },
];

describe.concurrent('a beat after takes that change but end where they did', () => {
  for (const at of COMPENSATED)
    it.effect(
      `keeps its key and paints the same at ${at.fps} fps: it starts on the same whole frame, and reads its time from it`,
      () =>
        Effect.gen(function* () {
          const films = yield* Films;
          const path = yield* Path.Path;
          const stamps = yield* Stamps;
          const laid = yield* Effect.forEach(
            [[3.6, 3.2] as const, [4.1, 2.7] as const],
            (durations) =>
              Effect.gen(function* () {
                const { placed: beats, film: drawn } = compensated(durations, at.fps);
                const keys = yield* stamps.scenes(film(films, path), beats);
                const segments = beatSegments({
                  placed: beats,
                  start: 0,
                  end: at.end,
                  render: {
                    width: 1920,
                    height: 1080,
                    fps: at.fps,
                    scale: 1,
                    encoder: 'hardware',
                    captions: false,
                    picture: [],
                    agent: 'HeadlessChrome/141',
                    platform: 'darwin',
                  },
                  beats: keys.beats,
                  board: Option.none(),
                  filmTimed: () => true,
                });
                return { beats, drawn, built: segments.at(-1)! };
              }),
          );
          const [was, now] = [laid[0]!, laid[1]!];
          expect(was.beats.map((p) => p.frame)).toEqual(at.was);
          expect(now.beats.map((p) => p.frame)).toEqual(at.now);
          for (const { beats, drawn } of laid)
            expect(drawn.placed.map((p) => [p.frame, p.start])).toEqual(
              beats.map((p) => [p.frame, p.start]),
            );
          const built = at.was[2] ?? 0;
          expect([was.built.from, was.built.to, was.built.pinned]).toEqual([built, at.end, true]);
          expect(now.built.key).toEqual(was.built.key);
          const fillsAt = (drawn: Film, i: number) => {
            const r = recorder(1920, 1080);
            withDom(() => drawn.render(r.ctx, secondsAt(i, at.fps)));
            return r.fills.map((fill) => fill.style);
          };
          const half = built + at.half;
          for (const i of [half - 1, half, half + 1])
            expect(fillsAt(now.drawn, i)).toEqual(fillsAt(was.drawn, i));
          expect(fillsAt(now.drawn, half - 1)).toContain('#112233');
          expect(fillsAt(now.drawn, half)).toContain('#445566');
        }).pipe(Effect.provide(fixture)),
    );
});

const declaredAt24 = Effect.fn('test.declaredAt24')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.join(root, 'films', 'r');
  yield* fs.makeDirectory(path.join(dir, 'scenes'), { recursive: true });
  const canvas = path.join(import.meta.dir, '..', 'canvas', 'film.ts');
  const files = {
    'voice.ts': "export const voice = { voiceId: 'v', model: 'eleven_v3', settings: {} };\n",
    'film.ts': `import { createFilm } from '${canvas}';
import { scenes } from './scenes/index.ts';

export const fps = 24;

export const film = (narrated) =>
  createFilm({ ...narrated, title: 'rate', paper: { base: '#fff', tone: '#000', seed: 1 }, shade: '#000', scenes });
`,
    'scenes/a.ts': 'export const a = { draw: () => {} };\n',
    'scenes/b.ts': `export const b = {
  draw: (f) => {
    f.ctx.fillStyle = ['#112233', '#445566'][Number(f.t >= 0.02)];
    f.ctx.fillRect(0, 0, 10, 10);
  },
};
`,
    'scenes/index.ts': `import { a } from './a.ts';
import { b } from './b.ts';

export const scenes = [
  { id: 'a', say: 'Hi.', lead: 0, tail: 0, ...a },
  { id: 'b', min: 5, ...b },
  { id: 'c', min: 1, ...a },
];
`,
  };
  for (const [name, source] of Object.entries(files))
    yield* fs.writeFileString(path.join(dir, name), source);
  return path.join(root, 'films');
});

const at24 = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const films = yield* declaredAt24(yield* fs.makeTempDirectoryScoped());
    return Stamps.layer.pipe(
      Layer.provide(outsideACheckout),
      Layer.provideMerge(scenesLocatedHere),
      Layer.provideMerge(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

const serving = (body: string) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.mapRequest(
      HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status: 200 }))),
      ),
      HttpClientRequest.prependUrl('http://page.test'),
    ),
  );

describe.concurrent('a film declared at 24 fps', () => {
  it.effect(
    'is laid on the same frames by its page and the tools, and a kept segment paints as a fresh draw would',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const films = yield* Films;
        const repo = yield* FilmRepo;
        const stamps = yield* Stamps;
        const takeOfA = (seconds: number) =>
          Effect.gen(function* () {
            const json = yield* Schema.encodeEffect(TimingsJson)({
              voice: 'v',
              scenes: { a: takeOf('Hi.', seconds) },
            });
            yield* fs.writeFileString(path.join(films, 'r', 'narration', 'timings.json'), json);
            const loaded = yield* repo.load('r');
            const placed = yield* placeFilm(loaded);
            const page = yield* Effect.scoped(
              narratedFilms(
                { r: () => importFilmModule(path.join(films, 'r', 'film.ts')) },
                Effect.void,
                serving(json),
              ).r,
            );
            const keys = yield* stamps.scenes(loaded, placed);
            const segments = beatSegments({
              placed,
              start: 0,
              end: Math.round(page.duration * page.fps),
              render: {
                width: 1920,
                height: 1080,
                fps: page.fps,
                scale: 1,
                encoder: 'hardware',
                captions: false,
                picture: [],
                agent: 'HeadlessChrome/141',
                platform: 'darwin',
              },
              beats: keys.beats,
              board: Option.none(),
              filmTimed: () => true,
            });
            return { loaded, placed, page, segments };
          });
        yield* fs.makeDirectory(path.join(films, 'r', 'narration'), { recursive: true });
        const laid = yield* Effect.forEach([3, 3.02, 3.03], takeOfA);
        const clock = (placed: ReadonlyArray<Placed>) =>
          placed.map((p) => [p.spec.id, p.frame, p.start, p.start + p.speechStart]);
        for (const { loaded, placed, page } of laid) {
          expect([loaded.fps, page.fps]).toEqual([24, 24]);
          expect(clock(page.placed)).toEqual(clock(placed));
        }
        expect(laid.map(({ placed }) => placed[1]?.frame)).toEqual([72, 72, 73]);
        const fillsAt = (page: Film, i: number) => {
          withDom(() => page.render(recorder(1920, 1080).ctx, secondsAt(i, page.fps)));
          const r = recorder(1920, 1080);
          withDom(() => page.render(r.ctx, secondsAt(i, page.fps)));
          return r.fills.map((fill) => fill.style);
        };
        for (const was of laid)
          for (const now of laid)
            for (const old of was.segments)
              for (const fresh of now.segments.filter(
                (s) => Option.isSome(s.key) && Equal.equals(s.key, old.key),
              )) {
                expect(fresh.to - fresh.from).toBe(old.to - old.from);
                for (let k = 0; k < fresh.to - fresh.from; k++)
                  expect(fillsAt(now.page, fresh.from + k)).toEqual(
                    fillsAt(was.page, old.from + k),
                  );
              }
        const bOf = (i: number) => laid[i]?.segments.find((s) => s.from >= 72);
        expect(bOf(1)?.key).toEqual(bOf(0)?.key);
        expect(bOf(2)?.key).not.toEqual(bOf(1)?.key);
        expect(fillsAt(laid[2]!.page, 73)).not.toEqual(fillsAt(laid[1]!.page, 73));
      }).pipe(Effect.provide(at24)),
  );
});
