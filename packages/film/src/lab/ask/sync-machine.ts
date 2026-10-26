// The player's clock machine: every video it plays on one clock, paused,
// playing, scrubbed or waiting on a stalled video, at ½× or 1×, with one
// video's sound heard.
//
//   Paused ─Play→ Playing ─Pause→ Paused     Playing ─Stalled→ Buffering ─Resumed→ Playing
//   any ─ScrubMoved→ Scrubbing ─ScrubReleased→ Playing | Paused (as it was)
//   Playing | Buffering ─Ended→ Paused (at the end)
//   any ─Stepped | Landed | Measured | HeardChosen | RateChosen→ the same, changed
//   any ─MediaFailed→ Failed (where it stood; it hears nothing more of that media)
//   Failed ─MediaReplaced→ Paused (where it stood: a failure is its media's, and the
//     clock's new media, another source or a retry of the same, starts there afresh)
//   any ─ClockMoved→ the same, on the new clock's end (Failed → Paused: the failure was
//     the old clock's media)
//
// Events are facts (a button pressed, the clock moved on, a video stalled);
// the driver (`sync.ts`) makes the videos do what each state says. A seek (a
// scrub, a step, Back landing on an entry's time, a play from the end) bumps `seek`, so the driver moves the
// videos only then, never for the clock's own ticks.

import { Effect, Match, Option, Predicate, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { FILM_FPS, clock, frameRead, timecode } from '../../core/time.ts';

/** An end not known yet: the clock's video's metadata has not loaded. */
export const UNKNOWN_END = Number.MAX_SAFE_INTEGER;

/** The rates the player offers. */
const Rate = Schema.Literals([0.5, 1]);
type Rate = typeof Rate.Type;

const Clock = {
  /** Where the set is, in seconds on its clock's video. */
  t: Schema.Finite,
  /** Where every video starts (the manifest's `start`). */
  start: Schema.Finite,
  /** Where the clock's video ends, once known (`UNKNOWN_END` before). */
  end: Schema.Finite,
  /**
   * The frames a second the clock counts, its timecode's and a ←/→ step's:
   * its video's own (`Timed`, as the server reads it from the file), the
   * film rate (`FILM_FPS`) only while that is not known yet or the video
   * names none.
   */
  fps: Schema.Finite,
  rate: Rate,
  /** The variant whose sound is heard. */
  audible: Schema.String,
  /** Counts the seeks: the driver moves the videos when it changes. */
  seek: Schema.Int,
};

export const SyncState = State({
  Paused: Clock,
  Playing: Clock,
  /** The scrub bar held; `resume` says whether to play once it is let go. */
  Scrubbing: { ...Clock, resume: Schema.Boolean },
  /** Playing, but a video has stalled: the rest wait for it. */
  Buffering: Clock,
  /** Its media cannot play (`reason`: the refusal's name, or `error`): it stays where it stood. */
  Failed: { ...Clock, reason: Schema.String },
});
export type SyncState = typeof SyncState.Type;

export const SyncEvent = Event({
  PlayPressed: {},
  PausePressed: {},
  /** Space, or the big button: play when paused, pause otherwise. */
  Toggled: {},
  /** The clock's video moved on while playing. */
  Ticked: { t: Schema.Finite },
  ScrubMoved: { t: Schema.Finite },
  ScrubReleased: {},
  /** A ←/→ step: `frames` on (back when negative) from the frame the clock reads. */
  Stepped: { frames: Schema.Int },
  /** Back or Forward landed on an entry whose `#t=` (or the set's start) is `t`. */
  Landed: { t: Schema.Finite },
  Stalled: {},
  Resumed: {},
  Ended: {},
  /** The clock's video's frame rate, once known (`FILM_FPS` until it is, or when it names none). */
  Timed: { fps: Schema.Finite },
  /** The clock's video's length, once its metadata loads. */
  Measured: { end: Schema.Finite },
  HeardChosen: { id: Schema.String },
  RateChosen: { rate: Rate },
  /** The clock's media cannot play: a play refused as it cannot be (not for sound), or an error. */
  MediaFailed: { reason: Schema.String },
  /** The clock's media is new: another source, or a retry of the same, in a fresh element. */
  MediaReplaced: {},
  /**
   * The clock is another version's video now (the version it followed left
   * the set): its end is that video's, `UNKNOWN_END` until it is measured.
   */
  ClockMoved: { end: Schema.Finite },
});
export type SyncEvent = typeof SyncEvent.Type;

/** A state's clock, whatever the state. */
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

/** The same state with its clock changed. */
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

/** How near the end a play starts over from the start. */
const AT_END_S = 0.05;

/** The clock ending at `end` (never before its start): a time past it (a link's `#t=`) stands at the end. */
const endingAt = (state: SyncState, end: number): SyncClock => {
  const at = Math.max(state.start, end);
  return { ...clockOf(state), end: at, t: Math.min(state.t, at) };
};

/** Play from where the clock is, or from the start when it stands at the end. */
const played = (state: SyncState): SyncState => {
  const clock = clockOf(state);
  if (clock.t < clock.end - AT_END_S) return SyncState.Playing(clock);
  return SyncState.Playing({ ...clock, t: clock.start, seek: clock.seek + 1 });
};

/** Whether a scrub let go should play: it was playing (or waiting to) when it was taken. */
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

/** Every state that plays, or can: a failed player hears only that its media is new. */
const ANY = [
  SyncState.Paused,
  SyncState.Playing,
  SyncState.Scrubbing,
  SyncState.Buffering,
] as const;
const MOVING = [SyncState.Playing, SyncState.Buffering] as const;

/** Where the synced player opens: `audible` heard, paused at `at` (never before `start`). */
export const syncAt = (audible: string, start: number, at: number = start): SyncState =>
  SyncState.Paused({
    t: Math.max(start, at),
    start,
    end: UNKNOWN_END,
    fps: FILM_FPS,
    rate: 1,
    audible,
    seek: 0,
  });

/** The synced player: `audible` heard first, paused at `at` (never before `start`). */
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
      // From the frame its timecode reads (`frameRead`), onto the frame grid: no drift.
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

/** The synced player's actor, started. */
export const spawnSync = (audible: string, start: number, at: number = start) =>
  Machine.spawn(syncMachine(audible, start, at)).pipe(Effect.tap((actor) => actor.start));

/** Whether the videos should be running: only while playing (a stall holds them all). */
export const runningOf = (state: SyncState): boolean => state._tag === 'Playing';

/** Whether the player plays, or waits on its videos to play on (`MOVING`). */
export const movingOf: (state: SyncState) => boolean = Predicate.or(
  Predicate.isTagged('Playing'),
  Predicate.isTagged('Buffering'),
);

/**
 * Whether the player is at rest: paused where it opens. A scrub is never at
 * rest, even at the start, so whatever shows only once the player has moved
 * stays for the whole scrub.
 */
export const atRest = (state: SyncState): boolean =>
  state._tag === 'Paused' && state.t === state.start;

/** Why the player's media cannot play, once it cannot. */
export const failureOf = (state: SyncState): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tag('Failed', (failed) => Option.some(failed.reason)),
    Match.orElse(() => Option.none()),
  );

/**
 * What the transport says of the clock, in two parts: where it is
 * (`00:00:12:09`), and the rest (` / 00:00:25:00`, and ` · waiting` while it
 * waits on a video), which a phone's one-row transport leaves out. `say`
 * reads a time: the frame's `timecode`, as a review compares frames, or a
 * lone video's `clock` (`0:12 / 0:25`), as its length says it at rest.
 */
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

/**
 * A video's length as its picture says it at rest (`0:36`, `1:02:05`):
 * none until it is measured.
 */
export const lengthText = (state: SyncState): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(state.end, (end) => end < UNKNOWN_END),
    clock,
  );

/** The scrub bar's reach: the clock's video's end once known, else where the clock is. */
export const reachOf = (state: SyncState): number => {
  if (state.end >= UNKNOWN_END) return Math.max(state.t, state.start);
  return state.end;
};
