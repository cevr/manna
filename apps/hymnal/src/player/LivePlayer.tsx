/**
 * The app's one player, over the device's playback (`playback.live.ts`)
 * under the score clock (`sound.ts`), which the Sound setting switches, its
 * seeks counted for the page's follow (`seeks.ts`).
 * It follows the lock screen and Control Center while the app shows it.
 *
 * Over the screens it draws the bar's `#` (`FIND_LABEL`), just above the
 * bar while the bar shows, and the find drums it opens (`FindDrums.tsx`).
 */

import { useAtom, useAtomMount, useAtomValue } from '@effect/atom-react';
import { Effect, Option, SubscriptionRef } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useSafeAreaInsets } from 'one';
import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { book } from '~/follow/book';
import { counted } from '~/follow/seeks';
import { settings } from '~/store';

import { Bar, barFor, dialFind, Find, FIND_LABEL, toggleFind } from './bar';
import { PlayerContext } from './context';
import { DialPanel } from './DialPanel';
import { MOST_SCALE } from './DialView';
import { FindDrums } from './FindDrums';
import { useShownPage } from './page';
import { heightOf } from './PlayerBar';
import { playbackLive } from './playback.live';
import { playerOn, statusEvery } from './player';
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
      {children}
      <FindNumber />
    </PlayerContext>
  );
}

/** The find drums: closed, or open on the number they dial; the hymn list reads it. */
export const find = Atom.make<Find>(Find.Closed()).pipe(Atom.keepAlive);

/** The space between the bar's top and the `#`, in points. */
const GAP = 8;

/** The `#` over the bar's right end while the bar shows, and the drums over it while open. */
function FindNumber() {
  const bar = barFor(useAtomValue(player.state), useShownPage());
  const [state, setFind] = useAtom(find);
  const inset = Math.max(useSafeAreaInsets().bottom, 0);
  return Bar.$match(bar, {
    Hidden: () => <></>,
    Shown: ({ state: sounding }) => {
      const open = Find.$is('Open')(state);
      return (
        <View
          testID="find"
          pointerEvents="box-none"
          style={[styles.find, { bottom: inset + heightOf(sounding) + GAP }]}
        >
          {Find.$match(state, {
            Closed: () => <></>,
            Open: ({ number }) => (
              <View style={styles.drums}>
                <DialPanel testID="find-drums">
                  <FindDrums
                    number={number}
                    onDial={(dialled) => setFind(dialFind(state, dialled))}
                  />
                </DialPanel>
              </View>
            ),
          })}
          <Pressable
            testID="find-number"
            accessibilityRole="button"
            accessibilityLabel={FIND_LABEL}
            accessibilityState={{ expanded: open }}
            onPress={() => setFind(toggleFind(state, bar))}
            style={({ pressed }) => [styles.hash, pressed && styles.pressed]}
          >
            <Text style={styles.hashText} maxFontSizeMultiplier={MOST_SCALE}>
              #
            </Text>
          </Pressable>
        </View>
      );
    },
  });
}

const styles = StyleSheet.create({
  find: { position: 'absolute', left: 12, right: 12, alignItems: 'flex-end', gap: GAP },
  drums: { alignSelf: 'stretch' },
  hash: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.pill,
  },
  pressed: { opacity: 0.6 },
  hashText: { fontSize: 20, fontWeight: '700', color: color.onPill },
});
