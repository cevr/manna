// A beat's line as the words reader lays it out, pure: its spoken words, each
// with its offset in the one text the page paints, and its `{mark}`s, each by
// the word it stands before (`SectionRows.marks`). The reader keeps the marks
// beside the words.

import { Option } from 'effect';
import type { Parsed } from '../../core/narration.ts';
import type { Row, SectionRows } from '../transcript/lit.ts';

/**
 * Beat `id`'s line, as `parse` read it, laid out from offset `at` of the
 * page's one text: each word with its offset, a space after it, and each
 * mark by the index of the word it stands before.
 */
export const lineRows = (id: string, parsed: Parsed, at: number): SectionRows => {
  let from = at;
  return {
    id,
    take: '',
    marks: Object.fromEntries(parsed.marks),
    rows: parsed.spoken.split(' ').map((text, index): Row => {
      const row = { index, text, struck: false, from, start: Option.none<number>() };
      from += text.length + 1;
      return row;
    }),
  };
};
