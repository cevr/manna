/**
 * The app's one player, over the device's playback (`playback.live.ts`)
 * under the score clock (`sound.ts`), which the Sound setting switches, its
 * seeks counted for the page's follow (`seeks.ts`).
 * It follows the lock screen and Control Center while the app shows it.
 *
 * Over the screens it draws the bar's `#` (`FIND_LABEL`) where `findAt`
 * puts it, just above the bar while the bar shows, and the find drums it
 * opens (`FindDrums.tsx`), with their `Open` and `Play` (`pressFind`). It
 * tells the lists the room the `#` takes (`FindRoom`).
 */

import { useAtom, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Effect, Option, SubscriptionRef } from 'effect';
import { usePathname, useRouter, useSafeAreaInsets } from 'one';
import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';

import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { book } from '~/follow/book';
import { counted } from '~/follow/seeks';
import { hymnAt } from '~/hymns/hymns';
import { settings } from '~/store';

import {
  type Bar,
  barFor,
  DOCKED_LIFT,
  find,
  Find,
  FindAct,
  FindAt,
  findAt,
  FIND_LABEL,
  FindPress,
  findRoom,
  HASH,
  HASH_GAP,
  pressFind,
  swipedDown,
} from './bar';
import { FindRoom, PlayerContext } from './context';
import { DialPanel } from './DialPanel';
import { MOST_SCALE } from './DialView';
import { FindDrums } from './FindDrums';
import { useShownPage } from './page';
import { heightOf } from './PlayerBar';
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
);
/** The context's one value: a draw again (the Sound switch) hands every reader the same player, so no page draws again for it. */
const provided = Option.some(player);

export function LivePlayer({ children }: { readonly children: ReactNode }) {
  // The commands run for as long as the app does, whichever screen shows.
  useAtomMount(player.send);
  useAtomMount(player.remote);
  useAtomMount(player.keys);
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

/** The screens, told the room the `#` takes, with the `#` over them where `findAt` puts it. */
function Finding({ children }: { readonly children: ReactNode }) {
  const bar = barFor(useAtomValue(player.state), useShownPage());
  const at = findAt(bar, usePathname() === '/');
  const inset = Math.max(useSafeAreaInsets().bottom, 0);
  return (
    <FindRoom value={findRoom(at, inset)}>
      {children}
      {FindAt.$match(at, {
        Nowhere: () => <></>,
        OverBar: ({ state }) => (
          <FindNumber bar={bar} bottom={inset + heightOf(state) + HASH_GAP} />
        ),
        Docked: () => <FindNumber bar={bar} bottom={inset + DOCKED_LIFT} />,
      })}
    </FindRoom>
  );
}

/** The `#`, its bottom `bottom` points over the window's, and the drums over it while open. */
function FindNumber({ bar, bottom }: { readonly bar: Bar; readonly bottom: number }) {
  const [state, setFind] = useAtom(find);
  const send = useAtomSet(player.send);
  const router = useRouter();
  const cue = useCue();
  const press = (pressed: FindPress) => {
    const [next, act] = pressFind(state, bar, pressed);
    setFind(next);
    FindAct.$match(act, {
      Stay: () => {},
      Open: ({ number }) => router.push(`/hymns/${number}`),
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
  return (
    <View testID="find" pointerEvents="box-none" style={[styles.find, { bottom }]}>
      {Find.$match(state, {
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
      })}
      <Pressable
        testID="find-number"
        accessibilityRole="button"
        accessibilityLabel={FIND_LABEL}
        accessibilityState={{ expanded: open }}
        onPress={() => press(FindPress.Hash())}
        style={({ pressed }) => [styles.hash, pressed && styles.pressed]}
      >
        <Text style={styles.hashText} maxFontSizeMultiplier={MOST_SCALE}>
          #
        </Text>
      </Pressable>
    </View>
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
  find: { position: 'absolute', left: 12, right: 12, alignItems: 'flex-end', gap: HASH_GAP },
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
    backgroundColor: color.pill,
  },
  pressed: { opacity: 0.6 },
  hashText: { fontSize: 20, fontWeight: '700', color: color.onPill },
});
