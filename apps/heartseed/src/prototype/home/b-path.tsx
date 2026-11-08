/**
 * PROTOTYPE, throwaway: variant B, the morning path. Home is today's verses
 * as an ordered path the reader can rearrange (up, down) or start anywhere
 * on, under a sun that rises as the path is tended. The length is one line
 * that cycles the minutes; under the path sit the reader's lists and `Find
 * more verses`, a page of its own; Voice sits at the very foot.
 */

import { Option } from 'effect';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import Animated, {
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { BigButton, color, look } from '../../sayit/draw';
import {
  MINUTES,
  STAGE_WORDS,
  VOICE_WORDS,
  groupOf,
  otherShelves,
  promiseShelves,
  referenceOf,
  ripeIn,
  summaryOf,
  todayOf,
  type Action,
  type Home,
  type Plant,
  type Shelf,
} from './data';
import { ICONS, Icon, OfferRow, Pill, Sprout, ecru, gold, kindIcon, styles as kit } from './kit';

/** The sun over the path: it rises from the horizon as the day's verses are tended. */
function Sunrise({ done, total }: { readonly done: number; readonly total: number }) {
  const risen = useSharedValue(0);
  useEffect(() => {
    risen.value = withSpring(done / Math.max(1, total), {
      damping: 14,
      reduceMotion: ReduceMotion.System,
    });
  }, [done, total, risen]);
  const sunStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 46 - risen.value * 40 }],
  }));
  return (
    <View aria-hidden style={styles.sky}>
      <Animated.View style={sunStyle}>
        <Icon source={ICONS.sun} size={72} />
      </Animated.View>
      <View style={styles.horizon} />
    </View>
  );
}

const placeText = (done: boolean, index: number) => {
  if (done) return '✓';
  return `${index + 1}`;
};

/** One step of the path: its place, its plant, its reference and list; up and down to reorder, a tap to start there. */
function Step({
  home,
  plant,
  index,
  last,
  dispatch,
}: {
  readonly home: Home;
  readonly plant: Plant;
  readonly index: number;
  readonly last: boolean;
  readonly dispatch: (action: Action) => void;
}) {
  const reference = referenceOf(plant);
  const done = home.tended.includes(plant.key);
  const list = Option.match(groupOf(home, plant.key), {
    onNone: () => '',
    onSome: (group) => group.title,
  });
  return (
    <Animated.View
      layout={LinearTransition.springify().reduceMotion(ReduceMotion.System)}
      style={[styles.step, done && styles.doneStep]}
    >
      <View style={styles.rail}>
        <Text style={styles.place}>{placeText(done, index)}</Text>
        {!last && <View style={styles.line} />}
      </View>
      <Pressable
        role="button"
        aria-label={`Start with ${reference}`}
        disabled={done}
        onPress={() => dispatch({ _tag: 'Begun', key: Option.some(plant.key) })}
        style={({ pressed }) => [styles.stepBody, pressed && look.pressed]}
      >
        <Sprout stage={plant.stage} size={36} delay={index * 80} sway={false} />
        <View style={styles.stepText}>
          <Text style={styles.reference}>{reference}</Text>
          <Text style={kit.small}>{`${list} · ${STAGE_WORDS[plant.stage]}`}</Text>
        </View>
      </Pressable>
      {!done && (
        <View style={styles.moves}>
          <Pressable
            role="button"
            aria-label={`Move ${reference} up`}
            onPress={() => dispatch({ _tag: 'Moved', key: plant.key, by: -1 })}
            style={styles.move}
          >
            <Text style={styles.moveText}>↑</Text>
          </Pressable>
          <Pressable
            role="button"
            aria-label={`Move ${reference} down`}
            onPress={() => dispatch({ _tag: 'Moved', key: plant.key, by: 1 })}
            style={styles.move}
          >
            <Text style={styles.moveText}>↓</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const nextMinutes = (home: Home) =>
  MINUTES[(MINUTES.indexOf(home.minutes) + 1) % MINUTES.length] ?? 5;

/** The page of more verses: Psalms, Proverbs and John, then the promise collections by need. */
function Browse({
  home,
  dispatch,
  onBack,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
  readonly onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [promise, setPromise] = useState(() => Option.fromUndefinedOr(promiseShelves[0]));
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <Pressable
        role="button"
        aria-label="Home"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && look.pressed]}
      >
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text role="heading" aria-level={1} style={look.title}>
        Find more verses
      </Text>
      {otherShelves.map((shelf) => (
        <View key={shelf.id} style={styles.section}>
          <View style={styles.sectionHead}>
            <Icon source={kindIcon(shelf.kind)} size={32} />
            <View>
              <Text style={styles.sectionTitle}>{shelf.title}</Text>
              <Text style={kit.small}>{shelf.note}</Text>
            </View>
          </View>
          {shelf.offers.map((offer) => (
            <OfferRow key={offer.id} shelf={shelf} offer={offer} home={home} dispatch={dispatch} />
          ))}
        </View>
      ))}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Icon source={ICONS.bow} size={32} />
          <View>
            <Text style={styles.sectionTitle}>Promises</Text>
            <Text style={kit.small}>For what you face today</Text>
          </View>
        </View>
        <View role="radiogroup" aria-label="Promise collections" style={kit.wrap}>
          {promiseShelves.map((shelf) => {
            const on = Option.exists(promise, (each: Shelf) => each.id === shelf.id);
            return (
              <Pressable
                key={shelf.id}
                role="radio"
                aria-label={shelf.title}
                aria-checked={on}
                onPress={() => setPromise(Option.some(shelf))}
                style={[kit.pill, on && kit.strong]}
              >
                <Text style={[kit.pillText, on && kit.strongText]}>{shelf.title}</Text>
              </Pressable>
            );
          })}
        </View>
        {Option.match(promise, {
          onNone: () => false,
          onSome: (open) =>
            open.offers.map((offer) => (
              <OfferRow key={offer.id} shelf={open} offer={offer} home={home} dispatch={dispatch} />
            )),
        })}
      </View>
    </ScrollView>
  );
}

export function PathHome({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<'home' | 'browse'>('home');
  const today = todayOf(home);
  const done = today.filter((each) => home.tended.includes(each.key)).length;
  if (page === 'browse')
    return (
      <View style={look.screen}>
        <Browse home={home} dispatch={dispatch} onBack={() => setPage('home')} />
      </View>
    );
  return (
    <View style={look.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 4 }]}>
        <Sunrise done={done} total={today.length} />
        <Text role="heading" aria-level={1} style={styles.greeting}>
          Good morning
        </Text>
        <Text testID="summary" style={styles.summary}>
          {summaryOf(home)}
        </Text>
        <Pressable
          role="button"
          aria-label="Length"
          aria-valuetext={`${home.minutes} min`}
          onPress={() => dispatch({ _tag: 'MinutesChosen', minutes: nextMinutes(home) })}
          style={({ pressed }) => [styles.length, pressed && look.pressed]}
        >
          <Text style={kit.small}>{`Today's length: ${home.minutes} min · tap to change`}</Text>
        </Pressable>
        <View style={styles.path}>
          {today.map((each, index) => (
            <Step
              key={each.key}
              home={home}
              plant={each}
              index={index}
              last={index === today.length - 1}
              dispatch={dispatch}
            />
          ))}
        </View>
        {done < today.length && (
          <BigButton
            label="Begin"
            busy={false}
            pressable
            onPress={() => dispatch({ _tag: 'Begun', key: Option.none() })}
          />
        )}
        <Text role="heading" aria-level={2} style={styles.sectionTitle}>
          Your lists
        </Text>
        {home.groups.map((group) => (
          <View key={group.id} style={styles.list}>
            <Icon source={kindIcon(group.kind)} size={32} />
            <View style={styles.stepText}>
              <Text style={styles.reference}>{group.title}</Text>
              <Text
                style={kit.small}
              >{`${group.plants.length} verses · ${ripeIn(group)} full corn`}</Text>
            </View>
          </View>
        ))}
        <Pressable
          role="button"
          aria-label="Find more verses"
          onPress={() => setPage('browse')}
          style={({ pressed }) => [styles.list, styles.more, pressed && look.pressed]}
        >
          <Icon source={ICONS.add} size={32} />
          <Text style={styles.reference}>Find more verses</Text>
        </Pressable>
        <View style={styles.foot}>
          <Pill
            label="Voice"
            shown={`Voice: ${VOICE_WORDS[home.voice]}`}
            strong={false}
            onPress={() => dispatch({ _tag: 'VoiceCycled' })}
          />
          <Text style={kit.small}>Natural voice: waiting for a connection</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120, gap: 12 },
  sky: { height: 72, alignItems: 'center', overflow: 'hidden' },
  horizon: {
    position: 'absolute',
    bottom: 0,
    left: 40,
    right: 40,
    height: 2,
    backgroundColor: ecru,
  },
  greeting: {
    fontFamily: 'Georgia',
    fontSize: 32,
    fontWeight: '600',
    color: color.ink,
    textAlign: 'center',
  },
  summary: { fontSize: 15, fontWeight: '600', color: color.ink, textAlign: 'center' },
  length: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  path: { gap: 0, marginTop: 4 },
  step: { flexDirection: 'row', alignItems: 'stretch', gap: 8, minHeight: 64 },
  doneStep: { opacity: 0.55 },
  rail: { width: 28, alignItems: 'center' },
  place: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 13,
    fontWeight: '700',
    color: color.ground,
    backgroundColor: gold,
  },
  line: { flex: 1, width: 2, backgroundColor: ecru, marginVertical: 2 },
  stepBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  stepText: { flex: 1, gap: 2 },
  reference: { fontFamily: 'Georgia', fontSize: 17, fontWeight: '600', color: color.ink },
  moves: { flexDirection: 'row' },
  move: { width: 44, height: 56, alignItems: 'center', justifyContent: 'center' },
  moveText: { fontSize: 20, color: color.ink },
  sectionTitle: {
    fontFamily: 'Georgia',
    fontSize: 21,
    fontWeight: '600',
    color: color.ink,
    marginTop: 8,
  },
  list: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: color.card,
  },
  more: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: ecru,
    borderStyle: 'dashed',
  },
  foot: { gap: 6, marginTop: 16, alignItems: 'flex-start' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 17, fontWeight: '600', color: color.ink },
  section: { gap: 6, marginTop: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
