import { useAtom, useAtomValue } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  type TextStyle,
  View,
} from 'react-native';
import { useRouter } from 'one';

import { About } from '~/about';
import { plain, useCue } from '~/feel/cue';
import type { ChordStyle } from '~/hymns/simple';
import type { Appearance } from '~/settings';
import { settings } from '~/store';
import { color, useAccent } from '~/color';
import { placements } from '~/settings';
import { Downloads } from '~/offline/Downloads';
import { chordsCue } from '~/player/thumb';
import { available } from '~/tuner/native';

interface Choice<A extends string> {
  readonly value: A;
  readonly label: string;
}

const appearances: ReadonlyArray<Choice<Appearance>> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const chordStyles: ReadonlyArray<Choice<ChordStyle>> = [
  { value: 'simple', label: 'Simple' },
  { value: 'advanced', label: 'Advanced' },
];

export default function Settings() {
  const chords = useAtomValue(settings.chords);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text role="heading" aria-level={1} style={styles.title}>
        Settings
      </Text>
      <Heading>Appearance</Heading>
      <Choices label="Appearance" value={settings.appearance} choices={appearances} />
      <Heading style={styles.section}>Chords</Heading>
      <ChordsSwitch />
      {chords && (
        <>
          <Choices label="Chord style" value={settings.chordStyle} choices={chordStyles} />
          <Heading style={styles.section}>Chord placement</Heading>
          <Choices label="Chord placement" value={settings.placement} choices={placements} />
        </>
      )}
      <FeelSwitch />
      {chords && available && <TunerRow />}
      <Downloads />
      <About />
    </ScrollView>
  );
}

function Heading({ children, style }: { readonly children: string; readonly style?: TextStyle }) {
  return (
    <Text role="heading" aria-level={2} style={[styles.heading, style]} dynamicTypeRamp="footnote">
      {children}
    </Text>
  );
}

function Choices<A extends string>({
  label,
  value,
  choices,
}: {
  readonly label: string;
  readonly value: Atom.Writable<A>;
  readonly choices: ReadonlyArray<Choice<A>>;
}) {
  const [chosen, choose] = useAtom(value);
  const accent = useAccent();
  const cue = useCue();
  return (
    <View role="radiogroup" aria-label={label} style={styles.group}>
      {choices.map((choice, k) => (
        <Pressable
          key={choice.value}
          role="radio"
          aria-label={choice.label}
          aria-checked={chosen === choice.value}
          onPress={() => {
            cue(plain('choose'));
            choose(choice.value);
          }}
          style={({ pressed }) => [styles.row, k > 0 && styles.divided, pressed && styles.pressed]}
        >
          <Text style={styles.label} dynamicTypeRamp="body">
            {choice.label}
          </Text>
          <Text style={[styles.check, { color: accent }]} aria-hidden>
            {chosen === choice.value && '✓'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function FeelSwitch() {
  const [on, setOn] = useAtom(settings.feel);
  const cue = useCue();
  const turn = (to: boolean) => {
    setOn(to);
    if (to) cue(plain('switch-on'));
  };
  return (
    <View style={[styles.group, styles.row, styles.section]}>
      <Text style={styles.label} dynamicTypeRamp="body" aria-hidden>
        Sounds and haptics
      </Text>
      {}
      <Switch accessibilityLabel="Sounds and haptics" value={on} onValueChange={turn} />
    </View>
  );
}

function ChordsSwitch() {
  const [on, setOn] = useAtom(settings.chords);
  const cue = useCue();
  const turn = (to: boolean) => {
    setOn(to);
    cue(chordsCue(to));
  };
  return (
    <View style={[styles.group, styles.row]}>
      <Text style={styles.label} dynamicTypeRamp="body" aria-hidden>
        Chords
      </Text>
      <Switch accessibilityLabel="Chords" value={on} onValueChange={turn} />
    </View>
  );
}

function TunerRow() {
  const router = useRouter();
  return (
    <Pressable
      role="button"
      aria-label="Tuner"
      onPress={() => router.push('/tuner')}
      style={({ pressed }) => [styles.group, styles.row, styles.section, pressed && styles.pressed]}
    >
      <Text style={styles.label} dynamicTypeRamp="body">
        Tuner
      </Text>
      <Text style={styles.chevron} aria-hidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 24, gap: 8 },
  title: { marginBottom: 8, fontSize: 28, fontWeight: '700', color: color.ink },
  heading: {
    marginLeft: 16,
    fontSize: 13,
    color: color.muted,
    textTransform: 'uppercase',
  },
  section: { marginTop: 16 },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  pressed: { backgroundColor: color.soft },
  label: { flex: 1, fontSize: 17, color: color.ink },
  check: { fontSize: 17, fontWeight: '600' },
  chevron: { fontSize: 22, color: color.muted },
});
