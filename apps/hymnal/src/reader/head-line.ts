import type { Passage } from '@manna/hymnal/indexes';
import { Array as Arr, Option } from 'effect';

import { passageText } from '../hymns/passage-text';

/** The head line's words: the section, and the first passage with how many more follow it. */
export const headLine = (section: string, passages: ReadonlyArray<Passage>) =>
  Option.match(Arr.head(passages), {
    onNone: () => section,
    onSome: (first) => {
      if (passages.length === 1) return `${section} · ${passageText(first)}`;
      return `${section} · ${passageText(first)} +${passages.length - 1}`;
    },
  });
