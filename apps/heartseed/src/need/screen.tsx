/**
 * When I need… as the reader meets it: the root's fifth screen, opened from
 * Today's `When I need…`. A bar fixed above the scroll view holds the one
 * way back, `‹ Today`, so it is on screen without a scroll; the scroll view
 * holds the one heading, then a card per collection `needOf` gives, in its
 * order: the collection's title as plain text (never a heading), each
 * promise the reader knows as a button named by its reference, and on a
 * taught card the count of its promises still to learn. A tap on a promise
 * hands it to `onVisit`. Every text is the scheme's ink, on the ground or on
 * a card, so each reads at WCAG AA; every control is at least 44 pt. It
 * reads and writes nothing in the store.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import type { NeedCard } from '../need';
import { passageReference, type Range } from '../passages';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';

/** A taught card's line of the promises it holds that the reader does not know yet. */
const toLearnText = (count: number) => `${count} still to learn`;

/** One card: its title, its known promises as buttons, and a taught card's count still to learn. */
function Card({
  card,
  onVisit,
}: {
  readonly card: NeedCard;
  readonly onVisit: (card: NeedCard, promise: Range) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <View testID="need-card" style={styles.card}>
      <Text testID="need-title" style={styles.title}>
        {card.title}
      </Text>
      {card.known.length > 0 && (
        <View style={styles.promises}>
          {card.known.map((promise) => {
            const reference = passageReference(promise);
            return (
              <Pressable
                key={reference}
                testID="promise"
                role="button"
                aria-label={reference}
                onPress={() => onVisit(card, promise)}
                style={({ pressed }) => [styles.promise, pressed && look.pressed]}
              >
                <Text style={styles.promiseText}>{reference}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {card.toLearn > 0 && (
        <Text testID="to-learn" style={styles.toLearn}>
          {toLearnText(card.toLearn)}
        </Text>
      )}
    </View>
  );
}

/** When I need… over `cards`, with the way back to Today (`onToday`) and a known promise's tap (`onVisit`). */
export function NeedScreen({
  cards,
  onToday,
  onVisit,
}: {
  readonly cards: readonly NeedCard[];
  readonly onToday: () => void;
  readonly onVisit: (card: NeedCard, promise: Range) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  return (
    <View style={look.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 16 }]}>
        <Pressable
          role="button"
          aria-label="Today"
          hitSlop={10}
          onPress={onToday}
          style={({ pressed }) => [styles.back, pressed && look.pressed]}
        >
          <Text style={styles.backText}>‹ Today</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Text role="heading" aria-level={1} style={look.title}>
          When I need…
        </Text>
        {cards.map((card) => (
          <Card key={card.id} card={card} onVisit={onVisit} />
        ))}
      </ScrollView>
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    bar: { paddingHorizontal: 24, paddingBottom: 8 },
    scroll: { flex: 1 },
    content: { gap: 16 },
    back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    backText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    card: {
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: color.card,
    },
    title: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    promises: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    promise: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: color.ink,
      justifyContent: 'center',
    },
    promiseText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    toLearn: { fontFamily: face, fontSize: 15, color: color.ink },
  }),
);
