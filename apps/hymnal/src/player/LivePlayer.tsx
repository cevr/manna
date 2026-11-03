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
import { playerOn, statusEvery } from './player';
import { cachedPlayback } from './offline';
import { keptOf } from './stanzas';
import { offlineLive } from '~/offline/live';
import { SaveShown } from '~/offline/Open';

const sound = Effect.runSync(SubscriptionRef.make(true));
const keptFor = (hymn: number, stanzas: ReadonlyArray<number>): ReadonlyArray<boolean> =>
  Option.match(hymnAt(String(hymn)), {
    onNone: () => [],
    onSome: (text) => keptOf(text.sections, stanzas),
  });
const player = playerOn(
  counted(cachedPlayback(playbackLive, book.of, sound, offlineLive, keptFor)),
  statusEvery,
  settings.heardMove,
  settings.tempo,
  settings.stanzas,
  settings.intro,
);
const provided = Option.some(player);

export function LivePlayer({ children }: { readonly children: ReactNode }) {
  useAtomMount(player.send);
  useAtomMount(player.remote);
  useAtomMount(player.keys);
  useAtomMount(player.tempos);
  useAtomMount(player.stanzas);
  useAtomMount(player.beats);
  const on = useAtomValue(settings.sound);
  useEffect(() => Effect.runSync(SubscriptionRef.set(sound, on)), [on]);
  return (
    <PlayerContext value={provided}>
      <SaveShown />
      <Finding>{children}</Finding>
    </PlayerContext>
  );
}

const holds = (segment: string): boolean => Option.isSome(hymnAt(segment));

function Finding({ children }: { readonly children: ReactNode }) {
  const state = useAtomValue(player.state);
  const shown = useShownPage();
  const bar = barFor(state, shown);
  const path = usePathname();
  const at = findPlace({ path, holds, shown, state, raised: useAtomValue(raised) > 0 });
  const inset = Math.max(useSafeAreaInsets().bottom, 0);
  const setFind = useAtomSet(find);
  const stands = hashStands(at);
  const place: FindPlace = { path, at };
  const was = useRef(place);
  useEffect(() => {
    const before = was.current;
    was.current = place;
    setFind((state) => findMoved(state, before, place));
  }, [path, stands, setFind]);
  return (
    <FindRoom value={findRoom(at, inset)}>
      {children}
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
  const router = useRouter();
  const searching = useAtomValue(searchOpen);
  const cancelSearch = useCancelSearch();
  const closeSearchHere = () => {
    if (Option.exists(searching, (open) => open.path === path)) cancelSearch();
  };
  const press = (pressed: FindPress) => {
    const [next, act] = pressFind(state, bar, pressed);
    setFind(next);
    FindAct.$match(act, {
      Stay: () => {},
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
              </View>
            </DialPanel>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    ),
  });
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
  disk: { backgroundColor: color.glass },
  pressed: { opacity: 0.6 },
  hashText: { fontSize: 20, fontWeight: '700', color: color.onGlass },
  hashChosen: { color: color.onGlassChosen },
});
