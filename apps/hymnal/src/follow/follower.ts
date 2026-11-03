import { Option } from 'effect';

import { type Clock, clockAt, observe, placeOf, SLACK } from './clock';
import { marksOf, WHOLE } from './marks';
import { placeAt, type Timeline } from './timeline';

export const LEAD = 600;

export type Report =
  | { readonly _tag: 'Away' }
  | {
      readonly _tag: 'Here';
      readonly at: number;
      readonly state: 'playing' | 'waiting' | 'paused';
      readonly rate?: number;
    };

export interface Host {
  readonly now: () => number;
  readonly wake: (ms: number, run: () => void) => () => void;
  readonly scrollTo: (line: number, animated: boolean) => void;
  readonly log: (event: string) => void;
}

export interface Held {
  readonly get: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

const heldOf = () => {
  let held = false;
  const listeners = new Set<() => void>();
  return {
    get: () => held,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (to: boolean) => {
      if (to === held) return;
      held = to;
      listeners.forEach((listener) => listener());
    },
  };
};

export const followerOf = (timeline: Timeline, host: Host) => {
  const marks = marksOf();
  const held = heldOf();
  let last: Report = { _tag: 'Away' };
  let clock: Option.Option<Clock> = Option.none();
  let shown = -1;
  let snap = false;
  let cancel = () => {};

  const tick = () => {
    cancel();
    cancel = () => {};
    if (Option.isNone(clock)) return;
    const { playing } = clock.value;
    const now = host.now();
    const at = placeOf(clock.value, now);
    const place = placeAt(timeline, at);
    if (place.line !== marks.line() && place.line >= 0)
      host.log(`line i=${place.line} of=${timeline.lines.length} at=${Math.round(at)}`);
    const line = timeline.lines[place.line];
    if (line && line.syllables.length === 0) marks.set(place.line, WHOLE);
    else marks.set(place.line, place.syllable);
    const ahead = placeAt(timeline, at + LEAD);
    let target = ahead.line;
    if (snap) target = place.line;
    if ((playing || snap) && !held.get() && target >= 0 && target !== shown) {
      shown = target;
      host.scrollTo(target, true);
    }
    snap = false;
    if (!playing) return;
    const next = Math.min(place.nextAt, ahead.nextAt - LEAD);
    if (Number.isFinite(next)) cancel = host.wake(Math.max(0, next - at) / clock.value.rate, tick);
  };

  const report = (told: Report) => {
    const now = host.now();
    last = told;
    if (told._tag === 'Away') {
      held.set(false);
      if (Option.isNone(clock)) return;
      clock = Option.none();
      shown = -1;
      marks.set(-1, -1);
      host.log('end');
      tick();
      return;
    }
    if (told.state === 'paused') held.set(false);
    const playing = told.state === 'playing';
    const rate = told.rate ?? 1;
    clock = Option.some(
      Option.match(clock, {
        onNone: () => clockAt(told.at, playing, now, rate),
        onSome: (was) => {
          if (Math.abs(told.at - placeOf(was, now)) > SLACK) snap = true;
          return observe(was, { at: told.at, playing, seek: false, rate }, now);
        },
      }),
    );
    if (snap) release();
    tick();
  };

  const release = () => {
    if (!held.get()) return;
    held.set(false);
    shown = -1;
    host.log('resume reason=seek');
  };

  return {
    marks,
    report,
    held: { get: held.get, subscribe: held.subscribe } satisfies Held,
    drag: () => {
      if (last._tag === 'Away' || last.state === 'paused' || held.get()) return;
      held.set(true);
      host.log('pause reason=drag');
    },
    seek: () => {
      snap = true;
      release();
    },
    resume: () => {
      if (!held.get()) return;
      held.set(false);
      host.log('resume reason=pill');
      if (Option.isNone(clock)) return;
      const line = placeAt(timeline, placeOf(clock.value, host.now())).line;
      if (line < 0) return;
      shown = line;
      host.scrollTo(line, true);
    },
    show: () => {
      if (Option.isNone(clock) || held.get()) return;
      const line = placeAt(timeline, placeOf(clock.value, host.now())).line;
      if (line < 0) return;
      shown = line;
      host.scrollTo(line, true);
    },
    relayout: () => {
      if (Option.isSome(clock) && clock.value.playing && !held.get() && shown >= 0)
        host.scrollTo(shown, false);
    },
    stop: () => {
      cancel();
      cancel = () => {};
    },
  };
};
export type Follower = ReturnType<typeof followerOf>;
