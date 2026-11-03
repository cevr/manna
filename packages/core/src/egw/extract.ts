import { Option, Predicate } from 'effect';

import { parseBibleQuery } from '../bible/parse.js';
import type { Node } from './ast.js';
import type { Paragraph } from './schemas.js';

interface ExtractedBibleRef {
  readonly bookId: number;
  readonly refCode: string;
  readonly bibleBook: number;
  readonly bibleChapter: number;
  readonly bibleVerse: Option.Option<number>;
}

export const paragraphRefcode = (paragraph: Paragraph, bookId: number): string => {
  const short = Option.getOrUndefined(paragraph.refcode_short);
  if (Predicate.isNotUndefined(short)) return short;
  const long = paragraph.refcode_long;
  if (Predicate.isNotNullish(long) && long.length > 0) return long;
  return Option.getOrElse(
    paragraph.para_id,
    () => `book-${String(bookId)}-para-${String(paragraph.puborder)}`,
  );
};

type ContainerNode = Extract<Node, { readonly children: readonly Node[] }>;

const CONTAINER_TAGS: readonly ContainerNode['_tag'][] = [
  'Emphasis',
  'Comment',
  'ScriptureRef',
  'BookRef',
  'Unknown',
];

const isContainerNode: Predicate.Refinement<Node, ContainerNode> = (
  node: Node,
): node is ContainerNode => CONTAINER_TAGS.some((tag) => Predicate.isTagged(node, tag));

const walkScriptureRefs = (nodes: readonly Node[], out: { readonly title: string }[]): void => {
  for (const node of nodes) {
    if (node._tag === 'ScriptureRef') {
      out.push({ title: node.title });
    }
    if (isContainerNode(node)) {
      walkScriptureRefs(node.children, out);
    }
  }
};

export const extractScriptureRefs = (
  paragraphs: readonly Paragraph[],
  bookId: number,
  refcodeOf: (paragraph: Paragraph, bookId: number) => string = paragraphRefcode,
): readonly ExtractedBibleRef[] => {
  const seen = new Set<string>();
  const out: ExtractedBibleRef[] = [];

  for (const paragraph of paragraphs) {
    const refCode = refcodeOf(paragraph, bookId);
    const titles: { readonly title: string }[] = [];
    walkScriptureRefs(paragraph.nodes, titles);

    for (const { title } of titles) {
      const parsed = parseBibleQuery(title);
      const rows = expandParsed(parsed);
      for (const row of rows) {
        const key = `${refCode}|${String(row.bibleBook)}|${String(row.bibleChapter)}|${String(Option.getOrElse(row.bibleVerse, () => -1))}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ bookId, refCode, ...row });
      }
    }
  }
  return out;
};

const expandParsed = (
  parsed: ReturnType<typeof parseBibleQuery>,
): readonly { bibleBook: number; bibleChapter: number; bibleVerse: Option.Option<number> }[] => {
  switch (parsed._tag) {
    case 'single': {
      return [
        {
          bibleBook: parsed.ref.book,
          bibleChapter: parsed.ref.chapter,
          bibleVerse: Option.some(parsed.ref.verse),
        },
      ];
    }
    case 'chapter':
      return [
        { bibleBook: parsed.ref.book, bibleChapter: parsed.ref.chapter, bibleVerse: Option.none() },
      ];
    case 'verseRange': {
      const rows: {
        bibleBook: number;
        bibleChapter: number;
        bibleVerse: Option.Option<number>;
      }[] = [];
      for (let v = parsed.ref.start.verse; v <= parsed.ref.end.verse; v++) {
        rows.push({
          bibleBook: parsed.ref.start.book,
          bibleChapter: parsed.ref.start.chapter,
          bibleVerse: Option.some(v),
        });
      }
      return rows;
    }
    case 'chapterRange':
    case 'fullBook':
    case 'search':
      return [];
  }
};
