import { Option } from 'effect';

/** The most symbols one chunk speaks, its words joined by one space; Kokoro takes 510 a call, and a short chunk starts sooner. */
export const CHUNK_CAP = 200;
/** Samples in one of Kokoro's duration frames, at 24 kHz. */
export const SAMPLES_PER_FRAME = 600;

/** The edge characters a word speaks; every other edge character is silent. */
const SPOKEN = /[,.:;?!()]/u;
/** The spoken edge characters that end a clause. */
const ENDS = /[,.:;?!]/u;
const WORDLIKE = /[\p{L}\p{N}]/u;
const EDGES = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u;

/** Where a word lights: the index in its chunk's ids of its first phoneme, and the word's whole run in the text (UTF-16). */
export interface WordMark {
  readonly token: number;
  readonly location: number;
  readonly length: number;
}

/** What the model is given in one call: BOS, the words' symbol ids joined by the space id, EOS; and each word's mark. */
export interface Chunk {
  readonly ids: ReadonlyArray<number>;
  readonly marks: ReadonlyArray<WordMark>;
}

/** A piece's text as the natural voice reads it, chunk by chunk. */
export interface NaturalPlan {
  readonly chunks: ReadonlyArray<Chunk>;
}

/** The sample of a chunk's audio at which a word starts, and the word's run in the text. */
export interface WordStart {
  readonly sample: number;
  readonly location: number;
  readonly length: number;
}

/** One word as it is spoken: its run, its spoken lead, phonemes and trail (code points), their count, and whether it ends a clause. */
interface Said {
  readonly location: number;
  readonly length: number;
  readonly lead: ReadonlyArray<string>;
  readonly body: ReadonlyArray<string>;
  readonly trail: ReadonlyArray<string>;
  readonly size: number;
  readonly ends: boolean;
}

const spokenOf = (edge: string): ReadonlyArray<string> =>
  Array.from(edge).filter((char) => SPOKEN.test(char));

/** The symbols `said` speaks, its words joined by one space. */
const sizeOf = (said: ReadonlyArray<Said>): number =>
  said.reduce((total, each) => total + each.size, 0) + Math.max(0, said.length - 1);

/** Splits the spoken words into clauses, each ending at a word whose spoken trail ends a clause. */
const clausesOf = (said: ReadonlyArray<Said>): ReadonlyArray<ReadonlyArray<Said>> => {
  const clauses: Array<Array<Said>> = [];
  let open: Array<Said> = [];
  for (const each of said) {
    open.push(each);
    if (each.ends) {
      clauses.push(open);
      open = [];
    }
  }
  if (open.length > 0) clauses.push(open);
  return clauses;
};

/** Packs units greedily: a unit joins the last chunk while the two together stay within the cap. */
const packOf = (units: ReadonlyArray<ReadonlyArray<Said>>): ReadonlyArray<ReadonlyArray<Said>> => {
  const chunks: Array<Array<Said>> = [];
  let last: Array<Said> = [];
  for (const unit of units) {
    if (last.length === 0 || sizeOf([...last, ...unit]) <= CHUNK_CAP) last.push(...unit);
    else {
      chunks.push(last);
      last = [...unit];
    }
  }
  if (last.length > 0) chunks.push(last);
  return chunks;
};

/** One chunk's ids and marks; every symbol is known to be in `vocab`. */
const chunkOf = (said: ReadonlyArray<Said>, vocab: ReadonlyMap<string, number>): Chunk => {
  const ids: Array<number> = [0];
  const marks: Array<WordMark> = [];
  for (const [index, each] of said.entries()) {
    if (index > 0) ids.push(vocab.get(' ') ?? 0);
    for (const char of each.lead) ids.push(vocab.get(char) ?? 0);
    marks.push({ token: ids.length, location: each.location, length: each.length });
    for (const char of [...each.body, ...each.trail]) ids.push(vocab.get(char) ?? 0);
  }
  ids.push(0);
  return { ids, marks };
};

/**
 * A piece's displayed text planned for the natural voice, or none when it
 * has no word, a word's key is not in `words`, a symbol it would speak is
 * not in `vocab`, or one word alone speaks over the cap. A clause within the
 * cap stays in one chunk; a longer one may break between any of its words.
 */
export const planOf = (
  words: ReadonlyMap<string, string>,
  vocab: ReadonlyMap<string, number>,
  text: string,
): Option.Option<NaturalPlan> => {
  const said: Array<Said> = [];
  for (const run of text.matchAll(/\S+/gu)) {
    if (!WORDLIKE.test(run[0])) continue;
    const [, lead = '', key = '', trail = ''] = EDGES.exec(run[0]) ?? [];
    const body = words.get(key);
    // oxlint-disable-next-line effect/noNullish -- a Map's get gives an absent key as undefined, and the loop's early return is the plan's none.
    if (body === undefined) return Option.none();
    const spoken = { lead: spokenOf(lead), body: Array.from(body), trail: spokenOf(trail) };
    const symbols = [...spoken.lead, ...spoken.body, ...spoken.trail];
    if (symbols.length > CHUNK_CAP || symbols.some((char) => !vocab.has(char))) {
      return Option.none();
    }
    said.push({
      ...spoken,
      location: run.index,
      length: run[0].length,
      size: symbols.length,
      ends: spoken.trail.some((char) => ENDS.test(char)),
    });
  }
  if (said.length === 0) return Option.none();
  const units = clausesOf(said).flatMap((clause) =>
    // oxlint-disable-next-line effect/noTernary -- a clause within the cap is one unit, else each word is; two plain branches.
    sizeOf(clause) <= CHUNK_CAP ? [clause] : clause.map((each) => [each]),
  );
  return Option.some({ chunks: packOf(units).map((group) => chunkOf(group, vocab)) });
};

/**
 * Each word's start in a chunk's audio from the model's frames per id: the
 * frames of every id before the word's first phoneme, in samples. None when
 * the durations do not fit the chunk: a count per id, each a whole frame or
 * more (the model never gives an id no frame).
 */
export const startsOf = (
  chunk: Chunk,
  durations: ReadonlyArray<number>,
): Option.Option<ReadonlyArray<WordStart>> => {
  if (durations.length !== chunk.ids.length) return Option.none();
  if (!durations.every((frames) => Number.isInteger(frames) && frames >= 1)) return Option.none();
  const before: Array<number> = [0];
  for (const frames of durations) before.push((before.at(-1) ?? 0) + frames);
  return Option.some(
    chunk.marks.map((mark) => ({
      sample: (before[mark.token] ?? 0) * SAMPLES_PER_FRAME,
      location: mark.location,
      length: mark.length,
    })),
  );
};
