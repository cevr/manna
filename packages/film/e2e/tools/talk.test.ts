import * as BunCrypto from '@effect/platform-bun/BunCrypto';

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Result, Schema } from 'effect';
import { sourceFile } from '../../src/core/footage.ts';
import { fileSource } from '../../src/core/sfx.ts';
import { Talk } from '../../src/core/talk.ts';
import { sha256Hex } from '../../src/tools/digest.ts';
import { FilmRepo, masterFile, placeFilm } from '../../src/tools/film-repo.ts';
import { filmServices } from '../../src/tools/film-services.ts';
import { FootageLibrary } from '../../src/tools/footage.ts';
import { syncClip } from '../../src/tools/fixtures/sync-clip.ts';
import { Mixer, planOf } from '../../src/tools/mixer.ts';
import { measuredFilm } from '../../src/tools/sound-render.ts';
import { emptyCalls, fakeElevenLabs } from '../../src/tools/elevenlabs/testing.ts';
import { privateFolder } from '../../src/tools/host/testing.ts';

const SAID = 'The law was given to show us our need of a Saviour';
const WORDS = SAID.split(' ');

const SPEECH = WORDS.map((_, i): readonly [number, number] => [
  0.5 * i + 0.05,
  0.5 * i + 0.35,
]).with(8, [4.25, 4.35]);

const CLIP = {
  camera: 'zv-e10',
  frames: 189,
  fps: 30,
  flash: 14,
  pictureStart: 0,
  variable: false,
  speech: SPEECH,
} as const;

const TALK: Talk = {
  title: 'Why the law?',
  format: 'question',
  takes: { a: 'why-the-law' },
  sections: [
    { id: 'law', take: 'a', from: 0, to: 5, cut: [[2, 2]] },
    { id: 'need', take: 'a', from: 6, to: 11 },
  ],
};

const calls = emptyCalls();

const world = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    return filmServices({
      films: path.join(root, 'films'),
      sounds: path.join(root, 'sounds'),
      footage: path.join(root, 'footage'),
      folders: {
        out: path.join(root, 'out'),
        lab: path.join(root, 'lab'),
        productions: path.join(root, 'productions'),
      },
      self: ['bun', 'cli.ts'],
      roots: Effect.succeed([]),
      elevenLabs: fakeElevenLabs(new Map(), calls, { heard: new Map([['', SAID]]) }),
      privateStore: Option.some(privateFolder(path.join(root, 'store'))),
      staging: Option.some(path.join(root, 'staging')),
      series: Option.none(),
    });
  }),
).pipe(Layer.provideMerge(Layer.merge(BunServices.layer, BunCrypto.layerMac)));

const tree = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs.readDirectory(dir, { recursive: true });
    const files = yield* Effect.filter(names, (name) =>
      Effect.map(fs.stat(path.join(dir, name)), (info) => info.type === 'File'),
    );
    return Object.fromEntries(
      yield* Effect.forEach(files.toSorted(), (name) =>
        Effect.map(fs.readFile(path.join(dir, name)), (bytes) => [name, sha256Hex(bytes)] as const),
      ),
    );
  });

describe('a talk through the tools, on real media', () => {
  it.live(
    "is imported, heard once, and mixed from the take's own voice in its pieces; its original never rewritten",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const library = yield* FootageLibrary;
        const root = path.dirname(library.dir);
        const films = path.join(root, 'films');
        const clip = yield* syncClip(CLIP);
        const camera = path.join(root, 'take.mp4');
        yield* fs.writeFile(camera, clip);
        yield* library.importFile(camera, {
          name: 'why-the-law',
          kind: 'take',
          licence: Option.none(),
          credit: Option.none(),
          source: Option.none(),
          tags: [],
        });
        const made = yield* library.make('why-the-law', { hearAgain: false });
        expect(made.made).toEqual(['mezzanine', 'proxy', 'voice', 'transcript']);
        expect(calls.stt.length).toBe(1);
        const again = yield* library.make('why-the-law', { hearAgain: false });
        expect([again.made, calls.stt.length]).toEqual([[], 1]);

        yield* fs.makeDirectory(path.join(films, 'why'), { recursive: true });
        const edit = yield* Schema.encodeEffect(Schema.fromJsonString(Talk))(TALK);
        yield* fs.writeFileString(
          path.join(films, 'why', 'talk.ts'),
          `export const talk = ${edit};\n`,
        );
        const loaded = yield* (yield* FilmRepo).load('why');
        const { cut, takes, copies } = Option.getOrThrow(loaded.talk);
        expect(cut.sections.map((s) => s.pieces.length)).toEqual([2, 2]);

        const placed = yield* placeFilm(loaded);
        const mixing = Result.getOrThrow(
          planOf(yield* measuredFilm(loaded), placed, {
            score: Option.none(),
            inPlace: Option.none(),
          }),
        );
        const source = Option.getOrThrow(Option.fromUndefinedOr(takes['a'])).source;
        const voice = path.join(copies, sourceFile(source, 'voice.flac'));
        expect(voice).toBe(
          path.join(
            root,
            'out',
            'footage',
            'why-the-law',
            sha256Hex(clip).slice(0, 12),
            'voice.flac',
          ),
        );
        expect(yield* fs.exists(voice)).toBe(true);
        expect(mixing.voice.map((t) => [t.name, t.sound, t.from, t.at])).toEqual(
          cut.sections.flatMap((s) => {
            const p = placed.find((q) => q.spec.id === s.id);
            return s.pieces.map((piece) => [
              s.id,
              fileSource(voice),
              piece.from,
              (p?.start ?? 0) + (p?.speechStart ?? 0) + piece.at,
            ]);
          }),
        );
        const mixer = yield* Mixer;
        yield* mixer.mix('why', { stems: false, score: Option.none() });
        const first = yield* tree(root);
        expect(Object.keys(first)).toContain(path.relative(root, masterFile(loaded.paths)));
        yield* mixer.mix('why', { stems: false, score: Option.none() });
        expect(yield* tree(root)).toEqual(first);
        expect(calls.stt.length).toBe(1);

        const entry = yield* library.entry('why-the-law');
        const { original } = yield* library.files('why-the-law', entry);
        expect([entry.sha256, sha256Hex(yield* fs.readFile(original))]).toEqual([
          sha256Hex(clip),
          sha256Hex(clip),
        ]);
      }).pipe(Effect.provide(world)),
    120_000,
  );
});
