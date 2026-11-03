import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type BeatSpan, cutPcm, cutsAround, placeBeats, timeScript } from '../core/align.ts';
import type { BeatUnplaced, LineError, UnknownVoice } from '../core/errors.ts';
import type { Pcm } from '../core/audio.ts';
import { MIX_RATE } from '../core/mix.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import { lineError } from '../core/spoken.ts';
import type { ReadBeat } from '../core/studio.ts';
import { prepareTake } from '../core/recording.ts';
import { voicedWords } from '../core/voiced.ts';
import { type Timings, TimingsJson, VoiceTiming } from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { ElevenLabs, heardWords } from './elevenlabs.ts';
import { NamedFileMissing, TakeAmbiguous } from './errors.ts';
import type { Follows } from './source-writer.ts';
import {
  type ElevenLabsFailed,
  type MediaFailed,
  RecordingInvalid,
  type SttUntimed,
  TakeMismatch,
} from '../core/refusals.ts';
import type { FilmPaths } from './film-repo.ts';
import { Media } from './media.ts';
import {
  MAX_WORD_ERROR,
  type VoicedFilm,
  contentHash,
  hashOfTake,
  isKeptAside,
  putAwayTake,
  putAwayUnnamed,
  sameBytes,
  takeFile,
} from './narrator.ts';

const RECORDING_EXTENSIONS = ['.wav', '.m4a', '.mp3', '.aif', '.aiff', '.flac'] as const;

const LOSSLESS_EXTENSIONS = ['.wav', '.aif', '.aiff', '.flac'] as const;

export const Attempt = Schema.Struct({
  beat: Schema.String,
  file: Schema.String,
  original: Schema.optionalKey(Schema.String),
  cut: Schema.optionalKey(Schema.Struct({ from: Schema.Finite, to: Schema.Finite })),
  take: VoiceTiming,
  heard: Schema.String,
  wer: Schema.Finite,
  at: Schema.Finite,
});
export type Attempt = typeof Attempt.Type;

const Attempts = Schema.Struct({ attempts: Schema.Array(Attempt) });
type Attempts = typeof Attempts.Type;
const AttemptsJson = Schema.fromJsonString(Attempts, { space: 2 });

export interface ImportOptions {
  readonly only: Option.Option<ReadonlySet<string>>;
  readonly acceptMismatch: ReadonlySet<string>;
  readonly whole: boolean;
}

interface BeatOptions {
  readonly acceptMismatch: boolean;
}

const forBeat = (options: ImportOptions, id: string): BeatOptions => ({
  acceptMismatch: options.acceptMismatch.has(id),
});

type TakesError =
  | RecordingInvalid
  | TakeMismatch
  | BeatUnplaced
  | UnknownVoice
  | LineError
  | ElevenLabsFailed
  | SttUntimed
  | MediaFailed
  | StoreError
  | PlatformError;

const isRecording = (name: string): boolean =>
  RECORDING_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

const beatNamed = (file: string): string => {
  const name = file.slice(file.lastIndexOf('/') + 1);
  return name.slice(0, Math.max(0, name.lastIndexOf('.')));
};

const spokenBeats = (beats: ReadonlyArray<ReadBeat>) =>
  new Map(beats.filter((b) => b.text.length > 0).map((b) => [b.id, b]));

const onlyOne = (only: Option.Option<ReadonlySet<string>>): Option.Option<string> =>
  Option.flatMap(
    Option.filter(only, (ids) => ids.size === 1),
    (ids) => Arr.head([...ids]),
  );

const allowed = (only: Option.Option<ReadonlySet<string>>, id: string): boolean =>
  Option.match(only, { onNone: () => true, onSome: (ids) => ids.has(id) });

const withRecorded =
  (film: VoicedFilm, id: string, take: VoiceTiming) =>
  (timings: Timings): Timings => {
    const scenes = { ...timings.scenes, [id]: take };
    if (timings.voice.length === 0) return { voice: voiceKey(film.voice), scenes };
    return { voice: timings.voice, scenes };
  };

interface Source {
  readonly file: string;
  readonly original: string;
  readonly cut: Option.Option<{ readonly from: number; readonly to: number }>;
}

interface Imported {
  readonly id: string;
  readonly take: VoiceTiming;
  readonly heard: string;
  readonly wer: number;
}

interface TakesService {
  readonly importPath: (
    film: VoicedFilm,
    path: string,
    options: ImportOptions,
  ) => Effect.Effect<ReadonlyArray<Imported>, TakesError>;
  readonly recordAttempt: (
    film: VoicedFilm,
    beat: string,
    file: string,
  ) => Effect.Effect<Attempt, TakesError>;
  readonly attempts: (
    film: FilmPaths,
    beat: string,
  ) => Effect.Effect<ReadonlyArray<Attempt>, StoreError>;
  readonly attemptFile: (
    film: FilmPaths,
    beat: string,
    file: string,
  ) => Effect.Effect<Option.Option<string>, StoreError>;
  readonly keepAttempt: (
    film: VoicedFilm,
    beat: string,
    file: string,
    options: BeatOptions,
  ) => Effect.Effect<Imported, TakesError>;
  readonly named: (film: FilmPaths) => Follows;
}

const takesOf = (timings: Timings): ReadonlyArray<readonly [string, string]> =>
  Object.entries(timings.scenes).map(([beat, t]) => [beat, t.file] as const);

const takesIn = (text: string): ReadonlyArray<readonly [string, string]> =>
  Option.match(Schema.decodeOption(TimingsJson)(text), { onNone: () => [], onSome: takesOf });

const onlyIn = (
  from: ReadonlyArray<readonly [string, string]>,
  to: ReadonlyArray<readonly [string, string]>,
) => {
  const kept = new Set(to.map(([, file]) => file));
  return from.filter(([, file]) => !kept.has(file));
};

export class Takes extends Context.Service<Takes, TakesService>()('@manna/film/tools/Takes') {
  static readonly layer = Layer.effect(
    Takes,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const elevenLabs = yield* ElevenLabs;
      const media = yield* Media;

      const attemptsDir = (film: FilmPaths, beat: string) =>
        path.join(film.narration, 'attempts', beat);
      const ledger = (film: FilmPaths, beat: string): Manifest<Attempts> => ({
        file: path.join(attemptsDir(film, beat), 'attempts.json'),
        codec: AttemptsJson,
        empty: { attempts: [] },
      });

      const beatsById = (film: VoicedFilm) => Effect.succeed(spokenBeats(film.beats));

      const beatFor = (film: VoicedFilm, id: string, file: string) =>
        Effect.flatMap(beatsById(film), (beats) =>
          Effect.fromOption(Option.fromNullishOr(beats.get(id)), () =>
            RecordingInvalid.make({
              file,
              reason: `the film has no beat "${id}" with a line; its beats are ${[...beats.keys()].join(', ')}`,
            }),
          ),
        );

      const keepOriginal = Effect.fn('Takes.keepOriginal')(function* (
        film: VoicedFilm,
        dir: string,
        file: string,
      ) {
        const bytes = yield* fs.readFile(file);
        const name = `${dir}.${contentHash(bytes)}.orig${path.extname(file).toLowerCase()}`;
        yield* store.writeFile(path.join(attemptsDir(film.paths, dir), name), bytes);
        if (!LOSSLESS_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext)))
          yield* Effect.logWarning(
            `takes.lossy file=${file} (the master is lossless from here, but this recording already lost what its codec drops; record WAV or FLAC for the final voice)`,
          );
        return `${dir}/${name}`;
      });

      const attempt = Effect.fn('Takes.attempt')(function* (
        film: VoicedFilm,
        beat: ReadBeat,
        source: Source,
        recording: Pcm,
      ) {
        const prepared = yield* Effect.fromOption(prepareTake(recording)).pipe(
          Effect.mapError(() =>
            RecordingInvalid.make({
              file: source.file,
              reason: 'nothing in it is louder than the room; check the input level',
            }),
          ),
        );
        const audio = yield* media.encodeFlac(prepared);
        const file = takeFile(beat.id, audio, '.flac');
        const at = path.join(attemptsDir(film.paths, beat.id), file);
        yield* store.writeFile(at, audio);
        const reply = yield* elevenLabs.stt(at);
        const heard = yield* Effect.fromResult(heardWords(reply, source.file));
        const { seconds: duration } = yield* media.timing(at);
        const wer = lineError(beat.text, reply.text, film.heardAs);
        const made: Attempt = {
          beat: beat.id,
          file,
          original: source.original,
          ...Option.match(source.cut, { onNone: () => ({}), onSome: (cut) => ({ cut }) }),
          take: {
            hash: hashText(beat.script),
            file,
            duration,
            words: voicedWords(timeScript(beat.text, heard, duration), prepared),
            source: 'recorded',
          },
          heard: reply.text,
          wer,
          at: yield* Clock.currentTimeMillis,
        };
        yield* store.update(ledger(film.paths, beat.id), (kept) => ({
          attempts: [...kept.attempts.filter((a) => a.file !== file), made],
        }));
        yield* Effect.log(
          `takes.attempt id=${beat.id} file=${file} secs=${duration.toFixed(2)} wer=${(wer * 100).toFixed(1)}%`,
        );
        return made;
      });

      const io = yield* Effect.context<FileSystem.FileSystem | Path.Path | ContentStore>();

      const putAwayReplaced = (film: FilmPaths, before: Timings, after: Timings) =>
        Effect.forEach(
          onlyIn(takesOf(before), takesOf(after)),
          ([beat, file]) => putAwayUnnamed(film, beat, file).pipe(Effect.provideContext(io)),
          { discard: true },
        );

      const putAwayAs = (film: FilmPaths, beat: string, file: string) =>
        Effect.gen(function* () {
          const dir = attemptsDir(film, beat);
          if (!(yield* fs.exists(dir))) return Option.none<string>();
          const names = (yield* fs.readDirectory(dir))
            .filter((name) => name === file || isKeptAside(file, name))
            .toSorted();
          const copies = yield* Effect.forEach(names, (name) =>
            Effect.map(fs.readFile(path.join(dir, name)), (bytes) => ({ name, bytes })),
          );
          const named = hashOfTake(file);
          if (Option.isSome(named)) {
            const take = Arr.findFirst(copies, (c) => contentHash(c.bytes) === named.value);
            if (Option.isNone(take) && copies.length > 0)
              return yield* NamedFileMissing.make({
                file,
                reason: `has copies in narration/attempts/${beat}/ (${names.join(', ')}), none holding the audio its name hashes`,
              });
            return Option.map(take, (c) => path.join(dir, c.name));
          }
          const distinct = copies.filter(
            (c, i) => copies.findIndex((d) => sameBytes(d.bytes, c.bytes)) === i,
          );
          if (distinct.length > 1) return yield* TakeAmbiguous.make({ file, copies: names });
          return Option.map(Arr.head(copies), (c) => path.join(dir, c.name));
        });

      const bringTake = (film: FilmPaths, beat: string, file: string) =>
        Effect.gen(function* () {
          const take = path.join(film.narration, file);
          if (yield* fs.exists(take)) return;
          const kept = yield* putAwayAs(film, beat, file);
          if (Option.isNone(kept))
            return yield* NamedFileMissing.make({
              file,
              reason: `is a take in neither narration/ nor narration/attempts/${beat}/`,
            });
          yield* store.writeFile(take, yield* fs.readFile(kept.value));
          yield* Effect.log(
            `takes.brought-back id=${beat} file=${file} from=${path.basename(kept.value)}`,
          );
        }).pipe(
          Effect.catchTag('PlatformError', (error) =>
            Effect.fail(NamedFileMissing.make({ file, reason: error.message })),
          ),
        );

      const named = (film: FilmPaths): Follows => ({
        bring: (from, to) =>
          Effect.forEach(
            onlyIn(takesIn(to), takesIn(from)),
            ([beat, file]) => bringTake(film, beat, file),
            { discard: true },
          ),
        putAway: (from, to) =>
          Effect.forEach(
            onlyIn(takesIn(from), takesIn(to)),
            ([beat, file]) => putAwayTake(film, beat, file).pipe(Effect.provideContext(io)),
            { discard: true },
          ),
        remake: Option.none(),
      });

      const keep = Effect.fn('Takes.keep')(function* (
        film: VoicedFilm,
        beat: ReadBeat,
        made: Attempt,
        options: BeatOptions,
      ) {
        const wer = lineError(beat.text, made.heard, film.heardAs);
        if (wer > MAX_WORD_ERROR) {
          const mismatch = TakeMismatch.make({
            id: beat.id,
            script: beat.text,
            heard: made.heard,
            wer,
          });
          if (!options.acceptMismatch) return yield* mismatch;
          yield* Effect.logWarning(`takes.mismatch accepted=true ${mismatch.message}`);
        }
        const bytes = yield* fs.readFile(path.join(attemptsDir(film.paths, beat.id), made.file));
        const [before, after] = yield* store.transact(film.paths.timings, (before) =>
          Effect.gen(function* () {
            yield* store.writeFile(path.join(film.paths.narration, made.file), bytes);
            const after = withRecorded(film, beat.id, made.take)(before);
            return [[before, after], after] as const;
          }),
        );
        yield* putAwayReplaced(film.paths, before, after);
        yield* Effect.log(`takes.kept id=${beat.id} file=${made.file} source=recorded`);
        return {
          id: beat.id,
          take: made.take,
          heard: made.heard,
          wer,
        } satisfies Imported;
      });

      const attemptOne = (film: VoicedFilm, beat: ReadBeat, file: string) =>
        Effect.gen(function* () {
          const recording = yield* media.load(file, MIX_RATE);
          const original = yield* keepOriginal(film, beat.id, file);
          return yield* attempt(film, beat, { file, original, cut: Option.none() }, recording);
        });

      const importOne = (film: VoicedFilm, beat: ReadBeat, file: string, options: BeatOptions) =>
        Effect.flatMap(attemptOne(film, beat, file), (made) => keep(film, beat, made, options));

      const recordAttempt = Effect.fn('Takes.recordAttempt')(function* (
        film: VoicedFilm,
        id: string,
        file: string,
      ) {
        return yield* attemptOne(film, yield* beatFor(film, id, file), file);
      });

      const folder = Effect.fn('Takes.folder')(function* (
        film: VoicedFilm,
        dir: string,
        options: ImportOptions,
      ) {
        const beats = yield* beatsById(film);
        const files = (yield* fs.readDirectory(dir))
          .filter(isRecording)
          .map((name) => path.join(dir, name));
        const unknown = Arr.head(files.filter((f) => !beats.has(beatNamed(f))));
        if (Option.isSome(unknown))
          return yield* RecordingInvalid.make({
            file: unknown.value,
            reason: `named for no beat with a line; name it <beat>${path.extname(unknown.value)}, one of ${[...beats.keys()].join(', ')}`,
          });
        const twice = Arr.head(
          files.filter((f, i) => files.findIndex((g) => beatNamed(g) === beatNamed(f)) !== i),
        );
        if (Option.isSome(twice))
          return yield* RecordingInvalid.make({
            file: twice.value,
            reason: `a second recording of beat "${beatNamed(twice.value)}"; keep one`,
          });
        const wanted = [...beats.values()].flatMap((beat) =>
          files
            .filter((f) => beatNamed(f) === beat.id && allowed(options.only, beat.id))
            .map((file) => ({ beat, file })),
        );
        if (wanted.length === 0)
          return yield* RecordingInvalid.make({
            file: dir,
            reason: `no recordings named for a beat to import (${RECORDING_EXTENSIONS.join(' ')})`,
          });
        return wanted;
      });

      const single = Effect.fn('Takes.single')(function* (
        film: VoicedFilm,
        file: string,
        options: ImportOptions,
      ) {
        const id = Option.getOrElse(onlyOne(options.only), () => beatNamed(file));
        if (!allowed(options.only, id))
          return yield* RecordingInvalid.make({
            file,
            reason: 'one recording is one beat: give --only just the beat it is',
          });
        return [{ beat: yield* beatFor(film, id, file), file }];
      });

      const whole = Effect.fn('Takes.whole')(function* (
        film: VoicedFilm,
        file: string,
        options: ImportOptions,
      ) {
        const beats = [...(yield* beatsById(film)).values()];
        const recording = yield* media.load(file, MIX_RATE);
        const heard = yield* Effect.fromResult(heardWords(yield* elevenLabs.stt(file), file));
        const spans: ReadonlyArray<BeatSpan> = yield* Effect.fromResult(
          placeBeats(beats, heard, recording.frames / recording.rate),
        );
        const cuts = cutsAround(spans, recording);
        const original = yield* keepOriginal(film, 'whole', file);
        const chosen = Arr.zip(beats, cuts).filter(([beat]) => allowed(options.only, beat.id));
        const made = yield* Effect.forEach(chosen, ([beat, cut]) =>
          attempt(
            film,
            beat,
            {
              file: `${file}#${beat.id}`,
              original,
              cut: Option.some({ from: cut.from, to: cut.to }),
            },
            cutPcm(recording, cut),
          ).pipe(Effect.map((a) => ({ beat, made: a }))),
        );
        yield* Effect.log(`takes.whole file=${file} beats=${cuts.length} imported=${made.length}`);
        return made;
      });

      const importPath = Effect.fn('Takes.importPath')(function* (
        film: VoicedFilm,
        at: string,
        options: ImportOptions,
      ) {
        if (options.whole) {
          const made = yield* whole(film, at, options);
          return yield* Effect.forEach(made, ({ beat, made: m }) =>
            keep(film, beat, m, forBeat(options, beat.id)),
          );
        }
        const recordings = yield* Effect.suspend(() => {
          if (isRecording(at)) return single(film, at, options);
          return folder(film, at, options);
        });
        return yield* Effect.forEach(recordings, ({ beat, file }) =>
          importOne(film, beat, file, forBeat(options, beat.id)).pipe(
            Effect.tapError((error) =>
              Effect.logError(`takes.failed id=${beat.id} error=${error._tag}`),
            ),
          ),
        );
      });

      const attempts = Effect.fn('Takes.attempts')(function* (film: FilmPaths, beat: string) {
        const stored = yield* store.read(ledger(film, beat));
        return [...stored.attempts].reverse();
      });

      const keepAttempt = Effect.fn('Takes.keepAttempt')(function* (
        film: VoicedFilm,
        id: string,
        file: string,
        options: BeatOptions,
      ) {
        const beat = yield* beatFor(film, id, file);
        const made = Arr.findFirst(yield* attempts(film.paths, id), (a) => a.file === file);
        if (Option.isNone(made))
          return yield* RecordingInvalid.make({
            file,
            reason: `no attempt of beat "${id}" by that name`,
          });
        if (made.value.take.hash !== hashText(beat.script))
          return yield* RecordingInvalid.make({
            file,
            reason: `recorded for an earlier line of beat "${id}"; record it again`,
          });
        return yield* keep(film, beat, made.value, options);
      });

      const attemptFile = Effect.fn('Takes.attemptFile')(function* (
        film: FilmPaths,
        beat: string,
        file: string,
      ) {
        const known = Arr.findFirst(yield* attempts(film, beat), (a) => a.file === file);
        return Option.map(known, (a) => path.join(attemptsDir(film, beat), a.file));
      });

      return Takes.of({
        importPath,
        recordAttempt,
        attempts,
        attemptFile,
        keepAttempt,
        named,
      });
    }),
  );
}
