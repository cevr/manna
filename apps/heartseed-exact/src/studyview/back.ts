/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): plain lines over plain numbers. */

/** One follow, as `studyBacks` keeps it. */
export interface StudyBack {
  under: number;
  book: number;
  chapter: number;
  verse: number;
  row: number;
  followed: number;
}

/** What one look at the Read tab's stack decides. */
export interface StudyReturn {
  backs: string;
  reopen: boolean;
  book: number;
  chapter: number;
  verse: number;
  row: number;
  key: string;
}

/** `studyBacks` as lines. */
export const backsOf = (text: string): Array<StudyBack> =>
  text
    .split(';')
    .filter((line) => line !== '')
    .map((line) => {
      const [under, book, chapter, verse, row, followed] = line.split(' ').map(Number);
      return {
        under: under ?? 0,
        book: book ?? 0,
        chapter: chapter ?? 0,
        verse: verse ?? 0,
        row: row ?? 0,
        followed: followed ?? 0,
      };
    });

/** Lines as `studyBacks` keeps them. */
export const backsText = (backs: ReadonlyArray<StudyBack>): string =>
  backs.map((b) => `${b.under} ${b.book} ${b.chapter} ${b.verse} ${b.row} ${b.followed}`).join(';');

/** The line a follow adds, from the entry the sheet was over. */
export const backLine = (
  under: number,
  book: number,
  chapter: number,
  verse: number,
  row: number,
): string => `${under} ${book} ${chapter} ${verse} ${row} 0`;

/**
 * One look at the Read tab: `top` its top entry under any sheet, `ids` its
 * stack's entries. Answers the lines kept and, when Back has just come to
 * a line's `under`, the sheet to open again. `key` changes exactly when
 * the lines or the decision do, so a task keyed on it runs once each.
 */
export const studyReturnOf = (
  text: string,
  top: number,
  ids: ReadonlyArray<number>,
): StudyReturn => {
  const held = new Set(ids);
  const kept: Array<StudyBack> = [];
  let reopen: StudyBack | undefined;
  for (const back of backsOf(text)) {
    if (!held.has(back.under)) continue;
    if (back.followed === 0) {
      if (top !== back.under) kept.push({ ...back, followed: top });
      else kept.push(back);
      continue;
    }
    if (held.has(back.followed)) {
      kept.push(back);
      continue;
    }
    if (top === back.under) reopen = back;
  }
  const backs = backsText(kept);
  return {
    backs,
    reopen: reopen !== undefined,
    book: reopen?.book ?? 0,
    chapter: reopen?.chapter ?? 0,
    verse: reopen?.verse ?? 0,
    row: reopen?.row ?? 0,
    key: backs === text && reopen === undefined ? '' : `${top}|${backs}|${reopen?.under ?? 0}`,
  };
};
