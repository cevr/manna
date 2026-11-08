/**
 * PROTOTYPE, throwaway: variant A, the field is home. The morning's line and
 * Begin sit over the field itself: each list a furrow of plants, the ready
 * ones marked with a gold dot. A tap on a plant names it and offers `Start
 * here`. `Add verses` at the field's end opens the library as a sheet;
 * Voice and minutes live behind the gear.
 */

import { Option } from 'effect';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { color, look } from '../../sayit/draw';
import {
  SHELVES,
  STAGE_WORDS,
  plantOf,
  referenceOf,
  ripeIn,
  summaryOf,
  todayOf,
  type Action,
  type Group,
  type Home,
  type Plant,
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
  gold,
  kindIcon,
  styles as kit,
} from './kit';

type Open = 'none' | 'settings' | 'library';

/** One plant of a furrow: its drawing, its verse number, and a gold dot when it is ready today. */
function Plot({
  plant,
  ready,
  chosen,
  delay,
  onPress,
}: {
  readonly plant: Plant;
  readonly ready: boolean;
  readonly chosen: boolean;
  readonly delay: number;
  readonly onPress: () => void;
}) {
  const label = [referenceOf(plant), STAGE_WORDS[plant.stage], ready && 'ready today']
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-selected={chosen}
      onPress={onPress}
      style={[styles.plot, chosen && styles.chosenPlot]}
    >
      <View style={[styles.dot, !ready && styles.noDot]} />
      <Sprout stage={plant.stage} size={40} delay={delay} sway />
      <Text aria-hidden style={styles.number}>
        {plant.verse}
      </Text>
    </Pressable>
  );
}

/** One list as a furrow: its icon, title and how much is ripe, then its plants on one soil line. */
function Furrow({
  group,
  index,
  ready,
  chosen,
  onChoose,
}: {
  readonly group: Group;
  readonly index: number;
  readonly ready: readonly string[];
  readonly chosen: Option.Option<string>;
  readonly onChoose: (key: string) => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 90).reduceMotion(ReduceMotion.System)}
      style={styles.furrow}
    >
      <View style={styles.furrowHead}>
        <Icon source={kindIcon(group.kind)} size={28} />
        <Text style={styles.furrowTitle}>{group.title}</Text>
        <Text style={kit.small}>{`${ripeIn(group)} of ${group.plants.length} ripe`}</Text>
      </View>
      <View style={styles.plots}>
        {group.plants.map((each, at) => (
          <Plot
            key={each.key}
            plant={each}
            ready={ready.includes(each.key)}
            chosen={Option.contains(chosen, each.key)}
            delay={index * 90 + at * 70}
            onPress={() => onChoose(each.key)}
          />
        ))}
      </View>
      <View aria-hidden style={styles.soil} />
    </Animated.View>
  );
}

/** The plant tapped, named, with the way to begin from it. */
function Chosen({
  home,
  chosen,
  dispatch,
}: {
  readonly home: Home;
  readonly chosen: Option.Option<string>;
  readonly dispatch: (action: Action) => void;
}) {
  return Option.match(
    Option.flatMap(chosen, (key) => plantOf(home, key)),
    {
      onNone: () => false,
      onSome: (each) => (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.chosenBar}>
          <Text
            style={styles.chosenText}
          >{`${referenceOf(each)} · ${STAGE_WORDS[each.stage]}`}</Text>
          <Pill
            label={`Start with ${referenceOf(each)}`}
            shown="Start here"
            strong
            onPress={() => dispatch({ _tag: 'Begun', key: Option.some(each.key) })}
          />
        </Animated.View>
      ),
    },
  );
}

export function FieldHome({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<Open>('none');
  const [chosen, setChosen] = useState<Option.Option<string>>(Option.none());
  const [shelfOpen, setShelfOpen] = useState('psalms');
  const ready = todayOf(home)
    .filter((each) => !home.tended.includes(each.key))
    .map((each) => each.key);
  const allDone = ready.length === 0;
  return (
    <View style={look.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.top}>
          <View style={styles.morning}>
            <Icon source={ICONS.sun} size={36} />
            <Text style={styles.eyebrow}>Good morning</Text>
          </View>
          <Pressable
            role="button"
            aria-label="Settings"
            hitSlop={6}
            onPress={() => setOpen('settings')}
            style={({ pressed }) => [styles.gear, pressed && look.pressed]}
          >
            <Text style={styles.gearText}>⚙︎</Text>
          </Pressable>
        </View>
        <Text role="heading" aria-level={1} style={look.title}>
          Your field
        </Text>
        <View style={styles.today}>
          <Text testID="summary" style={styles.summary}>
            {summaryOf(home)}
          </Text>
          {!allDone && (
            <Pill
              label="Begin"
              shown="Begin"
              strong
              onPress={() => dispatch({ _tag: 'Begun', key: Option.none() })}
            />
          )}
        </View>
        <Text style={kit.small}>A gold dot marks a plant ready today. Tap one to start there.</Text>
        <Chosen home={home} chosen={chosen} dispatch={dispatch} />
        {home.groups.map((group, index) => (
          <Furrow
            key={group.id}
            group={group}
            index={index}
            ready={ready}
            chosen={chosen}
            onChoose={(key) => setChosen(Option.some(key))}
          />
        ))}
        <Pressable
          role="button"
          aria-label="Add verses"
          onPress={() => setOpen('library')}
          style={({ pressed }) => [styles.add, pressed && look.pressed]}
        >
          <Icon source={ICONS.add} size={36} />
          <Text style={styles.addText}>Add verses</Text>
        </Pressable>
        <Text style={styles.caption}>
          First the blade, then the ear, then the full corn. Mark 4:28
        </Text>
      </ScrollView>
      {open === 'settings' && (
        <Sheet title="Settings" onClose={() => setOpen('none')}>
          <Settings home={home} dispatch={dispatch} />
        </Sheet>
      )}
      {open === 'library' && (
        <Sheet title="Add verses" onClose={() => setOpen('none')}>
          {SHELVES.map((shelf) => (
            <View key={shelf.id} style={styles.shelf}>
              <Pressable
                role="button"
                aria-label={shelf.title}
                aria-expanded={shelfOpen === shelf.id}
                onPress={() => setShelfOpen(shelf.id)}
                style={({ pressed }) => [styles.shelfHead, pressed && look.pressed]}
              >
                <Icon source={kindIcon(shelf.kind)} size={28} />
                <View style={styles.shelfText}>
                  <Text style={styles.furrowTitle}>{shelf.title}</Text>
                  <Text style={kit.small}>{shelf.note}</Text>
                </View>
              </Pressable>
              {shelfOpen === shelf.id &&
                shelf.offers.map((offer) => (
                  <OfferRow
                    key={offer.id}
                    shelf={shelf}
                    offer={offer}
                    home={home}
                    dispatch={dispatch}
                  />
                ))}
            </View>
          ))}
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  morning: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 15, fontWeight: '600', color: gold },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  gearText: { fontSize: 20, color: color.ink },
  today: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: color.card,
  },
  summary: { flex: 1, fontSize: 15, fontWeight: '600', color: color.ink },
  furrow: { gap: 6, paddingTop: 6 },
  furrowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  furrowTitle: {
    flex: 1,
    fontFamily: 'Georgia',
    fontSize: 17,
    fontWeight: '600',
    color: color.ink,
  },
  plots: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  plot: { width: 50, alignItems: 'center', paddingVertical: 4, borderRadius: 12 },
  chosenPlot: { backgroundColor: color.card },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: gold },
  noDot: { opacity: 0 },
  number: { fontSize: 11, color: color.ink },
  soil: { height: 3, borderRadius: 2, backgroundColor: ecru, opacity: 0.6 },
  chosenBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: color.ink,
  },
  chosenText: { flex: 1, fontSize: 15, fontWeight: '600', color: color.ink },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    marginTop: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ecru,
  },
  addText: { fontSize: 17, fontWeight: '600', color: color.ink },
  shelf: { gap: 4 },
  shelfHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  shelfText: { flex: 1, gap: 1 },
  caption: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 13,
    color: color.cue,
    textAlign: 'center',
    marginTop: 8,
  },
});
