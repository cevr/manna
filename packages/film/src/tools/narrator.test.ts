import * as BunServices from '@effect/platform-bun/BunServices';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import type { Pcm } from '../core/audio.ts';
import { captionCues } from '../core/captions.ts';
import { hashText, parse, takeScript, voiceFor, voiceKey } from '../core/narration.ts';
import { type Cast, type Timed, type Timings, TimingsJson, type Voice } from '../core/schema.ts';
import { ContentStore, Processes, writeWholeWith } from './content-store.ts';
import { ManifestLock, type ManifestLockService } from './manifest-lock.ts';
import { bunManifestLock } from './manifest-lock-bun.ts';
import { ElevenLabs } from './elevenlabs.ts';
import { StagingCache } from './staging.ts';
import type { LoadedFilm } from './film-repo.ts';
import {
  type NarrateOptions,
  type NarrationPlan,
  Narrator,
  planNarration,
  stateLine,
  sweepNarration,
} from './narrator.ts';
import { type ElevenLabsCalls, emptyCalls, fakeElevenLabs } from './elevenlabs/testing.ts';
import { testFilm, testVoice } from './film-repo/testing.ts';
import {
  crashingFileSystem,
  memoryFileSystem,
  memoryManifestLock,
  storeLayer,
  text,
} from './host/testing.ts';
import { fakeMedia, fakeLength } from './media/testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'a', say: 'Hello {wave} world.' },
  { id: 'quiet' },
  { id: 'b', say: 'The second line.' },
];

const take = (spoken: string, file: string) => ({
  hash: hashText(spoken),
  file,
  duration: 1,
  words: [],
  source: 'elevenlabs' as const,
});

const recorded: Timings = {
  voice: voiceKey(testVoice),
  scenes: { a: take('Hello world.', 'a.mp3') },
};

const defaults: NarrateOptions = {
  only: Option.none(),
  force: false,
  acceptMismatch: new Set(),
  replaceRecorded: false,
};

const TIMINGS = '/films/test/narration/timings.json';

const STAGING = '/staging';

const setup = (timings: Timings, heard: ReadonlyMap<string, string> = new Map(), decoded?: Pcm) => {
  const files = new Map<string, Uint8Array>();
  files.set(TIMINGS, text(Schema.encodeSync(TimingsJson)(timings)));
  const calls = emptyCalls();
  const layer = Narrator.layer.pipe(
    Layer.provide(StagingCache.layer(STAGING)),
    Layer.provideMerge(storeLayer(files)),
    Layer.provide([
      memoryFileSystem(files),
      Path.layer,
      fakeElevenLabs(files, calls, { heard }),
      fakeMedia(new Map(), decoded),
    ]),
  );
  return { files, calls, layer };
};

const narrate = (
  layer: Layer.Layer<Narrator | ContentStore>,
  voice: Voice = testVoice,
  options: NarrateOptions = defaults,
  beats: ReadonlyArray<Timed> = scenes,
) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;
    const film = testFilm(beats, recorded, voice);
    const timings = yield* store.read(film.paths.timings);
    const loaded = { ...film, timings };
    const plan = yield* Effect.fromResult(planNarration(loaded, options));
    yield* (yield* Narrator).record(loaded, plan, options);
    return yield* store.read(film.paths.timings);
  }).pipe(Effect.provide(layer));

const spoken = (calls: ElevenLabsCalls) => calls.tts.map((r) => r.text);

const processesOn = (host: string, alive: (pid: number) => boolean) =>
  Effect.provideService(Processes, { host, alive: (pid) => Effect.succeed(alive(pid)) });

describe('Narrator', () => {
  it.effect('records a stale beat once, and skips it once current', () =>
    Effect.gen(function* () {
      const { files, calls, layer } = setup(recorded);
      const after = yield* narrate(layer);
      expect(spoken(calls)).toEqual(['The second line.']);
      expect(after.scenes['b']?.hash).toBe(hashText('The second line.'));
      expect(after.scenes['a']).toEqual(recorded.scenes['a']);
      expect(after.scenes['b']?.file).toMatch(/^b\.[0-9a-f]{12}\.mp3$/);
      expect(files.has(`/films/test/narration/${after.scenes['b']?.file}`)).toBe(true);

      yield* narrate(layer);
      expect(spoken(calls)).toEqual(['The second line.']);
    }),
  );

  it.effect("a word timed past the take's end is held inside it, not refused by the timings", () =>
    Effect.gen(function* () {
      const long = 'This line runs on and on, far past the end of the audio it was made from.';
      const { layer } = setup(recorded);
      const after = yield* narrate(layer, testVoice, defaults, [{ id: 'b', say: long }]);
      const take = after.scenes['b'];
      expect(take?.duration).toBe(2.5);
      expect(take?.words.map((w) => w.text).join(' ')).toBe(long);
      for (const w of take?.words ?? []) {
        expect(w.start).toBeLessThanOrEqual(2.5);
        expect(w.end).toBeLessThanOrEqual(2.5);
        expect(w.start).toBeLessThanOrEqual(w.end);
      }
      expect(take?.words.at(-1)?.end).toBe(2.5);
    }),
  );

  it.effect('a staged take says where each word is heard, read from the take itself', () =>
    Effect.gen(function* () {
      const rate = 8000;
      const voice = Float32Array.from(
        { length: 3 * rate },
        (_, i) => Number(i >= 0.1 * rate) * 0.3 * Math.sin((2 * Math.PI * 220 * i) / rate),
      );
      const { layer } = setup(recorded, new Map(), {
        rate,
        frames: voice.length,
        channels: [voice],
      });
      const after = yield* narrate(layer);
      const [the, second] = after.scenes['b']?.words ?? [];
      expect([the?.text, the?.start, the?.voiced.start]).toEqual(['The', 0, 0.1]);
      expect<ReadonlyArray<number>>([second?.voiced.start ?? -1, second?.voiced.end ?? -1]).toEqual(
        [second?.start ?? -1, second?.end ?? -1],
      );
    }),
  );

  it.effect("a staged take's silent tail is trimmed, as an import's is, into a FLAC", () =>
    Effect.gen(function* () {
      const rate = 8000;
      const voice = Float32Array.from(
        { length: 3 * rate },
        (_, i) =>
          Number(i >= 0.07 * rate && i < 1.2 * rate) *
          0.3 *
          Math.sin((2 * Math.PI * 220 * i) / rate),
      );
      const { files, layer } = setup(recorded, new Map(), {
        rate,
        frames: voice.length,
        channels: [voice],
      });
      const after = yield* narrate(layer);
      const take = after.scenes['b'];
      expect(take?.file).toMatch(/^b\.[0-9a-f]{12}\.flac$/);
      expect(take?.duration).toBeCloseTo(1.2, 1);
      expect(files.has(`/films/test/narration/${take?.file}`)).toBe(true);
      const mp3s = [...files.keys()].filter((f) => /\/narration\/b\.[0-9a-f]{12}\.mp3$/.test(f));
      expect(mp3s).toEqual([]);
      for (const w of take?.words ?? []) expect(w.end).toBeLessThanOrEqual(take?.duration ?? 0);
    }),
  );

  it.effect('skips every beat whose hash is unchanged', () =>
    Effect.gen(function* () {
      const current: Timings = {
        ...recorded,
        scenes: { ...recorded.scenes, b: take('The second line.', 'b.mp3') },
      };
      const { calls, layer } = setup(current);
      const after = yield* narrate(layer);
      expect(calls.tts).toEqual([]);
      expect(after).toEqual(current);
    }),
  );

  it.effect('re-records every beat when the voice changes', () =>
    Effect.gen(function* () {
      const { calls, layer } = setup(recorded);
      const voice = { ...testVoice, settings: { stability: 0.9 } };
      const after = yield* narrate(layer, voice);
      expect(spoken(calls).toSorted()).toEqual(['Hello world.', 'The second line.']);
      expect(after.voice).toBe(voiceKey(voice));
      expect(Object.keys(after.scenes).toSorted()).toEqual(['a', 'b']);
    }),
  );

  it.effect('fails a take that says something else, and keeps it out', () =>
    Effect.gen(function* () {
      const heard = new Map([['The second line.', 'The second lie of the night.']]);
      const { files, layer } = setup(recorded, heard);
      const error = yield* Effect.flip(narrate(layer));
      expect(error._tag).toBe('TakeMismatch');
      expect(error).toMatchObject({ id: 'b', heard: 'The second lie of the night.' });
      const stored = yield* Schema.decodeEffect(TimingsJson)(
        new TextDecoder().decode(files.get(TIMINGS)),
      );
      expect(stored).toEqual(recorded);
      expect([...files.keys()].filter((f) => f.startsWith('/films/test/narration/b'))).toEqual([]);
    }),
  );

  it.effect('keeps a mismatched take for the beats --accept-mismatch names, and no other', () =>
    Effect.gen(function* () {
      const heard = new Map([['The second line.', 'The second lie of the night.']]);
      const { layer } = setup(recorded, heard);
      const other = yield* Effect.flip(
        narrate(layer, testVoice, { ...defaults, acceptMismatch: new Set(['a']) }),
      );
      expect(other).toMatchObject({ _tag: 'TakeMismatch', id: 'b' });
      const after = yield* narrate(layer, testVoice, {
        ...defaults,
        acceptMismatch: new Set(['b']),
      });
      expect(after.scenes['b']?.hash).toBe(hashText('The second line.'));
    }),
  );

  describe('a cast', () => {
    const cast: Cast = {
      model: 'eleven_v3',
      settings: { stability: 0.5 },
      voices: [
        { name: 'lead', voiceId: 'L' },
        { name: 'ask', voiceId: 'A' },
      ],
    };
    const said = "That's the law. {@ask}So where does that {stuck}leave us? {@lead}Stuck.";
    const dialogue: ReadonlyArray<Timed> = [{ id: 'd', say: said }];
    const none: Timings = { voice: voiceKey(cast), scenes: {} };

    it.effect('reads a beat as one dialogue, a line per turn', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const after = yield* narrate(layer, cast, defaults, dialogue);
        expect(calls.tts).toEqual([]);
        expect(calls.dialogue.map((r) => r.lines.map((l) => [l.voiceId, l.text]))).toEqual([
          [
            ['L', "That's the law."],
            ['A', 'So where does that leave us?'],
            ['L', 'Stuck.'],
          ],
        ]);
        const take = after.scenes['d'];
        expect(take?.hash).toBe(hashText(takeScript(Result.getOrThrow(parse('d', said)))));
        expect(take?.words.map((w) => w.text)).toEqual(
          Result.getOrThrow(parse('d', said)).spoken.split(' '),
        );
        expect(after.voice).toBe(voiceKey(cast));
      }),
    );

    it.effect('re-records a beat whose turn moved, and not one whose mark moved', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        yield* narrate(layer, cast, defaults, dialogue);
        yield* narrate(layer, cast, defaults, [{ id: 'd', say: said.replace('{stuck}', '') }]);
        expect(calls.dialogue).toHaveLength(1);
        const moved = said.replace('{@ask}So where', 'So {@ask}where');
        yield* narrate(layer, cast, defaults, [{ id: 'd', say: moved }]);
        expect(calls.dialogue).toHaveLength(2);
      }),
    );

    it.effect('refuses a turn to a voice the cast does not have, before any call', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const beats = [{ id: 'd', say: 'One. {@narrator}Two.' }];
        const error = yield* Effect.flip(narrate(layer, cast, defaults, beats));
        expect(error).toMatchObject({ _tag: 'UnknownVoice', voice: 'narrator' });
        expect([calls.tts, calls.dialogue]).toEqual([[], []]);
      }),
    );
  });

  describe("a person's takes", () => {
    const person = (spoken: string, file: string) => ({
      ...take(spoken, file),
      source: 'recorded' as const,
    });
    const owned: Timings = {
      voice: voiceKey(testVoice),
      scenes: { a: person('Hello world.', 'a.mp3'), b: person('The first line.', 'b.mp3') },
    };
    const film = (timings: Timings, voice: Voice = testVoice) =>
      ({ ...testFilm(scenes, timings, voice), timings }) satisfies LoadedFilm;
    const states = (plan: NarrationPlan) => plan.states.map((s) => [s.id, s.state._tag]);

    test('the plan names each beat recorded, staging or stale', () => {
      const plan = Result.getOrThrow(planNarration(film(owned), defaults));
      expect(states(plan)).toEqual([
        ['a', 'Recorded'],
        ['b', 'Stale'],
      ]);
      const staged = Result.getOrThrow(planNarration(film(recorded), defaults));
      expect(states(staged)).toEqual([
        ['a', 'Staging'],
        ['b', 'Stale'],
      ]);
    });

    test('--dry-run lists each beat as recorded, staging or stale', () => {
      const mixed: Timings = {
        voice: voiceKey(testVoice),
        scenes: { a: take('Hello world.', 'a.mp3'), b: person('The first line.', 'b.mp3') },
      };
      const plan = Result.getOrThrow(planNarration(film(mixed), defaults));
      expect(plan.states.map(stateLine)).toEqual([
        'staging   a',
        'stale     b (text changed, recorded take)',
      ]);
      const owner = Result.getOrThrow(planNarration(film(owned), defaults));
      expect(owner.states.map(stateLine).at(0)).toBe('recorded  a');
    });

    test('staging never replaces a current recorded take, even when forced or named', () => {
      for (const options of [
        { ...defaults, force: true },
        { ...defaults, only: Option.some(new Set(['a'])) },
      ]) {
        const plan = Result.getOrThrow(planNarration(film(owned), options));
        expect(plan.stale.map((b) => b.id)).not.toContain('a');
        expect(plan.kept.map((k) => [k.id, k.why])).toContainEqual(['a', 'recorded']);
      }
    });

    test('a stale recorded take is refused unless --replace-recorded', () => {
      const refused = Result.getOrThrow(planNarration(film(owned), defaults));
      expect(refused.stale).toEqual([]);
      expect(refused.kept.map((k) => [k.id, k.why])).toEqual([['b', 'recorded, stale']]);
      const replaced = Result.getOrThrow(
        planNarration(film(owned), { ...defaults, replaceRecorded: true }),
      );
      expect(replaced.stale.map((b) => b.id)).toEqual(['b']);
    });

    it.effect('a recorded take outlives a change of staging voice', () => {
      const { calls, layer } = setup(owned);
      return Effect.gen(function* () {
        const voice = { ...testVoice, settings: { stability: 0.9 } };
        const store = yield* ContentStore;
        const before = yield* store.read(testFilm(scenes, owned).paths.timings);
        const plan = Result.getOrThrow(planNarration(film(before, voice), defaults));
        expect(plan.stale).toEqual([]);
        yield* Narrator.use((n) => n.record(film(before, voice), plan, defaults));
        const after = yield* store.read(testFilm(scenes, owned).paths.timings);
        expect(calls.tts).toEqual([]);
        expect(after.scenes).toEqual(owned.scenes);
        expect(after.voice).toBe(voiceKey(voice));
      }).pipe(Effect.provide(layer));
    });

    it.effect("a renamed beat's recorded take is kept and reported, never swept", () => {
      const { files, layer } = setup(owned);
      files.set('/films/test/narration/a.mp3', text('Hello world.'));
      const renamed = scenes.map((s) => {
        if (s.id === 'a') return { ...s, id: 'hello' };
        return s;
      });
      return Effect.gen(function* () {
        const store = yield* ContentStore;
        const before = yield* store.read(testFilm(scenes, owned).paths.timings);
        const loaded = { ...testFilm(renamed, before), timings: before };
        const plan = Result.getOrThrow(planNarration(loaded, defaults));
        expect(plan.orphaned).toEqual([{ id: 'a', file: 'a.mp3' }]);
        yield* Narrator.use((n) => n.record(loaded, plan, defaults));
        const after = yield* store.read(testFilm(scenes, owned).paths.timings);
        expect(after.scenes['a']).toEqual(owned.scenes['a']);
        expect(files.has('/films/test/narration/a.mp3')).toBe(true);
      }).pipe(Effect.provide(layer));
    });
  });

  describe('a cast of one', () => {
    const solo: Cast = {
      model: 'eleven_v3',
      settings: { stability: 0.5 },
      voices: [{ name: 'lead', voiceId: 'L' }],
    };
    const said = 'Grace, {free}freely given. Received, not earned.';
    const none: Timings = { voice: voiceKey(solo), scenes: {} };

    it.effect('plans, reads and captions the film as one narrator, with no dash', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const after = yield* narrate(layer, solo, defaults, [{ id: 's', say: said }]);
        expect(calls.dialogue.map((r) => r.lines.map((l) => [l.name, l.text]))).toEqual([
          [['lead', 'Grace, freely given. Received, not earned.']],
        ]);
        const voice = Result.getOrThrow(voiceFor('s', said, after));
        expect(voice.recorded).toBe(true);
        const captions = captionCues(voice.words, voice.turns).map((c) => c.text);
        expect(captions.length).toBeGreaterThan(0);
        expect(captions.filter((c) => c.startsWith('-'))).toEqual([]);
      }),
    );

    it.effect('refuses a turn to a voice the one-voice cast does not have', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const beats = [{ id: 's', say: 'One. {@ask}Two?' }];
        const error = yield* Effect.flip(narrate(layer, solo, defaults, beats));
        expect(error).toMatchObject({ _tag: 'UnknownVoice', voice: 'ask', known: ['lead'] });
        expect(calls.dialogue).toEqual([]);
      }),
    );
  });

  describe('crash safety', () => {
    const DIR = '/films/test/narration';
    const said = 'Hello world.';
    const agreed = (): Map<string, Uint8Array> => {
      const audio = text(said);
      const timings: Timings = {
        voice: voiceKey(testVoice),
        scenes: {
          a: {
            hash: hashText(said),
            file: 'a.mp3',
            duration: fakeLength(audio),
            words: [],
            source: 'elevenlabs',
          },
        },
      };
      return new Map([
        [TIMINGS, text(Schema.encodeSync(TimingsJson)(timings))],
        [`${DIR}/a.mp3`, audio],
        [`${DIR}/full.wav`, text('mix')],
      ]);
    };
    const reRecordA: NarrateOptions = { ...defaults, only: Option.some(new Set(['a'])) };

    const run = (files: Map<string, Uint8Array>, fs: Layer.Layer<FileSystem.FileSystem>) => {
      const layer = Narrator.layer.pipe(
        Layer.provide(StagingCache.layer(STAGING)),
        Layer.provideMerge(
          ContentStore.layer.pipe(
            Layer.provide([fs, Path.layer, Layer.succeed(ManifestLock, memoryManifestLock())]),
          ),
        ),
        Layer.provide([fs, Path.layer, fakeElevenLabs(files, emptyCalls()), fakeMedia(files)]),
      );
      return narrate(layer, testVoice, reRecordA);
    };

    const expectAgreement = (files: Map<string, Uint8Array>) => {
      const timings = Schema.decodeSync(TimingsJson)(new TextDecoder().decode(files.get(TIMINGS)));
      for (const [id, take] of Object.entries(timings.scenes)) {
        const audio = Option.fromNullishOr(files.get(`${DIR}/${take.file}`));
        expect({ id, onDisk: Option.isSome(audio) }).toEqual({ id, onDisk: true });
        if (Option.isNone(audio)) continue;
        expect({ id, duration: fakeLength(audio.value) }).toEqual({ id, duration: take.duration });
        expect(hashText(new TextDecoder().decode(audio.value).trim())).toBe(take.hash);
      }
    };

    it.effect('a re-recorded take and its timings agree after a crash at any step', () =>
      Effect.gen(function* () {
        const clean = agreed();
        const counted = crashingFileSystem(clean, 0);
        yield* run(clean, counted.layer);
        expectAgreement(clean);
        expect(counted.ops()).toBeGreaterThan(4);
        for (let nth = 1; nth <= counted.ops(); nth++) {
          const files = agreed();
          yield* Effect.exit(run(files, crashingFileSystem(files, nth).layer));
          expectAgreement(files);
        }
      }),
    );

    it.effect('the next run clears what a crashed run left behind, putting every take away', () =>
      Effect.gen(function* () {
        const files = agreed();
        files.set(`${DIR}/b.take.mp3`, text('stray'));
        files.set(`${DIR}/a.0123456789ab.mp3`, text('orphan'));
        files.set(`${DIR}/b.0123456789ab.flac`, text('replaced master'));
        const unowned = `${TIMINGS}.partial`;
        files.set(unowned, text('{'));
        const layer = Narrator.layer.pipe(
          Layer.provide(StagingCache.layer(STAGING)),
          Layer.provideMerge(storeLayer(files)),
          Layer.provide([
            memoryFileSystem(files),
            Path.layer,
            fakeElevenLabs(files, emptyCalls()),
            fakeMedia(files),
          ]),
        );
        yield* narrate(layer);
        const left = [...files.keys()]
          .filter((f) => f.startsWith(`${DIR}/`) && !f.startsWith(`${DIR}/attempts/`))
          .toSorted();
        const takes = yield* Schema.decodeEffect(TimingsJson)(
          new TextDecoder().decode(files.get(TIMINGS)),
        );
        const current = Object.values(takes.scenes).map((t) => `${DIR}/${t.file}`);
        expect(left).toEqual([`${DIR}/full.wav`, TIMINGS, unowned, ...current].toSorted());
        expect(
          [
            `${DIR}/attempts/b/b.take.mp3`,
            `${DIR}/attempts/a/a.0123456789ab.mp3`,
            `${DIR}/attempts/b/b.0123456789ab.flac`,
          ].map((f) => new TextDecoder().decode(files.get(f))),
        ).toEqual(['stray', 'orphan', 'replaced master']);
      }),
    );
  });

  it.live("a sweep in another process never puts away the take a lab's Undo is bringing back", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const base = testFilm(scenes, recorded).paths;
      const paths = {
        ...base,
        dir,
        narration: `${dir}/narration`,
        timings: { ...base.timings, file: `${dir}/narration/timings.json` },
      };
      const naming = (file: string) =>
        Schema.encodeEffect(TimingsJson)({
          ...recorded,
          scenes: { a: take('Hello world.', file) },
        });
      const [now, back] = ['a.0123456789ab.flac', 'a.ba9876543210.flac'];
      yield* fs.makeDirectory(`${paths.narration}/attempts/a`, { recursive: true });
      yield* fs.writeFileString(paths.timings.file, yield* naming(now));
      yield* fs.writeFileString(`${paths.narration}/${now}`, 'the take now');
      yield* fs.writeFileString(`${paths.narration}/attempts/a/${back}`, 'the take before');
      const [brought, asked, swept] = [
        yield* Deferred.make<boolean>(),
        yield* Deferred.make<boolean>(),
        yield* Deferred.make<boolean>(),
      ];
      const asking: ManifestLockService = {
        take: (file) =>
          Effect.andThen(
            Effect.when(Deferred.succeed(asked, true), Effect.succeed(file === paths.timings.file)),
            bunManifestLock.take(file),
          ),
      };
      const own = Effect.map(Layer.build(ContentStore.layer), Context.get(ContentStore));
      const lab = yield* own;
      const narrate = yield* own.pipe(Effect.provideService(ManifestLock, asking));
      const undo = lab.holding(paths.timings, () =>
        Effect.gen(function* () {
          yield* fs.copyFile(`${paths.narration}/attempts/a/${back}`, `${paths.narration}/${back}`);
          yield* Deferred.succeed(brought, true);
          yield* Effect.raceFirst(Deferred.await(asked), Deferred.await(swept));
          yield* fs.writeFileString(paths.timings.file, yield* naming(back));
        }),
      );
      const undoing = yield* Effect.forkChild(undo);
      yield* Deferred.await(brought);
      yield* sweepNarration(paths).pipe(
        Effect.provideService(ContentStore, narrate),
        Effect.ensuring(Deferred.succeed(swept, true)),
      );
      yield* Fiber.join(undoing);
      expect(yield* fs.readFileString(`${paths.narration}/${back}`)).toBe('the take before');
      expect(yield* fs.exists(`${paths.narration}/${now}`)).toBe(false);
      expect(yield* fs.readFileString(`${paths.narration}/attempts/a/${now}`)).toBe('the take now');
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  describe('two writers on one film', () => {
    const DIR = '/films/test/narration';
    const host = () =>
      Layer.mergeAll(Path.layer, Layer.succeed(ManifestLock, memoryManifestLock()));
    const filed = () => new Map([[TIMINGS, text(Schema.encodeSync(TimingsJson)(recorded))]]);
    const fileSystemOf = (files: Map<string, Uint8Array>) =>
      Effect.map(Layer.build(memoryFileSystem(files)), Context.get(FileSystem.FileSystem));
    const sweepElsewhere = (fs: FileSystem.FileSystem) =>
      Effect.gen(function* () {
        const disk = Layer.succeed(FileSystem.FileSystem, fs);
        const store = Context.get(
          yield* Layer.build(ContentStore.layer.pipe(Layer.provide([disk, Path.layer]))),
          ContentStore,
        );
        yield* sweepNarration(testFilm(scenes, recorded).paths).pipe(
          Effect.provideService(ContentStore, store),
          Effect.provideService(FileSystem.FileSystem, fs),
        );
      });
    const firstRun = (
      fs: FileSystem.FileSystem,
      files: Map<string, Uint8Array>,
      heard: Effect.Effect<boolean> = Effect.succeed(true),
    ) => {
      const stt = Layer.effect(
        ElevenLabs,
        Effect.map(ElevenLabs, (fake) =>
          ElevenLabs.of({ ...fake, stt: (file) => fake.stt(file).pipe(Effect.tap(() => heard)) }),
        ),
      ).pipe(Layer.provide(fakeElevenLabs(files, emptyCalls())));
      const disk = Layer.succeed(FileSystem.FileSystem, fs);
      return narrate(
        Narrator.layer.pipe(
          Layer.provide(StagingCache.layer(STAGING)),
          Layer.provideMerge(ContentStore.layer.pipe(Layer.provide([disk, Path.layer]))),
          Layer.provide([disk, Path.layer, stt, fakeMedia(files)]),
        ),
      );
    };
    const placed = (files: Map<string, Uint8Array>, after: Timings) => {
      const file = after.scenes['b']?.file ?? '';
      return { file, inNarration: files.has(`${DIR}/${file}`) };
    };

    it.effect("a take being made is not in narration/ for another run's sweep to put away", () =>
      Effect.gen(function* () {
        const files = filed();
        const fs = yield* fileSystemOf(files);
        const [asked, answer] = [yield* Deferred.make<boolean>(), yield* Deferred.make<boolean>()];
        const recording = yield* Effect.forkChild(
          firstRun(
            fs,
            files,
            Effect.andThen(Deferred.succeed(asked, true), Deferred.await(answer)),
          ),
        );
        yield* Deferred.await(asked);
        yield* sweepElsewhere(fs);
        const putAway = [...files.keys()].filter((f) => f.startsWith(`${DIR}/attempts/`));
        yield* Deferred.succeed(answer, true);
        const after = yield* Fiber.join(recording);
        expect(after.scenes['b']?.file).toMatch(/^b\.[0-9a-f]{12}\.mp3$/);
        expect(placed(files, after)).toMatchObject({ inNarration: true });
        expect(putAway).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(host())),
    );

    it.live("another run's sweep waits for a take placed in narration/ to be named", () =>
      Effect.gen(function* () {
        const files = filed();
        const fs = yield* fileSystemOf(files);
        const [landed, go, asked, swept] = [
          yield* Deferred.make<boolean>(),
          yield* Deferred.make<boolean>(),
          yield* Deferred.make<boolean>(),
          yield* Deferred.make<boolean>(),
        ];
        const placing = FileSystem.FileSystem.of({
          ...fs,
          rename: (from, to) => {
            if (!to.startsWith(`${DIR}/b.`)) return fs.rename(from, to);
            return fs
              .rename(from, to)
              .pipe(
                Effect.andThen(Deferred.succeed(landed, true)),
                Effect.andThen(Deferred.await(go)),
              );
          },
        });
        const locks = yield* ManifestLock;
        const asking: ManifestLockService = {
          take: (file) =>
            locks
              .take(file)
              .pipe(
                Effect.tap((got) =>
                  Effect.when(
                    Deferred.succeed(asked, true),
                    Effect.succeed(file === TIMINGS && Option.isNone(got)),
                  ),
                ),
              ),
        };
        const recording = yield* Effect.forkChild(firstRun(placing, files));
        yield* Deferred.await(landed);
        const sweeping = yield* Effect.forkChild(
          sweepElsewhere(fs).pipe(
            Effect.provideService(ManifestLock, asking),
            Effect.ensuring(Deferred.succeed(swept, true)),
          ),
        );
        yield* Effect.raceFirst(Deferred.await(asked), Deferred.await(swept));
        yield* Deferred.succeed(go, true);
        const after = yield* Fiber.join(recording);
        yield* Fiber.join(sweeping);
        expect(placed(files, after)).toMatchObject({ inNarration: true });
      }).pipe(Effect.scoped, Effect.provide(host())),
    );

    const midMix = (fs: FileSystem.FileSystem) =>
      Effect.gen(function* () {
        const [begun, finish] = [yield* Deferred.make<boolean>(), yield* Deferred.make<boolean>()];
        const mix = writeWholeWith(
          fs,
          `${DIR}/full.wav`,
          (partial) =>
            fs
              .writeFile(partial, text('the mix'))
              .pipe(
                Effect.andThen(Deferred.succeed(begun, true)),
                Effect.andThen(Deferred.await(finish)),
              ),
          (partial) => fs.rename(partial, `${DIR}/full.wav`),
        );
        const mixing = yield* Effect.forkChild(Effect.exit(mix));
        yield* Deferred.await(begun);
        return { mixing, finish };
      });

    const partialsIn = (files: Map<string, Uint8Array>) =>
      [...files.keys()].filter((f) => f.startsWith(`${DIR}/`) && f.endsWith('.partial'));

    it.effect("a sweep spares a running writer's partial", () =>
      Effect.gen(function* () {
        const files = filed();
        const fs = yield* fileSystemOf(files);
        const { mixing, finish } = yield* midMix(fs);
        yield* sweepElsewhere(fs);
        yield* Deferred.succeed(finish, true);
        expect(Exit.isSuccess(yield* Fiber.join(mixing))).toBe(true);
        expect(new TextDecoder().decode(files.get(`${DIR}/full.wav`))).toBe('the mix');
      }).pipe(
        Effect.scoped,
        Effect.provide(host()),
        processesOn('here', (pid) => pid === process.pid),
      ),
    );

    it.effect('a sweep removes the partial of a writer on this host that no longer runs', () =>
      Effect.gen(function* () {
        const files = filed();
        const fs = yield* fileSystemOf(files);
        const { mixing } = yield* midMix(fs);
        expect(partialsIn(files)).toHaveLength(1);
        yield* sweepElsewhere(fs).pipe(processesOn('here', () => false));
        expect(partialsIn(files)).toEqual([]);
        yield* Fiber.interrupt(mixing);
      }).pipe(
        Effect.scoped,
        Effect.provide(host()),
        processesOn('here', () => true),
      ),
    );

    it.effect('a sweep keeps a partial whose name carries no host', () =>
      Effect.gen(function* () {
        const files = filed();
        const fs = yield* fileSystemOf(files);
        const partial = `${DIR}/full.wav.4242-7.partial`;
        files.set(partial, text('the mix'));
        yield* sweepElsewhere(fs).pipe(processesOn('here', () => false));
        expect(Exit.isSuccess(yield* Effect.exit(fs.rename(partial, `${DIR}/full.wav`)))).toBe(
          true,
        );
        expect(new TextDecoder().decode(files.get(`${DIR}/full.wav`))).toBe('the mix');
      }).pipe(Effect.scoped, Effect.provide(host())),
    );

    it.effect(
      'a sweep spares the partial of a writer on another host, whose pid means nothing here',
      () =>
        Effect.gen(function* () {
          const files = filed();
          const fs = yield* fileSystemOf(files);
          const { mixing, finish } = yield* midMix(fs).pipe(processesOn('elsewhere', () => true));
          yield* sweepElsewhere(fs).pipe(processesOn('here', () => false));
          yield* Deferred.succeed(finish, true);
          expect(Exit.isSuccess(yield* Fiber.join(mixing))).toBe(true);
          expect(new TextDecoder().decode(files.get(`${DIR}/full.wav`))).toBe('the mix');
        }).pipe(Effect.scoped, Effect.provide(host())),
    );
  });
});
