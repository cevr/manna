/* oxlint-disable effect/noNullish, effect/noRuntimeTypeof, effect/noTryCatch, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md), so no Schema codec: the pack arrives as text from a server, `JSON.parse` reads it, each field is checked by its runtime type, and a body that does not parse is an answer to name, not a defect. */

/**
 * Find's word index as a pack the one downloader keeps (q126): the index
 * `tools/find.ts` writes (`src/find/pack.ts`), inside the fields every pack
 * carries, its version before its body. `count` is the index's verses and
 * `sum` is `sumOf` over the index as JSON writes it, so the same index
 * gives the same version.
 */

import { versionOf } from '../commentary/pack';
import { FIND_FORMAT, type FindPack } from '../find/pack';
import { atOnce, sumPaced, type Paced } from '../packs/paced';
import { sumOf } from '../text/sum';
import { STUDY_FORMAT } from './pack';

/** The word index as served and kept. */
export interface WordsPack {
  readonly format: number;
  readonly version: string;
  readonly count: number;
  readonly sum: number;
  readonly find: FindPack;
}

/** Why a body is not a word index to keep, the first check it fails. */
export type WordsFault = 'json' | 'fields' | 'format' | 'count' | 'sum' | 'version';

/** A body checked: the pack it holds, or the check it failed. */
export type WordsCheck =
  | { readonly _tag: 'Good'; readonly pack: WordsPack }
  | { readonly _tag: 'Bad'; readonly fault: WordsFault };

/** `find` as a pack. */
export const wordsPackOf = (find: FindPack): WordsPack => {
  const sum = sumOf(JSON.stringify(find));
  return {
    format: STUDY_FORMAT,
    version: versionOf(find.verses, sum),
    count: find.verses,
    sum,
    find,
  };
};

/** The pack as text, its version before its body. */
export const wordsBodyOf = (pack: WordsPack): string =>
  JSON.stringify({
    format: pack.format,
    version: pack.version,
    count: pack.count,
    sum: pack.sum,
    find: pack.find,
  });

interface Unchecked {
  readonly format?: unknown;
  readonly version?: unknown;
  readonly count?: unknown;
  readonly sum?: unknown;
  readonly find?: unknown;
}

const isRecord = (value: unknown): value is Unchecked =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A body parsed, or not. */
interface Parsed {
  readonly ok: boolean;
  readonly value: unknown;
}

const parsedOf = (body: string): Parsed => {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, value: undefined };
  }
};

/** Whether `value` names its format and its verses, as the index does. */
const isFind = (value: unknown): value is { readonly format: number; readonly verses: number } =>
  typeof value === 'object' &&
  value !== null &&
  'format' in value &&
  typeof value.format === 'number' &&
  'verses' in value &&
  typeof value.verses === 'number';

const hasFields = (value: unknown): value is WordsPack =>
  isRecord(value) &&
  typeof value.format === 'number' &&
  typeof value.version === 'string' &&
  Number.isInteger(value.count) &&
  Number.isInteger(value.sum) &&
  isFind(value.find);

/** `body` checked whole: it parses, has every field, both formats are this app's, `count` is the index's verses, and the sum and version are the index's. */
export const checkWords = (body: string): WordsCheck => atOnce(checkWordsPaced(body));

/** `checkWords` in steps (`src/packs/paced.ts`): the parse, the fields, the index written again, then the sum `SLICE` code units a step. */
export function* checkWordsPaced(body: string): Paced<WordsCheck> {
  const read = parsedOf(body);
  if (!read.ok) return { _tag: 'Bad', fault: 'json' };
  yield undefined;
  if (!hasFields(read.value)) return { _tag: 'Bad', fault: 'fields' };
  const pack = read.value;
  if (pack.format !== STUDY_FORMAT || pack.find.format !== FIND_FORMAT)
    return { _tag: 'Bad', fault: 'format' };
  if (pack.count !== pack.find.verses) return { _tag: 'Bad', fault: 'count' };
  const written = JSON.stringify(pack.find);
  yield undefined;
  const sum = yield* sumPaced([written]);
  if (pack.sum !== sum) return { _tag: 'Bad', fault: 'sum' };
  if (pack.version !== versionOf(pack.count, sum)) return { _tag: 'Bad', fault: 'version' };
  return { _tag: 'Good', pack };
}
