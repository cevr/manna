import { Option, Predicate } from 'effect';

import type * as EGWSchemas from '../egw/schemas.js';

const CONTENT_PREFIX = 'zip:';

const DOWNLOAD_HASH = /[#&]hash=([0-9a-f]+)/i;

const downloadHash = (download: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(DOWNLOAD_HASH.exec(download)), (match) =>
    Option.fromNullishOr(match[1]),
  );

type RevisionFields = Pick<EGWSchemas.Book, 'download' | 'last_modified' | 'pub_year'>;

export const egwBookRevision = (book: RevisionFields): string => {
  const hash = Option.flatMap(Option.fromNullishOr(book.download), downloadHash);
  if (Option.isSome(hash)) return `${CONTENT_PREFIX}${hash.value.toLowerCase()}`;
  if (Predicate.isNotNullish(book.last_modified)) return book.last_modified;
  return book.pub_year;
};

export const isContentRevision = (revision: string): boolean => revision.startsWith(CONTENT_PREFIX);
