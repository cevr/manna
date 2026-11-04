import { useSafeAreaInsets } from 'one';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import passage from 'virtual:heartseed-passage';

/** Today: the passage the reader is learning, its reference over its words. */
export default function Today() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text role="heading" aria-level={1} style={styles.title}>
        Today
      </Text>
      <View style={styles.passage}>
        <Text testID="reference" style={styles.reference}>
          {passage.reference}
        </Text>
        <Text testID="passage" style={styles.words}>
          {passage.text}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { paddingHorizontal: 24, gap: 24 },
  title: { fontSize: 34, fontWeight: '700', color: '#1C1C1E' },
  passage: { gap: 8 },
  reference: { fontSize: 17, fontWeight: '600', color: '#3A3A3C' },
  words: { fontSize: 22, lineHeight: 32, color: '#1C1C1E' },
});
