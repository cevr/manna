/* oxlint-disable effect/noTernary, effect/noNullish -- the model writes the spec's rules out as plain branches over undefined, one character at a time, apart from the app's regular expressions and Option code, so the two cannot share a mistake. */

/**
 * The independent model of the pieces of verses an earlier build kept
 * (hsphrase), and of what this build does with them (hspiece W2 and M),
 * written plainly for the tests to judge the app by:
 * - the reference an old piece was stored under, `<verse> [<first>-<last>]`
 *   (`phraseRefRule`), and its strict reader (`phraseOfRule`);
 * - old pieces of a verse as main stored them, for generated stores
 *   (`oldPiecesRule`);
 * - the cue a verse is said under next: its own ladder once planted, else
 *   the full text, whatever old pieces of it are planted (`wholeCueRule`);
 * - the field, each old piece folded into its verse (`fieldFoldRule`).
 *
 * Nothing here reads `src/phrase.ts`.
 */

import type { Recall } from '../sayit';
import { sownDate, type ModelField, type ModelPassage, type ModelPlantStage } from './field-model';
import { referenceCue, referenceStage, type ModelCue } from './garden-model';

/** An old piece's reference. */
export const phraseRefRule = (verse: string, first: number, last: number): string =>
  `${verse} [${first}-${last}]`;

/** The most words main learned a verse whole in, and the most an old piece held. */
const LONGEST = 12;

/**
 * Old pieces of a verse of `words` words as references, in order: none for
 * 12 words or fewer; else the fewest runs of at most 12 words, as even as
 * whole words allow, the longer first. Main cut by punctuation too; a store
 * holds any such ranges, and this build reads them by their form alone.
 */
export const oldPiecesRule = (verse: string, words: number): string[] => {
  if (words <= LONGEST) return [];
  const count = Math.ceil(words / LONGEST);
  const out: string[] = [];
  let first = 1;
  for (let index = 0; index < count; index += 1) {
    const size = Math.floor(words / count) + (index < words % count ? 1 : 0);
    out.push(phraseRefRule(verse, first, first + size - 1));
    first += size;
  }
  return out;
};

/** A piece as the tests hold it: its reference. */
interface ModelReferenced {
  readonly reference: string;
}

/** The piece named `reference` among `pieces`. */
export const pieceRule = <P extends ModelReferenced>(
  pieces: readonly P[],
  reference: string,
): P | undefined => pieces.find((piece) => piece.reference === reference);

/** The verse a reference belongs to: an old piece's verse, else itself. */
export const verseOfRule = (reference: string) => phraseOfRule(reference)?.verse ?? reference;

/** The cue `reference` is said under next: its own ladder once planted, else the full text, whatever old pieces of it are planted. */
export const wholeCueRule = (
  plants: ReadonlyMap<string, readonly Recall[]>,
  reference: string,
): ModelCue => {
  const own = plants.get(reference);
  if (own !== undefined && own.length > 0) return referenceCue(own);
  return 'full';
};

/**
 * H7: the field over `records` (one per recital) and the passages taught,
 * each old piece folded into its verse. A verse with a plant of its own
 * shows its stage; else `not planted`, whatever old pieces of it are
 * planted (owner q87 (b)). Every other verse a plant names (an old piece's verse for
 * an old piece) is a row of its own, by its earliest recall among its
 * plants, then its reference in code units. Days sown count every recall;
 * the harvest counts verses' own plants at full corn, never an old piece's.
 */
export const fieldFoldRule = (
  records: readonly Recall[],
  passages: readonly ModelPassage[],
): ModelField => {
  const held = new Map<string, Recall[]>();
  for (const recall of records) {
    const list = held.get(recall.reference) ?? [];
    list.push(recall);
    held.set(recall.reference, list);
  }
  const stage = (verse: string): ModelPlantStage => {
    const own = held.get(verse);
    if (own !== undefined) return referenceStage(own);
    return 'not planted';
  };
  const taught = passages.flatMap((passage) => passage.verses);
  const firsts = new Map<string, number>();
  for (const recall of records) {
    const verse = verseOfRule(recall.reference);
    if (taught.includes(verse)) continue;
    const first = firsts.get(verse);
    if (first === undefined || recall.startedAt < first) firsts.set(verse, recall.startedAt);
  }
  const others = [...firsts.entries()].toSorted((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    if (a[0] === b[0]) return 0;
    return a[0] < b[0] ? -1 : 1;
  });
  let harvest = 0;
  for (const [reference, recalls] of held)
    if (phraseOfRule(reference) === undefined && referenceStage(recalls) === 'full corn')
      harvest += 1;
  return {
    rows: [
      ...passages.map((passage) => ({
        title: passage.title,
        plants: passage.verses.map((reference) => ({ reference, stage: stage(reference) })),
      })),
      ...others.map(([verse]) => ({
        title: verse,
        plants: [{ reference: verse, stage: stage(verse) }],
      })),
    ],
    sown: new Set(records.map(sownDate)).size,
    harvest,
  };
};

const DIGITS = '0123456789';

/** A whole number written with digits only, no sign, no leading zero, from 1, within the safe integers; else undefined. */
const wholeOf = (written: string): number | undefined => {
  if (written.length === 0 || written[0] === '0') return undefined;
  for (const char of written) if (!DIGITS.includes(char)) return undefined;
  const value = Number(written);
  return Number.isSafeInteger(value) ? value : undefined;
};

/** The verse and word numbers of an old piece's reference, read from the end; undefined for any other text. */
export const phraseOfRule = (
  reference: string,
): { verse: string; first: number; last: number } | undefined => {
  if (!reference.endsWith(']')) return undefined;
  const open = reference.lastIndexOf('[');
  if (open < 2 || reference[open - 1] !== ' ') return undefined;
  const verse = reference.slice(0, open - 1);
  if (verse.includes('[') || verse.includes(']')) return undefined;
  const range = reference.slice(open + 1, -1).split('-');
  if (range.length !== 2) return undefined;
  const first = wholeOf(range[0]!);
  const last = wholeOf(range[1]!);
  if (first === undefined || last === undefined || first > last) return undefined;
  return { verse, first, last };
};
