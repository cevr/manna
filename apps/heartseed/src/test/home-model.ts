/* oxlint-disable effect/noNullish -- the model writes the hshomebase spec's rules out as plain branches over undefined, apart from the app's Option code, so the two cannot share a mistake. */

/**
 * The hshomebase spec's rules written plainly, apart from `src/lists.ts`,
 * `src/home.ts` and the screens, for the tests to judge the app by. Book
 * names and references come from `test/passages-model.ts`, the canon's
 * verses from its corpus, and the collections from the committed list.
 *
 * - L1 a verse's place: a verse of the corpus, its reference written as
 *   `verseRef` writes it, and nothing else.
 * - L2-L3 the lists the field holds: each of the app's own rows (`Own`,
 *   id `own:<title>`), then each range held in stored order (`Passage`, id
 *   `passage:<index>:<book>.<chapter>.<first>-<last>`, titled by `spanRef`,
 *   carrying its range; none while unread), then each taught collection
 *   whose id the list has (`Collection`, id `collection:<id>`, its
 *   promises' verses in order, each once).
 */

import { COLLECTIONS } from '../promises';
import type { ModelPassage } from './field-model';
import { spanRef, verseRef, versesIn, type Corpus, type Held, type Span } from './passages-model';

/** A verse's place as the model holds it. */
export interface ModelPlace {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** Every verse of `corpus`, by its reference, at its place. */
export const placesOf = (corpus: Corpus): ReadonlyMap<string, ModelPlace> => {
  const places = new Map<string, ModelPlace>();
  for (const book of corpus.books) {
    const chapters = corpus.counts.get(book) ?? 0;
    for (let chapter = 1; chapter <= chapters; chapter++) {
      const count = versesIn(corpus, book, chapter).length;
      for (let verse = 1; verse <= count; verse++)
        places.set(verseRef(book, chapter, verse), { book, chapter, verse });
    }
  }
  return places;
};

/** A list's source as the model holds it. */
export type ModelSource =
  | { readonly tag: 'Own' }
  | { readonly tag: 'Passage'; readonly span: Span }
  | { readonly tag: 'Collection'; readonly id: string }
  | { readonly tag: 'Loose' };

/** A list as the model holds it. */
export interface ModelList {
  readonly id: string;
  readonly title: string;
  readonly verses: readonly string[];
  readonly range: Span | undefined;
  readonly source: ModelSource;
}

/** L2-L3: the lists the field holds over the app's `own` rows, the passages `held` and the collections `taught`. */
export const listsModel = (
  own: readonly ModelPassage[],
  held: Held,
  taught: readonly string[],
): ModelList[] => {
  const out: ModelList[] = [];
  for (const row of own)
    out.push({
      id: `own:${row.title}`,
      title: row.title,
      verses: [...row.verses],
      range: undefined,
      source: { tag: 'Own' },
    });
  if (held.tag === 'Read')
    held.passages.forEach((span, index) => {
      const verses: string[] = [];
      for (let verse = span.first; verse <= span.last; verse++)
        verses.push(verseRef(span.book, span.chapter, verse));
      out.push({
        id: `passage:${index}:${span.book}.${span.chapter}.${span.first}-${span.last}`,
        title: spanRef(span),
        verses,
        range: span,
        source: { tag: 'Passage', span },
      });
    });
  for (const id of taught) {
    const collection = COLLECTIONS.find((each) => each.id === id);
    if (collection === undefined) continue;
    const verses: string[] = [];
    for (const range of collection.promises)
      for (let verse = range.first; verse <= range.last; verse++) {
        const reference = verseRef(range.book, range.chapter, verse);
        if (!verses.includes(reference)) verses.push(reference);
      }
    out.push({
      id: `collection:${id}`,
      title: collection.title,
      verses,
      range: undefined,
      source: { tag: 'Collection', id },
    });
  }
  return out;
};
