import { Option } from 'effect';

import type { CorpusFileName } from './model.js';

export interface CorpusStorageIdentity<Corpus extends string> {
  readonly corpus: Corpus;
  readonly generationPrefix: string;
  readonly metadataDatabaseName: string;
  readonly activeGenerationKey: string;
  readonly assetPath: string;
  readonly generationFilename: (revision: string, digest12: string) => string;
  readonly ownsGeneration: (filename: string) => boolean;
}

const REVISION_LITERAL = /[^a-zA-Z0-9.-]/gu;

const UTF8 = new TextEncoder();

const escapeByte = (byte: number): string => `_${byte.toString(16).padStart(2, '0')}`;

const encodeRevision = (revision: string): string =>
  revision.replace(REVISION_LITERAL, (character) =>
    Array.from(UTF8.encode(character), escapeByte).join(''),
  );

const ENCODED_REVISION = /^(?:[a-zA-Z0-9.-]|_[0-9a-f]{2})*$/u;

const isEncodedRevision = (revision: string): boolean => ENCODED_REVISION.test(revision);

const DIGEST12 = /^[a-f0-9]{12}$/u;

const STRICT_SEPARATOR = '~';
const LEGACY_SEPARATOR = '-';
const SUFFIX = '.db';
const REFRESH_SUFFIX = '-next.db';

interface LegacyStorageNames {
  readonly generationPrefix: string;
  readonly metadataDatabaseName: string;
  readonly activeGenerationKey: string;
  readonly assetPath: string;
}

interface StorageNames extends LegacyStorageNames {
  readonly separator: string;
}

const legacyEntry = (
  corpus: CorpusFileName,
  names: LegacyStorageNames,
): readonly [string, LegacyStorageNames] => [corpus, names];

const LEGACY_IDENTITIES: ReadonlyMap<string, LegacyStorageNames> = new Map([
  legacyEntry('bible', {
    generationPrefix: 'bible',
    metadataDatabaseName: 'bible-corpus-metadata',
    activeGenerationKey: 'active-bible-generation',
    assetPath: '/api/assets/bible',
  }),
]);

const legacyNames = (corpus: string): Option.Option<LegacyStorageNames> =>
  Option.fromUndefinedOr(LEGACY_IDENTITIES.get(corpus));

const stripSuffix = (filename: string): Option.Option<string> => {
  if (filename.endsWith(REFRESH_SUFFIX)) {
    return Option.some(filename.slice(0, filename.length - REFRESH_SUFFIX.length));
  }
  if (filename.endsWith(SUFFIX))
    return Option.some(filename.slice(0, filename.length - SUFFIX.length));
  return Option.none();
};

const isOwned = (prefix: string, separator: string, filename: string): boolean => {
  const body = stripSuffix(filename);
  if (Option.isNone(body)) return false;
  const head = `${prefix}${separator}`;
  if (!body.value.startsWith(head)) return false;
  const rest = body.value.slice(head.length);
  const boundary = rest.lastIndexOf(separator);
  if (boundary <= 0) return false;
  const revision = rest.slice(0, boundary);
  const digest12 = rest.slice(boundary + separator.length);
  if (revision.length === 0 || !DIGEST12.test(digest12)) return false;
  return isEncodedRevision(revision);
};

export const makeCorpusStorageIdentity = <Corpus extends string>(
  corpus: Corpus,
): CorpusStorageIdentity<Corpus> => {
  const { separator, ...names } = Option.match(legacyNames(corpus), {
    onNone: (): StorageNames => ({
      separator: STRICT_SEPARATOR,
      generationPrefix: corpus,
      metadataDatabaseName: `${corpus}-corpus-metadata`,
      activeGenerationKey: `active-${corpus}-generation`,
      assetPath: `/api/assets/${corpus}`,
    }),
    onSome: (legacy): StorageNames => ({ separator: LEGACY_SEPARATOR, ...legacy }),
  });
  return {
    corpus,
    generationPrefix: names.generationPrefix,
    metadataDatabaseName: names.metadataDatabaseName,
    activeGenerationKey: names.activeGenerationKey,
    assetPath: names.assetPath,
    generationFilename: (revision, digest12) =>
      `${names.generationPrefix}${separator}${encodeRevision(revision)}${separator}${digest12}${SUFFIX}`,
    ownsGeneration: (filename) => isOwned(names.generationPrefix, separator, filename),
  };
};
