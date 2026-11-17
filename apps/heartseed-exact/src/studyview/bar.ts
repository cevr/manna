/* oxlint-disable effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): plain words over plain counts. */

/** One study button: its tab, its label, its second line and its name. */
export interface StudyButton {
  tab: string;
  label: string;
  line: string;
  name: string;
}

/** What the bar knows of one verse: its counts, and whether each pack is on the phone. */
export interface StudyVerseFacts {
  reference: string;
  language: string;
  xrefsHave: boolean;
  xrefs: number;
  wordsHave: boolean;
  words: number;
  notesHave: boolean;
  notes: number;
}

/** A count as a line: the number, or "none". */
const countLine = (count: number): string => (count > 0 ? `${count}` : 'none');

/** "2 notes", "1 note", "no notes". */
export const notesText = (count: number): string =>
  count === 0 ? 'no notes' : count === 1 ? '1 note' : `${count} notes`;

/** The three buttons for one verse, in the bar's order: Cross-refs, Words, Commentary. */
export const studyButtonsOf = (facts: StudyVerseFacts): Array<StudyButton> => [
  {
    tab: 'xrefs',
    label: 'Cross-refs',
    line: facts.xrefsHave ? countLine(facts.xrefs) : '',
    name: facts.xrefsHave
      ? `Cross-references of ${facts.reference}, ${countLine(facts.xrefs)}`
      : `Cross-references of ${facts.reference}`,
  },
  {
    tab: 'words',
    label: 'Words',
    line: facts.wordsHave && facts.words === 0 ? 'none tagged' : facts.language,
    name: `Hebrew and Greek words of ${facts.reference}`,
  },
  {
    tab: 'commentary',
    label: 'Commentary',
    line: facts.notesHave ? countLine(facts.notes) : '',
    name: facts.notesHave
      ? `Ellen White's commentary on ${facts.reference}, ${notesText(facts.notes)}`
      : `Ellen White's commentary on ${facts.reference}`,
  },
];

/** A tab's count as its segment shows it: the number, or nothing while its pack is missing or it holds none. */
export const tabCount = (have: boolean, count: number): string =>
  have && count > 0 ? `${count}` : '';
