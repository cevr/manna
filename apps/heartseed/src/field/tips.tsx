/**
 * Home's three tips, shown once after the first minute's `Continue` and at
 * the end of the replay, until `Got it` or the reader leaves home. A tip is
 * text in the page's flow, `onInk` on an `ink` fill, after a small numbered
 * badge hidden from the screen reader: it pushes what follows down, covers
 * nothing and is no control.
 */

import { StyleSheet, Text, View } from 'react-native';

import { themed, useThemed } from '../look';

/** Each tip's words, by its number in the order home shows them: the card, `Add a list`, a list's name. */
export const TIPS = {
  1: 'Come back each day and tap Start. It brings what is ready.',
  2: 'Add a psalm, a passage or a set of promises when you want more.',
  3: 'A list is a set of verses. Tap its name to open it.',
} as const;

/** Tip `n`, `id=tip-<n>`. */
export function Tip({ n }: { readonly n: keyof typeof TIPS }) {
  const styles = useThemed(sheets);
  return (
    <View testID={`tip-${n}`} style={styles.tip}>
      <View aria-hidden style={styles.badge}>
        <Text style={styles.badgeText}>{n}</Text>
      </View>
      <Text style={styles.words}>{TIPS[n]}</Text>
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    tip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: color.ink,
    },
    badge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.onInk,
    },
    badgeText: { fontFamily: face, fontSize: 13, fontWeight: '700', color: color.ink },
    words: { flex: 1, fontFamily: face, fontSize: 15, lineHeight: 21, color: color.onInk },
  }),
);
