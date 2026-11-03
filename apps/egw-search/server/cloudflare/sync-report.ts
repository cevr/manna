import { Array as Arr, Option } from 'effect';

import {
  type EgwParagraphChangeCounts,
  type EgwSyncBook,
  type EgwSyncFailure,
  unavailableReason,
} from '@manna/core/corpus-supply';
import type { ParagraphChangeRow } from '@manna/core/egw-db';

import { wordDiff } from './word-diff.ts';

export interface SyncCounts {
  readonly remote: number;
  readonly installedBefore: number;
  readonly unexpectedFailures: number;
  readonly present: number;
  readonly failures: readonly EgwSyncFailure[];
}

export interface RecheckedBook {
  readonly book: EgwSyncBook;
  readonly changes: EgwParagraphChangeCounts;
}

export interface VectorFailure {
  readonly id: number;
  readonly reason: string;
}

export interface SyncRun {
  readonly counts: SyncCounts;
  readonly added: readonly EgwSyncBook[];
  readonly updated: readonly RecheckedBook[];
  readonly verified: readonly RecheckedBook[];
  readonly recheckLeft: number;
  readonly vectorFailures: readonly VectorFailure[];
}

export interface BookChange {
  readonly book: EgwSyncBook;
  readonly change: ParagraphChangeRow;
}

export type ChangesByBook = ReadonlyMap<number, readonly ParagraphChangeRow[]>;

export const updateChanges = (run: SyncRun, changes: ChangesByBook): readonly BookChange[] =>
  run.updated.flatMap(({ book }) =>
    (changes.get(book.id) ?? []).map((change) => ({ book, change })),
  );

export const changeSummary = (changes: EgwParagraphChangeCounts): string => {
  const parts = [
    [changes.edited, 'edited'],
    [changes.added, 'added'],
    [changes.removed, 'removed'],
  ] as const;
  const said = parts
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${String(count)} ${word}`);
  if (said.length === 0) return 'no text changes';
  return said.join(', ');
};

export const changeCount = (changes: EgwParagraphChangeCounts): number =>
  changes.added + changes.removed + changes.edited;

export const changeLabel = (book: EgwSyncBook, change: ParagraphChangeRow): string =>
  change.refcode_short ?? `${book.code} ${change.para_id ?? change.ref_code}`;

export const withheldReasons = (bookIds: readonly number[]): string => {
  const reasons = bookIds.map((id) => unavailableReason(id));
  const count = (reason: string) =>
    reasons.filter((found) => Option.contains(found, reason)).length;
  const parts = [
    [count('subscription'), 'needs an EGW subscription', 'need an EGW subscription'],
    [
      count('third-party-licence'),
      'is a translation licensed for reading only',
      'are translations licensed for reading only',
    ],
  ] as const;
  return parts
    .filter(([found]) => found > 0)
    .map(([found, one, many]) => {
      if (found === 1) return `1 ${one}`;
      return `${String(found)} ${many}`;
    })
    .join(', ');
};

const MARKDOWN_SPECIAL = /[\\`*_[\]{}()<>#+\-.!|~]/g;

export const escapeMarkdown = (text: string): string =>
  text.replace(MARKDOWN_SPECIAL, (character) => `\\${character}`);

const editedQuote = (before: string, after: string): string =>
  wordDiff(before, after)
    .map((segment) => {
      const text = escapeMarkdown(segment.text);
      if (segment.kind === 'removed') return `~~${text}~~`;
      if (segment.kind === 'added') return `**${text}**`;
      return text;
    })
    .join(' ');

const changeBlock = (book: EgwSyncBook, change: ParagraphChangeRow): string => {
  const heading = `**${escapeMarkdown(changeLabel(book, change))}** · ${change.kind}`;
  const before = change.before_text ?? '';
  const after = change.after_text ?? '';
  let quote = escapeMarkdown(after);
  if (change.kind === 'edited') quote = editedQuote(before, after);
  if (change.kind === 'removed') quote = `~~${escapeMarkdown(before)}~~`;
  return `${heading}\n\n> ${quote}`;
};

const bookHeading = (book: EgwSyncBook) =>
  `${escapeMarkdown(book.code)} — ${escapeMarkdown(book.title)}`;

const bookLine = (book: EgwSyncBook) =>
  `- **${escapeMarkdown(book.code)}** ${escapeMarkdown(book.title)}`;

const ifAny = <A>(items: readonly A[], lines: (some: readonly A[]) => readonly string[]) =>
  Arr.match(items, { onEmpty: (): readonly string[] => [], onNonEmpty: lines });

interface Quoted {
  readonly rows: readonly ParagraphChangeRow[];
  readonly rest: number;
}

const quotesAdded = (kind: 'updated' | 'verified') => kind === 'updated';

const quotedBooks = (books: readonly RecheckedBook[], kind: 'updated' | 'verified') =>
  books.filter(
    ({ changes: counts }) =>
      changeCount(counts) > 0 && (quotesAdded(kind) || counts.edited + counts.removed > 0),
  );

const recheckedSection = (
  title: string,
  intro: string,
  books: readonly RecheckedBook[],
  kind: 'updated' | 'verified',
  quotes: ReadonlyMap<number, Quoted>,
  markdownHref: string,
): readonly string[] => {
  const same = books.filter(({ changes: counts }) => changeCount(counts) === 0);
  const quoted = quotedBooks(books, kind);
  const onlyAdded = books.filter((book) => changeCount(book.changes) > 0 && !quoted.includes(book));
  return ifAny(books, () => [
    `## ${title} (${String(books.length)})`,
    intro,
    ...ifAny(same, (some) => [
      `Unchanged (${String(some.length)}): ${some.map(({ book }) => escapeMarkdown(book.code)).join(', ')}.`,
    ]),
    ...ifAny(onlyAdded, (some) => [
      `Only gained paragraphs (${String(some.length)}): ` +
        `${some.map(({ book, changes: counts }) => `${escapeMarkdown(book.code)} \\+${String(counts.added)}`).join(', ')}.`,
    ]),
    ...quoted.flatMap(({ book, changes: counts }) => {
      const { rows, rest } = quotes.get(book.id) ?? { rows: [], rest: 0 };
      const more: string[] = [];
      if (rest > 0) more.push(`${String(rest)} more in [the full report](${markdownHref}).`);
      return [
        `### ${bookHeading(book)}`,
        `${changeSummary(counts)}.`,
        ...rows.map((change) => changeBlock(book, change)),
        ...more,
      ];
    }),
  ]);
};

export interface ReportForm {
  readonly quoteLimit: Option.Option<number>;
  readonly markdownHref: string;
}

export const WHOLE: ReportForm = { quoteLimit: Option.none(), markdownHref: '' };

const quotesOf = (run: SyncRun, changes: ChangesByBook, form: ReportForm) => {
  const books = [
    ...quotedBooks(run.updated, 'updated').map((book) => [book, 'updated'] as const),
    ...quotedBooks(run.verified, 'verified').map((book) => [book, 'verified'] as const),
  ];
  const quotes = new Map<number, Quoted>();
  let left = Option.getOrElse(form.quoteLimit, () => Number.POSITIVE_INFINITY);
  for (const [{ book }, kind] of books) {
    const rows = (changes.get(book.id) ?? []).filter(
      (change) => quotesAdded(kind) || change.kind !== 'added',
    );
    const taken = rows.slice(0, Math.max(0, left));
    left -= taken.length;
    quotes.set(book.id, { rows: taken, rest: rows.length - taken.length });
  }
  return quotes;
};

const failureLine = (failure: EgwSyncFailure) =>
  `- **${escapeMarkdown(failure.code)}** ${escapeMarkdown(failure.title)}: ${escapeMarkdown(failure.error)}`;

export const syncReport = (
  run: SyncRun,
  changes: ChangesByBook,
  at: string,
  form: ReportForm = WHOLE,
): string => {
  const { counts } = run;
  const quotes = quotesOf(run, changes, form);
  const unexpected = counts.failures.filter((failure) => !failure.expected);
  const expected = counts.failures.filter((failure) => failure.expected);
  const sections: readonly (readonly string[])[] = [
    [
      `# EGW sync, ${at.slice(0, 10)}`,
      `The library lists ${String(counts.remote)} books. The corpus holds ${String(counts.present)}; ` +
        `it held ${String(counts.installedBefore)} before this run.`,
    ],
    ifAny(run.added, (some) => [
      `## Added (${String(some.length)})`,
      some.map(bookLine).join('\n'),
    ]),
    recheckedSection(
      'Updated by the library',
      'Books whose archive changed since they were installed, and every paragraph that changed with them.',
      run.updated,
      'updated',
      quotes,
      form.markdownHref,
    ),
    recheckedSection(
      'Checked against the library',
      'Books installed before the sync kept content hashes, checked once against the library. ' +
        'What differs is what the earlier import missed, now corrected; it is not a change the library made. ' +
        'Paragraphs it gained are counted, not quoted: they are mostly headings the earlier import dropped. ' +
        `${String(run.recheckLeft)} books are still to check.`,
      run.verified,
      'verified',
      quotes,
      form.markdownHref,
    ),
    ifAny(unexpected, (some) => [
      `## Failed unexpectedly (${String(some.length)})`,
      some.map(failureLine).join('\n'),
    ]),
    ifAny(run.vectorFailures, (some) => [
      `## Installed without vectors (${String(some.length)})`,
      'A `reembed` run adds them.',
      some
        .map((failed) => `- book ${String(failed.id)}: ${escapeMarkdown(failed.reason)}`)
        .join('\n'),
    ]),
    ifAny(expected, (some) => [
      `## Withheld by the library (${String(some.length)})`,
      `Listed but not served, as expected (${withheldReasons(some.map((failure) => failure.id))}): ` +
        `${some.map((failure) => escapeMarkdown(failure.code)).join(', ')}.`,
    ]),
  ];
  return `${sections.flat().join('\n\n')}\n`;
};
