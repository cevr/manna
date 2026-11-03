import { Array as Arr, Option } from 'effect';
import { attemptUrl } from '../core/api.ts';
import type { StudioAttempt, StudioAttempts } from '../core/studio.ts';
import { narrationFileUrl } from '../player/narrated.ts';

interface TakeHeard {
  readonly url: string;
  readonly source: 'recorded' | 'staging';
  readonly heard: Option.Option<string>;
  readonly duration: number;
}

const recorded = (film: string, read: StudioAttempts, a: StudioAttempt): TakeHeard => ({
  url: attemptUrl(film, read.beat, a.file),
  source: 'recorded',
  heard: Option.some(a.transcript),
  duration: a.duration,
});

const timingsTake = (film: string, read: StudioAttempts): Option.Option<TakeHeard> =>
  Option.orElse(
    Option.map(
      Arr.findFirst(read.attempts, (a) => a.kept),
      (a) => recorded(film, read, a),
    ),
    () =>
      Option.map(Option.fromUndefinedOr(read.staged), (s): TakeHeard => ({
        url: narrationFileUrl(film, s.file),
        source: 'staging',
        heard: Option.none(),
        duration: s.duration,
      })),
  );

export const takeHeard = (
  film: string,
  read: StudioAttempts,
  attempt: Option.Option<string>,
): Option.Option<TakeHeard> =>
  Option.match(attempt, {
    onSome: (file) =>
      Option.map(
        Arr.findFirst(read.attempts, (a) => a.file === file),
        (a) => recorded(film, read, a),
      ),
    onNone: () => timingsTake(film, read),
  });
