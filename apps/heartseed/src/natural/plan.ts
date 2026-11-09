import { Option } from 'effect';

/** The most symbols one chunk speaks, its words joined by one space; Kokoro takes 510 a call, and a short chunk starts sooner. */
export const CHUNK_CAP = 200;
/** Samples in one of Kokoro's duration frames, at 24 kHz. */
export const SAMPLES_PER_FRAME = 600;
/**
 * The silence after a phrase, in samples at 24 kHz, by how it ends: a
 * comma 300 ms, a `;` or `:` 550 ms, a sentence 800 ms, a line break
 * 1,100 ms (the owner's Gentle spacing).
 */
export const RESTS = { comma: 7_200, clause: 13_200, sentence: 19_200, verse: 26_400 } as const;

/** The edge characters a word speaks; every other edge character is silent. */
const SPOKEN = /[,.:;?!()]/u;
/** The edge characters that end a phrase. */
const ENDS = /[,.:;?!]/u;
const WORDLIKE = /[\p{L}\p{N}]/u;
const EDGES = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u;
/** The marks spoken as another: `;` and `:` are read as a full stop, the text on screen keeping them (owner q25). */
const SAID_AS: ReadonlyMap<string, string> = new Map([
  [';', '.'],
  [':', '.'],
]);
/** The rest after a phrase by the last mark of its last word's trail. */
const REST_AFTER: ReadonlyMap<string, number> = new Map([
  [',', RESTS.comma],
  [';', RESTS.clause],
  [':', RESTS.clause],
  ['.', RESTS.sentence],
  ['?', RESTS.sentence],
  ['!', RESTS.sentence],
]);

/** Where a word lights: the index in its chunk's ids of its first phoneme, and the word's whole run in the text (UTF-16). */
export interface WordMark {
  readonly token: number;
  readonly location: number;
  readonly length: number;
}

/**
 * What the model is given in one call: BOS, the words' symbol ids joined by
 * the space id, EOS; each word's mark; and the silence after its audio, in
 * samples (0 after the text's last chunk and inside a phrase).
 */
export interface Chunk {
  readonly ids: ReadonlyArray<number>;
  readonly marks: ReadonlyArray<WordMark>;
  readonly rest: number;
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

/**
 * One word as it is spoken: its run, its spoken lead, phonemes and trail
 * (code points), their count, the rest a phrase ending at it takes (0 when
 * none ends there), and whether a phrase ends at it.
 */
interface Said {
  readonly location: number;
  readonly length: number;
  readonly lead: ReadonlyArray<string>;
  readonly body: ReadonlyArray<string>;
  readonly trail: ReadonlyArray<string>;
  readonly size: number;
  readonly rest: number;
  readonly ends: boolean;
}

/** An edge's spoken characters, `;` and `:` as a full stop. */
const spokenOf = (edge: string): ReadonlyArray<string> =>
  Array.from(edge)
    .filter((char) => SPOKEN.test(char))
    .map((char) => SAID_AS.get(char) ?? char);

/** The symbols `said` speaks, its words joined by one space. */
const sizeOf = (said: ReadonlyArray<Said>): number =>
  said.reduce((total, each) => total + each.size, 0) + Math.max(0, said.length - 1);

/** Splits the spoken words into phrases, each ending at a word a phrase ends at. */
const phrasesOf = (said: ReadonlyArray<Said>): ReadonlyArray<ReadonlyArray<Said>> => {
  const phrases: Array<Array<Said>> = [];
  let open: Array<Said> = [];
  for (const each of said) {
    open.push(each);
    if (each.ends) {
      phrases.push(open);
      open = [];
    }
  }
  if (open.length > 0) phrases.push(open);
  return phrases;
};

/** Breaks a phrase greedily between its words: a word joins the open group while the group stays within the cap. */
const groupsOf = (phrase: ReadonlyArray<Said>): ReadonlyArray<ReadonlyArray<Said>> => {
  const groups: Array<Array<Said>> = [];
  let open: Array<Said> = [];
  for (const each of phrase) {
    if (open.length === 0 || sizeOf([...open, each]) <= CHUNK_CAP) open.push(each);
    else {
      groups.push(open);
      open = [each];
    }
  }
  if (open.length > 0) groups.push(open);
  return groups;
};

/** One chunk's ids, marks and rest; every symbol is known to be in `vocab`. */
const chunkOf = (
  said: ReadonlyArray<Said>,
  vocab: ReadonlyMap<string, number>,
  rest: number,
): Chunk => {
  const ids: Array<number> = [0];
  const marks: Array<WordMark> = [];
  for (const [index, each] of said.entries()) {
    if (index > 0) ids.push(vocab.get(' ') ?? 0);
    for (const char of each.lead) ids.push(vocab.get(char) ?? 0);
    marks.push({ token: ids.length, location: each.location, length: each.length });
    for (const char of [...each.body, ...each.trail]) ids.push(vocab.get(char) ?? 0);
  }
  ids.push(0);
  return { ids, marks, rest };
};

/**
 * A piece's displayed text planned for the natural voice, or none when it
 * has no word, a word's key is not in `words`, a symbol it would speak is
 * not in `vocab`, or one word alone speaks over the cap. A phrase ends at a
 * word whose trail holds one of `,.:;?!`, or before a line break (mark-only
 * runs between words count as the gap). Each phrase is its own chunk, so
 * Kokoro reads one phrase a call; only a phrase over the cap breaks, greedily
 * between its words. A phrase's last chunk rests by its ending (`RESTS`: a
 * line break `verse`, else the trail's last mark), a chunk inside a phrase
 * and the text's last chunk rest 0.
 */
export const planOf = (
  words: ReadonlyMap<string, string>,
  vocab: ReadonlyMap<string, number>,
  text: string,
): Option.Option<NaturalPlan> => {
  const said: Array<Said> = [];
  let after = 0;
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
    const previous = said.at(-1);
    if (previous && text.slice(after, run.index).includes('\n')) {
      said[said.length - 1] = { ...previous, rest: RESTS.verse, ends: true };
    }
    const rest = REST_AFTER.get(Array.from(trail).findLast((char) => ENDS.test(char)) ?? '') ?? 0;
    said.push({
      ...spoken,
      location: run.index,
      length: run[0].length,
      size: symbols.length,
      rest,
      ends: rest > 0,
    });
    after = run.index + run[0].length;
  }
  const last = said.at(-1);
  if (!last) return Option.none();
  said[said.length - 1] = { ...last, rest: 0 };
  const groups = phrasesOf(said).flatMap(groupsOf);
  return Option.some({
    chunks: groups.map((group) => chunkOf(group, vocab, group.at(-1)?.rest ?? 0)),
  });
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
