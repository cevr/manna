/**
 * The chooser as the reader meets it: the root's third screen, opened from
 * the field's `Add verses`. A fixed header holds one way back and the
 * step's one heading; the scroll view under it, a new one for each step so
 * each opens at its top, holds the step's list: the
 * 66 books of the canon under two plain labels, then a book's chapters,
 * then every verse of a chapter (never a virtualized list, so no verse is
 * hidden from the screen reader). Each verse is a checkbox, checked while
 * inside the range a tap builds (`tapVerse`). On the verses step a footer
 * fixed under the scroll view holds the range's reference and count, the
 * cap, `Plant` and the plant's alert, so however long the chapter they are
 * on screen without a scroll.
 *
 * `Plant` adds the range (`plantPassage`): on `Added` the reader is back on
 * the field, where the new row is last among the passages; on `Full` the
 * limit line shows, and on any other answer the alert says the range was
 * not planted. Either way the range stays, so a retry is one tap, and the
 * next tap clears the line. From a tap of `Plant` until its answer, no
 * other tap of `Plant`, a verse or a back changes anything, even two in one
 * turn, and each shows as disabled. Nothing is stored but by a landed add.
 */

import { useAtomSet } from '@effect/atom-react';
import { BIBLE_BOOKS, type Book } from '@manna/core/bible';
import { Match, Option } from 'effect';
import { memo, useCallback, useReducer, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { plantPassage } from '../app';
import { LIMIT_LINE, tapVerse, type Verses } from '../chooser';
import { versesOf } from '../kjv';
import { MOST_VERSES, passageReference, verseReference, type Range } from '../passages';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';

/** Where the reader is in the chooser: the books, a book's chapters, or a chapter's verses with the range tapped so far. */
type Place =
  | { readonly _tag: 'Books' }
  | { readonly _tag: 'Chapters'; readonly book: Book }
  | {
      readonly _tag: 'Verses';
      readonly book: Book;
      readonly chapter: number;
      readonly chosen: Option.Option<Verses>;
    };

/** The chooser's one value: where the reader is, and the plant's line (the limit or the alert) while it shows. */
interface Chooser {
  readonly place: Place;
  readonly line: Option.Option<Line>;
}

/** The plant's line: the limit line on `Full`, else the alert. */
type Line = { readonly _tag: 'Limit' } | { readonly _tag: 'Alert'; readonly text: string };

/** A move of the reader's: a book or a chapter opened, a verse tapped, one step back, or the plant's line shown. */
type Move =
  | { readonly _tag: 'Book'; readonly book: Book }
  | { readonly _tag: 'Chapter'; readonly chapter: number }
  | { readonly _tag: 'Verse'; readonly verse: number }
  | { readonly _tag: 'Back' }
  | { readonly _tag: 'Line'; readonly line: Line };

const START: Chooser = { place: { _tag: 'Books' }, line: Option.none() };

/** The place one step back: a back to the chapters or the books clears the range. */
const backOf = (place: Place): Place =>
  Match.value(place).pipe(
    Match.tagsExhaustive({
      Books: (): Place => place,
      Chapters: (): Place => ({ _tag: 'Books' }),
      Verses: (at): Place => ({ _tag: 'Chapters', book: at.book }),
    }),
  );

/** The chooser after `move`; each tap but the line's own clears the line. */
const moved = (state: Chooser, move: Move): Chooser =>
  Match.value(move).pipe(
    Match.tagsExhaustive({
      Book: ({ book }): Chooser => ({ place: { _tag: 'Chapters', book }, line: Option.none() }),
      Chapter: ({ chapter }): Chooser => {
        if (state.place._tag !== 'Chapters') return state;
        const book = state.place.book;
        return {
          place: { _tag: 'Verses', book, chapter, chosen: Option.none() },
          line: Option.none(),
        };
      },
      Verse: ({ verse }): Chooser => {
        if (state.place._tag !== 'Verses') return state;
        const at = state.place;
        const count = versesOf(at.book.number, at.chapter).length;
        return { place: { ...at, chosen: tapVerse(at.chosen, verse, count) }, line: Option.none() };
      },
      Back: (): Chooser => ({ place: backOf(state.place), line: Option.none() }),
      Line: ({ line }): Chooser => ({ ...state, line: Option.some(line) }),
    }),
  );

/** The range the verses step holds, none on another step or with no verse tapped. */
const rangeOf = (place: Place): Option.Option<Range> => {
  if (place._tag !== 'Verses') return Option.none();
  return Option.map(place.chosen, (chosen) => ({
    book: place.book.number,
    chapter: place.chapter,
    first: chosen.first,
    last: chosen.last,
  }));
};

/** The way back each step offers: its name, the step it shows and the heading. */
const headOf = (place: Place): { readonly back: string; readonly heading: string } =>
  Match.value(place).pipe(
    Match.tagsExhaustive({
      Books: () => ({ back: 'Your field', heading: 'Add a passage' }),
      Chapters: ({ book }) => ({ back: 'Books', heading: book.name }),
      Verses: ({ book, chapter }) => ({ back: 'Chapters', heading: `${book.name} ${chapter}` }),
    }),
  );

/** A range's count as the footer writes it. */
const countText = (range: Range) => {
  const verses = range.last - range.first + 1;
  if (verses === 1) return '1 verse';
  return `${verses} verses`;
};

/** The plant's line as the reader reads it. */
const lineText = (line: Line) => {
  if (line._tag === 'Limit') return LIMIT_LINE;
  return line.text;
};

/** The plant's line's test id: the limit line's is the field's own, `limit`. */
const lineId = (line: Line) => {
  if (line._tag === 'Limit') return 'limit';
  return 'plant-alert';
};

/** The space under the list: the footer clears the home indicator on the verses step, the list itself on the others. */
const listFoot = (place: Place, bottom: number) => {
  if (place._tag === 'Verses') return 16;
  return bottom + 16;
};

/** The two testaments' labels and books, in canon order. */
const TESTAMENTS = [
  { label: 'Old Testament', books: BIBLE_BOOKS.filter((book) => book.testament === 'old') },
  { label: 'New Testament', books: BIBLE_BOOKS.filter((book) => book.testament === 'new') },
] as const;

/** A book or a chapter: a pill at least 44 pt tall, named `label`, showing `shown`. */
function Pick({
  id,
  label,
  shown,
  onPress,
}: {
  readonly id: 'book' | 'chapter';
  readonly label: string;
  readonly shown: string;
  readonly onPress: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID={id}
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pick, pressed && look.pressed]}
    >
      <Text style={styles.pickText}>{shown}</Text>
    </Pressable>
  );
}

/** One verse of the chapter: a checkbox named by its reference, showing its number and its text. Memoized, so a tap redraws only the verses whose check changed, never all 176 of Psalms 119. */
const VerseBox = memo(function VerseBox({
  name,
  verse,
  text,
  on,
  pending,
  onMove,
}: {
  readonly name: string;
  readonly verse: number;
  readonly text: string;
  readonly on: boolean;
  readonly pending: boolean;
  readonly onMove: (move: Move) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID="verse"
      role="checkbox"
      aria-label={name}
      aria-checked={on}
      disabled={pending}
      onPress={() => onMove({ _tag: 'Verse', verse })}
      style={({ pressed }) => [styles.verse, on && styles.on, pressed && look.pressed]}
    >
      <Text style={styles.verseText}>
        <Text style={styles.verseNumber}>{`${verse} `}</Text>
        {text}
      </Text>
    </Pressable>
  );
});

/** The step's list: the books under the testaments' labels, a book's chapters, or a chapter's verses. */
function List({
  place,
  pending,
  onMove,
}: {
  readonly place: Place;
  readonly pending: boolean;
  readonly onMove: (move: Move) => void;
}) {
  const styles = useThemed(sheets);
  return Match.value(place).pipe(
    Match.tagsExhaustive({
      Books: () =>
        TESTAMENTS.map((testament) => (
          <View key={testament.label} style={styles.group}>
            <Text style={styles.label}>{testament.label}</Text>
            <View style={styles.grid}>
              {testament.books.map((book) => (
                <Pick
                  key={book.number}
                  id="book"
                  label={book.name}
                  shown={book.name}
                  onPress={() => onMove({ _tag: 'Book', book })}
                />
              ))}
            </View>
          </View>
        )),
      Chapters: ({ book }) => (
        <View style={styles.grid}>
          {Array.from({ length: book.chapters }, (_, index) => index + 1).map((chapter) => (
            <Pick
              key={chapter}
              id="chapter"
              label={`${book.name} ${chapter}`}
              shown={String(chapter)}
              onPress={() => onMove({ _tag: 'Chapter', chapter })}
            />
          ))}
        </View>
      ),
      Verses: ({ book, chapter, chosen }) =>
        versesOf(book.number, chapter).map((text, index) => {
          const verse = index + 1;
          return (
            <VerseBox
              key={verse}
              name={verseReference(book.number, chapter, verse)}
              verse={verse}
              text={text}
              on={Option.exists(chosen, (range) => range.first <= verse && verse <= range.last)}
              pending={pending}
              onMove={onMove}
            />
          );
        }),
    }),
  );
}

/** The chooser screen; `onField` brings the reader back to the field, from its first back or after `Added`. */
export function ChooserScreen({ onField }: { readonly onField: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const [state, dispatch] = useReducer(moved, START);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const plant = useAtomSet(plantPassage, { mode: 'promise' });
  const range = rangeOf(state.place);
  const head = headOf(state.place);
  const onMove = useCallback((move: Move) => {
    if (busy.current) return;
    dispatch(move);
  }, []);
  const onBack = () => {
    if (busy.current) return;
    if (state.place._tag === 'Books') return onField();
    dispatch({ _tag: 'Back' });
  };
  const settle = (each: Range, answer: string) => {
    busy.current = false;
    setPending(false);
    if (answer === 'Added') return onField();
    if (answer === 'Full') return dispatch({ _tag: 'Line', line: { _tag: 'Limit' } });
    dispatch({
      _tag: 'Line',
      line: { _tag: 'Alert', text: `${passageReference(each)} was not planted. Try again.` },
    });
  };
  const onPlant = (each: Range) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    void plant(each).then(
      (answer) => settle(each, answer),
      () => settle(each, 'Failed'),
    );
  };
  return (
    <View style={look.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable
          role="button"
          aria-label={head.back}
          disabled={pending}
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && look.pressed]}
        >
          <Text style={styles.backText}>{`‹ ${head.back}`}</Text>
        </Pressable>
        <Text role="heading" aria-level={1} style={styles.title}>
          {head.heading}
        </Text>
      </View>
      <ScrollView
        key={head.heading}
        style={styles.scroll}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: listFoot(state.place, insets.bottom) },
        ]}
      >
        <List place={state.place} pending={pending} onMove={onMove} />
      </ScrollView>
      {state.place._tag === 'Verses' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {Option.match(range, {
            onNone: () => false,
            onSome: (each) => (
              <View style={styles.chosen}>
                <Text testID="chosen-reference" style={styles.reference}>
                  {passageReference(each)}
                </Text>
                <Text testID="chosen-count" style={styles.count}>
                  {countText(each)}
                </Text>
              </View>
            ),
          })}
          <Text style={styles.cap}>{`Up to ${MOST_VERSES} verses`}</Text>
          {Option.match(state.line, {
            onNone: () => false,
            onSome: (line) => (
              <Text role="alert" testID={lineId(line)} style={styles.line}>
                {lineText(line)}
              </Text>
            ),
          })}
          {Option.match(range, {
            onNone: () => false,
            onSome: (each) => (
              <Pressable
                role="button"
                aria-label="Plant"
                disabled={pending}
                onPress={() => onPlant(each)}
                style={({ pressed }) => [
                  styles.plant,
                  pressed && look.pressed,
                  pending && look.disabled,
                ]}
              >
                <Text style={styles.plantText}>Plant</Text>
              </Pressable>
            ),
          })}
        </View>
      )}
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    header: { paddingHorizontal: 24, paddingBottom: 8, gap: 4 },
    back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    backText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    title: { fontFamily: face, fontSize: 34, fontWeight: '700', color: color.ink },
    scroll: { flex: 1 },
    list: { paddingHorizontal: 24, paddingTop: 8, gap: 16 },
    group: { gap: 8 },
    label: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pick: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.card,
    },
    pickText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    verse: {
      minHeight: 44,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: 'transparent',
      justifyContent: 'center',
    },
    on: { backgroundColor: color.card, borderColor: color.ink },
    verseText: { fontFamily: face, fontSize: 17, lineHeight: 26, color: color.ink },
    verseNumber: { fontFamily: face, fontSize: 13, fontWeight: '700', color: color.ink },
    footer: { paddingHorizontal: 24, paddingTop: 12, gap: 6 },
    chosen: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    reference: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
    count: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    cap: { fontFamily: face, fontSize: 15, color: color.ink },
    line: { fontFamily: face, fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
    plant: {
      minHeight: 56,
      marginTop: 6,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.ink,
    },
    plantText: { fontFamily: face, fontSize: 17, fontWeight: '700', color: color.onInk },
  }),
);
