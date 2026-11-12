/**
 * Home's card, fixed above the scroll view under the greeting: the Today
 * card (`id=today-card`), or nothing: the day's headline and parts once a
 * plan is made, and its one filled, full-width button, `Start` or
 * `Practice anyway`, when it offers one. A tap on a plant starts its verse
 * at once (`./screen`), so no card stands between a plant and Today
 * (owner, 2026-11-12), and what starts the day sits in one place, first on
 * the screen.
 */

import { Option } from 'effect';
import { StyleSheet, Text, View } from 'react-native';

import type { TodayCard } from '../home/today';
import { themed, useThemed } from '../look';
import { Control } from './plot';

/** What a tap on a plant starts: a review (`Practice`) or the verse learned new (`Learn`). */
export type StartKind = 'Practice' | 'Learn';

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
