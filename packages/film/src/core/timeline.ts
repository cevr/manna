import { Predicate, Result } from 'effect';
import {
  CueCycle,
  type PointError,
  UnknownCue,
  UnknownMark,
  UntilBeforeStart,
  WordMissing,
} from './errors.ts';
import { wordAfter } from './narration.ts';
import {
  CUE_PATCH_KEYS,
  type CuePatch,
  type ResolvedCue,
  type ScenePoint,
  type Span,
  type Timeline,
  type Until,
  type Word,
} from './schema.ts';
import { CLOCK_EPSILON, DEFAULT_EASE, type Key, ease, keys, progress, toMs } from './time.ts';

export const cueProgress = (cue: ResolvedCue, t: number): number =>
  progress(t, cue.start, cue.dur, ease[cue.ease]);

export const staggerAt = (cue: ResolvedCue, t: number, at: number): number => {
  const lead = cue.stagger * at;
  return progress(t, cue.start + cue.dur * lead, cue.dur * (1 - cue.stagger), ease[cue.ease]);
};

export const staggerProgress = (cue: ResolvedCue, t: number, i: number, n: number): number =>
  n <= 1 ? cueProgress(cue, t) : staggerAt(cue, t, i / (n - 1));

export const cueKeys = (cue: ResolvedCue, t: number, frames: ReadonlyArray<Key>): number => {
  if (cue.dur <= 0) return keys(t >= cue.start ? 1 : 0, frames, cue.ease);
  return keys((t - cue.start) / cue.dur, frames, cue.ease);
};

const anchorField = (span: Span) => {
  if ('mark' in span)
    return span.word === undefined ? { mark: span.mark } : { mark: span.mark, word: span.word };
  if ('after' in span) return { after: span.after };
  if ('with' in span) return { with: span.with };
  return { at: span.at };
};

const untilOffsetField = (untilOffset: number | undefined) =>
  untilOffset === undefined || toMs(untilOffset) === 0 ? {} : { untilOffset };

const endField = (span: Span, patch: CuePatch) => {
  if (patch.until !== undefined)
    return { until: patch.until, ...untilOffsetField(patch.untilOffset) };
  const ends = span.ends === true ? { ends: true as const } : {};
  if (patch.dur !== undefined) return { dur: patch.dur, ...ends };
  if (span.until !== undefined && patch.untilOffset !== undefined)
    return { until: span.until, ...untilOffsetField(patch.untilOffset) };
  if (span.until !== undefined)
    return span.untilOffset === undefined
      ? { until: span.until }
      : { until: span.until, untilOffset: span.untilOffset };
  if (span.dur !== undefined) return { dur: span.dur, ...ends };
  return ends;
};

export const writtenPatch = (patch: CuePatch): CuePatch =>
  CUE_PATCH_KEYS.reduce<CuePatch>((written, key) => {
    const value = patch[key];
    if (!Predicate.isNumber(value)) return written;
    return { ...written, [key]: toMs(value) };
  }, patch);

export const patchSpan = (span: Span, patch: CuePatch): Span => {
  const offset = patch.offset ?? span.offset;
  const easeName = patch.ease ?? span.ease;
  const stagger = patch.stagger ?? span.stagger;
  const offsetField = offset === undefined ? {} : { offset };
  const easeField = easeName === undefined ? {} : { ease: easeName };
  const staggerField = stagger === undefined ? {} : { stagger };
  const silenceField = span.silence === true ? { silence: true as const } : {};
  const trackField = span.track === undefined ? {} : { track: span.track };
  return {
    ...anchorField(span),
    ...offsetField,
    ...endField(span, patch),
    ...easeField,
    ...staggerField,
    ...silenceField,
    ...trackField,
  };
};

export interface SceneClock {
  readonly scene: string;
  readonly marks: ReadonlyMap<string, number>;
  readonly words: ReadonlyArray<Word>;
  readonly speechStart: number;
  readonly speechEnd: number;
  readonly dur: number;
}

export const pointOn = <E>(
  clock: SceneClock,
  cueOf: (name: string) => Result.Result<ResolvedCue, E>,
  point: ScenePoint,
  by: string,
  edge: 'start' | 'end' = 'start',
): Result.Result<number, E | PointError> => {
  if (point.mark !== undefined) {
    const { mark, word } = point;
    const m = clock.marks.get(mark);
    if (m === undefined)
      return Result.fail(
        UnknownMark.make({ scene: clock.scene, mark, by, known: [...clock.marks.keys()] }),
      );
    if (word === undefined) return Result.succeed(clock.speechStart + m);
    return Result.map(
      Result.fromOption(wordAfter(clock.words, m, word), () =>
        WordMissing.make({ scene: clock.scene, by, mark, word }),
      ),
      (w) => clock.speechStart + w,
    );
  }
  if (point.cue !== undefined) {
    const named = point.edge ?? edge;
    return Result.map(cueOf(point.cue), (c) => (named === 'end' ? c.end : c.start));
  }
  switch (point.at) {
    case 'start':
      return Result.succeed(0);
    case 'speech':
      return Result.succeed(clock.speechStart);
    case 'speechEnd':
      return Result.succeed(clock.speechEnd);
    case 'end':
      return Result.succeed(clock.dur);
  }
};

const anchorPoint = (span: Span): ScenePoint => {
  if ('mark' in span)
    return span.word === undefined ? { mark: span.mark } : { mark: span.mark, word: span.word };
  if ('after' in span) return { cue: span.after, edge: 'end' };
  if ('with' in span) return { cue: span.with };
  return { at: span.at };
};

const untilPoint = (until: Until): ScenePoint => {
  if (Predicate.isString(until)) return { mark: until };
  if (until.cue !== undefined) return { cue: until.cue, edge: until.edge ?? 'end' };
  return { at: until.at };
};

const untilText = (until: Until): string => {
  if (Predicate.isString(until)) return `{${until}}`;
  if (until.cue !== undefined) return `the ${until.edge ?? 'end'} of cue "${until.cue}"`;
  return until.at;
};

export const endsLate = (cue: ResolvedCue, sceneDur: number): boolean =>
  cue.end > sceneDur + CLOCK_EPSILON;

export const untilEndText = (until: Until, untilOffset = 0): string => {
  if (toMs(untilOffset) === 0) return untilText(until);
  const sign = untilOffset < 0 ? '−' : '+';
  return `${untilText(until)} ${sign} ${Math.abs(untilOffset).toFixed(2)} s`;
};

export type TimelineError = PointError | CueCycle | UntilBeforeStart;

export const resolveTimeline = (
  timeline: Timeline | undefined,
  clock: SceneClock,
): Result.Result<ReadonlyMap<string, ResolvedCue>, TimelineError> => {
  const out = new Map<string, ResolvedCue>();
  if (timeline === undefined) return Result.succeed(out);
  const visiting: Array<string> = [];
  const known = Object.keys(timeline);

  const length = (
    name: string,
    span: Span,
    start: number,
  ): Result.Result<number, TimelineError> => {
    const until = span.until;
    if (until === undefined) return Result.succeed(span.dur ?? 0);
    const self = `cue "${name}"`;
    return Result.flatMap(
      pointOn(clock, (n) => resolve(n, self), untilPoint(until), self),
      (point): Result.Result<number, TimelineError> => {
        const end = point + (span.untilOffset ?? 0);
        if (end < start - CLOCK_EPSILON)
          return Result.fail(
            UntilBeforeStart.make({
              scene: clock.scene,
              cue: name,
              until: untilEndText(until, span.untilOffset),
            }),
          );
        return Result.succeed(Math.max(0, end - start));
      },
    );
  };

  const timed = (
    name: string,
    span: Span,
  ): Result.Result<{ readonly start: number; readonly dur: number }, TimelineError> => {
    const self = `cue "${name}"`;
    return Result.flatMap(
      pointOn(clock, (n) => resolve(n, self), anchorPoint(span), self),
      (anchor) => {
        const at = anchor + (span.offset ?? 0);
        const start = span.ends === true ? at - (span.dur ?? 0) : at;
        return Result.map(length(name, span, start), (dur) => ({ start, dur }));
      },
    );
  };

  const resolve = (name: string, by: string): Result.Result<ResolvedCue, TimelineError> => {
    const done = out.get(name);
    if (done !== undefined) return Result.succeed(done);
    const span = Object.hasOwn(timeline, name) ? timeline[name] : undefined;
    if (span === undefined)
      return Result.fail(UnknownCue.make({ scene: clock.scene, cue: name, by, known }));
    if (visiting.includes(name))
      return Result.fail(CueCycle.make({ scene: clock.scene, cycle: [...visiting, name] }));
    visiting.push(name);
    const at = timed(name, span);
    visiting.pop();
    if (Result.isFailure(at)) return Result.fail(at.failure);
    const { start, dur } = at.success;
    const cue = {
      start,
      end: start + dur,
      dur,
      ease: span.ease ?? DEFAULT_EASE,
      stagger: span.stagger ?? 0,
    };
    out.set(name, cue);
    return Result.succeed(cue);
  };

  for (const name of known) {
    const cue = resolve(name, 'timeline');
    if (Result.isFailure(cue)) return Result.fail(cue.failure);
  }
  return Result.succeed(out);
};
