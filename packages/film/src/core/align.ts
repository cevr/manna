import { Array as Arr, Option, Result } from 'effect';
import { BeatUnplaced } from './errors.ts';
import { normalizeWords } from './narration.ts';
import { type Pcm, fadeEdges, slice } from './audio.ts';
import type { Word } from './schema.ts';

export const wordError = (want: ReadonlyArray<string>, got: ReadonlyArray<string>): number => {
  let previous: ReadonlyArray<number> = Arr.makeBy(got.length + 1, (j) => j);
  for (const [i, w] of want.entries()) {
    const row: Array<number> = [i + 1];
    for (const [j, g] of got.entries()) {
      const substitute = Arr.getUnsafe(previous, j) + Number(w !== g);
      row.push(Math.min(Arr.getUnsafe(previous, j + 1) + 1, Arr.getUnsafe(row, j) + 1, substitute));
    }
    previous = row;
  }
  return Arr.getUnsafe(previous, got.length) / Math.max(1, want.length);
};

interface Token {
  readonly text: string;
  readonly owner: number;
}

const tokensOf = (words: ReadonlyArray<string>): ReadonlyArray<Token> =>
  words.flatMap((word, owner) => normalizeWords(word).map((text) => ({ text, owner })));

interface Paired {
  readonly got: number;
  readonly exact: boolean;
}

const PAIR = 0;
const LEFT_OVER = 1;
const UNHEARD = 2;
const MOVES = [PAIR, LEFT_OVER, UNHEARD] as const;
type Move = (typeof MOVES)[number];

const GAP_OPEN = 1;

const costs = (want: ReadonlyArray<string>, got: ReadonlyArray<string>) => {
  const width = got.length + 1;
  const table = MOVES.map(() => new Float32Array((want.length + 1) * width).fill(Infinity));
  const cell = (move: Move, i: number, j: number) =>
    Arr.getUnsafe(table, move)[i * width + j] ?? Infinity;
  const set = (move: Move, i: number, j: number, v: number) => {
    Arr.getUnsafe(table, move)[i * width + j] = v;
  };
  const best = (i: number, j: number) => Math.min(...MOVES.map((m) => cell(m, i, j)));
  const opened = (i: number, j: number, run: Move) =>
    Math.min(...MOVES.map((m) => cell(m, i, j) + Number(m !== run) * GAP_OPEN + 1));
  set(PAIR, 0, 0, 0);
  for (let i = 0; i <= want.length; i++)
    for (let j = 0; j <= got.length; j++) {
      if (i > 0 && j > 0)
        set(
          PAIR,
          i,
          j,
          best(i - 1, j - 1) + Number(Arr.getUnsafe(want, i - 1) !== Arr.getUnsafe(got, j - 1)),
        );
      if (j > 0) set(LEFT_OVER, i, j, opened(i, j - 1, LEFT_OVER));
      if (i > 0) set(UNHEARD, i, j, opened(i - 1, j, UNHEARD));
    }
  return cell;
};

const lineUp = (
  want: ReadonlyArray<string>,
  got: ReadonlyArray<string>,
): ReadonlyArray<Option.Option<Paired>> => {
  const cell = costs(want, got);
  const out: Array<Option.Option<Paired>> = Arr.makeBy(want.length, () => Option.none());
  const cheapest = (i: number, j: number, run: Option.Option<Move>): Move => {
    const extra = (m: Move) =>
      Option.match(run, {
        onNone: () => 0,
        onSome: (r) => Number(r !== PAIR && m !== r) * GAP_OPEN,
      });
    let chosen: Move = PAIR;
    for (const m of MOVES)
      if (cell(m, i, j) + extra(m) < cell(chosen, i, j) + extra(chosen)) chosen = m;
    return chosen;
  };
  let i = want.length;
  let j = got.length;
  let move = cheapest(i, j, Option.none());
  while (i > 0 && j > 0) {
    const from = move;
    if (from === PAIR) {
      out[i - 1] = Option.some({
        got: j - 1,
        exact: Arr.getUnsafe(want, i - 1) === Arr.getUnsafe(got, j - 1),
      });
      i -= 1;
      j -= 1;
    } else if (from === LEFT_OVER) j -= 1;
    else i -= 1;
    move = cheapest(i, j, Option.some(from));
  }
  return out;
};

type WordTime = Pick<Word, 'start' | 'end'>;

const widen = (a: Option.Option<WordTime>, b: WordTime): WordTime =>
  Option.match(a, {
    onNone: () => b,
    onSome: (s) => ({ start: Math.min(s.start, b.start), end: Math.max(s.end, b.end) }),
  });

const fillGaps = (
  heard: ReadonlyArray<Option.Option<WordTime>>,
  duration: number,
): Array<WordTime> => {
  const out: Array<WordTime> = [];
  let i = 0;
  while (i < heard.length) {
    const found = Arr.getUnsafe(heard, i);
    if (Option.isSome(found)) {
      out.push(found.value);
      i += 1;
      continue;
    }
    const next = Arr.findFirstIndex(heard, (s, k) => k > i && Option.isSome(s));
    const to = Option.getOrElse(next, () => heard.length);
    const from = Option.getOrElse(
      Option.map(Arr.last(out), (s) => s.end),
      () => 0,
    );
    const until = Option.getOrElse(
      Option.flatMap(next, (k) => Option.map(Arr.getUnsafe(heard, k), (s) => s.start)),
      () => duration,
    );
    const gap = Math.max(0, until - from);
    const n = to - i;
    for (let r = 0; r < n; r++)
      out.push({ start: from + (gap * r) / n, end: from + (gap * (r + 1)) / n });
    i = to;
  }
  return out;
};

const ordered = (spans: ReadonlyArray<WordTime>, duration: number): ReadonlyArray<WordTime> => {
  let floor = 0;
  return spans.map((s) => {
    const end = Math.min(duration, Math.max(s.end, s.start, floor));
    const start = Math.min(Math.max(s.start, floor), end);
    floor = start;
    return { start, end };
  });
};

export const timeScript = (
  spoken: string,
  heard: ReadonlyArray<Word>,
  duration: number,
): Array<Word> => {
  const words = spoken.split(/\s+/).filter((w) => w.length > 0);
  const want = tokensOf(words);
  const got = tokensOf(heard.map((h) => h.text));
  const pairs = lineUp(
    want.map((t) => t.text),
    got.map((t) => t.text),
  );
  const spans: Array<Option.Option<WordTime>> = words.map(() => Option.none());
  for (const [k, pair] of pairs.entries()) {
    if (Option.isNone(pair)) continue;
    const owner = Arr.getUnsafe(want, k).owner;
    const at = Arr.getUnsafe(heard, Arr.getUnsafe(got, pair.value.got).owner);
    spans[owner] = Option.some(widen(Arr.getUnsafe(spans, owner), at));
  }
  const timed = ordered(fillGaps(spans, duration), duration);
  return words.map((text, i) => ({ text, ...Arr.getUnsafe(timed, i) }));
};

interface BeatText {
  readonly id: string;
  readonly text: string;
}

export interface BeatSpan {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly before: number;
  readonly after: number;
}

const MIN_HEARD = 0.5;

export const placeBeats = (
  beats: ReadonlyArray<BeatText>,
  heard: ReadonlyArray<Word>,
  duration: number,
): Result.Result<ReadonlyArray<BeatSpan>, BeatUnplaced> => {
  const want = beats.flatMap((beat, owner) =>
    normalizeWords(beat.text).map((text) => ({ text, owner })),
  );
  const got = tokensOf(heard.map((h) => h.text));
  const pairs = lineUp(
    want.map((t) => t.text),
    got.map((t) => t.text),
  );
  return Result.all(
    beats.map((beat, owner) => {
      const mine = pairs.filter((_, k) => Arr.getUnsafe(want, k).owner === owner);
      const found = Arr.getSomes(mine);
      const exact = found.filter((p) => p.exact).length / Math.max(1, mine.length);
      const first = Arr.head(found);
      const last = Arr.last(found);
      if (exact < MIN_HEARD || Option.isNone(first) || Option.isNone(last))
        return Result.fail(BeatUnplaced.make({ beat: beat.id, heard: exact }));
      const word = (p: Paired) => Arr.getUnsafe(got, p.got).owner;
      const from = word(first.value);
      const to = word(last.value);
      return Result.succeed({
        id: beat.id,
        start: Arr.getUnsafe(heard, from).start,
        end: Arr.getUnsafe(heard, to).end,
        before: Option.getOrElse(
          Option.map(Arr.get(heard, from - 1).pipe(Option.filter(() => from > 0)), (w) => w.end),
          () => 0,
        ),
        after: Option.getOrElse(
          Option.map(Arr.get(heard, to + 1), (w) => w.start),
          () => duration,
        ),
      });
    }),
  );
};

interface Cut {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

const CUT_WINDOW = 0.01;

export const CUT_FADE = 0.005;

const quietestAt = (pcm: Pcm, from: number, to: number): number => {
  const window = Math.max(1, Math.round(CUT_WINDOW * pcm.rate));
  const first = Math.max(0, Math.ceil(from * pcm.rate));
  const last = Math.min(pcm.frames, Math.floor(to * pcm.rate)) - window;
  if (last < first) return (from + to) / 2;
  const plane = Arr.getUnsafe(pcm.channels, 0);
  let best = first;
  let quietest = Number.POSITIVE_INFINITY;
  for (let at = first; at <= last; at += Math.max(1, Math.floor(window / 2))) {
    let power = 0;
    for (let i = at; i < at + window; i++) power += (plane[i] ?? 0) ** 2;
    if (power < quietest) {
      quietest = power;
      best = at;
    }
  }
  return (best + window / 2) / pcm.rate;
};

export const cutsAround = (spans: ReadonlyArray<BeatSpan>, pcm: Pcm): ReadonlyArray<Cut> =>
  spans.map((span) => ({
    id: span.id,
    from: quietestAt(pcm, span.before, span.start),
    to: quietestAt(pcm, span.end, span.after),
  }));

export const cutPcm = (pcm: Pcm, cut: Cut): Pcm => {
  const at = (seconds: number) => Math.min(pcm.frames, Math.max(0, Math.round(seconds * pcm.rate)));
  return fadeEdges(slice(pcm, at(cut.from), at(cut.to) - at(cut.from)), CUT_FADE);
};
