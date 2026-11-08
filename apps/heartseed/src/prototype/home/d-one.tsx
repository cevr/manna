/**
 * PROTOTYPE, throwaway: variant D, one plant at a time. Home is the next
 * verse of the day, its plant large in the morning light, with Say it under
 * it; the reader pages through the day's verses to choose another, or sends
 * one to later. The garden and the seed packets (the library) rise as
 * sheets; Voice and minutes sit behind the gear.
 */

import { Option } from 'effect';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import Animated, { FadeIn, FadeInRight, ReduceMotion } from 'react-native-reanimated';

import { BigButton, color, look } from '../../sayit/draw';
import {
  SHELVES,
  STAGE_WORDS,
  groupOf,
  leftOf,
  referenceOf,
  summaryOf,
  textOf,
  type Action,
  type Home,
  type Plant,
  type Shelf,
} from './data';
import {
  ICONS,
  Icon,
  OfferRow,
  Pill,
  Settings,
  Sheet,
  Sprout,
  ecru,
  kindIcon,
  styles as kit,
} from './kit';

type Open = 'none' | 'garden' | 'packets' | 'settings';

/** The words of the verse the card may show before it is said: all of a new verse, else its opening words. */
const glimpse = (each: Plant) => {
  const text = textOf(each);
  if (each.stage === 'new') return text;
  return `${text.split(' ').slice(0, 3).join(' ')} …`;
};

/** The verse in the light: its plant large, its reference, its list and stage, and a glimpse of its words. */
function Card({ home, plant }: { readonly home: Home; readonly plant: Plant }) {
  const list = Option.match(groupOf(home, plant.key), {
    onNone: () => '',
    onSome: (group) => group.title,
  });
  return (
    <Animated.View
      key={plant.key}
      entering={FadeInRight.duration(260).reduceMotion(ReduceMotion.System)}
      style={styles.card}
    >
      <View style={styles.light}>
        <View aria-hidden style={styles.sun}>
          <Icon source={ICONS.sun} size={84} />
        </View>
        <Sprout stage={plant.stage} size={140} delay={120} sway />
      </View>
      <Text testID="reference" style={styles.reference}>
        {referenceOf(plant)}
      </Text>
      <Text style={kit.small}>{`${list} · ${STAGE_WORDS[plant.stage]}`}</Text>
      <Text style={styles.glimpse}>{glimpse(plant)}</Text>
    </Animated.View>
  );
}

/** The seed packets: the library as packets to pick from, then the chosen packet's passages. */
function Packets({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const [shelf, setShelf] = useState(() => Option.fromUndefinedOr(SHELVES[0]));
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.packets}
      >
        {SHELVES.map((each) => {
          const on = Option.exists(shelf, (open: Shelf) => open.id === each.id);
          return (
            <Pressable
              key={each.id}
              role="radio"
              aria-label={each.title}
              aria-checked={on}
              onPress={() => setShelf(Option.some(each))}
              style={[styles.packet, on && styles.packetOn]}
            >
              <Icon source={kindIcon(each.kind)} size={40} />
              <Text numberOfLines={2} style={styles.packetTitle}>
                {each.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {Option.match(shelf, {
        onNone: () => false,
        onSome: (open) => (
          <Animated.View key={open.id} entering={FadeIn.duration(200)}>
            <Text style={kit.small}>{open.note}</Text>
            {open.offers.map((offer) => (
              <OfferRow key={offer.id} shelf={open} offer={offer} home={home} dispatch={dispatch} />
            ))}
          </Animated.View>
        ),
      })}
    </>
  );
}

/** The whole garden, small. */
function Garden({ home }: { readonly home: Home }) {
  return home.groups.map((group) => (
    <View key={group.id} style={styles.gardenRow}>
      <View style={styles.gardenHead}>
        <Icon source={kindIcon(group.kind)} size={24} />
        <Text style={styles.gardenTitle}>{group.title}</Text>
      </View>
      <View style={kit.wrap}>
        {group.plants.map((each) => (
          <View
            key={each.key}
            role="img"
            accessible
            aria-label={`${referenceOf(each)}, ${STAGE_WORDS[each.stage]}`}
          >
            <Sprout stage={each.stage} size={32} delay={0} sway={false} />
          </View>
        ))}
      </View>
    </View>
  ));
}

export function OneHome({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<Open>('none');
  const [at, setAt] = useState(0);
  const left = leftOf(home);
  const index = Math.min(at, Math.max(0, left.length - 1));
  const current = Option.fromUndefinedOr(left[index]);
  const step = (by: number) => setAt((index + by + left.length) % Math.max(1, left.length));
  return (
    <View style={look.screen}>
      <View aria-hidden style={styles.sky} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.eyebrow}>Good morning</Text>
        <View style={styles.topActions}>
          <Pill label="Garden" shown="Garden" strong={false} onPress={() => setOpen('garden')} />
          <Pressable
            role="button"
            aria-label="Settings"
            onPress={() => setOpen('settings')}
            style={({ pressed }) => [styles.gear, pressed && look.pressed]}
          >
            <Text style={styles.gearText}>⚙︎</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.middle}>
        {Option.match(current, {
          onSome: (each) => <Card home={home} plant={each} />,
          onNone: () => (
            <View style={styles.card}>
              <Icon source={ICONS.sun} size={120} />
              <Text style={styles.reference}>All tended</Text>
            </View>
          ),
        })}
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 72 }]}>
        <Text testID="summary" style={styles.summary}>
          {summaryOf(home)}
        </Text>
        {Option.match(current, {
          onNone: () => (
            <Pill
              label="Add verses"
              shown="+ Seed packets"
              strong={false}
              onPress={() => setOpen('packets')}
            />
          ),
          onSome: (shown) => (
            <>
              <View style={styles.pager}>
                <Pressable
                  role="button"
                  aria-label="Previous verse"
                  onPress={() => step(-1)}
                  style={styles.arrow}
                >
                  <Text style={styles.arrowText}>‹</Text>
                </Pressable>
                <View
                  aria-label={`Verse ${index + 1} of ${left.length}`}
                  accessible
                  style={styles.dots}
                >
                  {left.map((each, place) => (
                    <View key={each.key} style={[styles.dot, place === index && styles.dotOn]} />
                  ))}
                </View>
                <Pressable
                  role="button"
                  aria-label="Next verse"
                  onPress={() => step(1)}
                  style={styles.arrow}
                >
                  <Text style={styles.arrowText}>›</Text>
                </Pressable>
              </View>
              <BigButton
                label="Say it"
                busy={false}
                pressable
                onPress={() => dispatch({ _tag: 'Begun', key: Option.some(shown.key) })}
              />
              <View style={styles.row}>
                <Pill
                  label="Later today"
                  shown="Later today"
                  strong={false}
                  onPress={() => dispatch({ _tag: 'Skipped', key: shown.key })}
                />
                <Pill
                  label="Add verses"
                  shown="+ Seed packets"
                  strong={false}
                  onPress={() => setOpen('packets')}
                />
              </View>
            </>
          ),
        })}
      </View>
      {open === 'garden' && (
        <Sheet title="Your field" onClose={() => setOpen('none')}>
          <Garden home={home} />
        </Sheet>
      )}
      {open === 'packets' && (
        <Sheet title="Seed packets" onClose={() => setOpen('none')}>
          <Packets home={home} dispatch={dispatch} />
        </Sheet>
      )}
      {open === 'settings' && (
        <Sheet title="Settings" onClose={() => setOpen('none')}>
          <Settings home={home} dispatch={dispatch} />
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    backgroundColor: 'rgba(167, 212, 228, 0.28)',
    borderBottomLeftRadius: 200,
    borderBottomRightRadius: 200,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  eyebrow: { fontSize: 15, fontWeight: '600', color: color.ink },
  topActions: { flexDirection: 'row', gap: 8 },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  gearText: { fontSize: 20, color: color.ink },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  card: { alignItems: 'center', gap: 6 },
  light: { width: 200, height: 160, alignItems: 'center', justifyContent: 'flex-end' },
  sun: { position: 'absolute', top: 0, right: 8, opacity: 0.6 },
  reference: {
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '600',
    color: color.ink,
    textAlign: 'center',
  },
  glimpse: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 25,
    color: color.cue,
    textAlign: 'center',
    marginTop: 6,
  },
  bottom: { paddingHorizontal: 24, gap: 10, alignItems: 'center' },
  summary: { fontSize: 15, fontWeight: '600', color: color.ink },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 26, color: color.ink },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ecru },
  dotOn: { backgroundColor: color.ink, width: 18 },
  row: { flexDirection: 'row', gap: 10 },
  packets: { gap: 10, paddingVertical: 4 },
  packet: {
    width: 104,
    height: 116,
    padding: 10,
    borderRadius: 16,
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderColor: ecru,
    gap: 6,
  },
  packetOn: { borderColor: color.ink },
  packetTitle: { fontSize: 13, fontWeight: '600', color: color.ink },
  gardenRow: { gap: 6, paddingVertical: 6 },
  gardenHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gardenTitle: { fontFamily: 'Georgia', fontSize: 16, fontWeight: '600', color: color.ink },
});
