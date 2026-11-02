/**
 * The app's one player, over the device's playback (`playback.live.ts`)
 * under the score clock (`sound.ts`), which the Sound setting switches, its
 * seeks counted for the page's follow (`seeks.ts`).
 * It follows the lock screen and Control Center while the app shows it.
 *
 * Over the screens it draws the bar's `#` (`FIND_LABEL`) where `findPlace`
 * puts it on the page the route draws, just above the bar while that page
 * draws one, and the find drums it
 * opens (`FindDrums.tsx`), with their `Open` and `Play` (`pressFind`).
 * `Open` pushes the hymn dialled, or on a hymn page puts it in the page's
 * place, and on the page's own hymn moves nothing (`openingAt`); either
 * closes a search open on that page, as a search's result does. On
 * every screen the `#` is the last button of the find bar (`FindBar.tsx`),
 * which also holds `Search`, in the same place: one find bar for the home
 * list and a hymn page alike, so it lives on and glides between their places
 * (`glideOf`), and stands over a hymn page's bar from the render the path
 * moves to it (`findPlace`). It
 * tells the lists the room the `#` takes (`FindRoom`). The drums close on a
 * move to another screen or where the `#` leaves (`findMoved`), and on a tap
 * outside them: while they are open a layer lies over the screens and the
 * bar, under the drums and the `#`, and takes that tap, so it reaches
 * nothing behind. The find bar lies over it too and lets a tap on any of
 * its views but the `#` through to it.
 */

import { useAtom, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Effect, Match, Option, SubscriptionRef } from 'effect';
import { usePathname, useRouter, useSafeAreaInsets } from 'one';
import { type ReactNode, useEffect, useRef } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';

import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { book } from '~/follow/book';
import { counted } from '~/follow/seeks';
import { hymnHref } from '~/home/Browse';
import { FindBar, useCancelSearch } from '~/home/FindBar';
import type { HashLook } from '~/home/finding';
import { openingAt } from '~/home/opening';
import { hymnAt } from '~/hymns/hymns';
import { searchOpen } from '~/reader/place';
import { settings } from '~/store';

import {
  type Bar,
  barFor,
  DOCKED_LIFT,
  find,
  Find,
  FindAct,
  FindAt,
  findMoved,
  type FindPlace,
  findPlace,
  FIND_LABEL,
  FindPress,
  findRoom,
  HASH,
  HASH_GAP,
  hashStands,
  heightOf,
  pressFind,
  raised,
  swipedDown,
} from './bar';
import { FindRoom, PlayerContext } from './context';
import { DialPanel } from './DialPanel';
import { MOST_SCALE } from './DialView';
import { FindDrums } from './FindDrums';
import { useShownPage } from './page';
import { playbackLive } from './playback.live';
import { Command, playerOn, statusEvery } from './player';
import { cachedPlayback } from './offline';
import { offlineLive } from '~/offline/live';
import { SaveShown } from '~/offline/Open';

/** Whether the recording sounds, as the score clock reads it: the Sound setting, set at mount. */
const sound = Effect.runSync(SubscriptionRef.make(true));
const player = playerOn(
  counted(cachedPlayback(playbackLive, book.of, sound, offlineLive)),
  statusEvery,
  settings.move,
  settings.tempo,
);
/** The context's one value: a draw again (the Sound switch) hands every reader the same player, so no page draws again for it. */
const provided = Option.some(player);

export function LivePlayer({ children }: { readonly children: ReactNode }) {
  // The commands run for as long as the app does, whichever screen shows.
  useAtomMount(player.send);
  useAtomMount(player.remote);
  useAtomMount(player.keys);
  useAtomMount(player.tempos);
  const on = useAtomValue(settings.sound);
  // The setting is the app's; the score clock is outside React, so it is told each change.
  useEffect(() => Effect.runSync(SubscriptionRef.set(sound, on)), [on]);
  return (
    <PlayerContext value={provided}>
      <SaveShown />
      <Finding>{children}</Finding>
    </PlayerContext>
  );
}

/** Whether the book holds the hymn a route's number segment names: the hymn route draws its page and bar. */
const holds = (segment: string): boolean => Option.isSome(hymnAt(segment));

/** The screens, told the room the `#` takes, with the `#` over them where `findPlace` puts it. */
function Finding({ children }: { readonly children: ReactNode }) {
  const state = useAtomValue(player.state);
  const shown = useShownPage();
  // The bar the `#` acts on: the drums open on its hymn.
  const bar = barFor(state, shown);
  const path = usePathname();
  const at = findPlace({ path, holds, shown, state, raised: useAtomValue(raised) > 0 });
  const inset = Math.max(useSafeAreaInsets().bottom, 0);
  // The drums close on a move to another screen, or where the `#` leaves.
  const setFind = useAtomSet(find);
  const stands = hashStands(at);
  const place: FindPlace = { path, at };
  const was = useRef(place);
  // Only a new route, or the `#` standing or leaving, moves the drums; not each status the bar shows.
  useEffect(() => {
    const before = was.current;
    was.current = place;
    setFind((state) => findMoved(state, before, place));
  }, [path, stands, setFind]);
  return (
    <FindRoom value={findRoom(at, inset)}>
      {children}
      {/* One `FindNumber` in one place for both of the bar's places, so the bar lives on and glides between them. */}
      {FindAt.$match(at, {
        Nowhere: () => <></>,
        Yielded: () => <></>,
        OverBar: ({ state }) => (
          <FindNumber bar={bar} path={path} at={at} bottom={inset + heightOf(state) + HASH_GAP} />
        ),
        Docked: () => <FindNumber bar={bar} path={path} at={at} bottom={inset + DOCKED_LIFT} />,
      })}
    </FindRoom>
  );
}

/**
 * The `#`, its bottom `bottom` points over the window's where it stands
 * (`at`), and the drums over it while open, over a layer across the whole
 * window that closes them on a tap (`FindPress.Outside`). The `#` is the last
 * button of the find bar (`FindBar`) of the screen at `path`, after `Search`.
 */
function FindNumber({
  bar,
  path,
  at,
  bottom,
}: {
  readonly bar: Bar;
  readonly path: string;
  readonly at: FindAt;
  readonly bottom: number;
}) {
  const [state, setFind] = useAtom(find);
  const send = useAtomSet(player.send);
  const router = useRouter();
  const cue = useCue();
  const searching = useAtomValue(searchOpen);
  const cancelSearch = useCancelSearch();
  // A search open on this page closes: its results would wait on the hymn left, or stand over the one shown.
  const closeSearchHere = () => {
    if (Option.exists(searching, (open) => open.path === path)) cancelSearch();
  };
  const press = (pressed: FindPress) => {
    const [next, act] = pressFind(state, bar, pressed);
    setFind(next);
    FindAct.$match(act, {
      Stay: () => {},
      // On a hymn page the hymn dialled takes the page's place, and the page's own hymn stays.
      Open: ({ number }) =>
        Match.value(openingAt(path, number)).pipe(
          Match.when('push', () => router.push(hymnHref(number))),
          Match.when('replace', () => {
            closeSearchHere();
            router.replace(hymnHref(number));
          }),
          Match.when('stay', closeSearchHere),
          Match.exhaustive,
        ),
      // Playbulk's Start alone starts a hymn, in place of the one held.
      Play: ({ number }) =>
        Option.match(hymnAt(String(number)), {
          onNone: () => {},
          onSome: (hymn) => {
            cue(plain('play'));
            send(Command.Start({ track: { number: hymn.number, title: hymn.title } }));
          },
        }),
    });
  };
  const swipe = usePanGesture({
    testID: 'find-swipe',
    runOnJS: true,
    activeOffsetY: [-12, 12],
    failOffsetX: [-24, 24],
    onDeactivate: ({ translationY = 0, velocityY = 0 }) => {
      if (swipedDown(translationY, velocityY)) press(FindPress.Swipe());
    },
  });
  const open = Find.$is('Open')(state);
  const drums = Find.$match(state, {
    Closed: () => <></>,
    Open: ({ number }) => (
      <GestureHandlerRootView style={styles.drums}>
        <GestureDetector gesture={swipe}>
          <View>
            <DialPanel testID="find-drums">
              <FindDrums
                number={number}
                onDial={(dialled) => press(FindPress.Dial({ number: dialled }))}
              />
              <View style={styles.acts}>
                <Act testID="find-open" label="Open" onPress={() => press(FindPress.Open())} />
                <Act testID="find-play" label="Play" onPress={() => press(FindPress.Play())} />
              </View>
            </DialPanel>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    ),
  });
  // The drums open over the keyboard's place: an open search's keyboard goes down first.
  const hash = (look: HashLook) => (
    <Pressable
      testID="find-number"
      accessibilityRole="button"
      accessibilityLabel={FIND_LABEL}
      aria-expanded={open}
      onPress={() => {
        Keyboard.dismiss();
        press(FindPress.Hash());
      }}
      style={({ pressed }) => [
        styles.hash,
        look === 'alone' && styles.disk,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[styles.hashText, look === 'chosen' && styles.hashChosen]}
        maxFontSizeMultiplier={MOST_SCALE}
      >
        #
      </Text>
    </Pressable>
  );
  return (
    <>
      {Find.$match(state, {
        Closed: () => <></>,
        // Over the screens and the bar, under the panel and the `#`: a tap outside closes the drums and goes no further.
        Open: () => (
          <Pressable
            testID="find-outside"
            accessible={false}
            aria-hidden
            style={StyleSheet.absoluteFill}
            onPress={() => press(FindPress.Outside())}
          />
        ),
      })}
      <FindBar path={path} at={at} bottom={bottom} drums={drums} drumsOpen={open} hash={hash} />
    </>
  );
}

/** One of the drums' two acts on the dialled hymn. */
function Act({
  testID,
  label,
  onPress,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.act, pressed && styles.pressed]}
    >
      <Text style={styles.actText} maxFontSizeMultiplier={MOST_SCALE}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  drums: { flex: 0, alignSelf: 'stretch' },
  acts: { flexDirection: 'row', gap: HASH_GAP },
  act: {
    flex: 1,
    minHeight: HASH,
    borderRadius: HASH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.pill,
  },
  actText: { fontSize: 17, fontWeight: '600', color: color.onPill },
  hash: {
    width: HASH,
    height: HASH,
    borderRadius: HASH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disk: { backgroundColor: color.pill },
  pressed: { opacity: 0.6 },
  hashText: { fontSize: 20, fontWeight: '700', color: color.onPill },
  hashChosen: { color: color.onChosen },
});
