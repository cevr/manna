import { Match, Option, Predicate, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { clock, frameRead, timecode } from '../../core/time.ts';

export const UNTIMED_FPS = 30;

export const UNKNOWN_END = Number.MAX_SAFE_INTEGER;

const Rate = Schema.Literals([0.5, 1]);
type Rate = typeof Rate.Type;

const Clock = {
  t: Schema.Finite,
  start: Schema.Finite,
  end: Schema.Finite,
  fps: Schema.Finite,
  rate: Rate,
  audible: Schema.String,
  seek: Schema.Int,
};

export const SyncState = State({
  Paused: Clock,
  Playing: Clock,
  Scrubbing: { ...Clock, resume: Schema.Boolean },
  Buffering: Clock,
  Failed: { ...Clock, reason: Schema.String },
});
export type SyncState = typeof SyncState.Type;

export const SyncEvent = Event({
  PlayPressed: {},
  PausePressed: {},
  Toggled: {},
  Ticked: { t: Schema.Finite },
  ScrubMoved: { t: Schema.Finite },
  ScrubReleased: {},
  Stepped: { frames: Schema.Int },
  Landed: { t: Schema.Finite },
  Stalled: {},
  Resumed: {},
  Ended: {},
  Timed: { fps: Schema.Finite },
  Measured: { end: Schema.Finite },
  HeardChosen: { id: Schema.String },
  RateChosen: { rate: Rate },
  MediaFailed: { reason: Schema.String },
  MediaReplaced: {},
  ClockMoved: { end: Schema.Finite },
});
export type SyncEvent = typeof SyncEvent.Type;

interface SyncClock {
  readonly t: number;
  readonly start: number;
  readonly end: number;
  readonly fps: number;
  readonly rate: Rate;
  readonly audible: string;
  readonly seek: number;
}

const clockOf = (state: SyncState): SyncClock => ({
  t: state.t,
  start: state.start,
  end: state.end,
  fps: state.fps,
  rate: state.rate,
  audible: state.audible,
  seek: state.seek,
});

const clamp = (clock: SyncClock, t: number) => Math.max(clock.start, Math.min(clock.end, t));

const withClock = (state: SyncState, clock: SyncClock): SyncState =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Paused: () => SyncState.Paused(clock),
      Playing: () => SyncState.Playing(clock),
      Scrubbing: (s) => SyncState.Scrubbing({ ...clock, resume: s.resume }),
      Buffering: () => SyncState.Buffering(clock),
      Failed: (s) => SyncState.Failed({ ...clock, reason: s.reason }),
    }),
  );

const AT_END_S = 0.05;

const endingAt = (state: SyncState, end: number): SyncClock => {
  const at = Math.max(state.start, end);
  return { ...clockOf(state), end: at, t: Math.min(state.t, at) };
};

const played = (state: SyncState): SyncState => {
  const clock = clockOf(state);
  if (clock.t < clock.end - AT_END_S) return SyncState.Playing(clock);
  return SyncState.Playing({ ...clock, t: clock.start, seek: clock.seek + 1 });
};

const resumes = (state: SyncState): boolean =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Paused: () => false,
      Playing: () => true,
      Scrubbing: (s) => s.resume,
      Buffering: () => true,
      Failed: () => false,
    }),
  );

const ANY = [
  SyncState.Paused,
  SyncState.Playing,
  SyncState.Scrubbing,
  SyncState.Buffering,
] as const;
const MOVING = [SyncState.Playing, SyncState.Buffering] as const;

export const syncAt = (audible: string, start: number, at: number = start): SyncState =>
  SyncState.Paused({
    t: Math.max(start, at),
    start,
    end: UNKNOWN_END,
    fps: UNTIMED_FPS,
    rate: 1,
    audible,
    seek: 0,
  });

export const syncMachine = (audible: string, start: number, at: number = start) =>
  Machine.make({
    state: SyncState,
    event: SyncEvent,
    initial: syncAt(audible, start, at),
  })
    .on(SyncState.Paused, SyncEvent.PlayPressed, ({ state }) => played(state))
    .on(SyncState.Paused, SyncEvent.Toggled, ({ state }) => played(state))
    .on(MOVING, SyncEvent.PausePressed, ({ state }) => SyncState.Paused(clockOf(state)))
    .on(MOVING, SyncEvent.Toggled, ({ state }) => SyncState.Paused(clockOf(state)))
    .on(SyncState.Playing, SyncEvent.Ticked, ({ state, event }) =>
      SyncState.Playing({ ...clockOf(state), t: clamp(clockOf(state), event.t) }),
    )
    .on(SyncState.Playing, SyncEvent.Stalled, ({ state }) => SyncState.Buffering(clockOf(state)))
    .on(SyncState.Buffering, SyncEvent.Resumed, ({ state }) => SyncState.Playing(clockOf(state)))
    .on(MOVING, SyncEvent.Ended, ({ state }) =>
      SyncState.Paused({ ...clockOf(state), t: state.end }),
    )
    .on(ANY, SyncEvent.ScrubMoved, ({ state, event }) => {
      const clock = clockOf(state);
      return SyncState.Scrubbing({
        ...clock,
        t: clamp(clock, event.t),
        seek: clock.seek + 1,
        resume: resumes(state),
      });
    })
    .on(SyncState.Scrubbing, SyncEvent.ScrubReleased, ({ state }) => {
      if (state.resume) return SyncState.Playing(clockOf(state));
      return SyncState.Paused(clockOf(state));
    })
    .on(ANY, SyncEvent.Stepped, ({ state, event }) => {
      const clock = clockOf(state);
      const frame = frameRead(clock.t, clock.fps);
      return withClock(state, {
        ...clock,
        t: clamp(clock, (frame + event.frames) / clock.fps),
        seek: clock.seek + 1,
      });
    })
    .on(ANY, SyncEvent.Landed, ({ state, event }) => {
      const clock = clockOf(state);
      return withClock(state, { ...clock, t: clamp(clock, event.t), seek: clock.seek + 1 });
    })
    .on(ANY, SyncEvent.Measured, ({ state, event }) => withClock(state, endingAt(state, event.end)))
    .on([...ANY, SyncState.Failed], SyncEvent.Timed, ({ state, event }) =>
      withClock(state, { ...clockOf(state), fps: event.fps }),
    )
    .on(ANY, SyncEvent.HeardChosen, ({ state, event }) =>
      withClock(state, { ...clockOf(state), audible: event.id }),
    )
    .on(ANY, SyncEvent.RateChosen, ({ state, event }) =>
      withClock(state, { ...clockOf(state), rate: event.rate }),
    )
    .on(ANY, SyncEvent.MediaFailed, ({ state, event }) =>
      SyncState.Failed({ ...clockOf(state), reason: event.reason }),
    )
    .on(SyncState.Failed, SyncEvent.MediaReplaced, ({ state }) => SyncState.Paused(clockOf(state)))
    .on(ANY, SyncEvent.ClockMoved, ({ state, event }) =>
      withClock(state, endingAt(state, event.end)),
    )
    .on(SyncState.Failed, SyncEvent.ClockMoved, ({ state, event }) =>
      SyncState.Paused(endingAt(state, event.end)),
    );

export const runningOf = (state: SyncState): boolean => state._tag === 'Playing';

export const movingOf: (state: SyncState) => boolean = Predicate.or(
  Predicate.isTagged('Playing'),
  Predicate.isTagged('Buffering'),
);

export const atRest = (state: SyncState): boolean =>
  state._tag === 'Paused' && state.t === state.start;

export const failureOf = (state: SyncState): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tag('Failed', (failed) => Option.some(failed.reason)),
    Match.orElse(() => Option.none()),
  );

export const clockParts = (
  state: SyncState,
  say: (seconds: number, fps: number) => string = timecode,
) => {
  const end = Match.value(state.end >= UNKNOWN_END).pipe(
    Match.when(true, () => '…'),
    Match.orElse(() => say(state.end, state.fps)),
  );
  const waiting = Match.value(state._tag).pipe(
    Match.when('Buffering', () => ' · waiting'),
    Match.orElse(() => ''),
  );
  return { at: say(Math.max(0, state.t), state.fps), rest: ` / ${end}${waiting}` };
};

export const lengthText = (state: SyncState): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(state.end, (end) => end < UNKNOWN_END),
    clock,
  );

export const reachOf = (state: SyncState): number => {
  if (state.end >= UNKNOWN_END) return Math.max(state.t, state.start);
  return state.end;
};
