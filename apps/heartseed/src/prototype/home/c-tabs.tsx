/**
 * PROTOTYPE, throwaway: variant C, three tabs. Today is a ring of the day's
 * plants around one Begin button; Field is the whole garden; Lists is the
 * library, the reader's lists first, each shelf opening to its passages.
 * Voice and minutes sit behind Today's gear.
 */

import { Option } from 'effect';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import Animated, { FadeIn, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { BigButton, color, look } from '../../sayit/draw';
import {
  SHELVES,
  STAGE_WORDS,
  referenceOf,
  ripeIn,
  summaryOf,
  todayOf,
  type Action,
  type Home,
  type Shelf,
} from './data';
import {
  ICONS,
  Icon,
  OfferRow,
  Settings,
  Sheet,
  Sprout,
  ecru,
  gold,
  kindIcon,
  styles as kit,
} from './kit';

type Tab = 'today' | 'field' | 'lists';

const RING = 280;
const RADIUS = 112;

/** The day's plants set in a ring around Begin, each one popping in; a tended one shows grown and ringed in gold. */
function Ring({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const today = todayOf(home);
  const left = today.filter((each) => !home.tended.includes(each.key));
  return (
    <View style={styles.ring}>
      {today.map((each, index) => {
        const angle = (index / today.length) * Math.PI * 2 - Math.PI / 2;
        const done = home.tended.includes(each.key);
        return (
          <Animated.View
            key={each.key}
            entering={ZoomIn.delay(index * 90)
              .springify()
              .reduceMotion(ReduceMotion.System)}
            aria-hidden
            style={[
              styles.ringPlant,
              done && styles.ringDone,
              {
                left: RING / 2 + Math.cos(angle) * RADIUS - 24,
                top: RING / 2 + Math.sin(angle) * RADIUS - 24,
              },
            ]}
          >
            <Sprout stage={each.stage} size={36} delay={index * 90} sway />
          </Animated.View>
        );
      })}
      <View style={styles.ringCenter}>
        {left.length > 0 && (
          <BigButton
            label="Begin"
            busy={false}
            pressable
            onPress={() => dispatch({ _tag: 'Begun', key: Option.none() })}
          />
        )}
        {left.length === 0 && <Icon source={ICONS.sun} size={96} />}
      </View>
    </View>
  );
}

function TodayTab({
  home,
  dispatch,
  onSettings,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
  readonly onSettings: () => void;
}) {
  const left = todayOf(home).filter((each) => !home.tended.includes(each.key));
  return (
    <>
      <View style={styles.headRow}>
        <Text role="heading" aria-level={1} style={look.title}>
          Good morning
        </Text>
        <Pressable
          role="button"
          aria-label="Settings"
          onPress={onSettings}
          style={({ pressed }) => [styles.gear, pressed && look.pressed]}
        >
          <Text style={styles.gearText}>⚙︎</Text>
        </Pressable>
      </View>
      <Ring home={home} dispatch={dispatch} />
      <Text testID="summary" style={styles.summary}>
        {summaryOf(home)}
      </Text>
      {left.length > 0 && <Text style={styles.subhead}>Up next</Text>}
      {left.slice(0, 3).map((each) => (
        <Pressable
          key={each.key}
          role="button"
          aria-label={`Start with ${referenceOf(each)}`}
          onPress={() => dispatch({ _tag: 'Begun', key: Option.some(each.key) })}
          style={({ pressed }) => [styles.next, pressed && look.pressed]}
        >
          <Text style={styles.nextRef}>{referenceOf(each)}</Text>
          <Text style={kit.small}>{STAGE_WORDS[each.stage]}</Text>
        </Pressable>
      ))}
    </>
  );
}

function FieldTab({ home }: { readonly home: Home }) {
  const total = home.groups.reduce((sum, group) => sum + group.plants.length, 0);
  const ripe = home.groups.reduce((sum, group) => sum + ripeIn(group), 0);
  return (
    <>
      <Text role="heading" aria-level={1} style={look.title}>
        Your field
      </Text>
      <Text style={styles.summary}>{`${total} verses growing · ${ripe} full corn`}</Text>
      {home.groups.map((group, index) => (
        <Animated.View key={group.id} entering={FadeIn.delay(index * 80)} style={styles.card}>
          <View style={styles.cardHead}>
            <Icon source={kindIcon(group.kind)} size={26} />
            <Text style={styles.nextRef}>{group.title}</Text>
          </View>
          <View style={kit.wrap}>
            {group.plants.map((each, at) => (
              <View
                key={each.key}
                role="img"
                accessible
                aria-label={`${referenceOf(each)}, ${STAGE_WORDS[each.stage]}`}
                style={styles.plot}
              >
                <Sprout stage={each.stage} size={36} delay={index * 80 + at * 60} sway />
                <Text aria-hidden style={kit.tiny}>
                  {each.verse}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ))}
    </>
  );
}

function ListsTab({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const [shelf, setShelf] = useState<Option.Option<Shelf>>(Option.none());
  return Option.match(shelf, {
    onSome: (open) => (
      <>
        <Pressable
          role="button"
          aria-label="Lists"
          onPress={() => setShelf(Option.none())}
          style={({ pressed }) => [styles.back, pressed && look.pressed]}
        >
          <Text style={styles.backText}>‹ Lists</Text>
        </Pressable>
        <View style={styles.cardHead}>
          <Icon source={kindIcon(open.kind)} size={40} />
          <Text role="heading" aria-level={1} style={styles.shelfTitle}>
            {open.title}
          </Text>
        </View>
        <Text style={kit.small}>{open.note}</Text>
        {open.offers.map((offer) => (
          <OfferRow key={offer.id} shelf={open} offer={offer} home={home} dispatch={dispatch} />
        ))}
      </>
    ),
    onNone: () => (
      <>
        <Text role="heading" aria-level={1} style={look.title}>
          Lists
        </Text>
        <Text style={styles.subhead}>In your field</Text>
        {home.groups.map((group) => (
          <View key={group.id} style={styles.shelfRow}>
            <Icon source={kindIcon(group.kind)} size={32} />
            <Text style={styles.nextRef}>{group.title}</Text>
            <Text style={kit.small}>{`${group.plants.length}`}</Text>
          </View>
        ))}
        <Text style={styles.subhead}>Add from</Text>
        {SHELVES.map((each) => (
          <Pressable
            key={each.id}
            role="button"
            aria-label={each.title}
            onPress={() => setShelf(Option.some(each))}
            style={({ pressed }) => [styles.shelfRow, pressed && look.pressed]}
          >
            <Icon source={kindIcon(each.kind)} size={32} />
            <View style={styles.grow}>
              <Text style={styles.nextRef}>{each.title}</Text>
              <Text style={kit.small}>{each.note}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </>
    ),
  });
}

const TABS: readonly { readonly tab: Tab; readonly name: string; readonly icon: number }[] = [
  { tab: 'today', name: 'Today', icon: ICONS.sun },
  { tab: 'field', name: 'Field', icon: ICONS.corn },
  { tab: 'lists', name: 'Lists', icon: ICONS.scroll },
];

export function TabsHome({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');
  const [settings, setSettings] = useState(false);
  return (
    <View style={look.screen}>
      <ScrollView
        key={tab}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      >
        {tab === 'today' && (
          <TodayTab home={home} dispatch={dispatch} onSettings={() => setSettings(true)} />
        )}
        {tab === 'field' && <FieldTab home={home} />}
        {tab === 'lists' && <ListsTab home={home} dispatch={dispatch} />}
      </ScrollView>
      <View role="tablist" style={[styles.tabs, { paddingBottom: insets.bottom }]}>
        {TABS.map((each) => (
          <Pressable
            key={each.tab}
            role="tab"
            aria-label={each.name}
            aria-selected={tab === each.tab}
            onPress={() => setTab(each.tab)}
            style={styles.tab}
          >
            <View style={[styles.tabIcon, tab === each.tab && styles.tabOn]}>
              <Icon source={each.icon} size={28} />
            </View>
            <Text style={[styles.tabText, tab === each.tab && styles.tabTextOn]}>{each.name}</Text>
          </Pressable>
        ))}
      </View>
      {settings && (
        <Sheet title="Settings" onClose={() => setSettings(false)}>
          <Settings home={home} dispatch={dispatch} />
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  gearText: { fontSize: 20, color: color.ink },
  ring: { width: RING, height: RING, alignSelf: 'center' },
  ringPlant: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  ringDone: { borderWidth: 2, borderColor: gold },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  summary: { fontSize: 15, fontWeight: '600', color: color.ink, textAlign: 'center' },
  subhead: { fontSize: 13, fontWeight: '700', color: color.cue, marginTop: 8 },
  next: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: color.card,
    justifyContent: 'center',
  },
  nextRef: {
    fontFamily: 'Georgia',
    fontSize: 17,
    fontWeight: '600',
    color: color.ink,
    flexShrink: 1,
  },
  card: { gap: 8, padding: 14, borderRadius: 20, backgroundColor: color.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plot: { width: 44, alignItems: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 17, fontWeight: '600', color: color.ink },
  shelfTitle: {
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '600',
    color: color.ink,
    flexShrink: 1,
  },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ecru,
  },
  grow: { flex: 1 },
  chevron: { fontSize: 22, color: color.cue },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ecru,
    backgroundColor: color.card,
  },
  tab: { flex: 1, alignItems: 'center', paddingTop: 6, minHeight: 56, gap: 2 },
  tabIcon: { paddingHorizontal: 14, paddingVertical: 2, borderRadius: 14 },
  tabOn: { backgroundColor: 'rgba(167, 212, 228, 0.55)' },
  tabText: { fontSize: 11, fontWeight: '600', color: color.cue },
  tabTextOn: { color: color.ink },
});
