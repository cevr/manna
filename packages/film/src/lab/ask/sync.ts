import { type Context, Effect, Option } from 'effect';
import { Frames } from '../../browser/frames.ts';
import { frameAtOrBefore, frameRead } from '../../core/time.ts';
import { Media, type Playable } from '../../browser/media.ts';
import {
  type SyncEvent,
  SyncEvent as Events,
  type SyncState,
  UNKNOWN_END,
  movingOf,
  runningOf,
} from './sync-machine.ts';

const DRIFT_S = 0.2;

const TICK_S = 0.05;

const INTO_FRAME = 0.25;

const landing = (t: number, fps: number, own: number): number =>
  (frameAtOrBefore(frameRead(t, fps) / fps, own) + INTO_FRAME) / own;

const drifted = (video: number, t: number): boolean => Math.abs(video - t) > DRIFT_S;

export interface SyncDriver {
  readonly attach: (id: string, video: Playable) => () => void;
  readonly apply: (state: SyncState) => void;
  readonly follow: (id: string) => void;
  readonly timed: (id: string, fps: Option.Option<number>) => void;
  readonly stop: () => void;
}

interface Attached {
  readonly video: Playable;
  readonly held: AbortController;
}

export const makeSync = (
  leader: string,
  send: (event: SyncEvent) => void,
  host: Context.Context<Frames | Media>,
): SyncDriver => {
  const videos = new Map<string, Attached>();
  const rates = new Map<string, number>();
  let current = Option.none<SyncState>();
  let seek = -1;
  let grid = -1;
  let told = -1;
  let looping = Option.none<() => void>();
  let leading = leader;

  const broken = new Map<Attached, string>();
  const all = () => [...videos.values()];
  const working = () => all().filter((a) => !broken.has(a));
  const clock = () => Option.fromUndefinedOr(videos.get(leading));

  const fork = (effect: Effect.Effect<unknown, never, Frames | Media>) => {
    Effect.runForkWith(host)(effect);
  };
  const forkOn = (a: Attached, effect: Effect.Effect<unknown, never, Frames | Media>) => {
    Effect.runForkWith(host)(effect, { signal: a.held.signal });
  };
  const failed = (id: string, a: Attached, reason: string) => {
    broken.set(a, reason);
    if (id === leading) send(Events.MediaFailed({ reason }));
  };
  const play = (id: string, a: Attached) =>
    forkOn(
      a,
      Media.use((media) => media.playOrMute(a.video)).pipe(
        Effect.tap((played) =>
          Effect.sync(() => {
            if (played._tag === 'Failed') failed(id, a, played.name);
          }),
        ),
      ),
    );
  const land = (id: string, a: Attached, state: SyncState) =>
    forkOn(
      a,
      a.video.seek(
        landing(
          state.t,
          state.fps,
          Option.getOrElse(Option.fromUndefinedOr(rates.get(id)), () => state.fps),
        ),
      ),
    );

  const hear = (state: SyncState) => {
    for (const [id, a] of videos) {
      a.video.mute(id !== state.audible);
      a.video.rate(state.rate);
    }
  };

  const step = (): boolean =>
    Option.exists(current, (state) => {
      Option.map(clock(), (master) => {
        const t = master.video.time();
        if (state._tag === 'Buffering') {
          if (working().every((a) => a.video.ready())) send(Events.Resumed);
          return;
        }
        if (Math.abs(t - told) >= TICK_S) {
          told = t;
          send(Events.Ticked({ t }));
        }
        for (const a of working()) {
          const video = a.video;
          if (a === master || video.seeking() || video.ended()) continue;
          if (t < video.duration() && drifted(video.time(), t)) forkOn(a, video.seek(t));
        }
      });
      return Option.exists(current, movingOf);
    });

  const run = () => {
    if (Option.isSome(looping)) return;
    const stop = Effect.runCallbackWith(host)(
      Frames.use((frames) => frames.loop(step)),
      {
        onExit: () => {
          if (Option.exists(looping, (running) => running === stop)) looping = Option.none();
        },
      },
    );
    looping = Option.some(stop);
  };
  const halt = () => {
    Option.map(looping, (stop) => stop());
    looping = Option.none();
  };

  const apply = (state: SyncState) => {
    current = Option.some(state);
    hear(state);
    const regrid = state.fps !== grid && !movingOf(state);
    grid = state.fps;
    if (state.seek !== seek || regrid) {
      seek = state.seek;
      told = state.t;
      for (const [id, a] of videos) if (!broken.has(a)) land(id, a, state);
    }
    if (runningOf(state)) {
      for (const [id, a] of videos) if (!broken.has(a) && !a.video.playing()) play(id, a);
      run();
      return;
    }
    for (const a of all()) fork(a.video.pause);
    if (state._tag === 'Buffering') {
      run();
      return;
    }
    halt();
  };

  const release = (id: string, a: Attached) => {
    if (videos.get(id) !== a) return;
    a.held.abort();
    fork(a.video.pause);
    videos.delete(id);
    broken.delete(a);
  };

  const measure = (id: string, video: Playable) => {
    if (id === leading && Number.isFinite(video.duration()))
      send(Events.Measured({ end: video.duration() }));
  };

  const attach = (id: string, video: Playable) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (old) => {
      old.held.abort();
      broken.delete(old);
    });
    const attached: Attached = { video, held: new AbortController() };
    const signal = attached.held.signal;
    videos.set(id, attached);
    if (id === leading && Option.exists(current, (state) => state._tag === 'Failed'))
      send(Events.MediaReplaced);
    measure(id, video);
    video.on(
      'measured',
      () => {
        broken.delete(attached);
        measure(id, video);
        Option.map(current, (state) => land(id, attached, state));
      },
      signal,
    );
    video.on('stalled', () => send(Events.Stalled), signal);
    video.on('error', () => failed(id, attached, 'error'), signal);
    video.on(
      'ended',
      () => {
        if (id === leading) send(Events.Ended);
      },
      signal,
    );
    Option.map(current, (state) => {
      hear(state);
      land(id, attached, state);
      if (runningOf(state)) play(id, attached);
    });
    return () => release(id, attached);
  };

  const follow = (id: string) => {
    if (id === leading) return;
    leading = id;
    told = -1;
    const now = Option.fromUndefinedOr(videos.get(id));
    send(
      Events.ClockMoved({
        end: Option.getOrElse(
          Option.filter(
            Option.map(now, (a) => a.video.duration()),
            Number.isFinite,
          ),
          () => UNKNOWN_END,
        ),
      }),
    );
    Option.map(now, (a) => {
      Option.map(Option.fromUndefinedOr(broken.get(a)), (reason) =>
        send(Events.MediaFailed({ reason })),
      );
      if (a.video.ended()) send(Events.Ended);
    });
  };

  const timed = (id: string, fps: Option.Option<number>) => {
    if (rates.get(id) === Option.getOrUndefined(fps)) return;
    Option.match(fps, {
      onNone: () => rates.delete(id),
      onSome: (rate) => rates.set(id, rate),
    });
    Option.map(Option.fromUndefinedOr(videos.get(id)), (a) => {
      if (!broken.has(a)) Option.map(current, (state) => land(id, a, state));
    });
  };

  const stop = () => {
    halt();
    for (const [id, a] of [...videos]) release(id, a);
  };

  return { attach, apply, follow, timed, stop };
};
