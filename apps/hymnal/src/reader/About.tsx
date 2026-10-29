/**
 * The sheet `About this hymn` opens from a hymn's page: `More like this`,
 * the hymns whose meaning lies nearest the hymn's (`moreLike`, from the
 * shipped vectors); `Topics`, the Topical index's topics the hymn is listed
 * under; `Scripture`, the passages the Scriptural index gives it; and `Sing
 * to another tune`, the other hymns of its metre (`indexes.ts`). A section
 * the indexes give nothing for is left out.
 *
 * A hymn row closes the sheet and opens that hymn's page over the one it
 * came from. A topic or a passage closes the sheet and the pages under it
 * and searches the hymns for it on the home screen (`searchQuery`,
 * `searchOpen`): a topic by its name, a passage by where it begins
 * (`passageQuery`). When home is not the stack's first screen (a link
 * opened the hymn or the sheet), home replaces it (`homeSteps`).
 *
 * The sheet is a route, `/about?hymn=<number>`, presented as a native form
 * sheet with a grabber (`aboutSheetOptions`), of one family with the player
 * and chord sheets: a drag down closes it, as does `Done`.
 */

import { useAtomSet } from '@effect/atom-react';
import { Array as Arr, Option } from 'effect';
import type { ReactNode } from 'react';
import { type ColorValue, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, type StackScreenOptions, useNavigation, useParams, useRouter } from 'one';

import { color, useAccent } from '~/color';
import { hymnAt, type HymnText } from '~/hymns/hymns';
import { passageQuery, passageText, referencesOf, sameMetre, topicsOf } from '~/hymns/indexes';
import { moreLike } from '~/hymns/meaning';
import type { StackState } from '~/player/title';

import { searchOpen, searchQuery } from './place';

/** The home route's file name, as the stack names its screens. */
const homeRoute = 'index';

/**
 * The steps that take the stack shown in `state` (the sheet on top) to the
 * home screen: the screens over the stack's first are closed when there are
 * any, and the first is replaced by home when it is not home (a hymn or the
 * sheet opened by a link, with nothing under it). Closing to a first screen
 * that is home keeps the home screen as it was.
 */
const homeSteps = (state: StackState) => ({
  dismiss: state.index > 0,
  replace: !Arr.head(state.routes).pipe(Option.exists((route) => route.name === homeRoute)),
});

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
  const navigation = useNavigation();
  const setQuery = useAtomSet(searchQuery);
  const setSearching = useAtomSet(searchOpen);
  const openHymn = (number: number) => {
    router.back();
    router.push(`/hymns/${number}`);
  };
  const search = (query: string) => {
    setQuery(query);
    setSearching(true);
    const { dismiss, replace } = homeSteps(navigation.getState());
    if (dismiss) router.dismissAll();
    if (replace) router.replace('/');
  };
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
            <Group name="More like this">
              {hymnRows(moreLike(shown.number, MORE_LIKE), 'about-like', accent, openHymn)}
            </Group>
            <Group name="Topics">
              {topicsOf(shown.number).map((topic, i) => (
                <SearchRow
                  key={`${i}`}
                  testID={`about-topic-${i}`}
                  label={topic.name}
                  detail={topic.parent}
                  onPress={() => search(topic.name)}
                />
              ))}
            </Group>
            <Group name="Scripture">
              {referencesOf(shown.number).map((passage, i) => (
                <SearchRow
                  key={`${i}`}
                  testID={`about-scripture-${i}`}
                  label={passageText(passage)}
                  detail={Option.none()}
                  onPress={() => search(passageQuery(passage))}
                />
              ))}
            </Group>
            <Group name="Sing to another tune">
              {hymnRows(sameMetre(shown.number), 'about-tune', accent, openHymn)}
            </Group>
          </ScrollView>
        ),
      })}
    </View>
  );
}

/** A section of the sheet under its heading, or nothing when it has no rows. */
function Group({ name, children }: { readonly name: string; readonly children: Array<ReactNode> }) {
  if (children.length === 0) return <></>;
  return (
    <>
      {/* The heading is drawn in capitals; its label, which VoiceOver reads and the drive matches, is not. */}
      <Text
        role="heading"
        aria-level={2}
        aria-label={name}
        style={styles.heading}
        dynamicTypeRamp="footnote"
      >
        {name}
      </Text>
      <View style={styles.group}>{children}</View>
    </>
  );
}

/** A row for each of `numbers` that is a hymn, its test id `<prefix>-<number>`. */
const hymnRows = (
  numbers: ReadonlyArray<number>,
  prefix: string,
  accent: ColorValue,
  open: (number: number) => void,
) =>
  numbers.flatMap((number) =>
    Option.toArray(hymnAt(String(number))).map((hymn) => (
      <HymnRow
        key={hymn.number}
        testID={`${prefix}-${hymn.number}`}
        hymn={hymn}
        accent={accent}
        onPress={() => open(hymn.number)}
      />
    )),
  );

/** A hymn: its number and title, a press away from its page. */
function HymnRow({
  testID,
  hymn,
  accent,
  onPress,
}: {
  readonly testID: string;
  readonly hymn: HymnText;
  readonly accent: ColorValue;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
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

/** A topic or a passage: its name, a quiet detail after it, a press away from its search. */
function SearchRow({
  testID,
  label,
  detail,
  onPress,
}: {
  readonly testID: string;
  readonly label: string;
  readonly detail: Option.Option<string>;
  readonly onPress: () => void;
}) {
  return (
    <Pressable testID={testID} role="link" aria-label={label} onPress={onPress}>
      {({ pressed }) => (
        <View style={[styles.row, pressed && styles.pressed]}>
          <Text style={styles.title} numberOfLines={1} dynamicTypeRamp="body">
            {label}
          </Text>
          {Option.match(detail, {
            onNone: () => <></>,
            onSome: (text) => (
              <Text style={styles.detail} numberOfLines={1} dynamicTypeRamp="footnote">
                {text}
              </Text>
            ),
          })}
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
  detail: { flexShrink: 1, fontSize: 13, color: color.muted },
  note: { fontSize: 13, color: color.muted, paddingHorizontal: 20 },
});
