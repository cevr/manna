/**
 * The home list's tabs under its title (`tabs.ts`): a row of tabs, each a
 * button VoiceOver reads as a tab, the tab in use selected and drawn filled.
 * A tap on another tab chooses it with a `tab` cue, a haptic alone; a tap on
 * the tab in use does nothing. A row too wide for the screen at a large text
 * size scrolls sideways.
 */

import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useCue } from '~/feel/cue';
import { color, useAccent } from '~/color';

import type { TabName } from './tabs';

/** A tab's line of text, the space above and below it, and the space around the row. */
const tabLine = 20;
const tabPadding = 6;
const rowMargin = 8;

/** The row's height at the reader's text size (`fontScale`). */
export const tabRowHeight = (fontScale: number) =>
  Math.ceil(tabLine * fontScale) + 2 * tabPadding + 2 * rowMargin;

export function TabRow({
  names,
  selected,
  onSelect,
}: {
  readonly names: ReadonlyArray<TabName>;
  readonly selected: TabName;
  readonly onSelect: (name: TabName) => void;
}) {
  const cue = useCue();
  const accent = useAccent();
  const choose = (name: TabName) => {
    if (name === selected) return;
    cue({ _tag: 'tab' });
    onSelect(name);
  };
  return (
    <ScrollView
      horizontal
      role="tablist"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {names.map((name) => {
        const chosen = name === selected;
        return (
          <Pressable
            key={name}
            role="tab"
            aria-selected={chosen}
            aria-label={name}
            onPress={() => choose(name)}
            style={({ pressed }) => [
              styles.tab,
              chosen && styles.chosen,
              pressed && !chosen && styles.pressed,
            ]}
          >
            <Text
              style={[styles.name, { color: accent }, chosen && styles.chosenName]}
              numberOfLines={1}
            >
              {name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: rowMargin },
  tab: { paddingHorizontal: 12, paddingVertical: tabPadding, borderRadius: 16 },
  chosen: { backgroundColor: color.soft },
  pressed: { opacity: 0.6 },
  name: { fontSize: 15, lineHeight: tabLine, fontWeight: '600' },
  chosenName: { color: color.ink },
});
