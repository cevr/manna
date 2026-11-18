import { Array as Arr, Option } from 'effect';

import { type Passage, passageText } from '../hymns/indexes';

/** The head line's words: the section, and the first passage with how many more follow it. */
export const headLine = (section: string, passages: ReadonlyArray<Passage>) =>
  Option.match(Arr.head(passages), {
    onNone: () => section,
    onSome: (first) => {
      if (passages.length === 1) return `${section} · ${passageText(first)}`;
      return `${section} · ${passageText(first)} +${passages.length - 1}`;
    },
  });
