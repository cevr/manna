import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Record as Rec,
  Result,
  String as Str,
} from 'effect';
import { Base64 } from 'effect/encoding';
import { holdsIn, shiftedBy, spokenAlignment } from '../core/delivery.ts';
import { type AlignmentMismatch, type LineError, type UnknownVoice } from '../core/errors.ts';
import type { Pcm } from '../core/audio.ts';
import {
  deliveredAs,
  hashText,
  heldInside,
  linesOf,
  parse,
  type TakeState,
  takeScript,
  takeState,
  voiceKey,
  wordsFromAlignment,
} from '../core/narration.ts';
import { trimTail, withGaps } from '../core/recording.ts';
import {
  type HeardAs,
  TAKE_TOLERANCE,
  type Timings,
  type Voice,
  type VoiceTiming,
} from '../core/schema.ts';
import { lineError } from '../core/spoken.ts';
import type { ReadBeat } from '../core/studio.ts';
import { voicedWords } from '../core/voiced.ts';
import { ContentStore, type StoreError, partialAbandoned } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  ElevenLabsFailed,
  type MediaFailed,
  type StagingCapReached,
  TakeMismatch,
} from '../core/refusals.ts';
import { type FilmPaths, type LoadedFilm, readerOf } from './film-repo.ts';
import type { TalkUnvoiced } from './errors.ts';
import { Media } from './media.ts';
import { settleAll } from './settle.ts';
import {
  type Made,
  type StagedTake,
  StagingCache,
  audioName,
  type StagingAsk,
  type StagingRequest,
  stagingRequest,
} from './staging.ts';

export const MAX_WORD_ERROR = 0.08;

export interface NarrateOptions {
  readonly only: Option.Option<ReadonlySet<string>>;
  readonly force: boolean;
  readonly acceptMismatch: ReadonlySet<string>;
  readonly replaceRecorded: boolean;
}

interface BeatTake {
  readonly id: string;
  readonly state: TakeState;
}

interface Kept {
  readonly id: string;
  readonly why: 'recorded' | 'recorded, stale';
}

interface Orphan {
  readonly id: string;
  readonly file: string;
}

const orphansOf = (timings: Timings, beats: ReadonlyArray<{ readonly id: string }>) => {
  const ids = new Set(beats.map((b) => b.id));
  return Object.entries(timings.scenes)
    .filter(([id, take]) => take.source === 'recorded' && !ids.has(id))
    .map(([id, take]): Orphan => ({ id, file: take.file }));
};

export interface NarrationPlan {
  readonly beats: ReadonlyArray<ReadBeat>;
  readonly states: ReadonlyArray<BeatTake>;
  readonly stale: ReadonlyArray<ReadBeat>;
  readonly kept: ReadonlyArray<Kept>;
  readonly orphaned: ReadonlyArray<Orphan>;
  readonly voice: string;
  readonly reader: Voice;
}

type NarrateError =
  | TakeMismatch
  | AlignmentMismatch
  | ElevenLabsFailed
  | MediaFailed
  | StagingCapReached
  | StoreError;

interface Staged {
  readonly take: StagedTake;
  readonly audio: Uint8Array;
  readonly cached: boolean;
}

const currentTakes = (timings: Timings, voice: string): Timings['scenes'] => {
  if (timings.voice === voice) return timings.scenes;
  return Rec.filter(timings.scenes, (take) => take.source === 'recorded');
};

export const readBeat = (
  voice: Voice,
  id: string,
  say: string,
): Result.Result<ReadBeat, UnknownVoice | LineError> =>
  Result.flatMap(parse(id, say), (parsed) =>
    Result.map(linesOf(id, parsed, voice), (lines): ReadBeat => ({
      id,
      text: parsed.spoken,
      script: takeScript(parsed),
      lines,
      delivery: parsed.delivery,
    })),
  );

const beatOf = (voice: Voice, scene: LoadedFilm['scenes'][number]) =>
  readBeat(
    voice,
    scene.id,
    Option.getOrElse(Option.fromNullishOr(scene.say), () => ''),
  );

export const beatsOf = (
  film: LoadedFilm,
): Result.Result<ReadonlyArray<ReadBeat>, UnknownVoice | LineError | TalkUnvoiced> =>
  Result.flatMap(readerOf(film), (voice) =>
    Result.all(film.scenes.map((scene) => beatOf(voice, scene))),
  );

export interface VoicedFilm {
  readonly paths: FilmPaths;
  readonly voice: Voice;
  readonly heardAs: HeardAs;
  readonly beats: ReadonlyArray<ReadBeat>;
}

export const voicedOf = (
  film: LoadedFilm,
): Result.Result<VoicedFilm, UnknownVoice | LineError | TalkUnvoiced> =>
  Result.flatMap(readerOf(film), (voice) =>
    Result.map(beatsOf(film), (beats) => ({
      paths: film.paths,
      voice,
      heardAs: film.heardAs,
      beats,
    })),
  );

const asked = (options: NarrateOptions, take: BeatTake): boolean =>
  Option.match(options.only, {
    onSome: (only) => only.has(take.id),
    onNone: () => options.force || take.state._tag === 'Stale',
  });

const keptBy = (options: NarrateOptions, state: TakeState): Option.Option<Kept['why']> => {
  if (state._tag === 'Recorded') return Option.some('recorded');
  if (state._tag === 'Stale' && state.recorded && !options.replaceRecorded)
    return Option.some('recorded, stale');
  return Option.none();
};

export const planNarration = (
  film: LoadedFilm,
  options: NarrateOptions,
): Result.Result<NarrationPlan, UnknownVoice | LineError | TalkUnvoiced> =>
  Result.flatMap(readerOf(film), (reader) => {
    const voice = voiceKey(reader);
    return Result.map(beatsOf(film), (beats): NarrationPlan => {
      const spoken = beats.filter((b) => b.text.length > 0);
      const states = spoken.map((b) => ({
        id: b.id,
        state: takeState(b.id, b.script, film.timings, voice, b.delivery),
      }));
      const wanted = Arr.zip(spoken, states).filter(([, take]) => asked(options, take));
      const verdicts = wanted.map(([beat, take]) => ({ beat, kept: keptBy(options, take.state) }));
      return {
        beats,
        states,
        stale: verdicts.filter((v) => Option.isNone(v.kept)).map((v) => v.beat),
        kept: verdicts.flatMap((v) =>
          Option.toArray(Option.map(v.kept, (why): Kept => ({ id: v.beat.id, why }))),
        ),
        orphaned: orphansOf(film.timings, beats),
        voice,
        reader,
      };
    });
  });

export const stateLine = (take: BeatTake): string =>
  Match.type<TakeState>().pipe(
    Match.tagsExhaustive({
      Recorded: () => `recorded  ${take.id}`,
      Staging: () => `staging   ${take.id}`,
      Stale: ({ reason, recorded }) => {
        if (recorded) return `stale     ${take.id} (${reason}, recorded take)`;
        return `stale     ${take.id} (${reason})`;
      },
    }),
  )(take.state);

const TAKE_EXTENSIONS = ['.mp3', '.flac'] as const;
type TakeExtension = (typeof TAKE_EXTENSIONS)[number];

const takeExtensionOf = (file: string): TakeExtension => {
  if (file.endsWith('.flac')) return '.flac';
  return '.mp3';
};

const editedTake = (
  sent: Pcm,
  edits: ReadonlyArray<{ readonly at: number; readonly by: number }>,
): Option.Option<Pcm> => {
  const gapped = withGaps(sent, edits);
  return Option.orElse(trimTail(Option.getOrElse(gapped, () => sent)), () => gapped);
};

export const contentHash = (bytes: Uint8Array): string => sha256Hex(bytes).slice(0, 12);

export const takeFile = (id: string, audio: Uint8Array, ext: TakeExtension = '.mp3'): string =>
  `${id}.${contentHash(audio)}${ext}`;

const beatOfTake = (name: string): string =>
  Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(/^(.+)\.[0-9a-f]{12}\.[^.]+$/.exec(name)), (made) =>
      Arr.get(made, 1),
    ),
    () => Arr.headNonEmpty(Str.split(name, '.')),
  );

export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

const extensionOf = (file: string): string =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(/\.[^.]+$/.exec(file)), (found) => found[0]),
    () => '',
  );

export const hashOfTake = (file: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(/\.([0-9a-f]{12})\.[^.]+$/.exec(file)), (named) =>
    Arr.get(named, 1),
  );

const KEPT_ASIDE_NAMES = 8;

const keptAside = (file: string, bytes: Uint8Array, n: number): string => {
  const named = `${file}.${contentHash(bytes)}`;
  if (n === 0) return `${named}${extensionOf(file)}`;
  return `${named}.${n}${extensionOf(file)}`;
};

export const isKeptAside = (file: string, name: string): boolean =>
  name.startsWith(`${file}.`) &&
  name.endsWith(extensionOf(file)) &&
  /^\.[0-9a-f]{12}(\.[1-9][0-9]*)?$/.test(
    name.slice(file.length, name.length - extensionOf(file).length),
  );

export const putAwayTake = Effect.fn('putAwayTake')(function* (
  paths: FilmPaths,
  beat: string,
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const take = path.join(paths.narration, file);
  if (!(yield* fs.exists(take))) return;
  const bytes = yield* fs.readFile(take);
  const attempts = path.join(paths.narration, 'attempts', beat);
  const names = [file, ...Arr.makeBy(KEPT_ASIDE_NAMES, (n) => keptAside(file, bytes, n))];
  const holds = (name: string) =>
    Effect.gen(function* () {
      const home = path.join(attempts, name);
      if (!(yield* fs.exists(home))) yield* store.writeFile(home, bytes);
      return sameBytes(yield* fs.readFile(home), bytes);
    });
  const home = yield* Effect.findFirst(names, holds);
  if (Option.isNone(home))
    return yield* Effect.logError(
      `takes.put-away.refused id=${beat} file=${file} reason="attempts/${beat}/ has no name for it that holds its bytes; it stays in narration/"`,
    );
  if (home.value !== file)
    yield* Effect.logWarning(
      `takes.put-away.kept-aside id=${beat} file=${file} as=${home.value} reason="attempts/${beat}/${file} holds other bytes"`,
    );
  yield* fs.remove(take);
  yield* Effect.log(`takes.put-away id=${beat} file=${file}`);
});

export const putAwayUnnamed = Effect.fn('putAwayUnnamed')(function* (
  paths: FilmPaths,
  beat: string,
  file: string,
) {
  const store = yield* ContentStore;
  yield* store.holding(paths.timings, (timings) => {
    if (Object.values(timings.scenes).some((t) => t.file === file))
      return Effect.log(`takes.put-away.skipped id=${beat} file=${file} reason=named`);
    return putAwayTake(paths, beat, file);
  });
});

export const sweepNarration = Effect.fn('Narrator.sweep')(function* (paths: FilmPaths) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const dir = paths.narration;
  if (!(yield* fs.exists(dir))) return;
  const sweep = Effect.fn('Narrator.sweep.held')(function* (timings: Timings) {
    const named = new Set(Object.values(timings.scenes).map((t) => t.file));
    const names = yield* fs.readDirectory(dir);
    const partials = yield* Effect.filter(
      names.filter((name) => name.endsWith('.partial')),
      partialAbandoned,
    );
    const stray = names.filter(
      (name) => TAKE_EXTENSIONS.some((ext) => name.endsWith(ext)) && !named.has(name),
    );
    yield* Effect.forEach(partials, (name) => fs.remove(path.join(dir, name)), {
      discard: true,
    });
    yield* Effect.forEach(stray, (name) => putAwayTake(paths, beatOfTake(name), name), {
      discard: true,
    });
    if (partials.length + stray.length > 0)
      yield* Effect.log(`narrate.sweep removed=${partials.join(',')} put-away=${stray.join(',')}`);
  });
  yield* store.holding(paths.timings, sweep);
});

const withTake =
  (voice: string, id: string, take: VoiceTiming) =>
  (timings: Timings): Timings => ({
    voice,
    scenes: { ...currentTakes(timings, voice), [id]: take },
  });

const withoutRemoved =
  (voice: string, beats: ReadonlyArray<ReadBeat>) =>
  (timings: Timings): Timings => {
    const ids = new Set(beats.map((b) => b.id));
    const scenes = Object.entries(currentTakes(timings, voice)).filter(
      ([id, take]) => ids.has(id) || take.source === 'recorded',
    );
    return { voice, scenes: Object.fromEntries(scenes) };
  };

interface NarratorService {
  readonly record: (
    film: LoadedFilm,
    plan: NarrationPlan,
    options: NarrateOptions,
  ) => Effect.Effect<void, NarrateError>;
  readonly stage: (
    ask: StagingAsk,
    heardAs: HeardAs,
    reuse?: (take: StagedTake) => boolean,
  ) => Effect.Effect<Staged, Exclude<NarrateError, TakeMismatch>>;
}

export class Narrator extends Context.Service<Narrator, NarratorService>()(
  '@manna/film/tools/Narrator',
) {
  static readonly layer = Layer.effect(
    Narrator,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const elevenLabs = yield* ElevenLabs;
      const media = yield* Media;
      const cache = yield* StagingCache;
      const io = yield* Effect.context<FileSystem.FileSystem | Path.Path | ContentStore>();

      const read = (request: StagingRequest) => {
        const { speech } = request;
        if (speech._tag === 'Dialogue')
          return Effect.map(elevenLabs.dialogue(speech.request), (reply) => ({
            ...reply,
            breaks: reply.voice_segments.map((s) => s.character_start_index),
          }));
        return Effect.map(elevenLabs.tts(speech.request), (reply) => ({ ...reply, breaks: [] }));
      };

      const readAloud = Effect.fn('Narrator.readAloud')(function* (
        ask: StagingAsk,
        request: StagingRequest,
        heardAs: HeardAs,
      ) {
        const { beat } = ask;
        const reply = yield* read(request);
        const aligned = spokenAlignment(
          reply.alignment.characters,
          reply.alignment.character_start_times_seconds,
          reply.alignment.character_end_times_seconds,
          reply.breaks,
        );
        const said = yield* Effect.fromResult(
          wordsFromAlignment(
            beat.text,
            aligned.chars,
            aligned.starts,
            aligned.ends,
            aligned.breaks,
          ),
        );
        const written = beat.text.split(/\s+/).filter((w) => w.length > 0);
        const words = said.map((w, i) => ({ ...w, text: written[i] ?? w.text }));
        const audio = yield* Effect.fromResult(Base64.decode(reply.audio_base64)).pipe(
          Effect.mapError((error) =>
            ElevenLabsFailed.make({ op: request.speech._tag, exitCode: 0, reason: error.message }),
          ),
        );
        const take = path.join(
          yield* fs.makeTempDirectoryScoped({ prefix: 'narrate-' }),
          takeFile(beat.id, audio),
        );
        yield* fs.writeFile(take, audio);
        const heard = yield* elevenLabs.stt(take);
        const wer = lineError(beat.text, heard.text, heardAs);
        const { seconds: duration } = yield* media.timing(take);
        const overrun = Math.max(0, ...words.map((w) => w.end)) - duration;
        if (overrun > TAKE_TOLERANCE)
          yield* Effect.logWarning(
            `narrate.overrun id=${beat.id} secs=${overrun.toFixed(2)} (the alignment runs past the take; its words are held inside it)`,
          );
        yield* Effect.log(
          `narrate.take id=${beat.id} words=${words.length} lines=${beat.lines.length} secs=${duration.toFixed(2)} wer=${(wer * 100).toFixed(1)}% chars=${request.characters}`,
        );
        const pcm = yield* media.decode(take);
        return {
          take: {
            file: audioName(audio, '.mp3'),
            duration,
            words: voicedWords(heldInside(words, duration), pcm),
            heard: heard.text,
            wer,
            characters: request.characters,
            at: yield* Clock.currentTimeMillis,
          },
          audio,
        } satisfies Made;
      });

      const takeFrom = Effect.fn('Narrator.takeFrom')(function* (
        ask: StagingAsk,
        request: StagingRequest,
        reading: Made,
      ) {
        const sent = yield* media.decode(cache.audioOf(reading.take));
        const edits = holdsIn(reading.take.words, request.compiled.holds);
        return yield* Option.match(editedTake(sent, edits), {
          onNone: () => Effect.succeed(reading),
          onSome: (pcm) =>
            Effect.gen(function* () {
              const secs = pcm.frames / pcm.rate;
              yield* Effect.log(
                `narrate.edited id=${ask.beat.id} holds=${edits.length} secs=${secs.toFixed(2)}`,
              );
              const audio = yield* media.encodeFlac(pcm);
              const take: StagedTake = {
                ...reading.take,
                file: audioName(audio, '.flac'),
                duration: secs,
                words: voicedWords(heldInside(shiftedBy(reading.take.words, edits), secs), pcm),
              };
              return { take, audio } satisfies Made;
            }),
        });
      });

      const stage = Effect.fn('Narrator.stage')(function* (
        ask: StagingAsk,
        heardAs: HeardAs,
        reuse: (take: StagedTake) => boolean = () => true,
      ) {
        const request = stagingRequest(ask);
        const kept = Option.filter(yield* cache.get(request.key), reuse);
        if (Option.isSome(kept)) {
          yield* Effect.log(`staging.cached id=${ask.beat.id} take=${request.key.slice(0, 12)}`);
          return {
            take: kept.value,
            audio: yield* fs.readFile(cache.audioOf(kept.value)),
            cached: true,
          };
        }
        const reading = yield* cache.reading(
          request.sent,
          reuse,
          Effect.andThen(
            cache.charge(request.characters),
            readAloud(ask, request, heardAs).pipe(Effect.scoped),
          ),
        );
        const made = yield* takeFrom(ask, request, reading);
        yield* cache.put(request.key, made.take, made.audio);
        if (!reading.cached)
          yield* Effect.log(
            `staging.voiced id=${ask.beat.id} chars=${request.characters} take=${request.key.slice(0, 12)}`,
          );
        return { ...made, cached: reading.cached };
      });

      const recordBeat = Effect.fn('Narrator.recordBeat')(function* (
        film: LoadedFilm,
        plan: NarrationPlan,
        options: NarrateOptions,
        beat: ReadBeat,
      ) {
        const index = plan.beats.findIndex((b) => b.id === beat.id);
        const neighbour = (at: number) =>
          Option.getOrElse(
            Option.map(Arr.get(plan.beats, at), (b) => b.text),
            () => '',
          );
        const ask = {
          beat,
          voice: plan.reader,
          previous: neighbour(index - 1),
          next: neighbour(index + 1),
        };
        const fresh = options.force || Option.isSome(options.only);
        const staged = yield* stage(
          ask,
          film.heardAs,
          (take) => !fresh && take.wer <= MAX_WORD_ERROR,
        );
        const { take } = staged;
        if (take.wer > MAX_WORD_ERROR) {
          const mismatch = TakeMismatch.make({
            id: beat.id,
            script: beat.text,
            heard: take.heard,
            wer: take.wer,
          });
          if (!options.acceptMismatch.has(beat.id)) return yield* mismatch;
          yield* Effect.logWarning(`narrate.mismatch accepted=true ${mismatch.message}`);
        }
        const file = takeFile(beat.id, staged.audio, takeExtensionOf(take.file));
        yield* store.transact(film.paths.timings, (timings) =>
          Effect.gen(function* () {
            yield* store.writeFile(path.join(film.paths.narration, file), staged.audio);
            const named = withTake(plan.voice, beat.id, {
              hash: hashText(beat.script),
              file,
              duration: take.duration,
              words: take.words,
              ...deliveredAs(beat.delivery),
              source: 'elevenlabs',
            })(timings);
            return [named, named] as const;
          }),
        );
      });

      const sweep = (film: LoadedFilm) =>
        sweepNarration(film.paths).pipe(Effect.provideContext(io));

      const record = Effect.fn('Narrator.record')(function* (
        film: LoadedFilm,
        plan: NarrationPlan,
        options: NarrateOptions,
      ) {
        yield* Effect.forEach(plan.kept, (kept) => {
          if (kept.why === 'recorded')
            return Effect.log(`narrate.skip id=${kept.id} take=recorded`);
          return Effect.logWarning(
            `narrate.refused id=${kept.id} take=recorded-stale: its line changed; record it again (takes import, or the lab's studio), or stage it with --replace-recorded`,
          );
        });
        yield* sweep(film);
        yield* settleAll(
          plan.stale,
          (beat) =>
            recordBeat(film, plan, options, beat).pipe(
              Effect.scoped,
              Effect.tapError((error) =>
                Effect.logError(`narrate.failed id=${beat.id} error=${error._tag}`),
              ),
            ),
          3,
        ).pipe(
          Effect.andThen(store.update(film.paths.timings, withoutRemoved(plan.voice, plan.beats))),
          Effect.ensuring(
            sweep(film).pipe(
              Effect.catch((error) => Effect.logWarning(`narrate.sweep failed=${error._tag}`)),
            ),
          ),
        );
      });

      return Narrator.of({ record, stage });
    }),
  );
}
