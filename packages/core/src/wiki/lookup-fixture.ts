import { Option } from 'effect';

import { Reference } from '../bible/model.js';
import { LookupInput } from './lookup-model.js';

export const LOOKUP_ADAPTER_SELECTION = {
  text: 'the daily',
  reference: 'Dan 8:13',
  book: 27,
  chapter: 8,
  verse: 13,
} satisfies {
  readonly text: string;
  readonly reference: string;
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
};

export const LOOKUP_ADAPTER_TEXTS = [
  { raw: '  the   daily  ', text: 'the daily' },
  { raw: 'the\n  daily', text: 'the daily' },
  { raw: 'The Daily,', text: 'The Daily,' },
  { raw: 'the daily', text: 'the daily' },
] satisfies readonly { readonly raw: string; readonly text: string }[];

export const LOOKUP_ADAPTER_EMPTY_TEXTS: readonly string[] = ['   ', '\n\t ', ''];

export const LOOKUP_ADAPTER_INPUT: LookupInput = LookupInput.make({
  text: LOOKUP_ADAPTER_SELECTION.text,
  context: Option.some(
    Reference.verse(
      LOOKUP_ADAPTER_SELECTION.book,
      LOOKUP_ADAPTER_SELECTION.chapter,
      LOOKUP_ADAPTER_SELECTION.verse,
    ),
  ),
});

export const LOOKUP_ADAPTER_INPUT_NO_CONTEXT: LookupInput = LookupInput.make({
  text: LOOKUP_ADAPTER_SELECTION.text,
  context: Option.none(),
});
