/**
 * A verse's lines, pure: consecutive runs of its words (the voice's, by
 * `wordSpans`, numbered from 0) that follow its punctuation, so Today can
 * show a long verse's shape while it stays one verse under one reference.
 * A verse of 20 words or fewer is one line. Walking the words in order, the
 * open line ends after a word whose gap (the text from its last letter or
 * number to the next word's first) holds one of `. ; : ? !` once the line
 * holds 4 words and 4 follow, or holds a comma once it holds 6 and 6
 * follow; never at any other gap, so a clause with no mark stays one line.
 * The last line takes the words left. The lines are drawing only: nothing
 * read aloud, heard, matched or stored is made from them.
 */

import { wordSpans } from '../voice/reading';

/** A line: its first and last word, by word number from 0. */
export interface Line {
  readonly first: number;
  readonly last: number;
}

/** The most words a verse shown as one line holds. */
const WHOLE = 20;

/** The least words a line closed at a strong mark holds, and leaves after it. */
const AT_STRONG = 4;

/** The least words a line closed at a comma holds, and leaves after it. */
const AT_COMMA = 6;

const LETTER = /[\p{L}\p{N}]/u;
const STRONG = /[.;:?!]/u;

/** The index in `text` of the first letter or number at or after `from`. */
const firstLetter = (text: string, from: number) => {
  const at = text.slice(from).search(LETTER);
  if (at < 0) return text.length;
  return from + at;
};

/** The index in `text` just past the last letter or number before `to`. */
const pastLastLetter = (text: string, from: number, to: number) => {
  const run = [...text.slice(from, to)];
  let end = to - from;
  for (let at = run.length - 1; at >= 0; at -= 1) {
    if (LETTER.test(run[at] ?? '')) break;
    end -= (run[at] ?? '').length;
  }
  return from + end;
};

/** The least words a line closed at `gap` holds and leaves: 4 at a strong mark, 6 at a comma, never at any other gap. */
const leastAt = (gap: string) => {
  if (STRONG.test(gap)) return AT_STRONG;
  if (gap.includes(',')) return AT_COMMA;
  return Number.POSITIVE_INFINITY;
};

/** The gap after each word but the last: the text from its last letter or number to the next word's first. */
const gapsOf = (text: string): readonly string[] => {
  const spans = wordSpans(text);
  return spans
    .slice(0, -1)
    .map((span, index) =>
      text.slice(
        pastLastLetter(text, span.start, span.end),
        firstLetter(text, spans[index + 1]?.start ?? text.length),
      ),
    );
};

/** The lines of `text`: one for a verse of 20 words or fewer, else its words cut after the gaps its punctuation gives room at. */
export const linesOf = (text: string): ReadonlyArray<Line> => {
  const gaps = gapsOf(text);
  const count = wordSpans(text).length;
  if (count <= WHOLE) return [{ first: 0, last: Math.max(0, count - 1) }];
  const lines: Line[] = [];
  let first = 0;
  gaps.forEach((gap, word) => {
    const least = leastAt(gap);
    if (word - first + 1 < least || count - word - 1 < least) return;
    lines.push({ first, last: word });
    first = word + 1;
  });
  return [...lines, { first, last: count - 1 }];
};

/** Where line `at` of `lines` starts in `text`: its first word's run, the text's start for the first line, the text's end past the words. */
const lineStart = (
  text: string,
  spans: ReturnType<typeof wordSpans>,
  lines: ReadonlyArray<Line>,
  at: number,
) => {
  if (at === 0) return 0;
  if (at >= lines.length) return text.length;
  return spans[lines[at]?.first ?? spans.length]?.start ?? text.length;
};

/** Each line's text: the verse's own characters from its line's start to the next line's, trimmed, each whitespace run one space, so the texts joined by a space are the verse's text with its whitespace made single. */
export const lineTextsOf = (text: string, lines: ReadonlyArray<Line>): readonly string[] => {
  const spans = wordSpans(text);
  return lines.map((_, at) =>
    text
      .slice(lineStart(text, spans, lines, at), lineStart(text, spans, lines, at + 1))
      .trim()
      .replace(/\s+/gu, ' '),
  );
};

/** The word numbers that start a line after the first: where Today draws a break. */
export const breaksOf = (lines: ReadonlyArray<Line>): ReadonlySet<number> =>
  new Set(lines.slice(1).map((line) => line.first));
