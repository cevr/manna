/**
 * The field's foot, fixed under the scroll view and clear of the home
 * indicator: one card, then `About`. With no verse chosen it is the Begin
 * card (the session's counts line and, while the run shows an item,
 * `Begin`), once a plan is made, or `Begin` alone when the run shows a verse
 * with no plan (the reader's passages unread, so none is made); with a verse
 * chosen it is the chosen card
 * (`<reference> · <stage words>` and, when a tap there starts something,
 * `Start here`, named `Start here with <reference>`). So what starts the run
 * sits in one place, on screen without a scroll.
 */

import { Option } from 'effect';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import type { PlantStage } from '../field';
import { themed, useThemed } from '../look';
import { Control } from './plot';

/** What the chosen card says of each stage. */
const STAGE_WORDS: Readonly<Record<PlantStage, string>> = {
  seed: 'a seed',
  blade: 'a blade',
  ear: 'an ear',
  'full corn': 'full corn',
  'not planted': 'not planted yet',
};

/** The verse chosen on the field: its reference, its stage, and whether a tap on Start here starts it. */
export interface Chosen {
  readonly reference: string;
  readonly stage: PlantStage;
  readonly startable: boolean;
}

/** The foot's one card, then `About`; every control disabled while a remove is pending. */
export function Foot({
  chosen,
  counts,
  begin,
  pending,
  onBegin,
  onStart,
  onAbout,
}: {
  readonly chosen: Option.Option<Chosen>;
  readonly counts: Option.Option<string>;
  readonly begin: boolean;
  readonly pending: boolean;
  readonly onBegin: () => void;
  readonly onStart: (reference: string) => void;
  readonly onAbout: () => void;
}) {
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  return (
    <View testID="foot" style={[styles.foot, { paddingBottom: insets.bottom + 8 }]}>
      {Option.match(chosen, {
        onSome: (verse) => (
          <View testID="chosen" style={styles.card}>
            <Text style={styles.line}>{`${verse.reference} · ${STAGE_WORDS[verse.stage]}`}</Text>
            {verse.startable && (
              <Control
                label={`Start here with ${verse.reference}`}
                shown="Start here"
                strong
                pending={pending}
                onPress={() => onStart(verse.reference)}
              />
            )}
          </View>
        ),
        onNone: () =>
          (Option.isSome(counts) || begin) && (
            <View testID="begin-card" style={styles.card}>
              {Option.match(counts, {
                onNone: () => false,
                onSome: (line) => (
                  <Text testID="counts" style={styles.line}>
                    {line}
                  </Text>
                ),
              })}
              {begin && (
                <Control label="Begin" shown="Begin" strong pending={pending} onPress={onBegin} />
              )}
            </View>
          ),
      })}
      <Control label="About" shown="About" pending={pending} onPress={onAbout} />
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    foot: { paddingHorizontal: 24, paddingTop: 8, gap: 8 },
    card: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: color.card,
    },
    line: { flexShrink: 1, fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
  }),
);
