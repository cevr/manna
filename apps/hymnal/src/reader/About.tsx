/**
 * The sheet `About this hymn` opens from a hymn's page: first `More like
 * this`, the hymns whose meaning lies nearest the hymn's (`moreLike`, from
 * the shipped vectors), each a row that closes the sheet and opens that
 * hymn's page over the one it came from.
 *
 * The sheet is a route, `/about?hymn=<number>`, presented as a native form
 * sheet with a grabber (`aboutSheetOptions`), of one family with the player
 * and chord sheets: a drag down closes it, as does `Done`.
 */

import { Option } from 'effect';
import { type ColorValue, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, type StackScreenOptions, useParams, useRouter } from 'one';

import { color, useAccent } from '~/color';
import { hymnAt, type HymnText } from '~/hymns/hymns';
import { moreLike } from '~/hymns/meaning';

/** How many hymns `More like this` lists. */
export const MORE_LIKE = 8;

/** The sheet's route for hymn `number`. */
export const aboutHref = (number: number): Href => `/about?hymn=${number}`;

/** How the stack presents the about route: a form sheet with a grabber, no header. */
export const aboutSheetOptions = {
  title: 'About this hymn',
  headerShown: false,
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: [0.5, 1],
} satisfies StackScreenOptions;

/** The about route's screen: the sheet for the hymn its params name, or a word that they name none. */
export function AboutScreen() {
  const params = useParams<{ readonly hymn?: string }>();
  return <AboutSheet hymn={hymnAt(String(params.hymn ?? ''))} />;
}

function AboutSheet({ hymn }: { readonly hymn: Option.Option<HymnText> }) {
  const accent = useAccent();
  const router = useRouter();
  return (
    <View testID="about-sheet" style={styles.sheet}>
      <View style={styles.head}>
        <Pressable role="button" aria-label="Done" onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.done, { color: accent }]}>Done</Text>
        </Pressable>
      </View>
      {Option.match(hymn, {
        onNone: () => <Text style={styles.note}>No hymn</Text>,
        onSome: (shown) => (
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.name} dynamicTypeRamp="footnote">
              {`${shown.number} ${shown.title}`}
            </Text>
            <Text role="heading" aria-level={2} style={styles.heading} dynamicTypeRamp="footnote">
              More like this
            </Text>
            <View style={styles.group}>
              {moreLike(shown.number, MORE_LIKE).flatMap((number) =>
                Option.toArray(hymnAt(String(number))).map((like) => (
                  <LikeRow
                    key={like.number}
                    hymn={like}
                    accent={accent}
                    onPress={() => {
                      router.back();
                      router.push(`/hymns/${like.number}`);
                    }}
                  />
                )),
              )}
            </View>
          </ScrollView>
        ),
      })}
    </View>
  );
}

/** A hymn like this one: its number and title, a press away from its page. */
function LikeRow({
  hymn,
  accent,
  onPress,
}: {
  readonly hymn: HymnText;
  readonly accent: ColorValue;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      testID={`about-like-${hymn.number}`}
      role="link"
      aria-label={`${hymn.number}, ${hymn.title}`}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View style={[styles.row, pressed && styles.pressed]}>
          <Text style={[styles.number, { color: accent }]} numberOfLines={1}>
            {hymn.number}
          </Text>
          <Text style={styles.title} numberOfLines={1} dynamicTypeRamp="body">
            {hymn.title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.ground, paddingTop: 16 },
  head: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  done: { fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 8 },
  name: { fontSize: 13, color: color.muted },
  heading: { marginTop: 8, fontSize: 13, color: color.muted, textTransform: 'uppercase' },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  pressed: { backgroundColor: color.soft },
  number: { minWidth: 32, fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'right' },
  title: { flex: 1, fontSize: 17, color: color.ink },
  note: { fontSize: 13, color: color.muted, paddingHorizontal: 20 },
});
