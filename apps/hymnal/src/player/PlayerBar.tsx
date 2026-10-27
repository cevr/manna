/**
 * The bottom bar. On a hymn page it is that hymn's player, unless another
 * hymn sounds; off a page it shows only while the player holds a hymn
 * (`barFor`). While the player holds a hymn, the bar is docked under the
 * stack (`PlayerBar`, in the hymnal's layout), as the player plays on across
 * screens. While it holds none, the hymn page draws the bar as its own
 * (`PageBar`), so the bar comes in with the page's push and goes out with
 * its back, frame for frame.
 *
 * Everything is at the thumb, left to right: on a hymn page, the key button
 * (`KeyButton`) for the page's hymn; the opener, which opens the player
 * sheet on the bar's hymn (`/player?hymn=<n>`, with `page=<m>` while another
 * hymn sounds over the reader), and holds the hymn's number
 * and title only when the bar's hymn is not the page's own; the Sound
 * switch; and the player's button. While another hymn sounds over a page,
 * a compact Play for the page's hymn sits before Sound. A swipe up on the
 * bar opens the sheet too. Over a hymn page, a pan from the docked bar's
 * left edge goes back, as the stack's own edge pan does above the bar
 * (`BackEdge`).
 *
 * Play springs the bar taller, 56 to 88 points, and shows the seeker under
 * the buttons (`Seeker`); Pause settles it back. The bar and the key dials
 * above it lie in an overlay over the screen, its full width, that takes
 * no touch of its own: the screen keeps only the bar's resting height under
 * it (`room`), so the spring and the dials move no layout, and every touch
 * on the bar, its dials and the page lands inside a view that holds it.
 */

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

import { Bar, dockedBar, pageBar, placeOf, REST, SOUNDING, toldPlace } from './bar';
import { usePlayer } from './context';
import { useShownPage } from './page';
import { Command, type HymnPlayer, Player, type Track } from './player';
import { BarMark } from './BarMark';
import { buttonsOf } from './button';
import { DialPopover } from './DialPanel';
import { type BoundThumb, Dials, useThumb } from './Dials';
import { KeyButton } from './KeyButton';
import { Seeker } from './Seeker';
import { ThumbEvent } from './thumb';
import { RecordingNotice } from './RecordingNotice';
import { PlayPage } from './PlayPage';

/** The bar docked under the stack, while the player holds a hymn. */
export function PlayerBar() {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <Docked player={player} />,
  });
}

/** The bar `track`'s page draws as its own, while the player holds no hymn. */
export function PageBar({ track }: { readonly track: Track }) {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <OnPage player={player} track={track} />,
  });
}

/** The docked bar the player's state and the page shown give: the stack's bottom follows it. */
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

/** Whether the bar stands tall, with its seeker: while its hymn loads, plays or buffers. */
const tall: (state: Player) => boolean = Player.$match({
  Idle: () => false,
  Loading: () => true,
  Playing: () => true,
  Buffering: () => true,
  Paused: () => false,
  Ended: () => false,
  Stopped: () => false,
  Failed: () => false,
});

/** The bar's height over the home indicator for the player's `state`. */
export const heightOf = (state: Player): number => (tall(state) && SOUNDING) || REST;

interface Drawing {
  readonly track: Track;
  readonly state: Player;
  /** The page's hymn, when another hymn sounds over it. */
  readonly page: Option.Option<Track>;
  /** The hymn page shown, if one is. */
  readonly shown: Option.Option<Track>;
  readonly send: (command: Command) => void;
  readonly inset: number;
  /** Whether the bar is docked under the stack, not a page's own. */
  readonly docked: boolean;
}

/**
 * `bar` drawn: nothing, or the screen's room for the bar at rest, and over
 * the screen the bar in its frame over the home indicator, with the key
 * dials of the page shown (`page`), if one is.
 */
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

/** The hymn number the key model is held on off a hymn page: no hymn has it, so it has no chords and no dials. */
const NO_PAGE = 0;

/** The dials' panel's inset from the screen's sides, and its gap over the bar's top, in points. */
const SIDE = 12;
const PANEL_GAP = 10;

/** The lit key button's centre from the panel's left edge, before the button has laid out. */
const KEY_CENTRE = 35;

/**
 * The overlay: the bar, and the key button and dials of the page shown. One
 * overlay draws every page and none, so a page turn, or a move to a screen
 * with no page, keeps the bar's frame, its spring and its seeker as they
 * are; only the key button and the dials follow the page. The dials stand
 * on their panel (`DialPopover`), which opens out of the key button and
 * closes back into it.
 */
function Overlay({ drawing }: { readonly drawing: Drawing }) {
  const model = useThumb(
    Option.match(drawing.shown, { onNone: () => NO_PAGE, onSome: (hymn) => hymn.number }),
  );
  const thumb = Option.map(drawing.shown, () => model);
  const open = Option.filter(thumb, (bound) => bound.state.open);
  const dials = Option.flatMap(thumb, (bound) =>
    Option.map(bound.printed, (printed) => ({ bound, printed })),
  );
  // The key button's centre from the panel's left edge, as the button lays out: the dials open out of it.
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
        {/* The popover stays while it closes, on a turn to a page with no chords or to no page too. */}
        <View pointerEvents="box-none" style={styles.dials}>
          <DialPopover
            open={Option.isSome(Option.filter(dials, ({ bound }) => bound.state.open))}
            keyAt={keyAt}
            below={PANEL_GAP + REST / 2}
          >
            {Option.match(dials, {
              onNone: () => <></>,
              onSome: ({ bound, printed }) => <Dials thumb={bound} printed={printed} />,
            })}
          </DialPopover>
        </View>
        <Frame drawing={drawing} thumb={thumb} onKeyLayout={keyLaidOut} />
      </View>
    </>
  );
}

/** The bar in its frame: its row of buttons, the seeker under them while it stands tall. */
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
  // The frame comes in at rest, so the first Play springs it up from the page's own bar.
  const height = useSharedValue(REST);
  useEffect(() => {
    // A spring that overshoots a little and settles, as the owner's prototype does.
    height.value = withSpring(target, { damping: 13, stiffness: 190, mass: 0.9 });
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
          {/* The swipe holds the seeker too: a swipe up from anywhere on the bar opens the sheet. */}
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
              {tall(state) && (
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

/** How far a pan on the docked bar's edge strip goes right, or how fast, to go back. */
const BACK_PAN = 40;
const BACK_SPEED = 500;

/**
 * The docked bar's left edge: a strip as wide as the bar's own padding,
 * over the whole bar, where a pan to the right goes back, as the stack's
 * own edge pan does above the bar. The docked bar lies outside the stack, so
 * the stack's back gesture never gets a touch that starts on it; a hymn
 * page's own bar lies in its screen, and needs no strip.
 */
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

/**
 * The bar's body: a button that opens the player sheet on the bar's hymn
 * (`/player?hymn=<n>`, with `page=<m>` for a differing reader), so the sheet
 * keeps that hymn, offers the page's Play and follows it after a swap,
 * whether or not the page stays mounted. It names the hymn (`named`) unless
 * the bar's hymn is the page's own, which the page already names; then it
 * shows a grabber, as the sheet it opens has.
 */
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

/**
 * Whether Play sounds the recording: on, a speaker with waves in the accent;
 * off, a speaker with a slash, muted, and the score clock runs (`sound.ts`).
 * It sits left of the player's button, so Play keeps its place at the bar's
 * end.
 */
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

/**
 * The player's buttons for the bar's hymn (`buttonsOf`) as marks in the
 * accent, the size of the Sound mark; a spinner in the same box while it
 * loads.
 */
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

/** A mark's target: 44 by 44, `color.soft` behind it while pressed. */
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
  // Over the bar's own left padding, the key button right of it.
  backEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 12 },
  fill: { flex: 1 },
});
