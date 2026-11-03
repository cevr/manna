import { Array as Arr, Option } from 'effect';
import type { CaptionCue } from './captions.ts';
import type { Placed } from './layout.ts';
import { CLAUSE, SENTENCE } from './narration.ts';
import type { HeardWord, Word } from './schema.ts';
import type { ResolvedShort } from './shorts.ts';
import { CLOCK_EPSILON } from './time.ts';
import { heard } from './voiced.ts';

const PHRASE_MAX = 4;
export const PHRASE_HOLD = 0.6;

interface PhraseWord extends Word {
  readonly quoted: boolean;
}

export interface Phrase {
  readonly start: number;
  readonly end: number;
  readonly words: ReadonlyArray<PhraseWord>;
}

export const PHRASE_GAP = 0.3;

export const quotedWords = (words: ReadonlyArray<Word>): ReadonlyArray<boolean> => {
  let inside = false;
  return words.map((w) => {
    if (w.text.includes('“')) inside = true;
    const quoted = inside;
    if (w.text.includes('”')) inside = false;
    return quoted;
  });
};

const run = (from: number, to: number) => Arr.makeBy(to - from, (i) => from + i);

const cutBefore = <A>(items: ReadonlyArray<A>, cut: (a: A, i: number) => boolean) =>
  items.reduce<Array<Array<A>>>((groups, a, i) => {
    Option.match(
      Option.filter(Arr.last(groups), () => !cut(a, i)),
      {
        onNone: () => groups.push([a]),
        onSome: (last) => last.push(a),
      },
    );
    return groups;
  }, []);

const balanced = (indices: ReadonlyArray<number>): Array<ReadonlyArray<number>> => {
  const k = Math.ceil(indices.length / PHRASE_MAX);
  const base = Math.floor(indices.length / k);
  const extra = indices.length % k;
  return Arr.makeBy(k, (j) => {
    const from = j * base + Math.min(j, extra);
    return indices.slice(from, from + base + Number(j < extra));
  });
};

const joinLone = (
  groups: ReadonlyArray<ReadonlyArray<number>>,
  joins: (first: ReadonlyArray<number>, then: ReadonlyArray<number>) => boolean,
): Array<ReadonlyArray<number>> => {
  const out: Array<ReadonlyArray<number>> = [];
  let carry: ReadonlyArray<number> = [];
  groups.forEach((g, i) => {
    const group = [...carry, ...g];
    carry = [];
    const lone = group.length === 1;
    const forward = Option.filter(Arr.get(groups, i + 1), (next) => joins(group, next));
    const back = Option.filter(Arr.last(out), (before) => joins(before, group));
    if (lone && Option.isSome(forward)) carry = group;
    else if (lone && Option.isSome(back)) out[out.length - 1] = [...back.value, ...group];
    else out.push(group);
  });
  return out;
};

export const phrasesOf = (
  words: ReadonlyArray<Word>,
  turns: ReadonlySet<number> = new Set(),
  quoted: ReadonlyArray<boolean> = quotedWords(words),
): ReadonlyArray<Phrase> => {
  const closes = (pattern: RegExp) => (i: number) =>
    Option.exists(Arr.get(words, i), (w) => pattern.test(w.text));
  const ends = closes(SENTENCE);
  const pauses = closes(CLAUSE);
  const runsOn = (first: ReadonlyArray<number>, then: ReadonlyArray<number>) =>
    Option.exists(
      Option.all([
        Option.flatMap(Arr.last(first), (i) => Arr.get(words, i)),
        Option.flatMap(Arr.head(then), (i) => Arr.get(words, i)),
      ]),
      ([last, next]) => next.start - last.end <= PHRASE_GAP + CLOCK_EPSILON,
    );
  const sentences = cutBefore(run(0, words.length), (i) => turns.has(i) || ends(i - 1));
  const chunks = sentences.flatMap((sentence) =>
    joinLone(
      cutBefore(sentence, (i, at) => at > 0 && pauses(i - 1)),
      runsOn,
    ).flatMap(balanced),
  );
  const phrased = chunks.flatMap((chunk) =>
    Option.toArray(
      Option.map(Arr.head(chunk), (first) => ({
        first,
        words: chunk.flatMap((i) =>
          Option.toArray(
            Option.map(Arr.get(words, i), (w) => ({ ...w, quoted: quoted[i] === true })),
          ),
        ),
      })),
    ),
  );
  return phrased.flatMap((p, i) =>
    Option.toArray(
      Option.map(Option.all([Arr.head(p.words), Arr.last(p.words)]), ([first, last]) => {
        const held = last.end + PHRASE_HOLD;
        const next = Option.flatMap(Arr.get(phrased, i + 1), (q) => Arr.head(q.words));
        const end = Option.match(next, {
          onNone: () => held,
          onSome: (n) => Math.min(n.start, held),
        });
        return { start: first.start, end, words: p.words };
      }),
    ),
  );
};

const spanPhrases = (
  words: ReadonlyArray<HeardWord>,
  p: Placed,
  span: ResolvedShort['spans'][number],
  fps: number,
): ReadonlyArray<Phrase> => {
  const quoted = quotedWords(words);
  const offset = p.start + p.speechStart;
  const slack = 0.5 / fps + CLOCK_EPSILON;
  const inside = run(0, words.length).filter((i) =>
    Option.exists(Arr.get(words, i), (w) => {
      const at = offset + w.start;
      return at >= span.from - slack && at < span.to - slack;
    }),
  );
  const shift = span.at - span.from + offset;
  const turnAt = new Set(p.voice.turns.map((t) => t.word));
  const local = inside.flatMap((i) =>
    Option.toArray(
      Option.map(Arr.get(words, i), (w) => ({
        text: w.text,
        start: w.start + shift,
        end: w.end + shift,
      })),
    ),
  );
  const turns = new Set(
    inside.flatMap((i, j) => Option.toArray(Option.liftPredicate(j, () => turnAt.has(i)))),
  );
  const spanEnd = span.at + (span.to - span.from);
  return phrasesOf(
    local,
    turns,
    inside.map((i) => quoted[i] === true),
  ).map((phrase) => ({
    ...phrase,
    start: Math.max(phrase.start - slack, span.at),
    end: Math.min(phrase.end - slack, spanEnd),
  }));
};

export const shortPhrases = (
  placed: ReadonlyArray<Placed>,
  short: ResolvedShort,
): ReadonlyArray<Phrase> =>
  short.spans.flatMap((span) =>
    Option.match(
      Arr.findFirst(placed, (p) => p.spec.id === span.scene),
      {
        onNone: () => [],
        onSome: (p) => spanPhrases(heard(p.voice.words), p, span, short.fps),
      },
    ),
  );

export const phraseCues = (phrases: ReadonlyArray<Phrase>): Array<CaptionCue> =>
  phrases.map((p) => ({ start: p.start, end: p.end, text: p.words.map((w) => w.text).join(' ') }));
