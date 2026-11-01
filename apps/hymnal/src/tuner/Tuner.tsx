/**
 * The tuner sheet: the nearest string's name, the note heard, a needle at
 * how far the string is off it, and the six strings around it, each lit
 * `tuned` once it holds in tune. It listens through the ear (`native.ios.ts`)
 * or, in a development build, a fed tone (`?feed=E2:-12`), and reads each
 * frame on the JavaScript thread through `detect` and `reading`.
 *
 * When it listens, asks, pauses and stops is the session's rule
 * (`session.ts`): this file only hands the world's events to it and carries
 * out the work it names. The tuner plays nothing: no cue, no tone, no haptic.
 *
 * The sheet is a route, `/tuner`, presented with the chord sheet's options
 * (`_layout.tsx`), opened from the chord sheet's head and from Settings
 * where the device has the ear (`available`).
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { Cause } from 'effect';
import { Clock, Data, Duration, Effect, Fiber, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type ColorValue,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { One, useParams, useRouter } from 'one';

import { color, useAccent } from '~/color';
import { usePlayer } from '~/player/context';
import { Command, type HymnPlayer, Player } from '~/player/player';

import { type Listen, type ListenEnd, listen } from './native';
import { detect } from './pitch';
import {
  Event,
  FEED_RATE,
  FRAME,
  type Feed,
  feedFrame,
  feedOf,
  LEFT,
  labelOf,
  type Latch,
  latch,
  NEEDLE_CENTS,
  needleOf,
  opened,
  type Permission,
  type Phase,
  RIGHT,
  type Session,
  STRING_NAMES,
  step,
  stringLabel,
  unlatched,
  Work,
} from './session';
import { type Reading, reading, type StringId } from './tuning';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

const log = (line: string) => Effect.runSync(Effect.logInfo(`[tuner] ${line}`));

/** Runs `effect` on its own fiber, answering nothing. */
const fork = (effect: Effect.Effect<unknown>) => {
  Effect.runFork(effect);
};

/** A device with no ear: off iOS, where a link still reaches the tuner. */
class NoEar extends Data.TaggedError('NoEar')<{}> {}

/** What the sheet listens to: the ear, or a fed tone. */
interface Source {
  readonly name: 'mic' | 'feed';
  /** Starts, and answers the sample rate. */
  readonly start: Effect.Effect<number, Cause.UnknownError | NoEar>;
  readonly stop: Effect.Effect<void>;
  readonly onFrame: (listener: (frame: Float32Array) => void) => () => void;
  readonly onEnd: (listener: (reason: ListenEnd) => void) => () => void;
}

/** The phone around the sheet: the permission, Settings and whether the app is active. */
interface Device {
  readonly readPermission: Effect.Effect<Permission, Cause.UnknownError>;
  readonly askPermission: Effect.Effect<Permission, Cause.UnknownError>;
  readonly openSettings: () => void;
  readonly active: () => boolean;
  readonly onActive: (listener: (active: boolean) => void) => () => void;
}

const liveDevice: Device = {
  readPermission: Effect.tryPromise(() => One.Audio.getRecordingPermissionStatus()),
  askPermission: Effect.tryPromise(() => One.Audio.requestRecordingPermission()),
  openSettings: () => fork(Effect.promise(() => Linking.openSettings())),
  active: () => AppState.currentState === 'active',
  onActive: (listener) => {
    const subscription = AppState.addEventListener('change', (state) =>
      listener(state === 'active'),
    );
    return () => subscription.remove();
  },
};

const noEnd = () => () => {};

/** The ear as a source; with none (off iOS) a start is refused. */
const earSource = (ear: Option.Option<Listen>): Source =>
  Option.match(ear, {
    onNone: () => ({
      name: 'mic',
      start: Effect.fail(new NoEar()),
      stop: Effect.void,
      onFrame: noEnd,
      onEnd: noEnd,
    }),
    onSome: (live) => ({
      name: 'mic',
      start: live.start,
      stop: live.stop,
      onFrame: live.onFrame,
      onEnd: live.onEnd,
    }),
  });

/** A fed tone at `FEED_RATE`, a frame each frame's length: it never starts the ear, and plays nothing. */
const feedSource = (feed: Feed): Source => {
  const listeners = new Set<(frame: Float32Array) => void>();
  let running: Option.Option<Fiber.Fiber<never>> = Option.none();
  let index = 0;
  const emit = Effect.sync(() => {
    const frame = feedFrame(feed, index, new Float32Array(FRAME));
    index += 1;
    for (const listener of listeners) listener(frame);
  });
  const every = Duration.millis((FRAME / FEED_RATE) * 1000);
  return {
    name: 'feed',
    start: Effect.sync(() => {
      if (Option.isNone(running))
        running = Option.some(Effect.runFork(Effect.forever(Effect.delay(emit, every))));
      return FEED_RATE;
    }),
    stop: Effect.suspend(() => {
      const was = running;
      running = Option.none();
      return Option.match(was, { onNone: () => Effect.void, onSome: Fiber.interrupt });
    }),
    onFrame: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onEnd: noEnd,
  };
};

/** Whether the player sounds or is about to: loading, playing or buffering. */
const soundingOf: (state: Player) => boolean = Player.$match({
  Idle: () => false,
  Loading: () => true,
  Playing: () => true,
  Buffering: () => true,
  Paused: () => false,
  Ended: () => false,
  Stopped: () => false,
  Failed: () => false,
});

/** The tuner route's screen: the ear, or in a development build the feed its params name. */
export function TunerScreen() {
  const params = useParams<{ readonly feed?: string }>();
  const source = useMemo(
    () =>
      Option.fromNullishOr(params.feed).pipe(
        Option.filter(() => dev),
        Option.flatMap(feedOf),
        Option.match({ onNone: () => earSource(listen), onSome: feedSource }),
      ),
    [params.feed],
  );
  return Option.match(usePlayer(), {
    onNone: () => (
      <TunerSheet device={liveDevice} source={source} sounding={false} pause={noPause} />
    ),
    onSome: (player) => <WithPlayer player={player} device={liveDevice} source={source} />,
  });
}

const noPause = () => {};

function WithPlayer({
  player,
  device,
  source,
}: {
  readonly player: HymnPlayer;
  readonly device: Device;
  readonly source: Source;
}) {
  const sounding = useAtomValue(useMemo(() => Atom.map(player.state, soundingOf), [player]));
  const send = useAtomSet(player.send);
  const pause = useCallback(() => send(Command.Pause()), [send]);
  return <TunerSheet device={device} source={source} sounding={sounding} pause={pause} />;
}

/** What the sheet shows of the frames: the reading, and the strings lit. */
interface Shown {
  readonly heard: Option.Option<Pick<Reading, 'string' | 'note' | 'octave' | 'inTune'>>;
  readonly tuned: ReadonlySet<StringId>;
}

const nothing: Shown = { heard: Option.none(), tuned: new Set() };

/** Whether two readings show the same: the string, the note and whether it is in tune. */
const sameHeard = (was: Shown['heard'], now: Shown['heard']): boolean =>
  Option.match(was, {
    onNone: () => Option.isNone(now),
    onSome: (before) =>
      Option.exists(
        now,
        (after) =>
          before.string === after.string &&
          before.note === after.note &&
          before.octave === after.octave &&
          before.inTune === after.inTune,
      ),
  });

/** The note heard, small under the string's name: `E2`, `A2 · in tune`, or nothing. */
const noteOf = (heard: Shown['heard']): string =>
  Option.match(heard, {
    onNone: () => '',
    onSome: ({ note, octave, inTune }) => {
      if (inTune) return `${note}${octave} · in tune`;
      return `${note}${octave}`;
    },
  });

/** The words read aloud change at most this often. */
const LABEL_EVERY = 1000;

/** How many frames between two `frame ms` lines. */
const LOG_EVERY = 10;

const isListening = (session: Option.Option<Session>) =>
  Option.exists(session, (now) => now.phase._tag === 'Listening');

/** The sheet over its device, its source and the player's sounding. */
function TunerSheet({
  device,
  source,
  sounding,
  pause,
}: {
  readonly device: Device;
  readonly source: Source;
  readonly sounding: boolean;
  readonly pause: () => void;
}) {
  const accent = useAccent();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase['_tag']>('Checking');
  const [shown, setShown] = useState<Shown>(nothing);
  const [label, setLabel] = useState('Listening');
  const needle = useSharedValue(0);
  const inTune = useSharedValue(0);

  const session = useRef<Option.Option<Session>>(Option.none());
  const rate = useRef(0);
  const latched = useRef<Latch>(unlatched);
  const busy = useRef(false);
  const frames = useRef(0);
  const spoken = useRef<{
    label: string;
    at: number;
    pending: Option.Option<Fiber.Fiber<void>>;
  }>({ label: 'Listening', at: 0, pending: Option.none() });
  // The latest props the session's work reads, so the subscriptions stay put.
  const latest = useRef({ device, source, pause });
  latest.current = { device, source, pause };

  /** Says the reading's words, at most once a `LABEL_EVERY`; the latest words win. */
  const say = useCallback((words: string) => {
    const said = spoken.current;
    if (Option.isSome(said.pending)) fork(Fiber.interrupt(said.pending.value));
    said.pending = Option.none();
    if (words === said.label) return;
    const speak = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* Effect.sleep(Duration.millis(Math.max(0, said.at + LABEL_EVERY - now)));
      said.label = words;
      said.at = yield* Clock.currentTimeMillis;
      setLabel(words);
    });
    said.pending = Option.some(Effect.runFork(speak));
  }, []);

  /** Back to rest: nothing heard, the needle at centre. */
  const rest = useCallback(() => {
    needle.value = withTiming(0, { duration: 120 });
    inTune.value = 0;
    setShown((before) =>
      Option.match(before.heard, {
        onNone: () => before,
        onSome: () => ({ ...before, heard: Option.none() }),
      }),
    );
    say('Listening');
  }, [needle, inTune, say]);

  const dispatch = useRef<(event: Event) => void>(() => {});
  dispatch.current = (event: Event) => {
    if (Option.isNone(session.current)) return;
    const before = session.current.value;
    const next = step(before, event);
    session.current = Option.some(next.session);
    if (next.session.phase._tag !== before.phase._tag) {
      setPhase(next.session.phase._tag);
      if (next.session.phase._tag !== 'Listening') rest();
    }
    for (const work of next.work) carry(work);
  };
  const tell = (event: Event) => dispatch.current(event);

  /** A permission read or answer, logged; a failed one is as denied. */
  const permission = (ask: Effect.Effect<Permission, Cause.UnknownError>) =>
    ask.pipe(
      Effect.orElseSucceed((): Permission => 'denied'),
      Effect.tap((state) => Effect.sync(() => log(`permission state=${state}`))),
    );

  const carry = (work: Work) => {
    const { device: phone, source: from, pause: pausePlayer } = latest.current;
    Work.$match(work, {
      ReadPermission: ({ check }) =>
        fork(
          permission(phone.readPermission).pipe(
            Effect.map((state) => tell(Event.Read({ permission: state, check }))),
          ),
        ),
      AskPermission: () =>
        fork(
          permission(phone.askPermission).pipe(
            Effect.map((state) => tell(Event.Answered({ permission: state }))),
          ),
        ),
      PausePlayer: () => {
        pausePlayer();
        log('paused player');
      },
      Start: ({ attempt }) =>
        fork(
          from.start.pipe(
            Effect.match({
              onFailure: () => tell(Event.Refused({ attempt })),
              onSuccess: (hz) => {
                rate.current = hz;
                log(`listen source=${from.name} rate=${hz}`);
                tell(Event.Started({ attempt }));
              },
            }),
          ),
        ),
      Stop: ({ reason }) => {
        fork(from.stop);
        log(`stop reason=${reason}`);
      },
    });
  };

  /** One frame through `detect` and `reading`: the needle, the latch, the words. */
  const read = useCallback(
    (frame: Float32Array) => {
      const heard = Option.map(detect(frame, rate.current), reading);
      needle.value = withTiming(needleOf(heard), { duration: 90 });
      inTune.value = Number(Option.exists(heard, (each) => each.inTune));
      latched.current = latch(latched.current, heard);
      const lit = latched.current.tuned;
      // A render only when what the sheet shows changes; the needle moves on the UI thread.
      setShown((was) => {
        if (lit === was.tuned && sameHeard(was.heard, heard)) return was;
        return { heard, tuned: lit };
      });
      say(labelOf(heard));
    },
    [needle, inTune, say],
  );

  /** A frame in: read on a later turn, so a frame that comes while the last is in work is dropped, never queued. */
  const take = useCallback(
    (frame: Float32Array) => {
      if (busy.current || !isListening(session.current)) return;
      busy.current = true;
      const work = Effect.gen(function* () {
        const arrived = yield* Clock.currentTimeNanos;
        yield* Effect.yieldNow;
        if (!isListening(session.current)) return;
        read(frame);
        const done = yield* Clock.currentTimeNanos;
        frames.current += 1;
        if (frames.current % LOG_EVERY === 0)
          log(`frame ms=${(Number(done - arrived) / 1e6).toFixed(1)}`);
      });
      fork(work.pipe(Effect.ensuring(Effect.sync(() => (busy.current = false)))));
    },
    [read],
  );

  useEffect(() => {
    const { device: phone, source: from } = latest.current;
    const first = opened(phone.active(), sounding);
    session.current = Option.some(first.session);
    setPhase(first.session.phase._tag);
    for (const work of first.work) carry(work);
    const offFrame = from.onFrame(take);
    const offEnd = from.onEnd((reason) => tell(Event.Ended({ reason })));
    const offActive = phone.onActive((active) => tell(Event.Active({ active })));
    return () => {
      offFrame();
      offEnd();
      offActive();
      tell(Event.Closed());
      const said = spoken.current;
      if (Option.isSome(said.pending)) fork(Fiber.interrupt(said.pending.value));
      latched.current = unlatched;
    };
    // The sheet's life: one opening, one close; the source and the device are read through `latest`.
  }, []);

  useEffect(() => {
    tell(Event.Sounding({ sounding }));
  }, [sounding]);

  const swing = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(needle.value / NEEDLE_CENTS) * 45}deg` }],
  }));
  // In tune the needle is wide and in the accent; out of tune, thin and in ink: a shape as well as a colour.
  const plain = useAnimatedStyle(() => ({ opacity: 1 - inTune.value }));
  const held = useAnimatedStyle(() => ({ opacity: inTune.value }));

  const heardName = Option.match(shown.heard, {
    onNone: () => 'Listening',
    onSome: ({ string }) => STRING_NAMES[string],
  });

  return (
    <View testID="tuner-sheet" style={styles.sheet}>
      <View style={styles.head}>
        <Pressable role="button" aria-label="Done" onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.done, { color: accent }]}>Done</Text>
        </Pressable>
      </View>
      {phase === 'Denied' && (
        <View style={styles.message}>
          <Text style={styles.title}>Microphone is off for Hymnal</Text>
          <Pressable
            role="button"
            aria-label="Open Settings"
            onPress={() => latest.current.device.openSettings()}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={[styles.actionText, { color: accent }]}>Open Settings</Text>
          </Pressable>
        </View>
      )}
      {phase !== 'Denied' && (
        <View style={styles.tuner}>
          <Strings ids={LEFT} tuned={shown.tuned} accent={accent} />
          <View style={styles.middle}>
            <View testID="tuner-reading" accessible aria-label={label} style={styles.reading}>
              <Text style={styles.name} aria-hidden>
                {heardName}
              </Text>
              <Text style={styles.note} aria-hidden>
                {noteOf(shown.heard)}
              </Text>
            </View>
            <View style={styles.gauge} aria-hidden>
              <View style={[styles.mark, styles.flatMark]} />
              <View style={[styles.mark, styles.centreMark]} />
              <View style={[styles.mark, styles.sharpMark]} />
              <Animated.View style={[styles.needle, styles.thin, swing, plain]} />
              <Animated.View
                style={[styles.needle, styles.wide, { backgroundColor: accent }, swing, held]}
              />
            </View>
            {phase === 'Ended' && (
              <Pressable
                role="button"
                aria-label="Tap to listen again"
                onPress={() => tell(Event.Tapped())}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={[styles.actionText, { color: accent }]}>Tap to listen again</Text>
              </Pressable>
            )}
          </View>
          <Strings ids={RIGHT} tuned={shown.tuned} accent={accent} />
        </View>
      )}
    </View>
  );
}

/** A column of strings, each a ring with its letter; a tuned one is filled and ticked. */
function Strings({
  ids,
  tuned,
  accent,
}: {
  readonly ids: ReadonlyArray<StringId>;
  readonly tuned: ReadonlySet<StringId>;
  readonly accent: ColorValue;
}) {
  return (
    <View style={styles.strings}>
      {ids.map((id) => {
        const lit = tuned.has(id);
        return (
          <View
            key={id}
            testID={`tuner-string-${id}`}
            accessible
            aria-label={stringLabel(id, lit)}
            style={[styles.string, lit && { backgroundColor: accent, borderColor: accent }]}
          >
            <Text style={[styles.letter, lit && styles.litLetter]} aria-hidden>
              {lit && '✓'}
              {!lit && id.slice(0, 1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: color.ground,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  done: { fontSize: 17, fontWeight: '600' },
  message: { alignItems: 'center', gap: 16, paddingTop: 24 },
  title: { fontSize: 20, fontWeight: '600', color: color.ink, textAlign: 'center' },
  tuner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  middle: { flex: 1, alignItems: 'center', gap: 20 },
  reading: { alignItems: 'center', gap: 4 },
  name: { fontSize: 44, fontWeight: '700', color: color.ink },
  note: { fontSize: 15, color: color.muted, minHeight: 20 },
  gauge: { width: 160, height: 90, alignItems: 'center', justifyContent: 'flex-end' },
  mark: { position: 'absolute', bottom: 0, width: 2, height: 80, backgroundColor: color.line },
  centreMark: { height: 86 },
  // The in-tune window, ±5 cents of ±50 over ±45 degrees.
  flatMark: { transform: [{ translateY: 40 }, { rotate: '-4.5deg' }, { translateY: -40 }] },
  sharpMark: { transform: [{ translateY: 40 }, { rotate: '4.5deg' }, { translateY: -40 }] },
  needle: {
    position: 'absolute',
    bottom: 0,
    height: 84,
    borderRadius: 3,
    transformOrigin: 'bottom',
  },
  thin: { width: 2, backgroundColor: color.ink },
  wide: { width: 6 },
  strings: { gap: 14 },
  string: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { fontSize: 17, fontWeight: '600', color: color.ink },
  litLetter: { color: color.ground },
  action: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  actionText: { fontSize: 17, fontWeight: '600' },
  pressed: { backgroundColor: color.soft },
});
