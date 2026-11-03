import { Array as Arr, Option, Result } from 'effect';
import {
  DuplicateScene,
  type LineError,
  type PointError,
  UnknownCue,
  UnknownScene,
} from './errors.ts';
import { type SceneVoice, voiceFor } from './narration.ts';
import type { Knob, ResolvedCue, ScenePoint, Timed, Timings, Transition } from './schema.ts';
import { CLOCK_EPSILON, frameRead, movedFrames, secondsAt } from './time.ts';
import { type SceneClock, type TimelineError, pointOn, resolveTimeline } from './timeline.ts';

export interface Placed<S extends Timed = Timed> {
  readonly spec: S;
  readonly index: number;
  readonly fps: number;
  readonly frame: number;
  readonly start: number;
  readonly dur: number;
  readonly length: number;
  readonly voice: SceneVoice;
  readonly speechStart: number;
  readonly tail: number;
  readonly min: number;
  readonly cues: ReadonlyMap<string, ResolvedCue>;
  readonly knobs: ReadonlyMap<string, Knob>;
}

export const transitionDur = (t: Transition | undefined) =>
  t === undefined || t.kind === 'cut' ? 0 : t.dur;

const clockOf = (
  scene: string,
  voice: SceneVoice,
  speechStart: number,
  dur: number,
): SceneClock => ({
  scene,
  marks: voice.marks,
  words: voice.words,
  speechStart,
  speechEnd: speechStart + voice.duration,
  dur,
});

export const sceneClock = (p: Placed): SceneClock =>
  clockOf(p.spec.id, p.voice, p.speechStart, p.dur);

export const MIN_LEAD = 0.5;

export const DEFAULT_TAIL = 0.1;

const SILENT_LENGTH = 3;

interface BeatSpan {
  readonly words: number;
  readonly lead: number;
  readonly tail: number;
  readonly min: number;
}

export const beatLength = (b: BeatSpan): number =>
  Math.max(b.min, b.words > 0 ? b.lead + b.words + b.tail : SILENT_LENGTH);

export type LayoutError = DuplicateScene | LineError | TimelineError;

export const layout = <S extends Timed>(
  scenes: ReadonlyArray<S>,
  timings: Timings | undefined,
  fps: number,
): Result.Result<Placed<S>[], LayoutError> => {
  const out: Placed<S>[] = [];
  let exact = 0;
  const ids = new Set<string>();
  for (const [index, spec] of scenes.entries()) {
    if (ids.has(spec.id)) return Result.fail(DuplicateScene.make({ scene: spec.id }));
    ids.add(spec.id);
    const said = voiceFor(spec.id, spec.say ?? '', timings);
    if (Result.isFailure(said)) return Result.fail(said.failure);
    const voice = said.success;
    const lead = spec.lead ?? Math.max(MIN_LEAD, transitionDur(spec.enter) * 0.7);
    const tail = spec.tail ?? DEFAULT_TAIL;
    const min = spec.min ?? 0;
    const length = beatLength({ words: voice.duration, lead, tail, min });
    const frame = frameRead(exact, fps);
    const dur = secondsAt(frameRead(exact + length, fps) - frame, fps);
    const speechStart = voice.duration > 0 ? lead : 0;
    const cues = resolveTimeline(spec.timeline, clockOf(spec.id, voice, speechStart, dur));
    if (Result.isFailure(cues)) return Result.fail(cues.failure);
    const knobs = new Map(Object.entries(spec.knobs ?? {}));
    out.push({
      spec,
      index,
      fps,
      frame,
      start: secondsAt(frame, fps),
      dur,
      length,
      voice,
      speechStart,
      tail,
      min,
      cues: cues.success,
      knobs,
    });
    exact += length;
  }
  return Result.succeed(out);
};

export const beatTime = (p: { readonly fps: number; readonly frame: number }, T: number): number =>
  movedFrames(T, -p.frame, p.fps);

export const pointIn = (
  p: Placed,
  point: ScenePoint,
  by: string,
  edge: 'start' | 'end' = 'start',
): Result.Result<number, PointError> =>
  pointOn(
    sceneClock(p),
    (cue) =>
      Result.fromOption(Option.fromUndefinedOr(p.cues.get(cue)), () =>
        UnknownCue.make({ scene: p.spec.id, cue, by, known: [...p.cues.keys()] }),
      ),
    point,
    by,
    edge,
  );

export const filmEnd = (placed: ReadonlyArray<Placed>): number =>
  Option.match(Arr.last(placed), { onNone: () => 0, onSome: (p) => p.start + p.dur });

export const sceneOf = <S extends Timed>(
  placed: ReadonlyArray<Placed<S>>,
  scene: string,
): Result.Result<Placed<S>, UnknownScene> =>
  Result.fromOption(
    Arr.findFirst(placed, (p) => p.spec.id === scene),
    () => UnknownScene.make({ scene, known: placed.map((p) => p.spec.id) }),
  );

export const scenesOf = <S extends Timed>(
  placed: ReadonlyArray<Placed<S>>,
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<Placed<S>>, UnknownScene> =>
  Result.all(ids.map((id) => sceneOf(placed, id)));

export const sceneIndexAt = (
  placed: ReadonlyArray<{ readonly start: number }>,
  T: number,
): number => {
  for (let i = placed.length - 1; i > 0; i--)
    if (T + CLOCK_EPSILON >= Arr.getUnsafe(placed, i).start) return i;
  return Math.min(0, placed.length - 1);
};

export const sceneAt = <P extends { readonly start: number }>(
  placed: ReadonlyArray<P>,
  T: number,
): Option.Option<P> => Arr.get(placed, sceneIndexAt(placed, T));

export const everyTakeRecorded = (placed: ReadonlyArray<Placed>): boolean =>
  placed.every((p) => p.voice.duration === 0 || p.voice.recorded);
