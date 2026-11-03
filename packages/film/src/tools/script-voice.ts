import {
  Array as Arr,
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Queue,
  Ref,
  Schedule,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ScriptVoice, StagingTake } from '../core/api.ts';
import type { DraftUnknown, DraftUnread } from '../core/refusals.ts';
import type { HeardAs, Voice } from '../core/schema.ts';
import type { ReadBeat } from '../core/studio.ts';
import type { StoreError } from './content-store.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import type { FreshError } from './fresh-film.ts';
import { MAX_WORD_ERROR, Narrator } from './narrator.ts';
import { draftKey, SeriesDrafts } from './series-drafts.ts';
import {
  dayOf,
  type StagedTake,
  type StagingAsk,
  StagingCache,
  stagingRequest,
} from './staging.ts';
import { StudioReadings } from './studio.ts';

const VOICING_AT_ONCE = 2;

const SWEEP_EVERY = Duration.minutes(1);

const saysLine = (take: StagedTake): boolean => take.wer <= MAX_WORD_ERROR;

const readyOrMisread = (take: StagedTake): StagingTake => {
  if (!saysLine(take))
    return {
      _tag: 'Refused',
      reason: `misread ${Math.round(take.wer * 100)}% of its words, heard "${take.heard}"`,
    };
  return { _tag: 'Ready', file: take.file, duration: take.duration, words: take.words };
};

interface Job {
  readonly key: string;
  readonly ask: StagingAsk;
  readonly heardAs: HeardAs;
  readonly reread: boolean;
}

const rereadDue = (take: StagedTake, today: string): boolean =>
  !saysLine(take) && dayOf(take.at) < today;

interface Fill {
  readonly running: boolean;
  readonly urgent: ReadonlyArray<Job>;
  readonly background: ReadonlyArray<Job>;
  readonly voicing: ReadonlySet<string>;
  readonly refused: ReadonlyMap<string, string>;
  readonly day: string;
}

const NO_FILL: Fill = {
  running: false,
  urgent: [],
  background: [],
  voicing: new Set(),
  refused: new Map(),
  day: '',
};

const asked = (fill: Fill, key: string) =>
  fill.voicing.has(key) || [...fill.urgent, ...fill.background].some((j) => j.key === key);

const asksOf = (voice: Voice, beats: ReadonlyArray<ReadBeat>): ReadonlyArray<StagingAsk> => {
  const text = (at: number) =>
    Option.getOrElse(
      Option.map(Arr.get(beats, at), (b) => b.text),
      () => '',
    );
  return beats.flatMap((beat, i) =>
    Arr.filter([{ beat, voice, previous: text(i - 1), next: text(i + 1) }], () => beat.text !== ''),
  );
};

const wanted = (beat: { readonly job: Job; readonly kept: Option.Option<StagedTake> }): boolean =>
  Option.isNone(beat.kept) || beat.job.reread;

const queued = (fill: Fill, jobs: ReadonlyArray<Job>, urgent: boolean): Fill => {
  if (!fill.running) return fill;
  const fresh = jobs.filter((j) => !fill.refused.has(j.key) && !fill.voicing.has(j.key));
  return queuedIn(fill, fresh, urgent);
};

const queuedIn = (fill: Fill, fresh: ReadonlyArray<Job>, urgent: boolean): Fill => {
  if (urgent) {
    const keys = new Set(fresh.map((j) => j.key));
    return {
      ...fill,
      urgent: [...fill.urgent, ...fresh.filter((j) => !fill.urgent.some((u) => u.key === j.key))],
      background: fill.background.filter((j) => !keys.has(j.key)),
    };
  }
  return { ...fill, background: [...fill.background, ...fresh.filter((j) => !asked(fill, j.key))] };
};

const next = (fill: Fill): readonly [Option.Option<Job>, Fill] => {
  const job = Option.orElse(Arr.head(fill.urgent), () => Arr.head(fill.background));
  return Option.match(job, {
    onNone: () => [job, fill] as const,
    onSome: (j) =>
      [
        job,
        {
          ...fill,
          urgent: fill.urgent.filter((u) => u.key !== j.key),
          background: fill.background.filter((b) => b.key !== j.key),
          voicing: new Set([...fill.voicing, j.key]),
        },
      ] as const,
  });
};

const settled = (fill: Fill, key: string, why: Option.Option<string>): Fill => ({
  ...fill,
  voicing: new Set([...fill.voicing].filter((k) => k !== key)),
  refused: Option.match(why, {
    onNone: () => fill.refused,
    onSome: (reason) => new Map([...fill.refused, [key, reason]]),
  }),
});

interface ScriptVoicesService {
  readonly voice: (
    film: FilmName,
  ) => Effect.Effect<ScriptVoice, FreshError | PlatformError | StoreError>;
  readonly draft: (
    series: string,
    draft: string,
  ) => Effect.Effect<ScriptVoice, DraftUnknown | DraftUnread | PlatformError | StoreError>;
  readonly fill: Effect.Effect<never>;
}

export class ScriptVoices extends Context.Service<ScriptVoices, ScriptVoicesService>()(
  '@manna/film/tools/ScriptVoices',
) {
  static readonly layer = Layer.effect(
    ScriptVoices,
    Effect.gen(function* () {
      const readings = yield* StudioReadings;
      const cache = yield* StagingCache;
      const narrator = yield* Narrator;
      const folder = yield* FilmFolder;
      const drafts = yield* SeriesDrafts;
      const state = yield* Ref.make(NO_FILL);
      const signals = yield* Queue.unbounded<void>();

      const beatsIn = (reading: {
        readonly voice: Voice;
        readonly heardAs: HeardAs;
        readonly beats: ReadonlyArray<ReadBeat>;
      }) =>
        Effect.gen(function* () {
          const today = dayOf(yield* Clock.currentTimeMillis);
          return yield* Effect.forEach(asksOf(reading.voice, reading.beats), (ask) => {
            const key = stagingRequest(ask).key;
            return Effect.map(cache.get(key), (kept) => ({
              job: {
                key,
                ask,
                heardAs: reading.heardAs,
                reread: Option.exists(kept, (t) => rereadDue(t, today)),
              } satisfies Job,
              kept,
            }));
          });
        });

      const beatsOf = Effect.fn('ScriptVoices.beatsOf')(function* (film: FilmName) {
        return yield* beatsIn(yield* readings.reading(film));
      });

      const draftBeatsOf = Effect.fn('ScriptVoices.draftBeatsOf')(function* (
        series: string,
        draft: string,
      ) {
        return yield* beatsIn(yield* drafts.reading(series, draft));
      });

      const enqueue = (jobs: ReadonlyArray<Job>, urgent: boolean) =>
        Effect.gen(function* () {
          const added = yield* Ref.modify(state, (fill) => {
            const after = queued(fill, jobs, urgent);
            const size = (f: Fill) => f.urgent.length + f.background.length;
            return [size(after) - size(fill), after] as const;
          });
          yield* Queue.offerAll(
            signals,
            Arr.makeBy(added, () => {}),
          );
        });

      const takeOf = (fill: Fill, key: string, kept: Option.Option<StagedTake>): StagingTake => {
        const ready = Option.filter(kept, saysLine);
        if (Option.isSome(ready))
          return {
            _tag: 'Ready',
            file: ready.value.file,
            duration: ready.value.duration,
            words: ready.value.words,
          };
        if (asked(fill, key)) return { _tag: 'Voicing' };
        const refused = Option.fromNullishOr(fill.refused.get(key));
        if (Option.isSome(refused)) return { _tag: 'Refused', reason: refused.value };
        return Option.match(kept, {
          onSome: readyOrMisread,
          onNone: (): StagingTake => ({ _tag: 'Unvoiced' }),
        });
      };

      const voiced = (
        name: string,
        beats: ReadonlyArray<{ readonly job: Job; readonly kept: Option.Option<StagedTake> }>,
      ) =>
        Effect.gen(function* () {
          yield* enqueue(
            beats.filter(wanted).map((b) => b.job),
            true,
          );
          const fill = yield* Ref.get(state);
          const spent = yield* cache.today;
          return {
            film: name,
            spent: spent.spent,
            cap: spent.cap,
            beats: beats.map((b) => ({
              id: b.job.ask.beat.id,
              take: takeOf(fill, b.job.key, b.kept),
            })),
          } satisfies ScriptVoice;
        });

      const voice = Effect.fn('ScriptVoices.voice')(function* (film: FilmName) {
        return yield* voiced(film, yield* beatsOf(film));
      });

      const draft = Effect.fn('ScriptVoices.draft')(function* (series: string, name: string) {
        return yield* voiced(draftKey(series, name), yield* draftBeatsOf(series, name));
      });

      const newDay = Effect.gen(function* () {
        const today = dayOf(yield* Clock.currentTimeMillis);
        yield* Ref.update(state, (fill) => {
          if (fill.day === today) return fill;
          return { ...fill, day: today, refused: new Map<string, string>() };
        });
      });

      const sweep = Effect.gen(function* () {
        yield* newDay;
        yield* Effect.forEach(
          yield* folder.names,
          (film) =>
            Effect.flatMap(
              Effect.provideService(filmNamed(film), FilmFolder, folder),
              beatsOf,
            ).pipe(
              Effect.flatMap((beats) =>
                enqueue(
                  beats.filter(wanted).map((b) => b.job),
                  false,
                ),
              ),
              Effect.catch((error) =>
                Effect.logDebug(`staging.fill.skip film=${film} reason=${error._tag}`),
              ),
            ),
          { discard: true },
        );
        const keys = yield* drafts.keys.pipe(
          Effect.catch((error) =>
            Effect.as(Effect.logWarning(`staging.fill.series.unread reason=${error.message}`), []),
          ),
        );
        yield* Effect.forEach(
          keys,
          ([series, name]) =>
            draftBeatsOf(series, name).pipe(
              Effect.flatMap((beats) =>
                enqueue(
                  beats.filter(wanted).map((b) => b.job),
                  false,
                ),
              ),
              Effect.catch((error) =>
                Effect.logDebug(
                  `staging.fill.skip draft=${draftKey(series, name)} reason=${error._tag}`,
                ),
              ),
            ),
          { discard: true },
        );
      });

      const voiceNext = Effect.gen(function* () {
        yield* Queue.take(signals);
        const job = yield* Ref.modify(state, next);
        if (Option.isNone(job)) return;
        const { key, ask, heardAs } = job.value;
        const why = yield* narrator.stage(ask, heardAs, saysLine).pipe(
          Effect.as(Option.none<string>()),
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning(
                `staging.fill.refused id=${ask.beat.id} take=${key.slice(0, 12)} reason=${error._tag}`,
              ),
              Option.some(error.message),
            ),
          ),
        );
        yield* Ref.update(state, (fill) => settled(fill, key, why));
      });

      const fill = Effect.gen(function* () {
        yield* Ref.update(state, (f) => ({ ...f, running: true }));
        yield* Effect.log(`staging.fill on at_once=${VOICING_AT_ONCE}`);
        const voicers = Effect.forEach(
          Arr.range(1, VOICING_AT_ONCE),
          () => Effect.forever(voiceNext),
          { concurrency: VOICING_AT_ONCE },
        );
        return yield* Effect.all([Effect.repeat(sweep, Schedule.spaced(SWEEP_EVERY)), voicers], {
          concurrency: 'unbounded',
          discard: true,
        }).pipe(Effect.andThen(Effect.never));
      }).pipe(
        Effect.ensuring(Ref.update(state, (f) => ({ ...NO_FILL, refused: f.refused, day: f.day }))),
        Effect.scoped,
      );

      return ScriptVoices.of({ voice, draft, fill });
    }),
  );
}

export const fillBeside = (fill: Effect.Effect<never>) =>
  Effect.forkScoped(
    Effect.catchDefect(fill, (defect) =>
      Effect.logError(`staging.fill.died cause="${String(defect)}"`),
    ),
  );

export const stagingFill = Config.Boolean('FILM_STAGING_FILL').pipe(Config.withDefault(false));
