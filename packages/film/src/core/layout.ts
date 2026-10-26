// The film clock, without the canvas: scenes laid end to end, each sized to its
// voice. Pure — the player, the renderer and the Bun scripts all read it, and
// it names no drawing type, so it runs where there is no DOM. A film that does
// not lay out fails as a value naming the scene (and cue) at fault.

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
  /** The frames a second the film is laid at: the film's own declared rate (`layout`). */
  readonly fps: number;
  /** Its first frame at `fps`: its exact start snapped to the nearest frame (`layout`). */
  readonly frame: number;
  /** Its start in seconds: its first frame's (`secondsAt`). */
  readonly start: number;
  /**
   * Its length on whole frames: from its first frame to the next beat's, the
   * frames nearest where its exact length (`beatLength`) and every one before
   * it end.
   */
  readonly dur: number;
  /** Its exact length as its words, lead, tail and `min` lay it (`beatLength`), before the frames snap it. */
  readonly length: number;
  readonly voice: SceneVoice;
  /** Scene-local time the voice starts. */
  readonly speechStart: number;
  /** The time after its words it asks for (its `tail`, else `DEFAULT_TAIL`), before its `min` holds it longer. */
  readonly tail: number;
  /** The length its `min` holds it to at least: 0 when it declares none. */
  readonly min: number;
  /** The scene's named cues, scene-local. */
  readonly cues: ReadonlyMap<string, ResolvedCue>;
  /** The scene's knobs, as its drawing declares them. */
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

/**
 * The clock a placed scene's timeline resolved on: resolving another timeline
 * on it (the lab's preview of a dragged cue, a timeline read back from source)
 * places each cue exactly as `layout()` would.
 */
export const sceneClock = (p: Placed): SceneClock =>
  clockOf(p.spec.id, p.voice, p.speechStart, p.dur);

/** The shortest lead before a scene's words: a long entrance lengthens it (`enter` × 0.7). */
export const MIN_LEAD = 0.5;

/** The time after a scene's last word, unless it declares a `tail`. */
export const DEFAULT_TAIL = 0.1;

/** A silent beat's length, unless its `min` holds it longer. */
const SILENT_LENGTH = 3;

/** What a beat's length is laid from: its words' seconds (0 when silent), its lead and tail, and its `min`. */
interface BeatSpan {
  readonly words: number;
  readonly lead: number;
  readonly tail: number;
  readonly min: number;
}

/**
 * A beat's length, the layout's one rule: its words between its lead and
 * tail, `SILENT_LENGTH` when it has none, never under its `min`. The studio's
 * trims preview a hold by it before the lab lays the script again. Pure.
 */
export const beatLength = (b: BeatSpan): number =>
  Math.max(b.min, b.words > 0 ? b.lead + b.words + b.tail : SILENT_LENGTH);

/** Why a film does not lay out: two scenes with one id, a line that does not parse, or a timeline that does not resolve. */
export type LayoutError = DuplicateScene | LineError | TimelineError;

/**
 * Lay scenes end to end at `fps`, the film's declared rate (its `film.ts`'s
 * `fps`, which its page and the tools both read; a talk's `TALK_FPS`): one
 * rate for every clock of the film, so the page, the mix, the checks and the
 * lab place each beat on the same frame. Each beat starts on a whole frame: the frame nearest where
 * the exact lengths before it (`beatLength`) end, so its start (picture and
 * voice together) sits at most half a frame from its exact place, and it
 * lasts to the next beat's first frame. The mix lays each take from that
 * start too (owner, 2026-10-26: "Snap"). A take changed by part of a frame
 * then moves the later beats by whole frames. Pure.
 */
export const layout = <S extends Timed>(
  scenes: ReadonlyArray<S>,
  timings: Timings | undefined,
  fps: number,
): Result.Result<Placed<S>[], LayoutError> => {
  const out: Placed<S>[] = [];
  /** Where the beat starts with every length before it exact. */
  let exact = 0;
  const ids = new Set<string>();
  for (const [index, spec] of scenes.entries()) {
    if (ids.has(spec.id)) return Result.fail(DuplicateScene.make({ scene: spec.id }));
    ids.add(spec.id);
    const said = voiceFor(spec.id, spec.say ?? '', timings);
    if (Result.isFailure(said)) return Result.fail(said.failure);
    const voice = said.success;
    const lead = spec.lead ?? Math.max(MIN_LEAD, transitionDur(spec.enter) * 0.7);
    // With the minimum lead, the default seam between two scenes' words is
    // MIN_LEAD + DEFAULT_TAIL = 0.6 s (the film skill's CRAFT rule 9); a meant
    // pause sets `tail`.
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

/**
 * The seconds film second `T` lies into beat `p`, on the rate it was laid at
 * (`movedFrames` back by its first frame). A frame's `T` (`frameOn`) reads
 * the whole frames from the beat's first, as `secondsAt` writes them: so a
 * frame the same whole frames into a beat, wherever the beat now starts,
 * reads the very same seconds. Any other `T` (a preview's clock, a cue's
 * start sought) reads its own seconds less the beat's start. Every painter
 * reads a beat's own time so, and none names a rate of its own.
 */
export const beatTime = (p: { readonly fps: number; readonly frame: number }, T: number): number =>
  movedFrames(T, -p.frame, p.fps);

/**
 * Where `point` lands in placed scene `p`, scene-local (`pointOn`): a cue it
 * names is one of the scene's resolved cues. `by` names who asked.
 */
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

/** When the film ends: the last placed scene's end, or 0 with no scenes. */
export const filmEnd = (placed: ReadonlyArray<Placed>): number =>
  Option.match(Arr.last(placed), { onNone: () => 0, onSome: (p) => p.start + p.dur });

/** The placed scene `scene` names, or `UnknownScene` listing the scenes there are. */
export const sceneOf = <S extends Timed>(
  placed: ReadonlyArray<Placed<S>>,
  scene: string,
): Result.Result<Placed<S>, UnknownScene> =>
  Result.fromOption(
    Arr.findFirst(placed, (p) => p.spec.id === scene),
    () => UnknownScene.make({ scene, known: placed.map((p) => p.spec.id) }),
  );

/** The placed scenes `ids` name, every one of them checked. */
export const scenesOf = <S extends Timed>(
  placed: ReadonlyArray<Placed<S>>,
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<Placed<S>>, UnknownScene> =>
  Result.all(ids.map((id) => sceneOf(placed, id)));

/**
 * The index of the placed scene playing at film time `T`: the last to have
 * started by then, so a scene owns its own start (and a transition's frames
 * the incoming scene's), with `CLOCK_EPSILON` of slack for a time computed
 * onto a start (float error, not a frame); the first before the film starts;
 * -1 for a film with no scenes. Allocation-free, so a frame may call it.
 */
export const sceneIndexAt = (
  placed: ReadonlyArray<{ readonly start: number }>,
  T: number,
): number => {
  for (let i = placed.length - 1; i > 0; i--)
    if (T + CLOCK_EPSILON >= Arr.getUnsafe(placed, i).start) return i;
  return Math.min(0, placed.length - 1);
};

/** The placed scene playing at film time `T` (`sceneIndexAt`); none only for a film with no scenes. */
export const sceneAt = <P extends { readonly start: number }>(
  placed: ReadonlyArray<P>,
  T: number,
): Option.Option<P> => Arr.get(placed, sceneIndexAt(placed, T));

/** Whether every scene that speaks has its take recorded: only then is there a mixed track. */
export const everyTakeRecorded = (placed: ReadonlyArray<Placed>): boolean =>
  placed.every((p) => p.voice.duration === 0 || p.voice.recorded);
