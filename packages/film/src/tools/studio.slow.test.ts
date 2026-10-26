// The lab's `studio` routes as an ask's take block calls them, over fakes: a
// beat's attempts listed, each kept or not and in its line or not, and one
// played back by its name; a beat or a file the film lacks refused. No
// network, no ffmpeg.

import { AskMaterials } from './ask-materials.ts';
import { AskStore } from './ask-store.ts';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Path, Schema } from 'effect';
import { HttpPlatform } from 'effect/http';
import { labUrls } from '../core/api.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import { type Timed, type Timings, TimingsJson } from '../core/schema.ts';
import { StudioAttempts } from '../core/studio.ts';
import { ContentStore } from './content-store.ts';
import { RenderCatalogue } from './catalogue.ts';
import { Choices } from './choices.ts';
import { FilmFolder, FilmRepo } from './film-repo.ts';
import type { OptionsKept } from './fresh-film.ts';
import { labHandler } from './lab.ts';
import { readingOf } from './read-cli.ts';
import { NO_SCORES } from './media-store.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { BoardStore } from './board-store.ts';
import { SourceWriter } from './source-writer.ts';
import { StudioReadings } from './studio.ts';
import { Attempt, Takes } from './takes.ts';
import { emptyCalls, fakeElevenLabs } from './elevenlabs/testing.ts';
import { testFilm, testVoice } from './film-repo/testing.ts';
import {
  formatAsIs,
  freshFilm,
  keepVoiceHere,
  echoPages,
  noRenders,
  noScenes,
  noStaging,
  voicesHere,
} from './film-services/testing.ts';
import { memoryFileSystem, storeLayer, text } from './host/testing.ts';
import { withTimelines } from './lab/testing.ts';
import { fakeMedia } from './media/testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'a', say: 'Hello {wave} world.' },
  { id: 'quiet' },
  { id: 'b', say: 'He said “be still” to them.' },
];

const staged: Timings = {
  voice: voiceKey(testVoice),
  scenes: {
    a: {
      hash: hashText('Hello world.'),
      file: 'a.mp3',
      duration: 1,
      words: [],
      source: 'elevenlabs',
    },
  },
};

const film = testFilm(scenes, staged);

const setup = (
  recorded: ReadonlyMap<string, string>,
  /** What `film mix` does beside being counted: a test that times the mixes slows it. */
  remixing: Effect.Effect<void> = Effect.void,
  /** What stands around each fresh keep of `beat`: a test that times the keeps marks them. */
  keeping: <A, E>(beat: string, keep: Effect.Effect<A, E>) => Effect.Effect<A, E> = (_, keep) =>
    keep,
  /** What `keep-voice` answers of what it kept: a test of an older film CLI says less. */
  answering: (kept: OptionsKept) => OptionsKept = (kept) => kept,
) => {
  const files = new Map<string, Uint8Array>([
    [film.paths.timings.file, text(Schema.encodeSync(TimingsJson)(staged))],
    ['/films/test/narration/a.mp3', text('Hello world.')],
    [
      '/films/test/quotes.jsonl',
      text('{"ref":"Ps 46:10","author":"KJV","text":"Be still, and know that I am God."}\n'),
    ],
  ]);
  const mixes: Array<string> = [];
  /** How many fresh reads of the script and voice the studio asked for. */
  const reads: Array<string> = [];
  /** The film's sources' stamp: a test moves it when it changes a source. */
  const stamp = { now: 1 };
  /** The film's lines as its files say them now: a test edits one while the lab runs. */
  const source = { scenes: film.scenes };
  const repo = Layer.effect(
    FilmRepo,
    Effect.gen(function* () {
      const store = yield* ContentStore;
      return FilmRepo.of({
        load: () =>
          Effect.map(store.read(film.paths.timings), (timings) => ({
            ...film,
            scenes: source.scenes,
            timings,
          })),
        script: () => Effect.succeedNone,
        sound: () => Effect.succeed(film.sound),
        scores: Effect.succeed(NO_SCORES),
      });
    }),
  );
  // The fresh process, over the film as it is stored now: `film read voice`, `film options
  // list` (its voices) and `keep-voice`, whose mix is counted, and `keeping` stands around.
  const fresh = Layer.unwrap(
    Effect.map(
      Effect.context<FilmRepo | Takes | ContentStore | FileSystem.FileSystem | Path.Path>(),
      (context) => {
        const keep = keepVoiceHere(
          context,
          Effect.andThen(
            Effect.sync(() => void mixes.push(film.paths.name)),
            Effect.as(remixing, true),
          ),
        );
        return freshFilm({
          reading: (name) =>
            Effect.gen(function* () {
              reads.push(name);
              const loaded = yield* (yield* FilmRepo).load(name);
              return yield* readingOf(loaded);
            }).pipe(Effect.provideContext(context), Effect.orDie),
          choices: voicesHere(context),
          keepVoice: (name, beat, file, options) =>
            keeping(beat, Effect.map(keep(name, beat, file, options), answering)),
          remix: () =>
            Effect.andThen(
              Effect.sync(() => void mixes.push(film.paths.name)),
              remixing,
            ),
          check: () => Effect.succeed([]),
        });
      },
    ),
  );
  const base = Layer.mergeAll(
    memoryFileSystem(files),
    Path.layer,
    fakeElevenLabs(files, emptyCalls(), { recorded }),
    fakeMedia(files),
    formatAsIs,
  );
  // The lab's handler serves the studio: its notes, source and review services only have to exist.
  const folder = Layer.succeed(
    FilmFolder,
    FilmFolder.of({
      paths: () => film.paths,
      names: Effect.succeed([film.paths.name]),
      sounds: Option.none(),
      footage: Option.none(),
      stamp: () => Effect.sync(() => stamp.now),
    }),
  );
  // The lab's handler serves the studio: its notes, scenes and renders only have to exist; its
  // writes and the choices routes' are real.
  const layer = Layer.mergeAll(
    NotesStore.layer,
    ProductionStore.layer,
    BoardStore.layer,
    AskStore.layer.pipe(
      Layer.provide(AskMaterials.layer),
      Layer.provide([BoardStore.layer, NotesStore.layer, ProductionStore.layer, noStaging]),
    ),
    noScenes,
    noStaging,
    echoPages,
    Choices.layer,
  ).pipe(
    // An ask's take is read as the studio reads it: the asks need the readings too.
    Layer.provideMerge(StudioReadings.layer),
    Layer.provideMerge(Layer.mergeAll(SourceWriter.layer, RenderCatalogue.layer, noRenders)),
    Layer.provideMerge(Layer.mergeAll(folder, fresh)),
    Layer.provideMerge(Takes.layer),
    Layer.provideMerge(repo),
    Layer.provideMerge(storeLayer(files)),
    Layer.provideMerge(Layer.mergeAll(base, HttpPlatform.layer.pipe(Layer.provide(base)))),
    withTimelines,
  );
  return { files, mixes, reads, stamp, source, layer };
};

const Json = Schema.fromJsonString(Schema.Unknown);

const bound = { hostname: '127.0.0.1', port: 4401 } as const;
const at = (path: string) => `http://127.0.0.1:4401${path}`;
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(at(path), { method: 'GET', headers });

const said = new Map([
  ['a', 'Hello world.'],
  ['b', 'He said be still to them.'],
]);

const call = (request: Request) =>
  Effect.gen(function* () {
    const studio = yield* labHandler();
    const res = yield* Effect.promise(() => studio(request, bound));
    const type = res.headers.get('content-type');
    const raw = yield* Effect.promise(() => res.text());
    // Audio answers stay text; JSON answers are parsed to decode against their Schema.
    if (!String(type).includes('json')) return { status: res.status, type, body: raw as unknown };
    const body = yield* Schema.decodeEffect(Json)(raw);
    return { status: res.status, type, body };
  });

/** Beat `a`'s attempt `file`, heard as `heard`, its take's text hashed as `hash`, recorded at `at`. */
const attemptOf = (file: string, heard: string, hash: string, at: number): Attempt => ({
  beat: 'a',
  file,
  take: { hash, file, duration: 1, words: [], source: 'recorded' },
  heard,
  wer: 0,
  at,
});

/** Beat `a`'s attempts on disk: the take its timings name, and an older line's. */
const seeded = (files: Map<string, Uint8Array>) => {
  const attempts = [
    attemptOf('a.old.flac', 'Hello there world.', 'h-old', 1),
    attemptOf('a.mp3', 'Hello world.', hashText('Hello world.'), 2),
  ];
  const dir = `${film.paths.narration}/attempts/a`;
  files.set(
    `${dir}/attempts.json`,
    text(
      Schema.encodeSync(Schema.fromJsonString(Schema.Struct({ attempts: Schema.Array(Attempt) })))({
        attempts,
      }),
    ),
  );
  for (const a of attempts) files.set(`${dir}/${a.file}`, text(a.heard));
};

describe("a beat's attempts", () => {
  it.effect(
    'are listed, each kept or not and in its line or not, and each played back by its name',
    () => {
      const { layer, files } = setup(said);
      seeded(files);
      return Effect.gen(function* () {
        const listed = yield* call(
          get(labUrls.studio.attempts({ params: { film: 'test', beat: 'a' } })),
        );
        expect(listed.status).toBe(200);
        const read = yield* Schema.decodeUnknownEffect(StudioAttempts)(listed.body);
        expect(read.attempts.map((a) => [a.file, a.kept, a.current]).toSorted()).toEqual([
          ['a.mp3', true, true],
          ['a.old.flac', false, false],
        ]);
        const played = yield* call(
          get(labUrls.studio.attempt({ params: { film: 'test', beat: 'a', file: 'a.old.flac' } })),
        );
        expect([played.status, played.body]).toEqual([200, 'Hello there world.']);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect(
    'refuse a beat the film does not have, and a file it never recorded, before reading one',
    () => {
      const { layer, files } = setup(said);
      seeded(files);
      return Effect.gen(function* () {
        const beat = yield* call(get('/api/films/test/studio/takes/nope/attempts'));
        expect([beat.status, (beat.body as { _tag: string })._tag]).toEqual([404, 'UnknownScene']);
        const never = yield* call(
          get(labUrls.studio.attempt({ params: { film: 'test', beat: 'a', file: 'a.new.flac' } })),
        );
        expect([never.status, (never.body as { _tag: string })._tag]).toEqual([
          404,
          'AttemptUnknown',
        ]);
        expect(
          (yield* call(get('/api/films/test/studio/takes/a/attempts/..%2F..%2Ftimings.json')))
            .status,
        ).toBe(404);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );
});
