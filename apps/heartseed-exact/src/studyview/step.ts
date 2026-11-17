/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): one step over plain records, as the Contract's actions compose Exact's router. */

/**
 * The study sheet's actions (`features/study.contract`) as one pure step,
 * each composed of Exact's router as the action composes it (`push`,
 * `back`, `replace`, from `src/read/nav.ts`), then the look the Contract's
 * `studyReturning` task takes at the Read tab (`studyReturnOf`).
 * `contract.test.ts` holds the actions' text to these compositions, and
 * `sheet.model.test.ts` walks generated readers through this beside a
 * small model of what the reader sees.
 */

import { back, push, type Nav, type NavVisit } from '../read/nav';
import { studyReturnOf } from './back';
import { isHold } from './hold';

/** What the sheet keeps: the router, the open word, the notes and entries opened whole, the follows, the row to scroll to, whether a hold has landed, and the chapter's selection. */
export interface StudyState {
  readonly nav: Nav;
  readonly book: number;
  readonly chapter: number;
  readonly word: string;
  readonly unfolded: ReadonlyArray<string>;
  readonly backs: string;
  readonly row: number;
  readonly held: boolean;
  readonly holds: number;
  readonly first: number;
  readonly last: number;
}

/** What the reader does with the study sheet. */
export type StudyInput =
  | { readonly _tag: 'choose'; readonly verse: number }
  | { readonly _tag: 'open'; readonly verse: number; readonly tab: string }
  | {
      readonly _tag: 'select';
      readonly verse: number;
      readonly start: number;
      readonly text: string;
    }
  | { readonly _tag: 'tab'; readonly tab: string }
  | { readonly _tag: 'word'; readonly index: number }
  | { readonly _tag: 'fold'; readonly key: string }
  | { readonly _tag: 'move'; readonly verse: number }
  | {
      readonly _tag: 'follow';
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
      readonly row: number;
    }
  | { readonly _tag: 'done' }
  | { readonly _tag: 'back' };

/** `replace(nav, location)`: the top visit takes the location and keeps its id. */
export const replace = (nav: Nav, location: string): Nav => {
  const stack = nav[nav.tab];
  const top = stack.at(-1);
  if (top === undefined) return nav;
  const visit: NavVisit = { ...top, url: location, fragment: '' };
  if (nav.tab === 'garden') return { ...nav, garden: [...stack.slice(0, -1), visit] };
  return { ...nav, read: [...stack.slice(0, -1), visit] };
};

/** `path("studySheet", book, chapter, verse, tab)`. */
export const sheetPath = (
  book: number | string,
  chapter: number | string,
  verse: number | string,
  tab: string,
) => `/read/study/${book}/${chapter}/${verse}/${tab}`;

/** The study sheet's visit on the Read tab, if one is open: its place and tab. */
export const sheetOn = (nav: Nav) => {
  const visit = nav.read.findLast((each) => each.name === 'studySheet');
  if (visit === undefined) return undefined;
  const [book = 0, chapter = 0, verse = 0] = visit.url.split('/').slice(3, 6).map(Number);
  return { id: visit.id, book, chapter, verse, tab: visit.url.split('/')[6] ?? '' };
};

/** The Read tab's top visit under any sheet. */
export const readTopOf = (nav: Nav): NavVisit | undefined =>
  nav.read.filter((visit) => visit.name !== 'studySheet').at(-1);

/** The chapter the Read tab's top shows: a followed reference's own, else the kept place. */
export const readPlaceOf = (state: Pick<StudyState, 'nav' | 'book' | 'chapter'>) => {
  const top = readTopOf(state.nav);
  if (top?.name === 'readAt') {
    const [book = 0, chapter = 0] = top.url.split('/').slice(3, 5).map(Number);
    return { book, chapter };
  }
  return { book: state.book, chapter: state.chapter };
};

/** The sheet's place key, as `studyPlace` writes it. */
const placeOf = (nav: Nav): string => {
  const sheet = sheetOn(nav);
  return sheet === undefined ? '..' : `${sheet.book}.${sheet.chapter}.${sheet.verse}`;
};

/** The Contract's `studyReturning`: Back to a follow's chapter opens its sheet again on Cross-refs. */
const look = (state: StudyState): StudyState => {
  const top = readTopOf(state.nav)?.id ?? 0;
  const seen = studyReturnOf(
    state.backs,
    top,
    state.nav.read.map((visit) => visit.id),
  );
  if (seen.key === '') return state;
  if (!seen.reopen) return { ...state, backs: seen.backs };
  return {
    ...state,
    backs: seen.backs,
    word: '',
    unfolded: [],
    row: seen.row,
    nav: push(state.nav, sheetPath(seen.book, seen.chapter, seen.verse, 'xrefs')),
  };
};

/** The action an input names, before the look. */
const act = (state: StudyState, input: StudyInput): StudyState => {
  const { book, chapter } = readPlaceOf(state);
  const sheet = sheetOn(state.nav);
  switch (input._tag) {
    case 'choose':
      return { ...state, first: input.verse, last: input.verse };
    case 'open':
      return {
        ...state,
        word: '',
        unfolded: [],
        row: -1,
        nav: push(state.nav, sheetPath(book, chapter, input.verse, input.tab)),
      };
    case 'select':
      if (!isHold(input.text) || sheet !== undefined) return state;
      return {
        ...state,
        holds: state.holds + 1,
        held: true,
        unfolded: [],
        row: -1,
        word: `${book}.${chapter}.${input.verse}:o${input.start}`,
        nav: push(state.nav, sheetPath(book, chapter, input.verse, 'words')),
      };
    case 'tab':
      if (sheet === undefined) return state;
      return {
        ...state,
        nav: replace(state.nav, sheetPath(sheet.book, sheet.chapter, sheet.verse, input.tab)),
      };
    case 'word':
      return { ...state, word: `${placeOf(state.nav)}:i${input.index}` };
    case 'fold':
      return {
        ...state,
        unfolded: state.unfolded.includes(input.key)
          ? state.unfolded.filter((key) => key !== input.key)
          : [...state.unfolded, input.key],
      };
    case 'move':
      if (sheet === undefined) return state;
      return {
        ...state,
        word: '',
        unfolded: [],
        nav: replace(state.nav, sheetPath(sheet.book, sheet.chapter, input.verse, 'commentary')),
      };
    case 'follow': {
      if (sheet === undefined) return state;
      const line = `${readTopOf(state.nav)?.id ?? 0} ${sheet.book} ${sheet.chapter} ${sheet.verse} ${input.row} 0`;
      return {
        ...state,
        backs: state.backs === '' ? line : `${state.backs};${line}`,
        first: 0,
        last: 0,
        nav: push(
          back(state.nav),
          `/read/at/${input.book}/${input.chapter}/${input.verse}#verse-${input.verse}`,
        ),
      };
    }
    case 'done':
    case 'back':
      return { ...state, nav: back(state.nav) };
  }
};

/** The state after one input: its action, then the look at the Read tab. */
export const studyStep = (state: StudyState, input: StudyInput): StudyState =>
  look(act(state, input));
