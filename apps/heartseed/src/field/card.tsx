/**
 * Home's card, fixed above the scroll view under the greeting: one card,
 * or nothing. With no verse chosen it is the Today card (`id=today-card`):
 * the day's headline and parts once a plan is made, and its one filled,
 * full-width button, `Start` or `Practice anyway`, when it offers one.
 * With a verse chosen it is the chosen card (`<reference> · <stage
 * words>`) and, when a tap there starts something, `Practice this verse`
 * (named `Practice <reference>`) for a review or `Learn this verse` (named
 * `Learn <reference>`) for a verse learned new. So what starts a recital
 * sits in one place, first on the screen.
 */

import { Option } from 'effect';
import { StyleSheet, Text, View } from 'react-native';

import type { PlantStage } from '../field';
import type { TodayCard } from '../home/today';
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

/** What a tap on the chosen verse starts: a review (`Practice`) or the verse learned new (`Learn`). */
export type StartKind = 'Practice' | 'Learn';

/** The verse chosen on the field: its reference, its stage, and what a tap there starts, if anything. */
export interface Chosen {
  readonly reference: string;
  readonly stage: PlantStage;
  readonly starts: Option.Option<StartKind>;
}

/** The Today card: its lines once a plan is made, and `Start` or `Practice anyway` when it offers one; nothing when it holds neither. */
export function TodayCardView({
  card,
  pending,
  onToday,
  onStart,
}: {
  readonly card: TodayCard;
  readonly pending: boolean;
  readonly onToday: () => void;
  readonly onStart: (verse: string) => void;
}) {
  const styles = useThemed(sheets);
  if (Option.isNone(card.headline) && card.action._tag === 'None') return false;
  return (
    <View testID="today-card" style={styles.card}>
      {Option.match(card.headline, {
        onNone: () => false,
        onSome: (line) => (
          <Text testID="today-headline" style={styles.headline}>
            {line}
          </Text>
        ),
      })}
      {Option.match(card.parts, {
        onNone: () => false,
        onSome: (line) => (
          <Text testID="today-parts" style={styles.parts}>
            {line}
          </Text>
        ),
      })}
      <TodayAction card={card} pending={pending} onToday={onToday} onStart={onStart} />
    </View>
  );
}

/** The Today card's one button, by its action. */
function TodayAction({
  card,
  pending,
  onToday,
  onStart,
}: {
  readonly card: TodayCard;
  readonly pending: boolean;
  readonly onToday: () => void;
  readonly onStart: (verse: string) => void;
}) {
  const { action } = card;
  if (action._tag === 'Start')
    return <Control label="Start" shown="Start" strong wide pending={pending} onPress={onToday} />;
  if (action._tag === 'PracticeAnyway')
    return (
      <Control
        label="Practice anyway"
        shown="Practice anyway"
        strong
        wide
        pending={pending}
        onPress={() => onStart(action.verse)}
      />
    );
  return false;
}

/** The chosen card: the verse and its stage, and `Practice this verse` or `Learn this verse` when a tap there starts it. */
export function ChosenCard({
  verse,
  pending,
  onStart,
}: {
  readonly verse: Chosen;
  readonly pending: boolean;
  readonly onStart: (verse: string) => void;
}) {
  const styles = useThemed(sheets);
  return (
    <View testID="chosen" style={styles.card}>
      <Text style={styles.headline}>{`${verse.reference} · ${STAGE_WORDS[verse.stage]}`}</Text>
      {Option.match(verse.starts, {
        onNone: () => false,
        onSome: (kind) => (
          <Control
            label={`${kind} ${verse.reference}`}
            shown={`${kind} this verse`}
            strong
            wide
            pending={pending}
            onPress={() => onStart(verse.reference)}
          />
        ),
      })}
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    card: {
      gap: 8,
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: color.card,
    },
    headline: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    parts: { fontFamily: face, fontSize: 15, color: color.ink },
  }),
);
