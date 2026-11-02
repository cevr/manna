/**
 * The tuner, full screen: a gauge from flat to sharp with its needle and a
 * hint under it, the string's name and the note heard, and a headstock with
 * three pegs a side and the six strings' names in circles beside them. A tap
 * on a circle picks that string, and the reading then measures from it
 * however far off the pitch is (`readingOn`); a second tap on the picked
 * string lets it go, back to Auto, which reads against the nearest string
 * (`reading`). The Auto switch turns either way. Each open starts in Auto. A
 * string that held in tune keeps its tick.
 *
 * It listens through the ear (`native.ios.ts`) or, in a development build, a
 * fed tone (`?feed=E2:-12`), and reads each frame on the JavaScript thread
 * through `detect`. When it listens, asks, pauses and stops is the session's
 * rule (`session.ts`): this file only hands the world's events to it (the
 * app's state, the navigation's focus, the player's sounding) and carries
 * out the work it names. The reading's words go to VoiceOver when they
 * change, at most once a `LABEL_EVERY`. The tuner plays nothing: no cue, no
 * tone, no haptic.
 *
 * The screen is a route, `/tuner`, a full-screen modal (`_layout.tsx`),
 * opened from the hymn page's bar, the chord sheet's head and Settings where
 * the device has the ear (`available`).
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { Cause } from 'effect';
import { Clock, Data, Duration, Effect, Fiber, Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  type ColorValue,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { One, useFocusEffect, useParams, useRouter, useSafeAreaInsets } from 'one';

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
  hintOf,
  LEFT,
  type Latch,
  latch,
  NEEDLE_CENTS,
  nameOf,
  needleOf,
  opened,
  type Permission,
  type Phase,
  RIGHT,
  type Session,
  step,
  stringLabel,
  unlatched,
  voiced,
  Work,
  wordsOf,
} from './session';
import { type Reading, reading, readingOn, type StringId } from './tuning';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

/** One log line, written whole (`[tuner] …`) so each reads as the drives grep it. */
const log = (line: string) => Effect.runSync(Effect.logInfo(line));

/** Runs `effect` on its own fiber, answering nothing. */
const fork = (effect: Effect.Effect<unknown>) => {
  Effect.runFork(effect);
};

/** A device with no ear: off iOS, where a link still reaches the tuner. */
class NoEar extends Data.TaggedError('NoEar')<{}> {}

/** What the screen listens to: the ear, or a fed tone. */
interface Source {
  readonly name: 'mic' | 'feed';
  /** Starts, and answers the sample rate. */
  readonly start: Effect.Effect<number, Cause.UnknownError | NoEar>;
  readonly stop: Effect.Effect<void>;
  readonly onFrame: (listener: (frame: Float32Array) => void) => () => void;
  readonly onEnd: (listener: (reason: ListenEnd) => void) => () => void;
}

/** The phone around the screen: the permission, Settings and whether the app is active. */
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
    onNone: () => <Tuner device={liveDevice} source={source} sounding={false} pause={noPause} />,
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
  return <Tuner device={device} source={source} sounding={sounding} pause={pause} />;
}

/** What the screen shows of the frames: the reading, and the strings lit. */
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

/** The string a frame is read against when nothing was heard and Auto is turned off. */
const LOWEST: StringId = 'E2';

const isListening = (session: Option.Option<Session>) =>
  Option.exists(session, (now) => now.phase._tag === 'Listening');

/** The screen over its device, its source and the player's sounding. */
function Tuner({
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
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase['_tag']>('Checking');
  const [shown, setShown] = useState<Shown>(nothing);
  const [label, setLabel] = useState('Listening');
  const [hint, setHint] = useState(hintOf(Option.none(), Option.none()));
  // None is Auto: each frame is read against the nearest string.
  const [target, setTarget] = useState<Option.Option<StringId>>(Option.none());
  const needle = useSharedValue(0);
  const inTune = useSharedValue(0);

  const session = useRef<Option.Option<Session>>(Option.none());
  const rate = useRef(0);
  const latched = useRef<Latch>(unlatched);
  const busy = useRef(false);
  const frames = useRef(0);
  const aim = useRef<Option.Option<StringId>>(Option.none());
  const last = useRef<Option.Option<StringId>>(Option.none());
  const spoken = useRef<{
    label: string;
    at: number;
    pending: Option.Option<Fiber.Fiber<void>>;
  }>({ label: 'Listening', at: 0, pending: Option.none() });
  // The latest props the session's work reads, so the subscriptions stay put.
  const latest = useRef({ device, source, pause });
  latest.current = { device, source, pause };

  /**
   * Says the reading's words, at most once a `LABEL_EVERY`; the latest words
   * win. Words that differ from the last said go to VoiceOver too (a no-op
   * with it off); the log names the announcement, never its words.
   */
  const hush = useCallback(() => {
    const said = spoken.current;
    if (Option.isSome(said.pending)) fork(Fiber.interrupt(said.pending.value));
    said.pending = Option.none();
  }, []);

  const say = useCallback(
    (words: string) => {
      hush();
      const said = spoken.current;
      if (words === said.label) return;
      const speak = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* Effect.sleep(Duration.millis(Math.max(0, said.at + LABEL_EVERY - now)));
        said.label = words;
        said.at = yield* Clock.currentTimeMillis;
        setLabel(words);
        // A screen covered, away or closed shows its words but says none of them.
        if (!Option.exists(session.current, voiced)) return;
        AccessibilityInfo.announceForAccessibility(words);
        log('[tuner] announced');
      });
      said.pending = Option.some(Effect.runFork(speak));
    },
    [hush],
  );

  /** Says the words `phase` gives the reading; a phase that shows no reading says nothing. */
  const voice = useCallback(
    (phase: Phase['_tag'], heard: Option.Option<Reading>) =>
      Option.match(wordsOf(phase, heard), { onNone: hush, onSome: say }),
    [hush, say],
  );

  /** Back to rest in `phase`: nothing heard, the needle at centre. */
  const rest = useCallback(
    (phase: Phase['_tag']) => {
      needle.value = withTiming(0, { duration: 120 });
      inTune.value = 0;
      setShown((before) =>
        Option.match(before.heard, {
          onNone: () => before,
          onSome: () => ({ ...before, heard: Option.none() }),
        }),
      );
      setHint(hintOf(aim.current, Option.none()));
      voice(phase, Option.none());
    },
    [needle, inTune, voice],
  );

  /** The string the frames are read against: one picked, or none for Auto. Logged when it changes. */
  const aimAt = useCallback((next: Option.Option<StringId>) => {
    if (Option.getOrUndefined(aim.current) === Option.getOrUndefined(next)) return;
    aim.current = next;
    setTarget(next);
    setHint(hintOf(next, Option.none()));
    log(`[tuner] target id=${Option.getOrElse(next, () => 'auto')}`);
  }, []);

  /**
   * A tap on a string's circle: the picked string goes back to Auto, any
   * other is picked. It reads `aim`, not the last render's `target`, so two
   * taps before a render still end in Auto.
   */
  const pick = useCallback(
    (id: StringId) => {
      if (Option.contains(aim.current, id)) return aimAt(Option.none());
      aimAt(Option.some(id));
    },
    [aimAt],
  );

  /** Auto on clears the target; off picks the string last heard, or the lowest. */
  const toggleAuto = useCallback(() => {
    if (Option.isSome(aim.current)) return aimAt(Option.none());
    aimAt(Option.some(Option.getOrElse(last.current, () => LOWEST)));
  }, [aimAt]);

  const dispatch = useRef<(event: Event) => void>(() => {});
  dispatch.current = (event: Event) => {
    if (Option.isNone(session.current)) return;
    const before = session.current.value;
    const next = step(before, event);
    session.current = Option.some(next.session);
    if (next.session.phase._tag !== before.phase._tag) {
      setPhase(next.session.phase._tag);
      if (next.session.phase._tag !== 'Listening') rest(next.session.phase._tag);
    }
    for (const work of next.work) carry(work);
  };
  const tell = (event: Event) => dispatch.current(event);

  /** A permission read or answer, logged; a failed one is as denied. */
  const permission = (ask: Effect.Effect<Permission, Cause.UnknownError>) =>
    ask.pipe(
      Effect.orElseSucceed((): Permission => 'denied'),
      Effect.tap((state) => Effect.sync(() => log(`[tuner] permission state=${state}`))),
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
        log('[tuner] paused player');
      },
      Start: ({ attempt }) =>
        fork(
          from.start.pipe(
            Effect.match({
              onFailure: () => tell(Event.Refused({ attempt })),
              onSuccess: (hz) => {
                rate.current = hz;
                log(`[tuner] listen source=${from.name} rate=${hz}`);
                tell(Event.Started({ attempt }));
              },
            }),
          ),
        ),
      Stop: ({ reason }) => {
        fork(from.stop);
        log(`[tuner] stop reason=${reason}`);
      },
    });
  };

  /** One frame through `detect`, read against the target or the nearest string: the needle, the latch, the words. */
  const read = useCallback(
    (frame: Float32Array) => {
      const target = aim.current;
      const heard = Option.map(detect(frame, rate.current), (hz) =>
        Option.match(target, { onNone: () => reading(hz), onSome: (id) => readingOn(hz, id) }),
      );
      if (Option.isSome(heard)) last.current = Option.some(heard.value.string);
      needle.value = withTiming(needleOf(heard), { duration: 90 });
      inTune.value = Number(Option.exists(heard, (each) => each.inTune));
      latched.current = latch(latched.current, heard);
      const lit = latched.current.tuned;
      // A render only when what the screen shows changes; the needle moves on the UI thread.
      setShown((was) => {
        if (lit === was.tuned && sameHeard(was.heard, heard)) return was;
        return { heard, tuned: lit };
      });
      setHint(hintOf(target, heard));
      // `take` reads frames only while listening.
      voice('Listening', heard);
    },
    [needle, inTune, voice],
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
          log(`[tuner] frame ms=${(Number(done - arrived) / 1e6).toFixed(1)}`);
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
    // The screen's life: one opening, one close; the source and the device are read through `latest`.
  }, []);

  // Another route over the screen covers it (a hymn link pushed over it): the session stops, and listens again once shown.
  useFocusEffect(
    useCallback(() => {
      tell(Event.Covered({ covered: false }));
      return () => tell(Event.Covered({ covered: true }));
    }, []),
    [],
  );

  useEffect(() => {
    tell(Event.Sounding({ sounding }));
  }, [sounding]);

  const swing = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(needle.value / NEEDLE_CENTS) * SWING}deg` }],
  }));
  // In tune the needle is wide and in the accent; out of tune, thin and in ink: a shape as well as a colour.
  const plain = useAnimatedStyle(() => ({ opacity: 1 - inTune.value }));
  const held = useAnimatedStyle(() => ({ opacity: inTune.value }));

  // What the reading shows comes from the phase, as its words do; none while denied.
  const name = nameOf(phase, target, shown.heard);
  // Listening, the label is the last words said (at most one change a second); else the phase's own, at once.
  const readingLabel = Match.value(phase).pipe(
    Match.when('Listening', () => label),
    Match.orElse((now) => Option.getOrElse(wordsOf(now, Option.none()), () => label)),
  );
  // The circle lit: the target, or in Auto the nearest string heard.
  const lit = Option.orElse(target, () => Option.map(shown.heard, (heard) => heard.string));
  const auto = Option.isNone(target);
  const heardInTune = Option.exists(shown.heard, (heard) => heard.inTune);

  return (
    <View
      testID="tuner-screen"
      onAccessibilityEscape={() => router.back()}
      style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
    >
      <View style={styles.head}>
        <Pressable
          role="button"
          aria-label="Done"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headButton}
        >
          <Text style={[styles.done, { color: accent }]}>Done</Text>
        </Pressable>
        <Pressable
          testID="tuner-auto"
          role="switch"
          aria-checked={auto}
          aria-label="Auto"
          onPress={toggleAuto}
          hitSlop={8}
          style={[styles.headButton, styles.auto]}
        >
          <Text style={styles.autoText} aria-hidden>
            Auto
          </Text>
          <View
            aria-hidden
            style={[styles.track, auto && { backgroundColor: accent, borderColor: accent }]}
          >
            <View style={[styles.knob, auto && styles.knobOn]} />
          </View>
        </Pressable>
      </View>

      <View style={styles.gaugeArea}>
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
        {phase === 'Ended' && (
          <View style={styles.message}>
            <Pressable
              role="button"
              aria-label="Tap to listen again"
              onPress={() => tell(Event.Tapped())}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text style={[styles.actionText, { color: accent }]}>Tap to listen again</Text>
            </Pressable>
          </View>
        )}
        {phase !== 'Denied' && phase !== 'Ended' && (
          <>
            <Gauge accent={accent} swing={swing} plain={plain} held={held} />
            <View
              testID="tuner-hint"
              accessible
              aria-label={hint}
              style={[styles.hint, heardInTune && { backgroundColor: accent }]}
            >
              <Text style={[styles.hintText, heardInTune && styles.hintHeld]} aria-hidden>
                {hint}
              </Text>
            </View>
          </>
        )}
      </View>

      {Option.isSome(name) && (
        <View testID="tuner-reading" accessible aria-label={readingLabel} style={styles.reading}>
          <Text style={styles.name} aria-hidden>
            {name.value}
          </Text>
          <Text style={styles.note} aria-hidden>
            {noteOf(shown.heard)}
          </Text>
        </View>
      )}

      <Headstock lit={lit} picked={target} tuned={shown.tuned} accent={accent} onPick={pick} />
    </View>
  );
}

/** The needle's swing either side of centre, in degrees, at `NEEDLE_CENTS`. */
const SWING = 50;

/** The gauge's radius, from the needle's pivot to the scale's ticks, in points. */
const RADIUS = 130;

/** The scale's ticks, in cents: one each 10, and the in-tune window's edges at ±5. */
const TICKS = [-50, -40, -30, -20, -10, -5, 0, 5, 10, 20, 30, 40, 50] as const;

/** The gauge: an arc of ticks from flat to sharp, the in-tune window marked in the accent, the needle over them. */
function Gauge({
  accent,
  swing,
  plain,
  held,
}: {
  readonly accent: ColorValue;
  readonly swing: ReturnType<typeof useAnimatedStyle>;
  readonly plain: ReturnType<typeof useAnimatedStyle>;
  readonly held: ReturnType<typeof useAnimatedStyle>;
}) {
  return (
    <View style={styles.gauge} aria-hidden>
      {TICKS.map((cents) => {
        const window = Math.abs(cents) === 5;
        const major = cents % 50 === 0;
        return (
          <View
            key={cents}
            style={[
              styles.spoke,
              { transform: [{ rotate: `${(cents / NEEDLE_CENTS) * SWING}deg` }] },
            ]}
          >
            <View
              style={[
                styles.tick,
                major && styles.majorTick,
                cents === 0 && styles.centreTick,
                window && { backgroundColor: accent, height: 22 },
              ]}
            />
          </View>
        );
      })}
      <Text style={[styles.side, styles.flatSide]}>♭</Text>
      <Text style={[styles.side, styles.sharpSide]}>♯</Text>
      <Animated.View style={[styles.needle, styles.thin, swing, plain]} />
      <Animated.View
        style={[styles.needle, styles.wide, { backgroundColor: accent }, swing, held]}
      />
      <View style={[styles.hub, { borderColor: accent }]} />
    </View>
  );
}

/** The strings across the headstock, low to high, as they run down from the nut. */
const ACROSS: ReadonlyArray<StringId> = [...LEFT].reverse().concat(RIGHT);

/**
 * The headstock, in Views: three pegs down each side (`LEFT`, `RIGHT`), each
 * string's circle beside its peg, and the six strings running from the pegs
 * down past the nut. The lit string's circle is filled and its string drawn
 * in the accent; a tuned one carries a tick.
 */
function Headstock({
  lit,
  picked,
  tuned,
  accent,
  onPick,
}: {
  readonly lit: Option.Option<StringId>;
  readonly picked: Option.Option<StringId>;
  readonly tuned: ReadonlySet<StringId>;
  readonly accent: ColorValue;
  readonly onPick: (id: StringId) => void;
}) {
  const isLit = (id: StringId) => Option.contains(lit, id);
  const side = (ids: ReadonlyArray<StringId>, flip: boolean) => (
    <View style={styles.column}>
      {ids.map((id) => (
        <View key={id} style={[styles.row, flip && styles.rowFlip]}>
          <StringCircle
            id={id}
            lit={isLit(id)}
            picked={Option.contains(picked, id)}
            tuned={tuned.has(id)}
            accent={accent}
            onPick={onPick}
          />
          <View style={styles.post} aria-hidden />
          <View style={[styles.peg, { borderColor: color.line }]} aria-hidden />
        </View>
      ))}
    </View>
  );
  return (
    <View style={styles.headstock}>
      <View style={styles.stock}>
        {side(LEFT, false)}
        <View style={styles.face} aria-hidden>
          <View style={styles.strings}>
            {ACROSS.map((id) => (
              <View
                key={id}
                style={[styles.line, isLit(id) && { backgroundColor: accent, width: 3 }]}
              />
            ))}
          </View>
          <View style={styles.nut} />
        </View>
        {side(RIGHT, true)}
      </View>
      <View style={styles.neck} aria-hidden>
        {ACROSS.map((id) => (
          <View
            key={id}
            style={[styles.line, isLit(id) && { backgroundColor: accent, width: 3 }]}
          />
        ))}
      </View>
    </View>
  );
}

/** What a second tap on the picked string does, as VoiceOver reads it after the circle's name. */
const BACK_TO_AUTO = 'Goes back to Auto';

/** The circle's VoiceOver hint: the picked string's says a second tap goes back to Auto; the others have none. */
const pickedHint = (picked: boolean): Option.Option<string> => {
  if (picked) return Option.some(BACK_TO_AUTO);
  return Option.none();
};

/**
 * One string's circle: its letter, filled while lit, a tick once tuned; it
 * springs lightly when picked. Picked, VoiceOver reads it as selected, with
 * a hint that a second tap goes back to Auto. Lit is not picked: in Auto the
 * string heard is lit, and none is selected.
 */
function StringCircle({
  id,
  lit,
  picked,
  tuned,
  accent,
  onPick,
}: {
  readonly id: StringId;
  readonly lit: boolean;
  readonly picked: boolean;
  readonly tuned: boolean;
  readonly accent: ColorValue;
  readonly onPick: (id: StringId) => void;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!picked) return;
    scale.value = withSequence(
      withTiming(1.12, { duration: 90 }),
      withSpring(1, { damping: 12, stiffness: 220 }),
    );
  }, [picked, scale]);
  const springing = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      testID={`tuner-string-${id}`}
      role="button"
      aria-label={stringLabel(id, tuned)}
      aria-selected={picked}
      accessibilityHint={Option.getOrUndefined(pickedHint(picked))}
      onPress={() => onPick(id)}
      hitSlop={4}
    >
      <Animated.View
        style={[styles.circle, lit && { backgroundColor: accent, borderColor: accent }, springing]}
      >
        <Text style={[styles.letter, lit && styles.litLetter]} aria-hidden>
          {id.slice(0, 1)}
        </Text>
        {tuned && (
          <View style={[styles.tickBadge, { borderColor: color.ground }]} aria-hidden>
            <Text style={styles.tickMark}>✓</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground, paddingHorizontal: 20, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headButton: { minHeight: 44, justifyContent: 'center' },
  done: { fontSize: 17, fontWeight: '600' },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoText: { fontSize: 15, fontWeight: '600', color: color.ink },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.soft,
    padding: 2,
  },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: color.ground },
  knobOn: { transform: [{ translateX: 18 }] },
  gaugeArea: { alignItems: 'center', justifyContent: 'flex-end', gap: 14, minHeight: 210 },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '600', color: color.ink, textAlign: 'center' },
  gauge: { width: 2 * RADIUS + 20, height: RADIUS + 16, alignItems: 'center' },
  // A spoke turns about the gauge's pivot; only its tick, at the rim, is drawn.
  spoke: {
    position: 'absolute',
    bottom: 8,
    width: 2,
    height: RADIUS,
    alignItems: 'center',
    transformOrigin: 'bottom',
  },
  tick: { width: 2, height: 12, borderRadius: 1, backgroundColor: color.line },
  majorTick: { height: 18, backgroundColor: color.muted },
  centreTick: { width: 3, height: 26, backgroundColor: color.ink },
  side: { position: 'absolute', bottom: 0, fontSize: 20, color: color.muted },
  flatSide: { left: 8 },
  sharpSide: { right: 8 },
  needle: {
    position: 'absolute',
    bottom: 8,
    height: RADIUS - 14,
    borderRadius: 3,
    transformOrigin: 'bottom',
  },
  thin: { width: 2, backgroundColor: color.ink },
  wide: { width: 6 },
  hub: {
    position: 'absolute',
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: color.ground,
  },
  hint: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: color.soft,
    minHeight: 36,
    justifyContent: 'center',
  },
  hintText: { fontSize: 15, fontWeight: '600', color: color.ink },
  hintHeld: { color: color.ground },
  reading: { alignItems: 'center', gap: 2 },
  name: { fontSize: 40, fontWeight: '700', color: color.ink },
  note: { fontSize: 15, color: color.muted, minHeight: 20 },
  headstock: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 },
  stock: { flexDirection: 'row', alignItems: 'stretch' },
  column: { justifyContent: 'space-around', paddingVertical: 10, gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowFlip: { flexDirection: 'row-reverse' },
  post: { width: 18, height: 2, backgroundColor: color.line },
  peg: {
    width: 22,
    height: 14,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: color.soft,
  },
  face: {
    width: 116,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: color.soft,
    borderWidth: 1,
    borderColor: color.line,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  strings: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'stretch',
    paddingTop: 24,
  },
  line: { width: 1.5, backgroundColor: color.muted },
  nut: { height: 6, backgroundColor: color.line },
  neck: {
    width: 96,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    backgroundColor: color.soft,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: color.line,
    backgroundColor: color.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { fontSize: 18, fontWeight: '700', color: color.ink },
  litLetter: { color: color.ground },
  tickBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: { fontSize: 11, fontWeight: '700', color: color.ground },
  action: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  actionText: { fontSize: 17, fontWeight: '600' },
  pressed: { backgroundColor: color.soft },
});
