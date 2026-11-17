/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): plain words over the readers' plain records. */

/**
 * What the study sheet draws (q118, q120, q122), from what the readers
 * answer: its heading, its three tabs with their counts, and each tab's
 * rows and lines. Every empty state says why, in a sentence. Long notes
 * and definitions fold (`FOLD_NOTE`, `FOLD_DEF`): the Contract clamps a
 * folded one to its lines and shows its button only when it folds, so no
 * text is ever hidden with no way to it.
 */

import type { CommentaryRead } from '../commentary/pack';
import type { StudyEntry, StudyWords, StudyXrefs } from '../study/read';
import { notesText, tabCount } from './bar';
import { holdOffset, holdWord } from './hold';

/** The lines a note is clamped to while folded. */
export const NOTE_LINES = 6;
/** The lines a definition is clamped to while folded. */
export const DEF_LINES = 5;
/** A note longer than this many characters folds: six lines at the sheet's body size on a phone. */
export const FOLD_NOTE = 6 * 40;
/** A definition longer than this many characters folds: five lines. */
export const FOLD_DEF = 5 * 40;
/** How many renderings an entry shows. */
export const RENDERS = 6;

/** Each tab's foot: where it is from. */
export const FOOT = {
  xrefs: 'Cross-references from OpenBible.info.',
  words: "Strong's numbers on the KJV, with Strong's own definitions.",
  commentary: 'From the SDA Bible Commentary, volumes 1-7, Ellen G. White comments.',
} as const;

/** The empty states, each a sentence that says why. */
export const LINES = {
  noXrefs: 'No cross-references for this verse.',
  noWords: 'No Hebrew or Greek is tagged on this verse.',
  noNotes: "Ellen White's Bible Commentary has no note on this verse.",
  chips: 'Verses of this chapter with notes:',
  caption: 'Tap a dotted word to see the Hebrew or Greek behind it.',
  holdHint: 'Hold a word in the chapter to come straight here.',
  supplied: 'Words in italics were supplied by the translators.',
  added: 'The translators supplied this word.',
  untagged: 'No Hebrew or Greek word is tagged here.',
  noDef:
    "The lexicon has no definition for this word yet; the KJV's renderings below show its sense.",
} as const;

/** A tab of the sheet: its key, label, count and name. */
export interface StudyTabShown {
  tab: string;
  label: string;
  count: string;
  name: string;
}

/** A cross-reference's row. */
export interface StudyXrefRow {
  index: number;
  reference: string;
  text: string;
  book: number;
  chapter: number;
  verse: number;
  name: string;
}

/** A word of the verse in the Words tab: a button when tagged. */
export interface StudyWordShown {
  index: number;
  text: string;
  tagged: boolean;
  added: boolean;
  name: string;
}

/** A note of the Commentary tab. */
export interface StudyNoteShown {
  index: number;
  key: string;
  ref: string;
  text: string;
  folds: boolean;
}

/** A chip that moves the sheet to another verse of the chapter. */
export interface StudyChip {
  verse: number;
  label: string;
  name: string;
}

/** The whole sheet but the open word's entries. */
export interface StudySheetShown {
  found: boolean;
  heading: string;
  place: string;
  tabs: Array<StudyTabShown>;
  xrefsLine: string;
  xrefs: Array<StudyXrefRow>;
  wordsLine: string;
  caption: string;
  hint: string;
  supplied: string;
  words: Array<StudyWordShown>;
  notesLine: string;
  notes: Array<StudyNoteShown>;
  chipsLine: string;
  chips: Array<StudyChip>;
  feet: { xrefs: string; words: string; commentary: string };
}

/** The waiting lines, each pack's own (`PackSpec.waiting`), for a pack not on the phone yet. */
export interface StudyWaiting {
  xrefs: string;
  tags: string;
  commentary: string;
  lexicon: string;
}

/** A verse's place as the sheet's keys name it: `<book>.<chapter>.<verse>`. */
export const placeKey = (book: number, chapter: number, verse: number): string =>
  `${book}.${chapter}.${verse}`;

/** A word's VoiceOver name: "loved, Greek, word 4 of 25". */
export const wordName = (text: string, language: string, index: number, count: number): string =>
  `${text}, ${language}, word ${index + 1} of ${count}`;

/** The sheet for `reference` (`book` `chapter` `verse`), from its readers' answers. */
export const sheetOf = (input: {
  book: number;
  chapter: number;
  verse: number;
  reference: string;
  language: string;
  xrefs: StudyXrefs;
  words: StudyWords;
  notes: CommentaryRead;
  held: boolean;
  waiting: StudyWaiting;
}): StudySheetShown => {
  const { book, chapter, verse, xrefs, words, notes, waiting } = input;
  const place = placeKey(book, chapter, verse);
  const shownWords = wordsPart(words, input.language, input.held, waiting.tags);
  const shownNotes = notesPart(notes, verse, place, waiting.commentary);
  return {
    found: words.words.length > 0,
    heading: input.reference,
    place,
    tabs: tabsOf(xrefs, words.have, shownWords.tagged, notes.have, shownNotes.notes.length),
    ...xrefsPart(xrefs, waiting.xrefs),
    wordsLine: shownWords.wordsLine,
    caption: shownWords.caption,
    hint: shownWords.hint,
    supplied: shownWords.supplied,
    words: shownWords.words,
    notesLine: shownNotes.notesLine,
    notes: shownNotes.notes,
    chipsLine: shownNotes.chipsLine,
    chips: shownNotes.chips,
    feet: FOOT,
  };
};

/** The three tabs, each with its count and its name. */
const tabsOf = (
  xrefs: StudyXrefs,
  wordsHave: boolean,
  tagged: number,
  notesHave: boolean,
  notes: number,
): Array<StudyTabShown> => [
  {
    tab: 'xrefs',
    label: 'Cross-refs',
    count: tabCount(xrefs.have, xrefs.refs.length),
    name: `Cross-references, ${xrefs.have ? `${xrefs.refs.length}` : 'on their way'}`,
  },
  {
    tab: 'words',
    label: 'Words',
    count: '',
    name: `Hebrew and Greek words, ${wordsHave ? `${tagged} tagged` : 'on their way'}`,
  },
  {
    tab: 'commentary',
    label: 'Commentary',
    count: tabCount(notesHave, notes),
    name: `Commentary, ${notesHave ? notesText(notes) : 'on its way'}`,
  },
];

/** The Cross-refs tab: its line and rows. */
const xrefsPart = (xrefs: StudyXrefs, waiting: string) => ({
  xrefsLine: !xrefs.have ? waiting : xrefs.refs.length === 0 ? LINES.noXrefs : '',
  xrefs: xrefs.refs.map((ref, index): StudyXrefRow => ({
    index,
    reference: ref.reference,
    text: ref.text,
    book: ref.book,
    chapter: ref.chapter,
    verse: ref.verse,
    name: `${ref.reference}, read it`,
  })),
});

/** The Words tab: its lines and the verse's words, each tagged one a button named by its word and place. */
const wordsPart = (words: StudyWords, language: string, held: boolean, waiting: string) => {
  const tagged = words.words.filter((word) => word.numbers.length > 0).length;
  const shows = words.have && tagged > 0;
  return {
    tagged,
    wordsLine: !words.have ? waiting : tagged === 0 ? LINES.noWords : '',
    caption: shows ? LINES.caption : '',
    hint: shows && !held ? LINES.holdHint : '',
    supplied: words.words.some((word) => word.added) ? LINES.supplied : '',
    words: words.words.map((word): StudyWordShown => ({
      index: word.index,
      text: word.text,
      tagged: word.numbers.length > 0,
      added: word.added,
      name:
        word.numbers.length > 0
          ? wordName(word.text, language, word.index, words.words.length)
          : word.text,
    })),
  };
};

/** The Commentary tab: its line, the verse's notes (one note opens whole), and with none the chapter's verses that have some. */
const notesPart = (notes: CommentaryRead, verse: number, place: string, waiting: string) => {
  const own = notes.verses.find((each) => each.verse === verse)?.notes ?? [];
  const others =
    notes.have && own.length === 0
      ? notes.verses.filter((each) => each.verse > 0 && each.verse !== verse)
      : [];
  return {
    notesLine: !notes.have ? waiting : own.length === 0 ? LINES.noNotes : '',
    notes: own.map((note, index): StudyNoteShown => ({
      index,
      key: `${place}:n${index}`,
      ref: note.ref,
      text: note.text,
      folds: own.length > 1 && note.text.length > FOLD_NOTE,
    })),
    chipsLine: others.length > 0 ? LINES.chips : '',
    chips: others.map((each): StudyChip => ({
      verse: each.verse,
      label: `${each.verse}`,
      name: `Verse ${each.verse}, ${notesText(each.notes.length)}`,
    })),
  };
};

/** One Strong's entry as the Words tab shows it. */
export interface StudyEntryShown {
  key: string;
  number: string;
  found: boolean;
  big: string;
  bigItalic: boolean;
  xlit: string;
  pron: string;
  heading: string;
  def: string;
  defLine: string;
  folds: boolean;
  rendersLine: string;
  renders: Array<string>;
  missing: string;
}

/** The open word: which word, its line when it has no entry, and each entry in turn. */
export interface StudyWordOpen {
  open: boolean;
  index: number;
  text: string;
  line: string;
  entries: Array<StudyEntryShown>;
}

/** No word open. */
export const NO_WORD: StudyWordOpen = { open: false, index: -1, text: '', line: '', entries: [] };

/**
 * The word a sheet's `word` key names in `words` (`<place>:i<index>` from
 * a tap, `<place>:o<start>` from a hold's selection start in the drawn
 * text), or -1 for another verse's key, none, or an offset on no word.
 */
export const wordIndexOf = (
  key: string,
  place: string,
  verse: number,
  words: StudyWords,
): number => {
  const head = `${place}:`;
  if (!key.startsWith(head)) return -1;
  const rest = key.slice(head.length);
  const value = Number(rest.slice(1));
  if (!Number.isInteger(value)) return -1;
  if (rest.startsWith('i')) return value >= 0 && value < words.words.length ? value : -1;
  if (rest.startsWith('o')) return holdWord(words.words, holdOffset(verse, value));
  return -1;
};

/** An entry as shown: the lemma large (the transliteration in italics with none), its number's line, its definition or the line for none. */
export const entryShown = (entry: StudyEntry, key: string, waiting: string): StudyEntryShown => {
  const shown = entry.renders.slice(0, RENDERS);
  return {
    key,
    number: entry.number,
    found: entry.found,
    big: entry.lemma !== '' ? entry.lemma : entry.xlit,
    bigItalic: entry.lemma === '',
    xlit: entry.lemma !== '' ? entry.xlit : '',
    pron: entry.pron,
    heading: `${entry.language} · Strong's ${entry.number}`,
    def: entry.def,
    defLine: entry.found && entry.def.trim() === '' ? LINES.noDef : '',
    folds: entry.def.length > FOLD_DEF,
    rendersLine: entry.total > 0 ? `In the KJV, ${entry.total} times, as` : '',
    renders: shown.map((render) => `${render.word} ${render.count}`),
    missing: !entry.have
      ? waiting
      : entry.found
        ? ''
        : `Strong's dictionary has no entry for ${entry.number} yet.`,
  };
};

/** The open word of `words` at `index`, its entries read by `entryOf`. */
export const wordOpenOf = (
  words: StudyWords,
  index: number,
  place: string,
  entryOf: (number: string) => StudyEntry,
  waiting: string,
): StudyWordOpen => {
  const word = words.words[index];
  if (word === undefined) return NO_WORD;
  return {
    open: true,
    index,
    text: word.text,
    line: word.numbers.length > 0 ? '' : word.added ? LINES.added : LINES.untagged,
    entries: word.numbers.map((number) =>
      entryShown(entryOf(number), `${place}:e${index}:${number}`, waiting),
    ),
  };
};
