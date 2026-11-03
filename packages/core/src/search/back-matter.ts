import { Option } from 'effect';

import type { NearestHeading, SectionHeading } from '../egw-db/book-database.js';

const WHOLE_TITLES: ReadonlySet<string> = new Set([
  'contents',
  'table of contents',
  'index',
  'general index',
  'glossary',
  'notes',
  'endnotes',
  'bibliography',
  'selected bibliography',
  'selective bibliography',
  'appendixes',
  'appendices',
]);

const TITLE_PATTERNS: readonly RegExp[] = [
  /^appendix(?:$|[\s—–:-])/u,
  /^index of\s/u,
  /^bibliography of\s/u,
  /^list of (?:illustrations|maps|correspondents|abbreviations)\b/u,
  /\b(?:scripture|scriptural|topical|subject) index\b/u,
];

export const isBackMatterTitle = (title: string): boolean => {
  const normalized = title.trim().toLowerCase().replace(/\.$/u, '');
  if (WHOLE_TITLES.has(normalized)) return true;
  return TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

interface Mark {
  readonly puborder: number;
  readonly underBackMatter: boolean;
  readonly inTail: boolean;
}

const proseLevel = (heading: SectionHeading): number => {
  if (isBackMatterTitle(heading.title)) return Number.POSITIVE_INFINITY;
  return heading.level;
};

const marksOf = (headings: readonly SectionHeading[]): readonly Mark[] => {
  const ordered = headings.toSorted((a, b) => a.puborder - b.puborder);
  const inTail = ordered.reduceRight<{ readonly shallowest: number; readonly tail: boolean[] }>(
    (state, heading) => {
      const backMatter = isBackMatterTitle(heading.title);
      return {
        shallowest: Math.min(state.shallowest, proseLevel(heading)),
        tail: [backMatter && state.shallowest > heading.level, ...state.tail],
      };
    },
    { shallowest: Number.POSITIVE_INFINITY, tail: [] },
  ).tail;
  const open: { readonly level: number; readonly backMatter: boolean; readonly inTail: boolean }[] =
    [];
  return ordered.map((heading, index) => {
    while (open.length > 0 && (open.at(-1)?.level ?? 0) >= heading.level) open.pop();
    open.push({
      level: heading.level,
      backMatter: isBackMatterTitle(heading.title),
      inTail: inTail[index] ?? false,
    });
    return {
      puborder: heading.puborder,
      underBackMatter: open.some((entry) => entry.backMatter),
      inTail: open.some((entry) => entry.inTail),
    };
  });
};

const markAt = (marks: readonly Mark[], puborder: number): Option.Option<Mark> =>
  Option.fromNullishOr(marks.findLast((mark) => mark.puborder <= puborder));

export const backMatterClassifier = (
  outline: readonly SectionHeading[],
  nearest: readonly NearestHeading[],
): ((publicationId: number, puborder: number) => boolean) => {
  const byBook = Map.groupBy(outline, (heading) => heading.publicationId);
  const marks = new Map([...byBook].map(([book, rows]) => [book, marksOf(rows)]));
  const closest = new Map(
    nearest.map((entry) => [
      `${String(entry.publicationId)}:${String(entry.puborder)}`,
      entry.heading,
    ]),
  );
  return (publicationId, puborder) =>
    Option.match(markAt(marks.get(publicationId) ?? [], puborder), {
      onNone: () => false,
      onSome: (mark) => {
        if (!mark.underBackMatter) return false;
        if (mark.inTail) return true;
        return Option.match(
          Option.fromNullishOr(closest.get(`${String(publicationId)}:${String(puborder)}`)),
          {
            onNone: () => false,
            onSome: (heading) => heading.level <= 3 || isBackMatterTitle(heading.title),
          },
        );
      },
    });
};
