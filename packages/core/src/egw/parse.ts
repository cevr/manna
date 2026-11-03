import { Match, Option, Schema } from 'effect';

import type * as Schemas from './schemas.js';

export const EGWParagraphRef = Schema.TaggedStruct('paragraph', {
  bookCode: Schema.String,
  page: Schema.Finite,
  paragraph: Schema.Finite,
});

export type EGWParagraphRef = Schema.Schema.Type<typeof EGWParagraphRef>;

export const EGWParagraphRangeRef = Schema.TaggedStruct('paragraph-range', {
  bookCode: Schema.String,
  page: Schema.Finite,
  paragraphStart: Schema.Finite,
  paragraphEnd: Schema.Finite,
});

export type EGWParagraphRangeRef = Schema.Schema.Type<typeof EGWParagraphRangeRef>;

export const EGWPageRef = Schema.TaggedStruct('page', {
  bookCode: Schema.String,
  page: Schema.Finite,
});

export type EGWPageRef = Schema.Schema.Type<typeof EGWPageRef>;

export const EGWPageRangeRef = Schema.TaggedStruct('page-range', {
  bookCode: Schema.String,
  pageStart: Schema.Finite,
  pageEnd: Schema.Finite,
});

export type EGWPageRangeRef = Schema.Schema.Type<typeof EGWPageRangeRef>;

export const EGWBookRef = Schema.TaggedStruct('book', {
  bookCode: Schema.String,
});

export type EGWBookRef = Schema.Schema.Type<typeof EGWBookRef>;

export const EGWSearchQuery = Schema.TaggedStruct('search', {
  query: Schema.String,
});

export type EGWSearchQuery = Schema.Schema.Type<typeof EGWSearchQuery>;

export type EGWParsedRef =
  | EGWParagraphRef
  | EGWParagraphRangeRef
  | EGWPageRef
  | EGWPageRangeRef
  | EGWBookRef
  | EGWSearchQuery;

const PARAGRAPH_PATTERN = /^([A-Z0-9]+)\s+(\d+)\.(\d+)$/i;

const PARAGRAPH_RANGE_PATTERN = /^([A-Z0-9]+)\s+(\d+)\.(\d+)-(\d+)$/i;

const PAGE_PATTERN = /^([A-Z0-9]+)\s+(\d+)$/i;

const PAGE_RANGE_PATTERN = /^([A-Z0-9]+)\s+(\d+)-(\d+)$/i;

const BOOK_PATTERN = /^([A-Z0-9]+)$/i;

export function parseEGWRef(input: string): EGWParsedRef {
  const trimmed = input.trim();

  const paragraphMatch = trimmed.match(PARAGRAPH_PATTERN);
  if (paragraphMatch && paragraphMatch[1] && paragraphMatch[2] && paragraphMatch[3]) {
    return {
      _tag: 'paragraph',
      bookCode: paragraphMatch[1].toUpperCase(),
      page: parseInt(paragraphMatch[2], 10),
      paragraph: parseInt(paragraphMatch[3], 10),
    };
  }

  const paragraphRangeMatch = trimmed.match(PARAGRAPH_RANGE_PATTERN);
  if (
    paragraphRangeMatch &&
    paragraphRangeMatch[1] &&
    paragraphRangeMatch[2] &&
    paragraphRangeMatch[3] &&
    paragraphRangeMatch[4]
  ) {
    return {
      _tag: 'paragraph-range',
      bookCode: paragraphRangeMatch[1].toUpperCase(),
      page: parseInt(paragraphRangeMatch[2], 10),
      paragraphStart: parseInt(paragraphRangeMatch[3], 10),
      paragraphEnd: parseInt(paragraphRangeMatch[4], 10),
    };
  }

  const pageRangeMatch = trimmed.match(PAGE_RANGE_PATTERN);
  if (pageRangeMatch && pageRangeMatch[1] && pageRangeMatch[2] && pageRangeMatch[3]) {
    return {
      _tag: 'page-range',
      bookCode: pageRangeMatch[1].toUpperCase(),
      pageStart: parseInt(pageRangeMatch[2], 10),
      pageEnd: parseInt(pageRangeMatch[3], 10),
    };
  }

  const pageMatch = trimmed.match(PAGE_PATTERN);
  if (pageMatch && pageMatch[1] && pageMatch[2]) {
    return {
      _tag: 'page',
      bookCode: pageMatch[1].toUpperCase(),
      page: parseInt(pageMatch[2], 10),
    };
  }

  const bookMatch = trimmed.match(BOOK_PATTERN);
  if (bookMatch && bookMatch[1]) {
    return {
      _tag: 'book',
      bookCode: bookMatch[1].toUpperCase(),
    };
  }

  return {
    _tag: 'search',
    query: trimmed,
  };
}

export function formatEGWRef(ref: EGWParsedRef): string {
  return Match.value(ref).pipe(
    Match.tagsExhaustive({
      paragraph: (r) => `${r.bookCode} ${r.page}.${r.paragraph}`,
      'paragraph-range': (r) => `${r.bookCode} ${r.page}.${r.paragraphStart}-${r.paragraphEnd}`,
      page: (r) => `${r.bookCode} ${r.page}`,
      'page-range': (r) => `${r.bookCode} ${r.pageStart}-${r.pageEnd}`,
      book: (r) => r.bookCode,
      search: (r) => r.query,
    }),
  );
}

export function isSearchQuery(ref: EGWParsedRef): ref is EGWSearchQuery {
  return ref._tag === 'search';
}

export function isChapterHeading(elementType: Option.Option<string>): boolean {
  if (Option.isNone(elementType) || elementType.value.length === 0) return false;
  const type = elementType.value.toLowerCase();
  if (/^h[1-6]$/.test(type)) return true;
  return ['chapter', 'heading', 'title'].includes(type);
}

const FURNITURE_SUBTYPES: ReadonlySet<string> = new Set([
  'addressee',
  'bibletext',
  'center',
  'date',
  'devotionaltext',
  'egwsignatureline',
  'introquote',
  'letterhead',
  'ltaddress',
  'ltaddressee',
  'ltdate',
  'ltplace',
  'ltpubinfo',
  'ltsalutation',
  'msdate',
  'msplace',
  'mspubinfo',
  'mssalutation',
  'mstitle',
  'periodicalauthor',
  'picture',
  'place',
  'right',
  'salutation',
  'signaturedate',
  'signatureline',
  'signatureplace',
  'signaturesource',
  'thoughtbreak',
]);

export function isFurniture(elementSubtype: Option.Option<string>): boolean {
  return Option.exists(elementSubtype, (subtype) => FURNITURE_SUBTYPES.has(subtype.toLowerCase()));
}

export function headingLevel(elementType: Option.Option<string>): number {
  if (Option.isNone(elementType)) return 0;
  const match = elementType.value.toLowerCase().match(/^h(\d)$/);
  if (match?.[1]) return parseInt(match[1], 10);
  return 0;
}

export function chapterIdFromTocItem(toc: Schemas.TocItem): string {
  if (Option.isSome(toc.para_id)) {
    const match = toc.para_id.value.match(/\.(\d+)$/);
    return match?.[1] ?? String(toc.puborder);
  }
  return String(toc.puborder);
}
