/* oxlint-disable effect/noNewPromise, effect/noNewError -- the world stands in for One's `Audio` and `Network`, whose calls are promises the adapter wraps; a refused call rejects with an Error as One's do. */

import { Array as Arr, Clock, Effect, Layer, Match, Option, Predicate, References } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { TestClock } from 'effect/testing';

import { type Device, playbackOn, type Session } from '../player/playback.live';
import { Command, Playback, Player, playerOn, type Status, statusEvery } from '../player/player';

export type Platform = 'ios' | 'android' | 'web';

export type Phase =
  | 'idle'
  | 'loading'
  | 'silent'
  | 'sound'
  | 'dry'
  | 'paused'
  | 'ended'
  | 'failed'
  | 'held'
  | 'closed'
  | 'reasked';

export const step = 50;
export const span = 250 + 600;
const answerMost = 600;
export const cadence = span + answerMost + step;
export const allowance = 2000 + 2 * span + 2 * answerMost + step;
export const standFloor = 2000;
export const proving = 2 * span + answerMost;
export const owed = 15_000 + 2 * span + step;
const length = 240_000;

export interface Knobs {
  readonly lag: () => number;
  readonly sample: () => number;
  readonly loadFor: () => number;
  readonly silentFor: () => number;
  readonly landAfter: () => number;
  readonly remoteLand: () => number;
  readonly tellAfter: () => number;
  readonly seekDry: () => boolean;
}

export const fixedKnobs: Knobs = {
  lag: () => 50,
  sample: () => 0.5,
  loadFor: () => 500,
  silentFor: () => 0,
  landAfter: () => 0,
  remoteLand: () => 0,
  tellAfter: () => 0,
  seekDry: () => false,
};

export interface Breach {
  readonly rule: string;
  readonly t: number;
  readonly detail: string;
}

interface Read {
  readonly asked: number;
  readonly acts: number;
  readonly sampleAt: number;
  readonly dueAt: number;
  seen: Option.Option<Status>;
  endSeen: number;
  readonly answer: (status: Status) => void;
}

interface Tell {
  readonly pressedAt: number;
  readonly at: number;
  readonly run: () => void;
  readonly before?: Option.Option<number>;
  readonly unseen?: Option.Option<number>;
  readonly seekTo?: number;
}

interface Target {
  readonly to: number;
  readonly asked: number;
  readonly at: number;
  landed: boolean;
  reported: boolean;
}

export type Press = 'play' | 'pause' | 'seek' | 'follow';

interface SeekAsk {
  readonly resolve: (status: Status) => void;
  readonly reject: (error: Error) => void;
  readonly asked: number;
  readonly acts: number;
}
type RemoteListener = Parameters<Device['audio']['watchRemoteCommands']>[0];
type NetworkListener = Parameters<Device['network']['addStateListener']>[0];

const settleJs = Effect.forEach(
  Array.from({ length: 3 }),
  () =>
    Effect.andThen(
      Effect.promise(() => Promise.resolve()),
      Effect.yieldNow,
    ),
  { discard: true },
);

const silentPhase = (phase: Phase) =>
  phase === 'loading' ||
  phase === 'silent' ||
  phase === 'dry' ||
  phase === 'closed' ||
  phase === 'reasked';
const soundPhase = (phase: Phase) => phase === 'sound' || phase === 'held';
const holding = (phase: Phase) => phase !== 'idle' && phase !== 'failed';
const insideClose = (phase: Phase) => phase === 'held' || phase === 'closed' || phase === 'reasked';

const stateOf = (platform: Platform, phase: Phase): Status['state'] =>
  Match.value(phase).pipe(
    Match.whenOr('silent', 'sound', 'held', 'reasked', (): Status['state'] => 'playing'),
    Match.when('dry', (): Status['state'] =>
      Match.value(platform).pipe(
        Match.when('ios', (): Status['state'] => 'loading'),
        Match.orElse((): Status['state'] => 'playing'),
      ),
    ),
    Match.when('closed', (): Status['state'] => 'loading'),
    Match.orElse((it): Status['state'] => it),
  );

const keepRun = (since: number, holds: boolean, now: number) => {
  if (!holds) return Number.NaN;
  if (Number.isNaN(since)) return now;
  return since;
};

const pressAction = (kind: Press) =>
  Match.value(kind).pipe(
    Match.when('play', () => 'play'),
    Match.when('pause', () => 'pause'),
    Match.orElse(() => 'seekto'),
  );

const pressCommand = (kind: Press) =>
  Match.value(kind).pipe(
    Match.when('play', () => 'Resume'),
    Match.when('pause', () => 'Pause'),
    Match.when('seek', () => 'Seek'),
    Match.orElse(() => 'Follow'),
  );

const isLetGo = Predicate.or(Predicate.isTagged('Failed'), Predicate.isTagged('Stopped'));
const isHalted = Predicate.or(Predicate.isTagged('Paused'), Predicate.isTagged('Stopped'));
const isAfterSound = Predicate.or(isLetGo, Predicate.isTagged('Ended'));
const isWaiting = Predicate.or(Predicate.isTagged('Loading'), Predicate.isTagged('Buffering'));
const asksSound = Predicate.or(Predicate.isTagged('Start'), Predicate.isTagged('Resume'));

const reading = new Set<Player['_tag']>(['Loading', 'Playing', 'Buffering']);
const isReading = (player: Player) => reading.has(player._tag);
const isRetry = (player: Player) => Player.$is('Buffering')(player) && player.retry;

const initial = (platform: Platform, start: number) => ({
  platform,
  t: start,
  js: start,
  phase: 'idle' as Phase,
  place: 0,
  length,
  ready: false,
  pausedEarly: false,
  ahead: 0,
  stallUntil: 0,
  loadLeft: 0,
  phaseLeft: 0,
  online: true,
  holdUntil: start,
  holdEnd: Number.NEGATIVE_INFINITY,
  landing: Option.none<{ readonly to: number; readonly at: number; readonly own: boolean }>(),
  seekAsk: Option.none<SeekAsk>(),
  seekAsksBefore: new Array<SeekAsk>(),
  reads: new Array<Read>(),
  answers: new Array<{ readonly dueAt: number; readonly run: () => void }>(),
  tells: new Array<Tell>(),
  remoteListeners: new Array<RemoteListener>(),
  networkListeners: new Array<NetworkListener>(),
  handlers: new Map<string, (details: { readonly seekTime?: number }) => void>(),
  loadAt: Number.NEGATIVE_INFINITY,
  soundProved: Number.NEGATIVE_INFINITY,
  lastSound: Number.NEGATIVE_INFINITY,
  quietRun: { from: Number.NEGATIVE_INFINITY, to: Number.NEGATIVE_INFINITY },
  carriedAt: Number.NEGATIVE_INFINITY,
  playingFrom: Number.NEGATIVE_INFINITY,
  lastSampleAt: start,
  silentFrom: Number.NEGATIVE_INFINITY,
  heldUntil: Number.NEGATIVE_INFINITY,
  answeredSample: Number.NEGATIVE_INFINITY,
  readingFrom: start,
  readGap: 0,
  answered: new Array<{
    readonly asked: number;
    readonly sampleAt: number;
    readonly answered: number;
  }>(),
  soundSince: Number.NaN,
  lastAct: start,
  acts: 0,
  toldAt: start,
  knownAct: start,
  toldWants: false,
  playTold: start,
  pauseAt: Number.NEGATIVE_INFINITY,
  pauseTold: Number.NEGATIVE_INFINITY,
  unseenFrom: Option.none<number>(),
  unseenSince: Number.POSITIVE_INFINITY,
  endedLast: Number.NEGATIVE_INFINITY,
  wants: false,
  readerPausedAt: Number.NEGATIVE_INFINITY,
  readerPlace: Option.none<number>(),
  resumePlaces: new Array<ReadonlyArray<number>>(),
  fromPending: Option.none<number>(),
  fromSince: start,
  firstFrom: Option.none<number>(),
  target: Option.none<Target>(),
  playAsk: Option.none<number>(),
  seeks: new Array<number>(),
  pressing: false,
  sentAct: 0,
  pressedAct: 0,
  seekAt: Number.NEGATIVE_INFINITY,
  resumeAt: Number.NEGATIVE_INFINITY,
  landedAt: Number.NEGATIVE_INFINITY,
  failedAt: Number.NEGATIVE_INFINITY,
  endedAt: Number.NEGATIVE_INFINITY,
  endedSeen: false,
  endedSaid: false,
  endedBefore: false,
  onlineToldAt: Number.NEGATIVE_INFINITY,
  leftEndAt: Number.NEGATIVE_INFINITY,
  endedSampled: Number.NEGATIVE_INFINITY,
  stoppedAt: Number.NEGATIVE_INFINITY,
  endedAsked: Number.NEGATIVE_INFINITY,
  readyAt: Number.POSITIVE_INFINITY,
  quiet: Number.NaN,
  offQuiet: Number.NaN,
  offTold: Number.NaN,
  offToldLog: new Array<{ readonly at: number; readonly since: number }>(),
  landedKnown: Number.NEGATIVE_INFINITY,
  onQuiet: Number.NaN,
  stops: 0,
  lastCommand: '',
  was: 'Idle' as Player['_tag'],
  wasRetry: false,
  breaches: new Array<Breach>(),
  counts: new Map<string, number>(),
  plays: new Array<{ readonly t: number; readonly from: number }>(),
  sought: new Array<number>(),
  history: new Array<{
    readonly t: number;
    readonly tag: Player['_tag'];
    readonly retry: boolean;
  }>(),
});

const told = (value: { readonly _tag: string }) =>
  Object.entries(value)
    .map(([key, it]) => {
      if (key === 'track') return '';
      if (Option.isOption(it))
        return `${key}=${Option.getOrElse(Option.map(it, String), () => 'none')}`;
      return `${key}=${String(it)}`;
    })
    .filter((it) => it !== '')
    .join(' ');

export const makeWorld = (
  platform: Platform,
  clock: TestClock.TestClock,
  knobs: Knobs,
  start: number,
  options: { readonly outOfOrder?: boolean; readonly trace?: boolean } = {},
) => {
  const w = initial(platform, start);
  const story = new Array<string>();
  const note = (line: string) => {
    if (options.trace) story.push(`${w.t} ${line}`);
  };
  const phone = platform !== 'web';
  const count = (item: string) => w.counts.set(item, (w.counts.get(item) ?? 0) + 1);
  const breach = (rule: string, detail: string) =>
    w.breaches.push({
      rule,
      t: w.t,
      detail: `${detail} phase=${w.phase} place=${w.place} online=${w.online} wants=${w.wants}`,
    });

  const said = (): Status => {
    if (platform === 'android' && w.phase === 'failed') return { state: 'failed', positionMs: 0 };
    if (platform === 'android' && w.phase !== 'idle' && !w.ready)
      return { state: 'loading', positionMs: 0 };
    let state = stateOf(platform, w.phase);
    if (w.pausedEarly && w.phase !== 'ended') state = 'paused';
    const status = { state, positionMs: w.place };
    if (w.ready) return { ...status, durationMs: w.length };
    return status;
  };

  const later = <A>(run: () => A) =>
    new Promise<A>((resolve) =>
      w.answers.push({ dueAt: w.t + knobs.lag(), run: () => resolve(run()) }),
    );
  const refuse = (message: string) =>
    new Promise<never>((_, reject) =>
      w.answers.push({ dueAt: w.t + knobs.lag(), run: () => reject(new Error(message)) }),
    );

  const startSound = () => {
    w.phase = 'dry';
    if (w.ahead > 0) w.phase = 'sound';
  };
  const markLanded = (at: number) => {
    Option.map(w.target, (it) => {
      if (Math.abs(it.to - at) <= 2) {
        it.landed = true;
        w.readerPlace = Option.some(at);
      }
    });
    Option.map(w.fromPending, (from) => {
      if (Math.abs(Math.min(from, w.length) - at) <= 2) w.fromPending = Option.none();
    });
  };
  const land = (to: number, told = true) => {
    const at = Math.max(0, Math.min(w.length, Math.round(to * 0.6) / 0.6));
    markLanded(at);
    w.landing = Option.none();
    if (at >= w.length && w.phase === 'ended') return;
    w.landedAt = w.t;
    if (told) w.landedKnown = w.t;
    w.place = at;
    if (w.place >= w.length && (w.phase === 'paused' || w.phase === 'failed')) return;
    if (w.place >= w.length) {
      w.phase = 'ended';
      w.endedAt = w.t;
      return;
    }
    if (w.phase === 'ended') {
      w.phase = 'paused';
      w.pauseAt = w.t;
    }
    if (knobs.seekDry() && soundPhase(w.phase)) {
      w.ahead = 0;
      w.phase = 'dry';
    }
  };
  const dropSeek = (cleared: boolean) => {
    const reject = (it: SeekAsk, message: string) =>
      w.answers.push({ dueAt: w.t + knobs.lag(), run: () => it.reject(new Error(message)) });
    Option.map(w.seekAsk, (it) => {
      if (platform === 'ios') reject(it, 'The seek was superseded');
      if (platform === 'web') w.seekAsksBefore.push(it);
    });
    if (cleared)
      for (const it of w.seekAsksBefore.splice(0)) reject(it, 'Playback failed or stopped');
    w.seekAsk = Option.none();
  };
  const completed = (own: boolean) => {
    Option.map(w.seekAsk, (it) => {
      if (platform === 'ios' && !own) return;
      w.seekAsk = Option.none();
      const status = said();
      const at = w.t;
      const endSeen = w.endedAt;
      const answer = (ask: typeof it) => () => {
        if (status.state === 'ended') {
          w.endedSampled = Math.max(w.endedSampled, at, endSeen);
          w.endedAsked = ask.asked;
          if (ask.acts === w.acts) w.endedSaid = true;
        }
        ask.resolve(status);
      };
      for (const ask of [...w.seekAsksBefore.splice(0), it])
        w.answers.push({ dueAt: w.t + knobs.lag(), run: answer(ask) });
    });
  };
  const landAfter = (to: number, after: number, own: boolean) => {
    if (after > 0) {
      w.landing = Option.some({ to, at: w.t + after, own });
      return;
    }
    land(to);
    completed(own);
  };

  const load = () => {
    dropSeek(true);
    Object.assign(w, {
      phase: 'loading',
      place: 0,
      ready: false,
      pausedEarly: false,
      ahead: 0,
      loadLeft: knobs.loadFor(),
      landing: Option.none(),
      loadAt: w.t,
      readyAt: Number.POSITIVE_INFINITY,
      endedSeen: false,
      stops: 0,
    });
    count('D1 load');
  };
  const resumeDevice = () => {
    w.pausedEarly = false;
    if (w.phase === 'ended') {
      w.place = 0;
      w.leftEndAt = w.t;
      startSound();
      if (platform !== 'ios') completed(false);
    } else if (w.phase === 'paused' && w.ready) startSound();
    else if (w.phase === 'paused') w.phase = 'loading';
  };
  const pausesEarly = () => platform === 'android' && w.phase === 'loading' && !w.ready;
  const pauseDevice = () => {
    if (pausesEarly()) w.pausedEarly = true;
    else if (holding(w.phase) && w.phase !== 'ended') w.phase = 'paused';
  };

  const seek = (positionMs: number) => {
    note(`device seek ${positionMs} phase=${w.phase} ready=${w.ready}`);
    w.sought.push(positionMs);
    const near2 = (it: number) =>
      Math.abs(Math.min(it, w.length) - positionMs) <= 2 || Math.abs(it - positionMs) <= 2;
    const served = w.seeks.findIndex(near2);
    if (served >= 0) w.seeks.splice(0, served);
    const asked =
      served >= 0 || Option.exists(w.playAsk, near2) || Option.exists(w.fromPending, near2);
    const zero = positionMs <= 2 && Option.exists(w.target, (it) => it.to >= w.length - 5000);
    if (!asked && zero) breach('O7 seek in the last 5 s asked 0', `to=${positionMs}`);
    if (!asked && !zero)
      breach('O7 the device was asked a place the reader did not ask', `to=${positionMs}`);
    if (!holding(w.phase) || (phone && !w.ready)) {
      count('D10 refused');
      return refuse('The item is not ready to seek');
    }
    count('D10 seek');
    let after = knobs.landAfter();
    if (Option.isSome(w.fromPending) && platform === 'android') after = Math.min(300, after);
    dropSeek(false);
    return new Promise<Status>((resolve, reject) => {
      w.seekAsk = Option.some({ resolve, reject, asked: w.t, acts: w.acts });
      landAfter(positionMs, after, true);
    });
  };

  const audio: Device['audio'] = {
    setPlaybackRate: () => Promise.resolve(said()),
    play: () => {
      load();
      return later(said);
    },
    pause: () => {
      pauseDevice();
      return later(said);
    },
    resume: () => {
      resumeDevice();
      return later(said);
    },
    seek,
    stop: () => {
      dropSeek(true);
      Object.assign(w, {
        phase: 'idle',
        place: 0,
        ready: false,
        pausedEarly: false,
        landing: Option.none(),
      });
      return later(() => {});
    },
    getPlaybackStatus: () =>
      new Promise<Status>((resolve) => {
        const lag = knobs.lag();
        w.reads.push({
          asked: w.t,
          acts: w.acts,
          sampleAt: w.t + Math.floor((lag * knobs.sample()) / step) * step,
          dueAt: w.t + lag,
          seen: Option.none(),
          endSeen: Number.NEGATIVE_INFINITY,
          answer: resolve,
        });
        count('D7 read');
      }) as never,
    setNowPlayingInfo: () => later(() => {}),
    watchRemoteCommands: (listener) => {
      w.remoteListeners.push(listener);
      return () => void w.remoteListeners.splice(w.remoteListeners.indexOf(listener), 1);
    },
  };
  const network: Device['network'] = {
    getState: () => Promise.resolve({ isConnected: w.online } as never),
    addStateListener: (listener) => {
      w.networkListeners.push(listener);
      return {
        remove: () => void w.networkListeners.splice(w.networkListeners.indexOf(listener), 1),
      };
    },
  };
  const session = Option.liftPredicate(
    {
      setActionHandler: (action, handler) =>
        void w.handlers.set(action, (details) => handler?.(details as never)),
    } satisfies Session,
    () => !phone,
  );

  const api = playbackOn(() => ({ audio, network }), session);
  const seam = Playback.of({
    ...api,
    play: (uri, fromMs) =>
      Effect.suspend(() => {
        w.plays.push({ t: w.t, from: fromMs });
        w.lastAct = w.t;
        w.knownAct = w.t;
        w.acts += 1;
        w.fromPending = Option.liftPredicate(fromMs, (from) => from > 0);
        w.playAsk = w.fromPending;
        w.fromSince = w.t;
        const places = w.resumePlaces.splice(0).at(-1) ?? [];
        const resumed = places.length > 0;
        w.firstFrom = Option.filter(w.fromPending, () => resumed);
        const from = Math.min(fromMs, w.length);
        const legal = (place: number) => near(from, place) || (place >= w.length && from === 0);
        if (resumed && !places.some(legal))
          breach(
            'O6 a Resume played from another place',
            `from=${fromMs} reader=${places.join('/')}`,
          );
        if (resumed && w.seekAt <= w.resumeAt)
          w.readerPlace = Option.some(Math.min(fromMs, w.length));
        w.unseenFrom = Option.none();
        return api.play(uri, fromMs);
      }),
    stop: Effect.suspend(() => {
      w.stops += 1;
      w.stoppedAt = w.t;
      return api.stop;
    }),
  });
  const hostClock: Clock.Clock = {
    ...clock,
    currentTimeMillisUnsafe: () => w.js,
    currentTimeMillis: Effect.sync(() => w.js),
    currentTimeNanosUnsafe: () => BigInt(w.js) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(w.js) * 1_000_000n),
  };
  const player = playerOn(
    Layer.mergeAll(
      Layer.succeed(Playback, seam),
      Layer.succeed(Clock.Clock, hostClock),
      Layer.succeed(References.MinimumLogLevel, 'None'),
    ),
    statusEvery,
  );
  const registry = AtomRegistry.make();
  registry.mount(player.send);
  registry.mount(player.remote);
  const page = () => registry.get(player.state);

  const running = () => w.t >= w.holdUntil;
  const near = (at: number, expected: number) =>
    Math.abs(at - expected) <= 1000 ||
    Option.exists(w.unseenFrom, (from) => Math.abs(at - from) <= 1000);
  const settled = () => w.t >= w.holdEnd + span + step;
  const untoldBefore = () =>
    Option.match(
      Arr.findFirst(w.tells, (tell) => 'before' in tell),
      {
        onNone: () => [],
        onSome: (tell) => [
          Option.getOrElse(Option.flatten(Option.fromNullishOr(tell.before)), () => 0),
          ...Option.toArray(Option.flatten(Option.fromNullishOr(tell.unseen))),
        ],
      },
    );
  const noteAct = () => {
    w.endedBefore =
      w.endedAt > Number.NEGATIVE_INFINITY &&
      w.endedAt >= Math.max(w.landedAt, w.loadAt, w.leftEndAt) &&
      w.endedSampled >= w.endedAt &&
      w.seekAt <= w.endedAt &&
      w.stoppedAt < w.endedAsked;
    w.lastAct = w.t;
    w.acts += 1;
    w.firstFrom = Option.none();
    w.endedSeen = false;
    w.endedSaid = false;
  };
  const seekAfterResume = (to: number) => {
    Option.map(Arr.last(w.resumePlaces), (last) => {
      w.resumePlaces[w.resumePlaces.length - 1] = [...last, to];
    });
  };
  const askSeek = (asked: number) => {
    w.seekAt = w.t;
    const to = Math.min(w.length, Math.max(0, asked));
    w.target = Option.some({
      to,
      asked: Math.max(0, asked),
      at: w.t,
      landed: false,
      reported: false,
    });
    if (!w.pressing) {
      w.seeks.push(Math.max(0, asked));
      seekAfterResume(to);
    }
    w.readerPlace = Option.some(to);
    w.unseenFrom = Option.none();
    w.fromPending = Option.none();
    return to;
  };
  const wantSound = () => {
    w.wants = true;
    if (w.endedBefore) w.readerPlace = Option.some(0);
  };

  const countResume = () => {
    const shown = page();
    if (isAfterSound(shown)) count(`resume from ${shown._tag}`);
    if (isRetry(shown)) count('resume from retry');
  };

  const send = (command: Command) => {
    note(`send ${told(command)}`);
    noteAct();
    w.playAsk = Option.none();
    w.sentAct = w.acts;
    w.lastCommand = command._tag;
    Command.$match(command, {
      Start: () => {
        w.wants = true;
        w.resumePlaces = [];
        w.readerPlace = Option.none();
        w.target = Option.none();
        w.seeks = [];
      },
      Resume: () => {
        countResume();
        wantSound();
        w.resumeAt = w.t;
        w.resumePlaces.push([Option.getOrElse(w.readerPlace, () => 0), ...untoldBefore()]);
      },
      Pause: () => {
        w.wants = false;
        w.pauseAt = w.t;
        w.readerPausedAt = w.t;
      },
      Seek: ({ seconds }) => void askSeek(seconds * 1000),
      Follow: () => {},
    });
    count(`D9 ${command._tag}`);
    if (insideClose(w.phase)) count(`act inside D5 ${w.phase}`);
    w.toldAt = w.t;
    w.knownAct = w.t;
    if (asksSound(command)) w.toldWants = true;
    if (command._tag === 'Pause') w.toldWants = false;
    w.acts += 1;
    if (asksSound(command)) w.playTold = w.t;
    registry.set(player.send, command);
  };

  const countPress = (kind: Press, to: number) => {
    count(`D8 ${kind}`);
    if (w.phase === 'silent') count('D8 inside D2');
    if (w.phase === 'dry') count('D8 inside D3');
    if (insideClose(w.phase)) count(`act inside D5 ${w.phase}`);
    if (kind !== 'seek') return;
    const delta = Math.min(w.length, Math.max(0, to)) - w.place;
    if (Math.abs(delta) <= 300) count('D8 seek tiny');
    if (delta < 0) count('D8 seek back');
    if (to >= w.length - 5000) count('D8 seek last 5 s');
  };
  const pressPhone = (kind: Press, to: number) => {
    if (kind === 'play') w.pausedEarly = false;
    if (kind === 'play' && (w.phase === 'ended' || w.phase === 'paused')) resumeDevice();
    if (kind === 'pause') pauseDevice();
    if (kind === 'seek' && platform === 'android' && holding(w.phase) && w.ready) {
      land(to, false);
      completed(false);
    }
  };
  const tellPress = (kind: Press, to: number) => {
    const pressedAt = w.t;
    return () => tellNow(kind, to, pressedAt);
  };
  const tellNow = (kind: Press, to: number, pressedAt: number) => {
    w.toldAt = w.t;
    w.knownAct = w.t;
    if (kind === 'play') w.toldWants = true;
    if (kind === 'pause') w.toldWants = false;
    w.acts += 1;
    if (kind === 'play') w.playTold = Math.max(w.playTold, pressedAt);
    if (kind === 'play' && !phone) w.playTold = w.t;
    if (kind === 'pause') w.pauseTold = w.t;
    if (!phone) {
      const details = Option.match(
        Option.liftPredicate(kind, (it) => it === 'seek'),
        {
          onNone: () => ({}),
          onSome: () => ({ seekTime: to / 1000 }),
        },
      );
      Option.map(Option.fromNullishOr(w.handlers.get(pressAction(kind))), (handler) =>
        handler(details),
      );
      return;
    }
    if (kind === 'seek' && platform === 'ios' && holding(w.phase)) {
      dropSeek(false);
      landAfter(to, knobs.remoteLand(), false);
    }
    const event = Option.match(
      Option.liftPredicate(kind, (it) => it === 'seek'),
      {
        onNone: () => ({ type: kind }),
        onSome: () => ({ type: kind, positionMs: to }),
      },
    );
    for (const listener of [...w.remoteListeners]) listener(event as never);
  };

  const press = (kind: Press, to = 0) => {
    note(`press ${kind} ${to}`);
    countPress(kind, to);
    if (kind === 'follow' && phone) return;
    const tell = tellPress(kind, to);
    if (!phone || (platform === 'ios' && kind === 'seek')) {
      w.tells.push({
        pressedAt: w.t,
        at: w.t + knobs.tellAfter(),
        ...Option.getOrUndefined(
          Option.map(
            Option.liftPredicate(kind, (it) => it === 'seek'),
            () => ({ seekTo: Math.min(w.length, Math.max(0, to)) }),
          ),
        ),
        run: () => {
          pressed(kind, to);
          tell();
        },
      });
      return;
    }
    const before = w.readerPlace;
    const unseen = w.unseenFrom;
    const pressedAt = w.t;
    w.pressing = true;
    pressed(kind, to);
    const pressedAct = w.acts;
    w.pressing = false;
    pressPhone(kind, to);
    const placeThen = Option.getOrElse(
      Option.orElse(
        Option.fromNullishOr(w.tells.findLast((it) => 'seekTo' in it)?.seekTo),
        () => w.readerPlace,
      ),
      () => 0,
    );
    w.tells.push({
      pressedAt,
      before,
      unseen,
      at: w.t + knobs.tellAfter(),
      run: () => {
        if (kind === 'play') {
          w.resumePlaces.push([placeThen]);
          w.resumeAt = pressedAt;
        }
        if (kind === 'seek' && w.sentAct > pressedAct && w.pressedAct <= pressedAct) askSeek(to);
        else if (kind === 'seek') {
          w.seeks.push(Math.max(0, to));
          seekAfterResume(Math.min(w.length, Math.max(0, to)));
        }
        if (kind === 'play' && w.readerPausedAt < pressedAt) w.wants = true;
        if (kind === 'seek' && w.plays.some((play) => play.t > pressedAt)) {
          w.readerPlace = Option.some(Math.min(w.length, Math.max(0, to)));
          w.fromPending = Option.none();
          w.firstFrom = Option.none();
        }
        tell();
      },
    });
  };
  const pressed = (kind: Press, to: number) => {
    noteAct();
    w.pressedAct = w.acts;
    w.lastCommand = pressCommand(kind);
    if (kind === 'play') wantSound();
    if (kind === 'play' && !phone) {
      w.resumePlaces.push([Option.getOrElse(w.readerPlace, () => 0)]);
      w.resumeAt = w.t;
    }
    if (kind === 'pause') {
      w.wants = false;
      w.pauseAt = w.t;
      w.readerPausedAt = w.t;
    }
    if (kind === 'seek') askSeek(to);
  };

  const connect = (online: boolean) => {
    if (online === w.online) return;
    w.online = online;
    count('D11 change');
    if (!running()) count('D11 inside a hold');
    w.tells.push({
      pressedAt: Number.POSITIVE_INFINITY,
      at: w.t,
      run: () => {
        if (online) w.onlineToldAt = w.t;
        for (const listener of [...w.networkListeners]) listener({ isConnected: online } as never);
      },
    });
  };

  const hold = (ms: number) => {
    w.holdUntil = Math.max(w.holdUntil, w.t + ms);
    w.holdEnd = w.holdUntil;
    count('D7 hold');
    if (ms < 1000) count('D7 hold under 1 s');
  };
  const stall = (ms: number) => {
    w.stallUntil = w.t + ms;
    w.ahead = Math.min(w.ahead, 0);
  };
  const close = () => {
    if (!soundPhase(w.phase) && w.phase !== 'loading' && w.phase !== 'dry') return;
    w.phase = 'held';
    w.phaseLeft = 300;
    w.stallUntil = w.t + 32_000;
    count('D5 close');
  };
  const fail = () => {
    if (!holding(w.phase)) return;
    w.phase = 'failed';
    w.failedAt = w.t;
    count('D6 failed');
  };
  const interrupt = () => {
    if (!soundPhase(w.phase) && !silentPhase(w.phase)) return;
    count('D12 interrupted');
    if (pausesEarly()) {
      w.pausedEarly = true;
      return;
    }
    w.phase = 'paused';
    w.pauseAt = w.t;
    w.wants = false;
    w.toldWants = false;
  };

  const turnReady = () => {
    w.ready = true;
    w.readyAt = w.t;
    Option.map(w.target, (it) => {
      if (Math.abs(it.to - w.place) <= 2) it.landed = true;
    });
  };
  const becomeReady = () => {
    turnReady();
    if (w.pausedEarly) {
      w.wants = false;
      w.toldWants = false;
      w.pauseAt = w.t;
    }
    w.ahead = Math.max(w.ahead, 1500);
    let silentFor = 0;
    if (platform === 'ios') silentFor = knobs.silentFor();
    if (silentFor <= 0) return startSound();
    w.phase = 'silent';
    w.phaseLeft = silentFor;
    count('D2 silent start');
  };
  const wait = () => {
    if (w.phase === 'loading') {
      if (w.online) w.loadLeft -= step;
      if (w.loadLeft <= 0) becomeReady();
    } else if (w.phase === 'silent') {
      w.phaseLeft -= step;
      if (w.phaseLeft <= 0) startSound();
    } else if (w.phase === 'dry' && w.ahead >= 1000) w.phase = 'sound';
    else if (w.phase === 'closed' && w.t >= w.stallUntil - 2000) {
      w.phase = 'reasked';
      w.phaseLeft = 2000;
    } else if (w.phase === 'reasked') {
      w.phaseLeft -= step;
      if (w.phaseLeft > 0) return;
      w.ahead = Math.max(w.ahead, 1500);
      w.phase = 'sound';
    }
  };
  const firstSound = () => {
    Option.map(w.firstFrom, (from) => {
      if (Math.abs(w.place - from) > 1000)
        breach('O6 the first sound is not at the place played from', `from=${from}`);
    });
    w.firstFrom = Option.none();
  };
  const sound = () => {
    if (w.phase === 'sound' && w.ahead <= 0) {
      w.phase = 'dry';
      count('D3 dry');
      return;
    }
    if (!w.ready) turnReady();
    const before = w.place;
    w.place = Math.min(w.length, w.place + step);
    Option.map(
      Option.filter(w.target, (it) => !it.landed && before < it.to - 2 && w.place >= it.to - 2),
      (it) => {
        it.landed = true;
        w.carriedAt = w.t;
      },
    );
    w.ahead -= step;
    if (w.lastSound < w.t) w.quietRun = { from: w.lastSound, to: w.t };
    w.lastSound = w.t + step;
    const seeking = Option.exists(w.target, (it) => !it.landed);
    if (Option.isSome(w.fromPending)) count('D4 lead-in');
    else if (!seeking) {
      firstSound();
      if (!running() && Option.isNone(w.unseenFrom)) {
        w.unseenFrom = w.readerPlace;
        w.unseenSince = w.t;
      }
      w.readerPlace = Option.some(w.place);
    }
    if (w.phase === 'held') {
      w.phaseLeft -= step;
      if (w.phaseLeft <= 0) w.phase = 'closed';
    }
    if (w.place < w.length) return;
    w.phase = 'ended';
    w.endedAt = w.t + step;
    w.wants = false;
    w.toldWants = false;
    count('D13 ended');
  };
  const engine = () => {
    Option.map(
      Option.filter(w.landing, (it) => w.t >= it.at),
      (it) => {
        w.landing = Option.none();
        land(it.to);
        completed(it.own);
      },
    );
    const filling = w.online && w.t >= w.stallUntil;
    if (filling && holding(w.phase) && w.phase !== 'ended')
      w.ahead = Math.min(w.ahead + 150, 20_000);
    wait();
    if (soundPhase(w.phase)) sound();
  };

  const runs = () => {
    w.soundSince = keepRun(w.soundSince, soundPhase(w.phase), w.t);
    const quiet = w.wants && silentPhase(w.phase);
    w.quiet = keepRun(w.quiet, quiet, w.t);
    w.offQuiet = keepRun(w.offQuiet, quiet && !w.online, w.t);
    const offTold = keepRun(w.offTold, w.toldWants && silentPhase(w.phase) && !w.online, w.t);
    if (!Object.is(offTold, w.offTold)) {
      w.offToldLog.push({ at: w.t, since: offTold });
      if (w.offToldLog.length > 1000) w.offToldLog.splice(0, 500);
    }
    w.offTold = offTold;
    w.onQuiet = keepRun(w.onQuiet, quiet && w.online, w.t);
  };

  const tellDue = (due: ReadonlyArray<Read>) => {
    const needed = Math.max(Number.NEGATIVE_INFINITY, ...due.map((read) => read.sampleAt));
    const last = w.tells.findLastIndex(
      (tell) => tell.at <= w.t || (!options.outOfOrder && tell.pressedAt <= needed),
    );
    for (const tell of w.tells.splice(0, last + 1)) tell.run();
    return last >= 0;
  };
  const answerDue = (due: ReadonlyArray<Read>) => {
    for (const read of due) {
      w.reads.splice(w.reads.indexOf(read), 1);
      w.answered.push({ asked: read.asked, sampleAt: read.sampleAt, answered: w.t });
      w.answeredSample = Math.max(w.answeredSample, read.sampleAt);
      if (w.answered.length > 1000) w.answered.splice(0, 500);
      const seen = Option.getOrThrow(read.seen);
      note(`read asked=${read.asked} sample=${read.sampleAt} ${seen.state} ${seen.positionMs}`);
      const current = read.acts === w.acts;
      if (seen.state === 'ended' && current) w.endedSaid = true;
      if (seen.state === 'ended') {
        w.endedSampled = Math.max(w.endedSampled, read.sampleAt, read.endSeen);
        w.endedAsked = read.asked;
      }
      if (seen.state === 'ended' && settled() && current) w.endedSeen = true;
      read.answer(seen);
    }
    const answers = w.answers.filter((answer) => answer.dueAt <= w.t);
    for (const answer of answers) {
      w.answers.splice(w.answers.indexOf(answer), 1);
      answer.run();
    }
  };
  const js = Effect.gen(function* () {
    if (w.t > w.js) {
      const by = w.t - w.js;
      w.js = w.t;
      yield* clock.adjust(by);
    }
    yield* settleJs;
    const due = w.reads.filter((read) => read.dueAt <= w.t && Option.isSome(read.seen));
    if (tellDue(due)) yield* settleJs;
    answerDue(due);
    yield* settleJs;
  });

  const quietFor = (since: number) => w.t - Math.max(since, w.lastAct, w.landedAt);
  const seenFor = (since: number) => {
    const from = Math.max(since, w.lastAct, w.landedAt);
    const capped = Math.max(from, w.holdEnd) + cadence;
    const first = Option.match(
      Arr.findFirst(w.answered, (it) => it.asked >= from && it.sampleAt > from),
      { onNone: () => capped, onSome: (it) => Math.min(it.answered, capped) },
    );
    return w.t - first;
  };

  const judgeFailed = (now: Player) => {
    if (now._tag !== 'Failed' || w.was === 'Failed') return;
    const byDevice = w.phase === 'failed' || w.failedAt >= w.lastAct;
    const sampled = Option.match(Arr.last(w.answered), {
      onNone: () => w.t,
      onSome: (read) => read.sampleAt,
    });
    const landed = Math.max(
      w.landedKnown,
      Option.getOrElse(
        Option.liftPredicate(w.landedAt, (at) => at <= sampled),
        () => Number.NEGATIVE_INFINITY,
      ),
    );
    const offQuietFor = Option.getOrElse(
      Option.filter(
        Option.map(
          Arr.findLast(w.offToldLog, (it) => it.at <= sampled),
          (it) => sampled - Math.max(it.since, w.knownAct, landed),
        ),
        (held) => !Number.isNaN(held),
      ),
      () => 0,
    );
    const toldOnline = w.onlineToldAt > sampled;
    if (!byDevice && (offQuietFor < 15_000 - span || toldOnline))
      breach('O2 Failed with no cause', `offQuietFor=${offQuietFor}`);
  };
  const judgeSound = (now: Player) => {
    const heard =
      w.lastSound >= w.loadAt &&
      (w.t - w.silentFrom <= allowance ||
        (w.heldUntil >= w.lastSound && w.t - w.heldUntil <= cadence));
    if (isReading(now) && !reading.has(w.was)) w.readingFrom = w.t;
    const gap = w.t - Math.max(w.lastSampleAt, w.holdEnd, w.readingFrom);
    if (settled() && isReading(now) && gap > w.readGap) {
      w.readGap = gap;
      if (gap > cadence) note(`read gap ${gap} page=${now._tag}`);
    }
    if (settled() && now._tag === 'Playing' && !heard)
      breach('O1 Playing with no sound', `lastSound=${w.lastSound} loadAt=${w.loadAt}`);
    judgeFailed(now);
    const unacted = w.t - Math.max(w.lastAct, w.landedAt, w.holdEnd) >= proving + span;
    const sounding = w.t - w.soundSince >= proving && Option.isNone(w.fromPending);
    if (sounding && unacted) w.soundProved = w.t;
    if (settled() && w.wants && sounding && unacted && now._tag !== 'Playing')
      breach('O3 sounding, not Playing', `page=${now._tag}`);
  };
  const judgeWait = (now: Player) => {
    const unheld = w.t - w.holdEnd >= owed;
    if (unheld && quietFor(w.offQuiet) >= owed && seenFor(w.offQuiet) >= owed) {
      if (!(Player.$is('Failed')(now) && now.offline)) breach('O4 Failed owed', `page=${now._tag}`);
      else if (w.stops !== 1) breach('O4 stop called once', `stops=${w.stops}`);
    }
    const sounded = w.soundProved >= w.loadAt;
    if (unheld && sounded && seenFor(w.onQuiet) >= owed && !isRetry(now))
      breach('O5 Retry owed', `page=${now._tag}`);
    const known = settled() && !w.tells.some((tell) => tell.pressedAt < Number.POSITIVE_INFINITY);
    if (isRetry(now) && known && seenFor(w.quiet) >= 0 && quietFor(w.quiet) < 15_000 - span)
      breach('O5 Retry early', `quietFor=${quietFor(w.quiet)}`);
  };
  const judgePlace = (now: Player) => {
    if (isLetGo(now) && w.was !== now._tag)
      Option.map(now.at, (at) => {
        const expected = Option.getOrElse(w.readerPlace, () => 0);
        const kept = Math.min(at * 1000, w.length);
        const untold = untoldBefore();
        if (!near(kept, expected) && !untold.some((place) => Math.abs(kept - place) <= 1000))
          breach('O6 the page keeps another place', `at=${at} reader=${expected}`);
      });
    const latest = w.fromSince >= w.lastAct - 1;
    const dueAt = Math.max(w.fromSince, w.readyAt + span, w.holdEnd) + 1000 + span;
    if (Option.isSome(w.fromPending) && holding(w.phase) && settled() && latest && w.t >= dueAt)
      breach('O6 the play from a place never landed', `from=${Option.getOrThrow(w.fromPending)}`);
  };
  const judgeSeek = () =>
    Option.map(w.target, (it) => {
      const dueAt = Math.max(it.at, w.readyAt + span, w.holdEnd) + 1000 + span;
      const latest = it.at >= w.lastAct && holding(w.phase) && settled();
      if (it.landed || it.reported || !latest || w.t < dueAt) return;
      breach('O7 the seek never landed', `to=${it.to}`);
      it.reported = true;
    });
  const judgeEnd = (now: Player) => {
    const endedNow =
      w.phase === 'ended' ||
      w.endedSaid ||
      w.endedAt >= w.lastAct ||
      (w.endedLast >= w.lastAct && w.t - w.endedLast <= allowance);
    const sinceKnown = w.t - Math.max(w.lastAct, w.toldAt);
    if (now._tag === 'Ended' && settled() && sinceKnown > span && !endedNow)
      breach('O8 Ended, not ended', '');
    const endedOwed =
      w.endedSeen || w.t - Math.max(w.endedAt, w.lastAct, w.toldAt, w.holdEnd) >= cadence;
    if (settled() && endedOwed && w.phase === 'ended' && now._tag !== 'Ended')
      breach('O8 Ended owed', `page=${now._tag}`);
    if (isHalted(now) && Math.max(w.pauseAt, w.pauseTold) < w.playTold)
      breach('O9 Paused on its own', `page=${now._tag}`);
  };
  const judgeStand = (now: Player) => {
    if (now._tag === 'Playing' && w.was !== 'Playing')
      w.playingFrom = Option.match(Arr.last(w.answered), {
        onNone: () => w.lastSampleAt,
        onSome: (read) => read.sampleAt,
      });
    const unacted =
      Math.max(w.lastAct, w.toldAt, w.landedAt, w.carriedAt, w.loadAt) < w.playingFrom ||
      w.t - Math.max(w.lastAct, w.toldAt, w.landedAt, w.carriedAt, w.loadAt) > cadence;
    const turnSample = Option.match(Arr.last(w.answered), {
      onNone: () => w.lastSampleAt,
      onSome: (read) => read.sampleAt,
    });
    const ranQuiet =
      w.t - w.lastSound >= standFloor ||
      (w.quietRun.from <= turnSample &&
        w.quietRun.to >= turnSample &&
        w.quietRun.to - w.quietRun.from >= standFloor);
    if (isWaiting(now) && w.was === 'Playing' && unacted && !ranQuiet)
      breach('O10 Buffering early', `silentFor=${w.t - w.lastSound} page=${now._tag}`);
  };
  const judge = () => {
    const now = page();
    judgeSound(now);
    judgeWait(now);
    judgePlace(now);
    judgeSeek();
    judgeEnd(now);
    judgeStand(now);
    const retry = isRetry(now);
    if (now._tag !== w.was || retry !== w.wasRetry) {
      w.history.push({ t: w.t, tag: now._tag, retry });
      note(`page ${told(now)}`);
    }
    w.was = now._tag;
    w.wasRetry = retry;
  };

  const tick = Effect.gen(function* () {
    engine();
    if (w.phase === 'ended') w.endedLast = w.t;
    w.t += step;
    w.silentFrom = Math.max(w.silentFrom, w.lastSound);
    if (
      w.t - Math.max(w.soundSince, w.lastAct, w.holdEnd, w.unseenSince) >=
      2 * cadence + answerMost
    )
      w.unseenFrom = Option.none();
    if (!running() && w.t - w.silentFrom <= allowance) {
      if (w.answeredSample > w.lastSound) w.heldUntil = Math.max(w.heldUntil, w.holdUntil);
      else w.silentFrom = Math.max(w.silentFrom, w.holdUntil);
    }
    for (const read of w.reads)
      if (Option.isNone(read.seen) && w.t >= read.sampleAt) {
        read.seen = Option.some(said());
        w.lastSampleAt = w.t;
        if (said().state !== 'ended') continue;
        read.endSeen = w.endedAt;
        Option.map(w.target, (it) => {
          if (it.at < w.t && w.endedAt >= it.at) it.landed = true;
        });
      }
    runs();
    if (running()) yield* js;
    judge();
  });

  return Object.assign(w, {
    page: () => page()._tag,
    state: page,
    send,
    press,
    connect,
    hold,
    stall,
    close,
    fail,
    interrupt,
    running,
    settled,
    tick,
    run: (ms: number) =>
      Effect.gen(function* () {
        for (let i = 0; i < ms / step; i++) yield* tick;
      }),
    until: (holds: () => boolean, ms = 60_000) =>
      Effect.gen(function* () {
        for (let i = 0; i < ms / step && !holds(); i++) yield* tick;
        return holds();
      }),
    shownSince: (from: number) => w.history.filter((it) => it.t >= from).map((it) => it.tag),
    audio,
    playback: seam,
    story,
    note,
    dispose: () => registry.dispose(),
  });
};

export type World = ReturnType<typeof makeWorld>;

export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const either = <A>(r: () => number, p: number, yes: () => A, no: () => A) => {
  if (r() < p) return yes();
  return no();
};

export const drawnKnobs = (r: () => number): Knobs => ({
  lag: () => 10 + Math.floor(r() * 591),
  sample: r,
  loadFor: () =>
    either(
      r,
      0.3,
      () => r() * 1000,
      () =>
        either(
          r,
          0.7,
          () => 1000 + r() * 4000,
          () => 5000 + r() * 55_000,
        ),
    ),
  silentFor: () =>
    either(
      r,
      0.7,
      () => 300 + r() * 2700,
      () => 0,
    ),
  landAfter: () =>
    either(
      r,
      0.5,
      () => 0,
      () => r() * 1000,
    ),
  remoteLand: () => r() * 500,
  tellAfter: () =>
    either(
      r,
      0.5,
      () => 0,
      () => r() * 600,
    ),
  seekDry: () => r() < 0.5,
});

const seekFrom = (r: () => number, place: number) => {
  const kind = r();
  const sign = Math.sign(r() - 0.5) || 1;
  if (kind < 0.2) return place + sign * (1 + Math.floor(r() * 300));
  if (kind < 0.45) return place + sign * (300 + Math.floor(r() * 4700));
  if (kind < 0.7) return Math.floor(r() * length);
  if (kind < 0.9) return length - Math.floor(r() * 5000);
  return length + Math.floor(r() * 2000);
};

export const morning = { number: 100, title: 'Great Is Thy Faithfulness' };

const pressDrawn = (w: World, r: () => number) => {
  const kind = r();
  if (kind < 0.45) w.press('seek', seekFrom(r, w.place));
  else if (kind < 0.55) w.press('follow');
  else if (kind < 0.75) w.press('play');
  else w.press('pause');
};

const commandDrawn = (w: World, r: () => number) => {
  const shown = w.state();
  const tag = shown._tag;
  const seekTo = () => w.send(Command.Seek({ seconds: seekFrom(r, w.place) / 1000 }));
  if (tag === 'Idle' || (tag === 'Stopped' && r() < 0.2)) w.send(Command.Start({ track: morning }));
  else if (tag === 'Stopped' || tag === 'Failed' || tag === 'Ended') w.send(Command.Resume());
  else if (isRetry(shown) && r() < 0.7) w.send(Command.Resume());
  else if (tag === 'Paused' && r() < 0.6) w.send(Command.Resume());
  else if (tag === 'Paused' || r() >= 0.3) seekTo();
  else w.send(Command.Pause());
};

const readerDrawn = (w: World, r: () => number, waiting: boolean) => {
  if (isRetry(w.state()) && w.running() && r() < 0.05) w.send(Command.Resume());
  if (w.page() === 'Ended' && w.running() && r() < 0.01) w.send(Command.Resume());
  if (waiting && !w.online && r() < 0.002) w.press('follow');
};

export const roam = (w: World, r: () => number) => {
  const waiting = w.state()._tag === 'Buffering' && !isRetry(w.state());
  if (r() < Math.max(0.001, 0.004 * Number(!waiting))) w.connect(!w.online);
  if (w.running() && r() < 0.002)
    w.hold(
      either(
        r,
        0.4,
        () => 50 + r() * 950,
        () => 1000 + r() * 24_000,
      ),
    );
  const inside = w.phase === 'silent' || w.phase === 'held' || w.phase === 'reasked';
  let chance = 0.002;
  let commandChance = 0.006;
  if (w.phase === 'dry') chance = 0.005;
  if (w.phase === 'closed') commandChance = 0.0015;
  if (inside) {
    chance = 0.04;
    commandChance = 0.03;
  }
  const shown = w.state();
  if (shown._tag === 'Buffering' && !isRetry(shown)) {
    chance /= 10;
    commandChance /= 10;
  }
  readerDrawn(w, r, waiting);
  if (w.phase !== 'idle' && r() < chance) pressDrawn(w, r);
  if (w.running() && r() < commandChance) commandDrawn(w, r);
  deviceDrawn(w, r);
};

const deviceDrawn = (w: World, r: () => number) => {
  if (w.online && w.phase === 'sound' && r() < 0.005)
    w.stall(
      either(
        r,
        0.5,
        () => 100 + r() * 1900,
        () => 2000 + r() * 58_000,
      ),
    );
  const closable = w.phase === 'sound' || w.phase === 'loading';
  if (w.platform === 'ios' && closable && r() < 0.003) w.close();
  if (r() < 0.0002) w.fail();
  if (r() < 0.0005) w.interrupt();
};

const only = (holds: boolean, items: ReadonlyArray<string>) => items.filter(() => holds);

export const reachable = (platform: Platform) => [
  'D1 load',
  ...only(platform === 'ios', ['D2 silent start', 'D8 inside D2']),
  'D3 dry',
  'D8 inside D3',
  ...only(platform === 'android', ['D4 lead-in']),
  ...only(platform === 'ios', [
    'D5 close',
    'act inside D5 held',
    'act inside D5 closed',
    'act inside D5 reasked',
  ]),
  'D6 failed',
  'D7 read',
  'D7 hold',
  'D7 hold under 1 s',
  'D8 play',
  'D8 pause',
  'D8 seek',
  'D8 follow',
  'D8 seek tiny',
  'D8 seek back',
  'D8 seek last 5 s',
  'D9 Start',
  'D9 Pause',
  'D9 Resume',
  'D9 Seek',
  'D10 seek',
  'D11 change',
  'D11 inside a hold',
  'D12 interrupted',
  'D13 ended',
  'resume from Failed',
  'resume from Stopped',
  'resume from retry',
  'resume from Ended',
];
