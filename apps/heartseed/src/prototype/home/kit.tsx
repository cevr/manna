/**
 * PROTOTYPE, throwaway (branch hymnapp/hshome-proto): what the home
 * variants share. The icons (hand-drawn stand-ins, `assets/prototype`), the
 * plant that grows up out of its soil, the floating variant switcher, a
 * bottom sheet, the reader's settings (Voice and minutes) and the run, a
 * stand-in for Say it where `Said it` grows the plant a stage.
 */

import { Option } from 'effect';
import { useEffect, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import add from '../../../assets/prototype/add.png';
import blade from '../../../assets/prototype/blade.png';
import bow from '../../../assets/prototype/bow.png';
import corn from '../../../assets/prototype/corn.png';
import ear from '../../../assets/prototype/ear.png';
import harp from '../../../assets/prototype/harp.png';
import lamp from '../../../assets/prototype/lamp.png';
import scroll from '../../../assets/prototype/scroll.png';
import seed from '../../../assets/prototype/seed.png';
import sun from '../../../assets/prototype/sun.png';
import { color, look } from '../../sayit/draw';
import {
  MINUTES,
  STAGE_WORDS,
  VOICE_WORDS,
  groupOf,
  leftOf,
  plantOf,
  referenceOf,
  textOf,
  type Action,
  type Home,
  type Kind,
  type Offer,
  type Plant,
  type Shelf,
  type Stage,
  offerReference,
  held,
} from './data';

const dev = __DEV__;

export const ICONS = { add, blade, bow, corn, ear, harp, lamp, scroll, seed, sun } as const;

export const gold = '#b8892f';
export const ecru = '#c2ae93';

const STAGE_ICONS: Readonly<Record<Stage, number>> = {
  new: seed,
  seed,
  blade,
  ear,
  'full corn': corn,
};

const KIND_ICONS: Readonly<Record<Kind, number>> = {
  psalms: harp,
  proverbs: lamp,
  promises: bow,
  gospel: scroll,
  own: scroll,
};

export const kindIcon = (kind: Kind) => KIND_ICONS[kind];

/** An icon, hidden from the screen reader. */
export function Icon({ source, size }: { readonly source: number; readonly size: number }) {
  return <Image aria-hidden source={source} style={{ width: size, height: size }} />;
}

const SPRING = { damping: 11, stiffness: 120, reduceMotion: ReduceMotion.System };

const AIR = {
  duration: 1800,
  easing: Easing.inOut(Easing.sin),
  reduceMotion: ReduceMotion.System,
};

/**
 * A plant drawn at `stage`: it grows up out of its soil when it first shows
 * and again whenever its stage changes, `delay` ms after; full corn sways a
 * little in the morning air when `sway` is on. A piece not yet planted is
 * its seed, faint.
 */
export function Sprout({
  stage,
  size,
  delay,
  sway,
}: {
  readonly stage: Stage;
  readonly size: number;
  readonly delay: number;
  readonly sway: boolean;
}) {
  const grown = useSharedValue(0);
  const air = useSharedValue(0);
  useEffect(() => {
    grown.value = 0;
    grown.value = withDelay(delay, withSpring(1, SPRING));
  }, [stage, delay, grown]);
  useEffect(() => {
    if (!sway || stage !== 'full corn') return;
    air.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, AIR), withTiming(-1, AIR)), -1, true),
    );
  }, [sway, stage, delay, air]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, grown.value * 1.6),
    transform: [
      { translateY: (1 - grown.value) * size * 0.25 },
      { scaleY: 0.2 + grown.value * 0.8 },
      { rotate: `${air.value * 3}deg` },
    ],
  }));
  return (
    <Animated.View
      aria-hidden
      style={[{ width: size, height: size, transformOrigin: 'bottom' }, style]}
    >
      <Image
        source={STAGE_ICONS[stage]}
        style={[{ width: size, height: size }, stage === 'new' && styles.faint]}
      />
    </Animated.View>
  );
}

/** A pill button, at least 44 pt tall: filled in ink when `strong`, else on the card. */
export function Pill({
  label,
  shown,
  strong,
  onPress,
}: {
  readonly label: string;
  readonly shown: string;
  readonly strong: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, strong && styles.strong, pressed && look.pressed]}
    >
      <Text style={[styles.pillText, strong && styles.strongText]}>{shown}</Text>
    </Pressable>
  );
}

/** A variant's key and name, for the switcher. */
export interface Variant {
  readonly key: string;
  readonly name: string;
}

/** The floating bar that flips between the variants: high contrast, so it reads as the prototype's, not the design's. Development builds only. */
export function Switcher({
  variants,
  current,
  onChange,
  lift,
}: {
  readonly variants: readonly Variant[];
  readonly current: number;
  readonly onChange: (index: number) => void;
  readonly lift: number;
}) {
  const insets = useSafeAreaInsets();
  if (!dev) return false;
  const shown = variants[current];
  const step = (by: number) => onChange((current + by + variants.length) % variants.length);
  return (
    <View
      pointerEvents="box-none"
      style={[styles.switchPlace, { bottom: insets.bottom + 8 + lift }]}
    >
      <View style={styles.switcher}>
        <Pressable
          role="button"
          aria-label="Previous variant"
          hitSlop={8}
          onPress={() => step(-1)}
          style={styles.arrow}
        >
          <Text style={styles.switchText}>‹</Text>
        </Pressable>
        <Text testID="variant" style={styles.switchLabel}>
          {`${shown?.key.toUpperCase() ?? '?'} · ${shown?.name ?? ''}`}
        </Text>
        <Pressable
          role="button"
          aria-label="Next variant"
          hitSlop={8}
          onPress={() => step(1)}
          style={styles.arrow}
        >
          <Text style={styles.switchText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A sheet over the screen, rising from the bottom: its title, `Done`, and its content scrolling. The rest of the screen is hidden from the screen reader while it shows. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.sheetPlace} accessibilityViewIsModal>
      <Pressable aria-label="Close" role="button" onPress={onClose} style={StyleSheet.absoluteFill}>
        <Animated.View entering={FadeIn.duration(200)} style={styles.scrim} />
      </Pressable>
      <Animated.View
        entering={SlideInDown.springify().damping(18).reduceMotion(ReduceMotion.System)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 12, maxHeight: '86%' }]}
      >
        <View style={styles.sheetHead}>
          <Text role="heading" aria-level={2} style={styles.sheetTitle}>
            {title}
          </Text>
          <Pill label="Done" shown="Done" strong={false} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
      </Animated.View>
    </View>
  );
}

/** The reader's settings, out of the way of the day: the session's length and the voice for new verses. */
export function Settings({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  return (
    <View style={styles.settings}>
      <Text style={styles.label}>A day's tending</Text>
      <View role="radiogroup" aria-label="Minutes" style={styles.wrap}>
        {MINUTES.map((each) => (
          <Pressable
            key={each}
            role="radio"
            aria-label={`${each} min`}
            aria-checked={home.minutes === each}
            onPress={() => dispatch({ _tag: 'MinutesChosen', minutes: each })}
            style={({ pressed }) => [
              styles.pill,
              home.minutes === each && styles.strong,
              pressed && look.pressed,
            ]}
          >
            <Text style={[styles.pillText, home.minutes === each && styles.strongText]}>
              {`${each} min`}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Reads new verses aloud</Text>
      <Pill
        label="Voice"
        shown={`Voice: ${VOICE_WORDS[home.voice]}`}
        strong={home.voice !== 'off'}
        onPress={() => dispatch({ _tag: 'VoiceCycled' })}
      />
      <Text style={styles.small}>Natural voice: waiting for a connection</Text>
    </View>
  );
}

const versesText = (verses: number) => {
  if (verses === 1) return '1 verse';
  return `${verses} verses`;
};

/** One library passage with its way in: `Plant` while it is not in the garden, else `In your field`. */
export function OfferRow({
  shelf,
  offer,
  home,
  dispatch,
}: {
  readonly shelf: Shelf;
  readonly offer: Offer;
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const reference = offerReference(offer);
  const verses = offer.range.last - offer.range.first + 1;
  const planted = held(home, offer);
  return (
    <View style={styles.offer}>
      <View style={styles.offerText}>
        <Text style={styles.offerTitle}>{reference}</Text>
        <Text style={styles.small}>{versesText(verses)}</Text>
      </View>
      {planted && <Text style={styles.small}>In your field</Text>}
      {!planted && (
        <Pill
          label={`Plant ${reference}`}
          shown="Plant"
          strong={false}
          onPress={() => dispatch({ _tag: 'Added', shelf, offer })}
        />
      )}
    </View>
  );
}

/** How the run shows a verse under the cue its stage gives: whole for a new verse or a seed, first letters for a blade, a line for an ear and full corn. */
const cued = (each: Plant) => {
  const text = textOf(each);
  if (each.stage === 'new' || each.stage === 'seed') return text;
  if (each.stage === 'blade')
    return text
      .split(' ')
      .map((word) => word.replace(/^(\W*\w)\w*/u, '$1'))
      .join(' ');
  return '';
};

/** The run's end: what grew today, each plant growing in turn. */
function Tended({ home, onHome }: { readonly home: Home; readonly onHome: () => void }) {
  const grown = home.grown.flatMap((key) => Option.toArray(plantOf(home, key)));
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.tended}>
      <Icon source={sun} size={72} />
      <Text role="heading" aria-level={1} style={styles.runTitle}>
        The field is tended
      </Text>
      <Text style={styles.runNote}>{`${grown.length} grew a stage this morning.`}</Text>
      <View style={styles.wrap}>
        {grown.map((each, index) => (
          <View key={each.key} style={styles.grownPlot}>
            <Sprout stage={each.stage} size={44} delay={300 + index * 160} sway />
            <Text style={styles.tiny}>{referenceOf(each)}</Text>
          </View>
        ))}
      </View>
      <Pill label="Home" shown="Home" strong onPress={onHome} />
    </Animated.View>
  );
}

/** The run over the screen, while one is under way: one verse at a time, `Said it` grows it, `Not now` sends it to the end; then what grew. */
export function Run({
  home,
  dispatch,
}: {
  readonly home: Home;
  readonly dispatch: (action: Action) => void;
}) {
  const insets = useSafeAreaInsets();
  if (Option.isNone(home.run)) return false;
  const left = leftOf(home);
  const current = Option.fromUndefinedOr(left[home.run.value]);
  const end = () => dispatch({ _tag: 'Ended' });
  return (
    <View
      accessibilityViewIsModal
      style={[styles.run, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}
    >
      <View style={styles.runBar}>
        <Pill label="Close" shown="Close" strong={false} onPress={end} />
        <Text style={styles.small}>{`${left.length} left`}</Text>
      </View>
      {Option.match(current, {
        onNone: () => <Tended home={home} onHome={end} />,
        onSome: (shown) => <Verse home={home} current={shown} dispatch={dispatch} />,
      })}
    </View>
  );
}

/** The verse the run shows, under its stage's cue, with `Said it` and `Not now`. */
function Verse({
  home,
  current,
  dispatch,
}: {
  readonly home: Home;
  readonly current: Plant;
  readonly dispatch: (action: Action) => void;
}) {
  return (
    <Animated.View key={current.key} entering={FadeIn.duration(250)} style={styles.runBody}>
      <Sprout stage={current.stage} size={88} delay={0} sway />
      <Text testID="run-reference" style={styles.runTitle}>
        {referenceOf(current)}
      </Text>
      <Text style={styles.small}>
        {`${Option.match(groupOf(home, current.key), {
          onNone: () => '',
          onSome: (group) => group.title,
        })} · ${STAGE_WORDS[current.stage]}`}
      </Text>
      <Text style={styles.verse}>{cued(current)}</Text>
      <View style={styles.runActions}>
        <Pill
          label="Said it"
          shown="Said it"
          strong
          onPress={() => dispatch({ _tag: 'Said', key: current.key })}
        />
        <Pill
          label="Not now"
          shown="Not now"
          strong={false}
          onPress={() => dispatch({ _tag: 'Passed', key: current.key })}
        />
      </View>
      <Text style={styles.small}>Prototype: Said it stands in for Say it.</Text>
    </Animated.View>
  );
}

export const styles = StyleSheet.create({
  faint: { opacity: 0.35 },
  pill: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
    alignSelf: 'flex-start',
  },
  strong: { backgroundColor: color.ink },
  pillText: { fontSize: 15, fontWeight: '600', color: color.ink },
  strongText: { color: color.ground },
  switchPlace: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    borderRadius: 24,
    backgroundColor: '#111',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  switchText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  switchLabel: { color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: 220 },
  sheetPlace: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  scrim: { flex: 1, backgroundColor: 'rgba(6, 79, 110, 0.28)' },
  sheet: {
    backgroundColor: color.ground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  sheetTitle: { fontFamily: 'Georgia', fontSize: 24, fontWeight: '600', color: color.ink },
  sheetBody: { paddingHorizontal: 24, paddingBottom: 16, gap: 12 },
  settings: { gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: color.cue, marginTop: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { fontSize: 13, lineHeight: 18, color: color.cue },
  tiny: { fontSize: 11, color: color.cue, textAlign: 'center' },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ecru,
  },
  offerText: { flex: 1, gap: 2 },
  offerTitle: { fontFamily: 'Georgia', fontSize: 17, fontWeight: '600', color: color.ink },
  run: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.ground,
    paddingHorizontal: 24,
    gap: 16,
  },
  runBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  runBody: { flex: 1, alignItems: 'center', gap: 12, paddingTop: 24 },
  runTitle: {
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '600',
    color: color.ink,
    textAlign: 'center',
  },
  runNote: { fontSize: 15, color: color.ink, textAlign: 'center' },
  verse: {
    fontFamily: 'Georgia',
    fontSize: 21,
    lineHeight: 31,
    color: color.ink,
    textAlign: 'center',
    minHeight: 100,
  },
  runActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  tended: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  grownPlot: { width: 76, alignItems: 'center', gap: 2 },
});
