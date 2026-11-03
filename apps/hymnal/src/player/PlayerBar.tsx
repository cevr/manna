import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Match, Option } from 'effect';
import { type Href, Link, useLinkTo, useRouter, useSafeAreaInsets } from 'one';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { settings } from '~/store';
import { available } from '~/tuner/native';

import {
  Bar,
  BAR_SPRING,
  dockedBar,
  heightOf,
  pageBar,
  placeOf,
  REST,
  sounding,
  toldPlace,
} from './bar';
import { usePlayer, useRaised } from './context';
import { useShownPage } from './page';
import { Command, type HymnPlayer, type Player, type Track } from './player';
import { BarMark } from './BarMark';
import { buttonsOf } from './button';
import { DialPopover } from './DialPanel';
import { type BoundThumb, Dials, useThumb } from './Dials';
import { KeyButton } from './KeyButton';
import { Seeker } from './Seeker';
import { ThumbEvent } from './thumb';
import { RecordingNotice } from './RecordingNotice';
import { PlayPage } from './PlayPage';

export function PlayerBar() {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <Docked player={player} />,
  });
}

export function PageBar({ track }: { readonly track: Track }) {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <OnPage player={player} track={track} />,
  });
}

export const useDockedBar = (player: HymnPlayer) =>
  dockedBar(useAtomValue(player.state), useShownPage());

function Docked({ player }: { readonly player: HymnPlayer }) {
  return <Drawn bar={useDockedBar(player)} page={useShownPage()} player={player} docked />;
}

function OnPage({ player, track }: { readonly player: HymnPlayer; readonly track: Track }) {
  return (
    <Drawn
      bar={pageBar(useAtomValue(player.state), track)}
      page={Option.some(track)}
      player={player}
      docked={false}
    />
  );
}

interface Drawing {
  readonly track: Track;
  readonly state: Player;
  readonly page: Option.Option<Track>;
  readonly shown: Option.Option<Track>;
  readonly send: (command: Command) => void;
  readonly inset: number;
  readonly docked: boolean;
}

function Drawn({
  bar,
  page,
  player,
  docked,
}: {
  readonly bar: Bar;
  readonly page: Option.Option<Track>;
  readonly player: HymnPlayer;
  readonly docked: boolean;
}) {
  const send = useAtomSet(player.send);
  const inset = Math.max(useSafeAreaInsets().bottom, 0);
  return Bar.$match(bar, {
    Hidden: () => <></>,
    Shown: ({ track, state, page: other }) => {
      const drawing = { track, state, page: other, shown: page, send, inset, docked };
      return (
        <>
          <View testID="bar-room" aria-hidden style={{ height: REST + inset }} />
          <View testID="bar-overlay" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <Overlay drawing={drawing} />
          </View>
        </>
      );
    },
  });
}

const NO_PAGE = 0;

const SIDE = 12;
const PANEL_GAP = 10;

const KEY_CENTRE = 35;

function Overlay({ drawing }: { readonly drawing: Drawing }) {
  const model = useThumb(
    Option.match(drawing.shown, { onNone: () => NO_PAGE, onSome: (hymn) => hymn.number }),
  );
  const thumb = Option.map(drawing.shown, () => model);
  const open = Option.filter(thumb, (bound) => bound.state.open);
  useRaised(Option.isSome(open));
  const dials = Option.flatMap(thumb, (bound) =>
    Option.map(bound.printed, (printed) => ({ bound, printed })),
  );
  const keyAt = useSharedValue(KEY_CENTRE);
  const keyLaidOut = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    keyAt.value = x + width / 2 - SIDE;
  };
  return (
    <>
      {Option.match(open, {
        onNone: () => <></>,
        onSome: (bound) => (
          <Pressable
            testID="dials-backdrop"
            accessible={false}
            aria-hidden
            style={StyleSheet.absoluteFill}
            onPress={() => bound.send(ThumbEvent.TapPage())}
          />
        ),
      })}
      <View pointerEvents="box-none" style={styles.dock}>
        <View pointerEvents="box-none" style={styles.dials}>
          <DialPopover
            open={Option.isSome(Option.filter(dials, ({ bound }) => bound.state.open))}
            keyAt={keyAt}
            below={PANEL_GAP + REST / 2}
          >
            {Option.match(dials, {
              onNone: () => <></>,
              onSome: ({ bound, printed }) => (
                <Dials thumb={bound} printed={printed} tuner={available} />
              ),
            })}
          </DialPopover>
        </View>
        <Frame drawing={drawing} thumb={thumb} onKeyLayout={keyLaidOut} />
      </View>
    </>
  );
}

function Frame({
  drawing,
  thumb,
  onKeyLayout,
}: {
  readonly drawing: Drawing;
  readonly thumb: Option.Option<BoundThumb>;
  readonly onKeyLayout: (event: LayoutChangeEvent) => void;
}) {
  const { track, state, page, shown, send, inset } = drawing;
  const cue = useCue();
  const target = heightOf(state);
  const height = useSharedValue(REST);
  useEffect(() => {
    height.value = withSpring(target, BAR_SPRING);
  }, [target]);
  const springing = useAnimatedStyle(() => ({ height: height.value }));
  const router = useRouter();
  const sheet = Option.match(page, {
    onNone: () => `/player?hymn=${track.number}` as const,
    onSome: (page) => `/player?hymn=${track.number}&page=${page.number}` as const,
  });
  const swipe = usePanGesture({
    testID: 'bar-swipe',
    runOnJS: true,
    activeOffsetY: [-12, 12],
    failOffsetX: [-24, 24],
    onDeactivate: ({ translationY = 0, velocityY = 0 }) => {
      if (translationY > -24 && velocityY > -400) return;
      cue(plain('sheet-open'));
      router.push(sheet);
    },
  });
  const { at, length } = Option.getOrElse(placeOf(state), () => ({
    at: 0,
    length: Option.none<number>(),
  }));
  return (
    <View role="region" aria-label="Player" style={[styles.frame, { paddingBottom: inset }]}>
      <Animated.View testID="bar-spring" style={[styles.spring, springing]}>
        <GestureHandlerRootView style={styles.root}>
          <GestureDetector gesture={swipe}>
            <View>
              <View style={styles.bar}>
                {Option.match(thumb, {
                  onNone: () => <></>,
                  onSome: (bound) => <KeyButton thumb={bound} onLayout={onKeyLayout} />,
                })}
                <Opener
                  track={track}
                  state={state}
                  href={sheet}
                  named={!Option.exists(shown, (hymn) => hymn.number === track.number)}
                />
                {Option.match(page, {
                  onNone: () => <></>,
                  onSome: (other) => <PlayPage track={other} send={send} />,
                })}
                <Sound />
                <Buttons track={track} state={state} send={send} />
              </View>
              {sounding(state) && (
                <Seeker
                  key={track.number}
                  at={at}
                  length={length}
                  onSeek={(seconds) => send(Command.Seek({ seconds }))}
                />
              )}
            </View>
          </GestureDetector>
        </GestureHandlerRootView>
      </Animated.View>
      <RecordingNotice number={track.number} />
      {drawing.docked && Option.isSome(shown) && <BackEdge />}
    </View>
  );
}

const BACK_PAN = 40;
const BACK_SPEED = 500;

function BackEdge() {
  const router = useRouter();
  const back = usePanGesture({
    testID: 'bar-back-edge',
    runOnJS: true,
    activeOffsetX: [-1000, 10],
    failOffsetY: [-24, 24],
    onDeactivate: ({ translationX = 0, velocityX = 0 }) => {
      if (translationX < BACK_PAN && velocityX < BACK_SPEED) return;
      router.back();
    },
  });
  return (
    <GestureHandlerRootView style={styles.backEdge}>
      <GestureDetector gesture={back}>
        <View testID="bar-back-edge" style={styles.fill} />
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

function Opener({
  track,
  state,
  href,
  named,
}: {
  readonly track: Track;
  readonly state: Player;
  readonly href: Href;
  readonly named: boolean;
}) {
  const accent = useAccent();
  const cue = useCue();
  const link = useLinkTo({ href: Link.resolveHref(href) });
  return (
    <Pressable
      {...link}
      onPress={(event) => {
        cue(plain('press'));
        link.onPress(event);
      }}
      role="button"
      aria-label="Open player"
      aria-valuetext={Option.getOrUndefined(toldPlace(state))}
      style={styles.open}
    >
      {Match.value(named).pipe(
        Match.when(true, () => (
          <>
            <Text style={[styles.number, { color: accent }]} numberOfLines={1}>
              {track.number}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
          </>
        )),
        Match.orElse(() => <View testID="bar-grabber" style={styles.grabber} />),
      )}
    </Pressable>
  );
}

function Sound() {
  const [on, setOn] = useAtom(settings.sound);
  const accent = useAccent();
  const cue = useCue();
  const tint = [color.muted, accent][Number(on)] ?? accent;
  return (
    <Pressable
      role="button"
      aria-label="Sound"
      aria-checked={on}
      onPress={() => {
        cue(plain((on && 'switch-off') || 'switch-on'));
        setOn(!on);
      }}
      style={pressedSoft}
    >
      <BarMark mark={(['sound-off', 'sound-on'] as const)[Number(on)] ?? 'sound-on'} tint={tint} />
    </Pressable>
  );
}

function Buttons({
  track,
  state,
  send,
}: {
  readonly track: Track;
  readonly state: Player;
  readonly send: (command: Command) => void;
}) {
  const accent = useAccent();
  const cue = useCue();
  return buttonsOf(state, track).map((button) =>
    Option.match(button.command, {
      onNone: () => (
        <View key={button.kind} style={styles.mark}>
          <ActivityIndicator color={accent} accessibilityLabel={button.label} />
        </View>
      ),
      onSome: (command) => (
        <Pressable
          key={button.kind}
          role="button"
          aria-label={button.label}
          onPress={() => {
            cue(plain((button.kind === 'pause' && 'pause') || 'play'));
            send(command);
          }}
          style={pressedSoft}
        >
          {Match.value(button.kind).pipe(
            Match.when('loading', () => <></>),
            Match.orElse((kind) => <BarMark mark={kind} tint={accent} />),
          )}
        </Pressable>
      ),
    }),
  );
}

const pressedSoft = ({ pressed }: { readonly pressed: boolean }) => [
  styles.mark,
  pressed && styles.pressed,
];

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  dials: { paddingHorizontal: SIDE, paddingBottom: PANEL_GAP },
  frame: {
    backgroundColor: color.bar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  spring: { overflow: 'hidden' },
  root: { flex: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: REST,
  },
  open: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
  },
  grabber: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: color.line },
  number: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { flex: 1, fontSize: 15, color: color.ink },
  mark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: { backgroundColor: color.soft },
  backEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 12 },
  fill: { flex: 1 },
});
