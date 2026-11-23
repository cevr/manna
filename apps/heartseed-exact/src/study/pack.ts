/* oxlint-disable effect/noNullish, effect/noRuntimeTypeof, effect/noTryCatch, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md), so no Schema codec: a pack arrives as text from a server, `JSON.parse` reads it, each field is checked by its runtime type, and a body that does not parse is an answer to name, not a defect. */

/**
 * A study pack as egw.cvr.im serves it and the phone keeps it (q126): the
 * cross-references, the Strong's tags and the lexicon are each one list of
 * strings, `parts`, built by `tools/study.ts` from `bible.db`. A chapter
 * pack holds one part per chapter of the canon, in order; the lexicon its
 * blocks. `sum` is `sumOf` over the parts joined by `\n`, and `version` is
 * `<count>-<sum as 8 hex digits>`, as the commentary's, so the same parts
 * give the same version and the one downloader reads it from the head.
 */

import { versionOf } from '../commentary/pack';
import { atOnce, sumPaced, type Paced } from '../packs/paced';
import { sumOf } from '../text/sum';

/** The study packs' format this app reads. */
export const STUDY_FORMAT = 1;

/** A study pack as served and kept. */
export interface StudyPack {
  readonly format: number;
  readonly version: string;
  readonly count: number;
  readonly sum: number;
  readonly parts: ReadonlyArray<string>;
}

/** Why a body is not a study pack to keep, the first check it fails, in the order they run. */
export type StudyFault = 'json' | 'fields' | 'format' | 'count' | 'parts' | 'sum' | 'version';

/** A body checked: the pack it holds, or the check it failed. */
export type StudyCheck =
  | { readonly _tag: 'Good'; readonly pack: StudyPack }
  | { readonly _tag: 'Bad'; readonly fault: StudyFault };

/** The sum over `parts`, joined by `\n`. */
export const partsSum = (parts: ReadonlyArray<string>): number => sumOf(parts.join('\n'));

/** The pack of `parts`, its count, sum and version theirs. */
export const studyPackOf = (parts: ReadonlyArray<string>): StudyPack => {
  const sum = partsSum(parts);
  return {
    format: STUDY_FORMAT,
    version: versionOf(parts.length, sum),
    count: parts.length,
    sum,
    parts,
  };
};

/** The pack as text, its version among the fields before its body, so `versionAt` finds it in the head. */
export const studyBodyOf = (pack: StudyPack): string =>
  JSON.stringify({
    format: pack.format,
    version: pack.version,
    count: pack.count,
    sum: pack.sum,
    parts: pack.parts,
  });

/** A parsed object, its pack's fields not yet checked. */
interface Unchecked {
  readonly format?: unknown;
  readonly version?: unknown;
  readonly count?: unknown;
  readonly sum?: unknown;
  readonly parts?: unknown;
}

const isRecord = (value: unknown): value is Unchecked =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasFields = (value: unknown): value is StudyPack =>
  isRecord(value) &&
  typeof value.format === 'number' &&
  typeof value.version === 'string' &&
  Number.isInteger(value.count) &&
  Number.isInteger(value.sum) &&
  Array.isArray(value.parts) &&
  value.parts.every((part) => typeof part === 'string');

/** A body parsed, or not: whether it parsed, and what it held. */
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

/**
 * The check of a study pack whose parts number `parts` (any, for none):
 * the body parses, has every field, `format` is 1, `count` is the parts'
 * number and the one asked, and the sum and version are the parts'.
 */
export const studyCheckOf =
  (parts?: number) =>
  (body: string): StudyCheck =>
    atOnce(studyCheckPaced(parts)(body));

/** `studyCheckOf` in steps (`src/packs/paced.ts`): the parse, the fields, then the sum `SLICE` code units a step, so the downloader holds no turn of the data host past its budget. */
export const studyCheckPaced = (parts?: number) =>
  function* checked(body: string): Paced<StudyCheck> {
    const read = parsedOf(body);
    if (!read.ok) return { _tag: 'Bad', fault: 'json' };
    yield undefined;
    if (!hasFields(read.value)) return { _tag: 'Bad', fault: 'fields' };
    const pack = read.value;
    if (pack.format !== STUDY_FORMAT) return { _tag: 'Bad', fault: 'format' };
    if (pack.count !== pack.parts.length) return { _tag: 'Bad', fault: 'count' };
    if (parts !== undefined && pack.count !== parts) return { _tag: 'Bad', fault: 'parts' };
    yield undefined;
    const sum = yield* sumPaced(pack.parts);
    if (pack.sum !== sum) return { _tag: 'Bad', fault: 'sum' };
    if (pack.version !== versionOf(pack.count, sum)) return { _tag: 'Bad', fault: 'version' };
    return { _tag: 'Good', pack };
  };
