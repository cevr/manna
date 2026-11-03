import {
  Array as Arr,
  Clock,
  Config,
  Context,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Result,
  Schedule,
  Schema,
} from 'effect';
import { type Compiled, compileDelivery, sentText } from '../core/delivery.ts';
import type { Line } from '../core/narration.ts';
import { StagingCapReached } from '../core/refusals.ts';
import { type Cast, type Reader, type Voice, Seconds, TakeWord, isCast } from '../core/schema.ts';
import { STAGING_VOICE_ID, STAGING_VOICE_PACE } from '../core/staging-voice.ts';
import type { ReadBeat } from '../core/studio.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { type DialogueRequest, type TtsRequest, sendsNeighbours } from './elevenlabs.ts';

const TAKE_AUDIO = /^[0-9a-f]{64}\.(?:mp3|flac)$/;

export const audioName = (audio: Uint8Array, ext: '.mp3' | '.flac'): string =>
  `${sha256Hex(audio)}${ext}`;

const STAGING_DAILY_CAP = 100_000;

const VOICE_PACE: ReadonlyMap<string, number> = new Map([[STAGING_VOICE_ID, STAGING_VOICE_PACE]]);

export interface StagingAsk {
  readonly beat: ReadBeat;
  readonly voice: Voice;
  readonly previous: string;
  readonly next: string;
}

type SpeechRequest =
  | { readonly _tag: 'Tts'; readonly request: TtsRequest }
  | { readonly _tag: 'Dialogue'; readonly request: DialogueRequest };

export interface StagingRequest {
  readonly speech: SpeechRequest;
  readonly compiled: Compiled;
  readonly characters: number;
  readonly sent: string;
  readonly key: string;
}

const wordRanges = (lines: ReadonlyArray<Line>) =>
  lines.reduce<ReadonlyArray<{ readonly line: Line; readonly from: number; readonly to: number }>>(
    (ranges, line) => {
      const from = Option.getOrElse(
        Option.map(Arr.last(ranges), (r) => r.to),
        () => 0,
      );
      const words = line.text.split(/\s+/).filter((w) => w.length > 0).length;
      return [...ranges, { line, from, to: from + words }];
    },
    [],
  );

export const stagingRequest = (ask: StagingAsk): StagingRequest => {
  const words = ask.beat.text.split(/\s+/).filter((w) => w.length > 0);
  const { voice } = ask;
  if (isCast(voice)) return dialogueRequest(ask, voice, words);
  return speechRequest(ask, voice, words);
};

const dialogueRequest = (
  ask: StagingAsk,
  cast: Cast,
  words: ReadonlyArray<string>,
): StagingRequest => {
  const compiled = compileDelivery(words, ask.beat.delivery, cast.model);
  const lines = wordRanges(ask.beat.lines).map(({ line, from, to }): Line => ({
    ...line,
    text: sentText(compiled, from, to),
  }));
  return {
    speech: { _tag: 'Dialogue', request: { lines, cast } },
    compiled,
    characters: lines.reduce((sum, l) => sum + l.text.length, 0),
    ...keysOf(compiled, {
      op: 'dialogue',
      model: cast.model,
      settings: settingsKey(cast.settings),
      inputs: lines.map((l) => [l.voiceId, l.text] as const),
      previous: '',
      next: '',
    }),
  };
};

const speechRequest = (
  ask: StagingAsk,
  reader: Reader,
  words: ReadonlyArray<string>,
): StagingRequest => {
  const compiled = compileDelivery(
    words,
    ask.beat.delivery,
    reader.model,
    Option.fromNullishOr(VOICE_PACE.get(reader.voiceId)),
  );
  const settings = Option.match(compiled.speed, {
    onNone: () => reader.settings,
    onSome: (speed) => ({ speed, ...reader.settings }),
  });
  const text = sentText(compiled);
  const { previous, next } = neighboursOf(ask, reader.model);
  return {
    speech: {
      _tag: 'Tts',
      request: { text, voice: { ...reader, settings }, previousText: previous, nextText: next },
    },
    compiled,
    characters: text.length,
    ...keysOf(compiled, {
      op: 'tts',
      model: reader.model,
      settings: settingsKey(settings),
      inputs: [[reader.voiceId, text]],
      previous,
      next,
    }),
  };
};

const neighboursOf = (ask: StagingAsk, model: string) => {
  if (sendsNeighbours(model)) return { previous: ask.previous, next: ask.next };
  return { previous: '', next: '' };
};

const RequestKey = Schema.fromJsonString(
  Schema.Struct({
    op: Schema.Literals(['tts', 'dialogue']),
    model: Schema.String,
    settings: Schema.Array(Schema.Tuple([Schema.String, Schema.Finite])),
    inputs: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
    previous: Schema.String,
    next: Schema.String,
  }),
);

const settingsKey = (settings: Readonly<Record<string, number>>) =>
  Object.entries(settings).toSorted(([a], [b]) => a.localeCompare(b));

const HoldsKey = Schema.fromJsonString(Schema.Array(Schema.Tuple([Schema.Int, Schema.Finite])));

const keysOf = (compiled: Compiled, request: typeof RequestKey.Type) => {
  const sent = sha256Hex(`staging/2 sent ${Schema.encodeSync(RequestKey)(request)}`);
  const holds = compiled.holds
    .map((h) => [h.before, h.seconds] as const)
    .toSorted(([a], [b]) => a - b);
  return { sent, key: sha256Hex(`staging/2 take ${sent} ${Schema.encodeSync(HoldsKey)(holds)}`) };
};

export const StagedTake = Schema.Struct({
  file: Schema.String,
  duration: Seconds,
  words: Schema.Array(TakeWord),
  heard: Schema.String,
  wer: Schema.Finite,
  characters: Schema.Int,
  at: Schema.Finite,
});
export type StagedTake = typeof StagedTake.Type;

const StagedJson = Schema.fromJsonString(Schema.OptionFromNullOr(StagedTake));

const Spend = Schema.Struct({ days: Schema.Record(Schema.String, Schema.Int) });
type Spend = typeof Spend.Type;
const SpendJson = Schema.fromJsonString(Spend);

interface Spent {
  readonly day: string;
  readonly spent: number;
  readonly cap: number;
}

export const dayOf = (ms: number): string =>
  DateTime.formatIsoDate(DateTime.makeZonedUnsafe(ms, { timeZone: DateTime.zoneMakeLocal() }));

const charged = (
  spend: Spend,
  day: string,
  characters: number,
  cap: number,
): Result.Result<Spend, StagingCapReached> => {
  const spent = spend.days[day] ?? 0;
  if (spent + characters > cap)
    return Result.fail(StagingCapReached.make({ day, spent, asked: characters, cap }));
  const kept = Object.entries(spend.days)
    .filter(([d]) => d !== day)
    .toSorted(([a], [b]) => b.localeCompare(a))
    .slice(0, 13);
  return Result.succeed({ days: { ...Object.fromEntries(kept), [day]: spent + characters } });
};

export interface Made {
  readonly take: StagedTake;
  readonly audio: Uint8Array;
}

type Reading = Made & { readonly cached: boolean };

const READING_WAIT = { times: 60, every: Duration.seconds(1) } as const;

interface StagingCacheService {
  readonly get: (key: string) => Effect.Effect<Option.Option<StagedTake>, StoreError>;
  readonly put: (
    key: string,
    take: StagedTake,
    audio: Uint8Array,
  ) => Effect.Effect<void, StoreError>;
  readonly reading: <E, R>(
    sent: string,
    reuse: (take: StagedTake) => boolean,
    make: Effect.Effect<Made, E, R>,
  ) => Effect.Effect<Reading, E | StoreError, R>;
  readonly audioOf: (take: StagedTake) => string;
  readonly audioNamed: (file: string) => Effect.Effect<Option.Option<string>, StoreError>;
  readonly charge: (characters: number) => Effect.Effect<Spent, StagingCapReached | StoreError>;
  readonly today: Effect.Effect<Spent, StoreError>;
}

export class StagingCache extends Context.Service<StagingCache, StagingCacheService>()(
  '@manna/film/tools/StagingCache',
) {
  static readonly layer = (dir: string, cap: number = STAGING_DAILY_CAP) =>
    Layer.effect(
      StagingCache,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const takes = path.join(dir, 'takes');
        const record = (key: string): Manifest<Option.Option<StagedTake>> => ({
          file: path.join(takes, `${key}.json`),
          codec: StagedJson,
          empty: Option.none(),
        });
        const ledger: Manifest<Spend> = {
          file: path.join(dir, 'spend.json'),
          codec: SpendJson,
          empty: { days: {} },
        };
        const audioOf = (take: StagedTake) => path.join(takes, take.file);
        const day = Effect.map(Clock.currentTimeMillis, dayOf);

        const get = Effect.fn('StagingCache.get')(function* (key: string) {
          const kept = yield* store.read(record(key));
          if (Option.isNone(kept)) return kept;
          if (yield* fs.exists(audioOf(kept.value))) return kept;
          return Option.none();
        });

        const audioNamed = Effect.fn('StagingCache.audioNamed')(function* (file: string) {
          const named = Option.map(
            Option.liftPredicate(file, (f) => TAKE_AUDIO.test(f)),
            (f) => path.join(takes, f),
          );
          if (Option.isNone(named)) return named;
          const kept = yield* fs.exists(named.value);
          return Option.filter(named, () => kept);
        });

        const put = Effect.fn('StagingCache.put')(function* (
          key: string,
          take: StagedTake,
          audio: Uint8Array,
        ) {
          yield* fs.makeDirectory(takes, { recursive: true });
          yield* store.writeFile(audioOf(take), audio);
          yield* store.update(record(key), () => Option.some(take));
        });

        const reading = <E, R>(
          sent: string,
          reuse: (take: StagedTake) => boolean,
          make: Effect.Effect<Made, E, R>,
        ) =>
          store
            .transact(record(sent), (current) =>
              Effect.gen(function* () {
                const kept = Option.filter(current, reuse);
                if (Option.isSome(kept) && (yield* fs.exists(audioOf(kept.value)))) {
                  const audio = yield* fs.readFile(audioOf(kept.value));
                  const found: Reading = { take: kept.value, audio, cached: true };
                  return [found, current] as const;
                }
                const made = yield* make;
                yield* fs.makeDirectory(takes, { recursive: true });
                yield* store.writeFile(audioOf(made.take), made.audio);
                const read: Reading = { ...made, cached: false };
                return [read, Option.some(made.take)] as const;
              }),
            )
            .pipe(
              Effect.retry({
                while: (error) => Predicate.isTagged(error, 'StoreLocked'),
                times: READING_WAIT.times,
                schedule: Schedule.spaced(READING_WAIT.every),
              }),
              Effect.withSpan('StagingCache.reading'),
            );

        const charge = Effect.fn('StagingCache.charge')(function* (characters: number) {
          const today = yield* day;
          yield* fs.makeDirectory(dir, { recursive: true });
          const spend = yield* store.modify(ledger, (spend) =>
            charged(spend, today, characters, cap),
          );
          const spent = spend.days[today] ?? 0;
          yield* Effect.log(
            `staging.spent chars=${characters} day=${today} total=${spent} cap=${cap}`,
          );
          return { day: today, spent, cap };
        });

        const today = Effect.gen(function* () {
          const d = yield* day;
          const spend = yield* store.read(ledger);
          return { day: d, spent: spend.days[d] ?? 0, cap };
        });

        return StagingCache.of({ get, put, reading, audioOf, audioNamed, charge, today });
      }),
    );

  static readonly fromConfig = Layer.unwrap(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
      const dir = yield* Config.String('FILM_STAGING_DIR').pipe(
        Config.withDefault(path.join(home, '.cache', 'bible-film', 'staging')),
      );
      const cap = yield* Config.Int('FILM_STAGING_DAILY_CAP').pipe(
        Config.withDefault(STAGING_DAILY_CAP),
      );
      return StagingCache.layer(dir, cap);
    }),
  );
}
