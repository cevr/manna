import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  type MovementLength,
  MovementTooLong,
  MovementTooShort,
  ScoreUnknown,
  type SoundCueError,
  type UnknownScene,
} from './errors.ts';
import { type PartError, stretchesOf } from './acts.ts';
import { type Placed, filmEnd, pointIn, sceneOf } from './layout.ts';
import { hashText } from './narration.ts';
import {
  type Cue,
  type Movement,
  type Music,
  MusicRequestKey,
  type Plan,
  type PlanChunk,
  type Score,
  type ScoreAsset,
  type SoundManifest,
} from './schema.ts';

const MIN_CHUNK_MS = 3000;

export const MAX_CHUNK_MS = 120_000;

export const MUSIC_TAIL = 6;

interface ScoreOption {
  readonly name: string;
  readonly music: Music;
}

export const scoreOptions = (score: Score): ReadonlyArray<ScoreOption> =>
  Object.entries(score.options).map(([name, music]) => ({ name, music }));

export const playedOption = (
  score: Score,
  asked: Option.Option<string>,
): Result.Result<ScoreOption, ScoreUnknown> => {
  const name = Option.getOrElse(asked, () => score.play);
  return Result.fromOption(
    Option.map(Option.fromUndefinedOr(score.options[name]), (music) => ({ name, music })),
    () => ScoreUnknown.make({ option: name, known: Object.keys(score.options) }),
  );
};

export const cueTime = (
  cue: Cue,
  placed: ReadonlyArray<Placed>,
): Result.Result<number, SoundCueError> =>
  Result.gen(function* () {
    const p = yield* sceneOf(placed, cue.scene);
    const anchor = yield* pointIn(p, cue, 'sound');
    return p.start + Option.getOrElse(Option.fromNullishOr(cue.offset), () => 0) + anchor;
  });

interface MovementSpan {
  readonly movement: Movement;
  readonly ms: number;
}

export const scoreEnd = (
  placed: ReadonlyArray<Placed>,
  through: Option.Option<string>,
): Result.Result<number, UnknownScene> =>
  Option.match(through, {
    onNone: () => Result.succeed(filmEnd(placed)),
    onSome: (scene) => Result.map(sceneOf(placed, scene), (p) => p.start + p.dur),
  });

export const movementSpans = (
  music: Music,
  placed: ReadonlyArray<Placed>,
  through: Option.Option<string> = Option.none(),
): Result.Result<ReadonlyArray<Result.Result<MovementSpan, MovementLength>>, PartError> =>
  Result.gen(function* () {
    const all = yield* stretchesOf(music.movements, placed);
    const end = yield* scoreEnd(placed, through);
    const stretches = all.filter((s) => s.from < end);
    const bounds = [...stretches.map((s) => s.from), end + MUSIC_TAIL].map((s) =>
      Math.round(s * 1000),
    );
    return stretches.map(({ part: movement }, i): Result.Result<MovementSpan, MovementLength> => {
      const ms = Arr.getUnsafe(bounds, i + 1) - Arr.getUnsafe(bounds, i);
      if (ms < MIN_CHUNK_MS)
        return Result.fail(MovementTooShort.make({ movement: movement.name, ms }));
      if (ms > MAX_CHUNK_MS)
        return Result.fail(
          MovementTooLong.make({ movement: movement.name, ms, max: MAX_CHUNK_MS }),
        );
      return Result.succeed({ movement, ms });
    });
  });

export const musicPlan = (
  music: Music,
  placed: ReadonlyArray<Placed>,
  through: Option.Option<string> = Option.none(),
): Result.Result<Plan, PartError | MovementLength> =>
  Result.gen(function* () {
    const spans = yield* movementSpans(music, placed, through);
    const chunks: PlanChunk[] = [];
    for (const span of spans) {
      const { movement, ms } = yield* span;
      chunks.push({
        text: `[${movement.name}]`,
        duration_ms: ms,
        positive_styles: [...music.styles, ...movement.styles],
        negative_styles: [
          ...music.avoid,
          ...Option.getOrElse(Option.fromNullishOr(movement.avoid), () => []),
        ],
        context_adherence: 'high',
      });
    }
    return { chunks };
  });

export const musicKey = (music: Music, plan: Plan): string =>
  hashText(Schema.encodeSync(MusicRequestKey)({ model: music.model, plan }));

type ScoreStale = { readonly _tag: 'Retimed'; readonly key: string } | PartError | MovementLength;

export type ScoreOptionState =
  | { readonly _tag: 'Current'; readonly asset: ScoreAsset; readonly key: string }
  | { readonly _tag: 'Stale'; readonly asset: ScoreAsset; readonly why: ScoreStale }
  | { readonly _tag: 'Missing' };

export interface PartialRange {
  readonly through: string;
  readonly to: number;
  readonly end: number;
}

export const partialRange = (
  state: ScoreOptionState,
  placed: ReadonlyArray<Placed>,
): Option.Option<PartialRange> => {
  if (state._tag !== 'Current') return Option.none();
  const end = filmEnd(placed);
  return Option.flatMap(Option.fromUndefinedOr(state.asset.through), (through) =>
    Option.map(
      Option.filter(Result.getSuccess(scoreEnd(placed, Option.some(through))), (at) => at < end),
      (at) => ({ through, to: at + MUSIC_TAIL, end }),
    ),
  );
};

export const scoreOptionState = (
  option: ScoreOption,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ScoreOptionState =>
  Option.match(Option.fromUndefinedOr(manifest.scores?.[option.name]), {
    onNone: (): ScoreOptionState => ({ _tag: 'Missing' }),
    onSome: (asset): ScoreOptionState =>
      Result.match(musicPlan(option.music, placed, Option.fromUndefinedOr(asset.through)), {
        onFailure: (why): ScoreOptionState => ({ _tag: 'Stale', asset, why }),
        onSuccess: (plan): ScoreOptionState => {
          const key = musicKey(option.music, plan);
          if (asset.hash === key) return { _tag: 'Current', asset, key };
          return { _tag: 'Stale', asset, why: { _tag: 'Retimed', key } };
        },
      }),
  });
