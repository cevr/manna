/**
 * The reader's settings, in the player sheet: the words' size on a dial of
 * steps, their font, the space between lines, and whether the screen stays
 * on while a hymn is shown. Each choice is kept under its `reading.*` key
 * and the page behind the sheet follows it at once.
 */

import { useAtom } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import { Pressable, StyleSheet, Switch, Text, type TextStyle, View } from 'react-native';

import type { ReadingSettings } from '~/settings';
import { color, useAccent } from '~/color';
import { DialView } from '~/player/DialView';

import { pageTextOf } from './pageText';
import {
  DEFAULT_SIZE,
  defaultReading,
  type Font,
  pointsAt,
  readingStyle,
  SIZES,
  type Spacing,
} from './reading';

export function ReadingControls({ reading }: { readonly reading: ReadingSettings }) {
  return (
    <View role="group" aria-label="Reading" style={styles.page}>
      <TextSize size={reading.size} />
      <Heading>Font</Heading>
      <Choices label="Font" value={reading.font} choices={fonts} />
      <Heading>Line spacing</Heading>
      <Choices label="Line spacing" value={reading.spacing} choices={spacings} />
      <Awake awake={reading.awake} />
    </View>
  );
}

/** Each font, its name drawn in its own face. */
const fonts: ReadonlyArray<Choice<Font>> = [
  { value: 'system', label: 'System', style: {} },
  {
    value: 'serif',
    label: 'Serif',
    style: pageTextOf(readingStyle({ ...defaultReading, font: 'serif' }, 1)).words,
  },
];

const spacings: ReadonlyArray<Choice<Spacing>> = [
  { value: 'compact', label: 'Compact', style: {} },
  { value: 'normal', label: 'Normal', style: {} },
  { value: 'roomy', label: 'Roomy', style: {} },
];

/** The size as a share of the page's first size: 100% as it has always been. */
const shareOf = (size: number) =>
  `${Math.round((pointsAt(size) / (SIZES[DEFAULT_SIZE] ?? 17)) * 100)}%`;

/**
 * The words' size, a stopping dial over the steps, each drawn as an "A" of
 * its size (held to the dial's height), the share read out.
 */
function TextSize({ size }: { readonly size: Atom.Writable<number> }) {
  const [step, setStep] = useAtom(size);
  return (
    <DialView
      testID="dial-size"
      label="Text size"
      title="SIZE"
      stops={SIZES}
      index={step}
      wrap={false}
      said={shareOf(step)}
      drawStop={(points, current) => <SizeMark points={points} current={current} />}
      onTurn={(to) => setStep(Math.min(Math.max(to, 0), SIZES.length - 1))}
    />
  );
}

function SizeMark({ points, current }: { readonly points: number; readonly current: boolean }) {
  const accent = useAccent();
  return (
    <Text
      aria-hidden
      style={[styles.size, { fontSize: Math.min(points, 26) }, current && { color: accent }]}
    >
      A
    </Text>
  );
}

function Heading({ children }: { readonly children: string }) {
  return (
    <Text role="heading" aria-level={2} style={styles.heading} dynamicTypeRamp="footnote">
      {children}
    </Text>
  );
}

interface Choice<A extends string> {
  readonly value: A;
  readonly label: string;
  readonly style: TextStyle;
}

/** A radio group: one row per choice, the chosen one checked. */
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
  return (
    <View role="radiogroup" aria-label={label} style={styles.group}>
      {choices.map((choice, k) => (
        <Pressable
          key={choice.value}
          role="radio"
          aria-label={choice.label}
          aria-checked={chosen === choice.value}
          onPress={() => choose(choice.value)}
          style={({ pressed }) => [styles.row, k > 0 && styles.divided, pressed && styles.pressed]}
        >
          <Text style={[styles.label, choice.style, styles.labelSize]} dynamicTypeRamp="body">
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

function Awake({ awake }: { readonly awake: Atom.Writable<boolean> }) {
  const [on, setOn] = useAtom(awake);
  return (
    <View style={[styles.group, styles.row, styles.awake]}>
      <Text style={styles.label} dynamicTypeRamp="body" aria-hidden>
        Keep screen on
      </Text>
      {/* React Native's Switch hands iOS no `aria-label`; it reads `accessibilityLabel` on every platform. */}
      <Switch accessibilityLabel="Keep screen on" value={on} onValueChange={setOn} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 8 },
  heading: {
    marginTop: 8,
    marginLeft: 16,
    fontSize: 13,
    color: color.muted,
    textTransform: 'uppercase',
  },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  size: { fontWeight: '600', color: color.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  awake: { marginTop: 16, paddingVertical: 6 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  pressed: { backgroundColor: color.soft },
  label: { flex: 1, fontSize: 17, color: color.ink },
  labelSize: { fontSize: 17, lineHeight: 22 },
  check: { fontSize: 17, fontWeight: '600' },
});
