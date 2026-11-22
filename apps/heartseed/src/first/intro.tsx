/**
 * The two screens before the first verse, drawn by the first minute for
 * its `welcome` and `grows` phases and by the root for the replay. Each has
 * one heading and a scroll view of its words, its controls fixed under the
 * scroll view, clear of the home indicator.
 *
 * - The welcome: the growing seed (`./growing`), the heading `Heartseed`,
 *   the line `Plant a verse. Say it from memory. Watch it grow.`, on the
 *   first run alone `Your first verse` over the passage's reference, then
 *   the filled `Begin` and the quiet `Skip`.
 * - How it grows: the four stages drawn still over their names, the
 *   heading `Every verse is a plant`, its line, the reference Mark 4:28,
 *   and one filled button: `Plant your first verse` on the first run,
 *   `See your field` in the replay.
 *
 * Neither writes, reads aloud, listens, sounds or ticks: their taps go to
 * the caller alone.
 */

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import { Control, DRAWN, Icon } from '../field/plot';
import { STAGES } from '../garden';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import { GrowingSeed } from './growing';
import { GROWS, ONWARD, WELCOME, type IntroRun } from './words';

export type { IntroRun } from './words';

/** A small round-cornered button on the card's fill, never filled in ink: the first minute's Next and Continue, and home's Got it. */
export function Pill({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && look.pressed]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

/** One screen: its heading and words in a scroll view, its controls fixed under it. */
function IntroScreen({
  heading,
  children,
  controls,
}: {
  readonly heading: string;
  readonly children: ReactNode;
  readonly controls: ReactNode;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  return (
    <View style={look.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[look.content, { paddingTop: insets.top + 24, paddingBottom: 16 }]}
      >
        <Text role="heading" aria-level={1} style={look.title}>
          {heading}
        </Text>
        {children}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>{controls}</View>
    </View>
  );
}

/** The welcome: `onBegin` goes on to how a verse grows, `onSkip` past it. */
export function Welcome({
  run,
  onBegin,
  onSkip,
}: {
  readonly run: IntroRun;
  readonly onBegin: () => void;
  readonly onSkip: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <IntroScreen
      heading={WELCOME.heading}
      controls={
        <>
          <Control
            label={WELCOME.begin}
            shown={WELCOME.begin}
            strong
            wide
            pending={false}
            onPress={onBegin}
          />
          <Pressable
            role="button"
            aria-label={WELCOME.skip}
            onPress={onSkip}
            style={({ pressed }) => [styles.skip, pressed && look.pressed]}
          >
            <Text style={styles.skipText}>{WELCOME.skip}</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.seed}>
        <GrowingSeed />
      </View>
      <Text style={styles.words}>{WELCOME.line}</Text>
      {run === 'first' && (
        <View style={styles.first}>
          <Text style={styles.quiet}>{WELCOME.first}</Text>
          <Text testID="reference" style={look.reference}>
            {passage.reference}
          </Text>
        </View>
      )}
    </IntroScreen>
  );
}

/** How a verse grows: `onOn` is its one button's tap, which plants the first verse on the first run and shows the field in the replay. */
export function Grows({ run, onOn }: { readonly run: IntroRun; readonly onOn: () => void }) {
  const styles = useThemed(sheets);
  const label = ONWARD[run];
  return (
    <IntroScreen
      heading={GROWS.heading}
      controls={<Control label={label} shown={label} strong wide pending={false} onPress={onOn} />}
    >
      <View style={styles.stages}>
        {STAGES.map((stage) => (
          <View key={stage} style={styles.stage}>
            <Icon name={DRAWN[stage]} size={40} />
            <Text style={styles.stageName}>{stage}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.words}>{GROWS.line}</Text>
      <Text style={styles.caption}>{GROWS.caption}</Text>
    </IntroScreen>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    foot: { paddingHorizontal: 24, paddingTop: 12, gap: 8, alignItems: 'stretch' },
    words: { fontFamily: face, fontSize: 20, lineHeight: 28, color: color.ink },
    seed: { alignItems: 'center' },
    first: { gap: 4 },
    quiet: { fontFamily: face, fontSize: 15, color: color.quiet },
    skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    skipText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.quiet },
    stages: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
    stage: { alignItems: 'center', gap: 6, minWidth: 64 },
    stageName: { fontFamily: face, fontSize: 15, color: color.ink },
    caption: { fontFamily: face, fontStyle: 'italic', fontSize: 15, color: color.ink },
    pill: {
      minHeight: 44,
      paddingHorizontal: 22,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      backgroundColor: color.card,
    },
    pillText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
  }),
);
