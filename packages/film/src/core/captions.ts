import { Array as Arr, Option } from 'effect';
import type { Placed } from './layout.ts';
import { type Turn, endsClause, endsSentence } from './narration.ts';
import type { TakeWord, Word } from './schema.ts';
import { phraseCues, shortPhrases } from './phrases.ts';
import type { ResolvedShort } from './shorts.ts';

const CAPTION_LEAD = 0.05;
const CAPTION_HOLD = 0.6;

const captionLines = (
  words: ReadonlyArray<Word>,
  turns: ReadonlySet<number> = new Set(),
  max = 7,
): Word[][] => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const [i, w] of words.entries()) {
    if (turns.has(i) && cur.length > 0) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (cur.length >= max || endsSentence(w.text) || endsClause(w.text)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
};

export interface CaptionCue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export const captionCues = (
  words: ReadonlyArray<Word>,
  turns: ReadonlyArray<Turn> = [],
): Array<CaptionCue> => {
  const turnAt = new Set(turns.map((t) => t.word));
  const lines = captionLines(words, turnAt);
  const firstWords = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.length, 0));
  const opensVoice = (i: number) =>
    turns.length > 0 && Option.exists(Arr.get(firstWords, i), (w) => w === 0 || turnAt.has(w));
  return lines.flatMap((line, i) => {
    const first = Arr.head(line);
    const last = Arr.last(line);
    if (Option.isNone(first) || Option.isNone(last)) return [];
    const end = Option.match(Option.flatMap(Arr.get(lines, i + 1), Arr.head), {
      onNone: () => last.value.end + CAPTION_HOLD,
      onSome: (next) => next.start,
    });
    const lead = Arr.match(lines.slice(0, i), { onEmpty: () => CAPTION_LEAD, onNonEmpty: () => 0 });
    const start = first.value.start - lead;
    const said = line.map((w) => w.text).join(' ');
    if (opensVoice(i)) return [{ start, end, text: `- ${said}` }];
    return [{ start, end, text: said }];
  });
};

const filmCaptionTimes = (words: ReadonlyArray<TakeWord>): ReadonlyArray<Word> => words;

export const sceneCaptions = (p: Placed): Array<CaptionCue> =>
  captionCues(filmCaptionTimes(p.voice.words), p.voice.turns);

export const filmCaptions = (
  placed: ReadonlyArray<Placed>,
  range: { readonly from: number; readonly to: number },
): Array<CaptionCue> =>
  placed.flatMap((p) => {
    const at = p.start + p.speechStart;
    return sceneCaptions(p).flatMap((cue) => {
      const start = Math.max(p.start, range.from, at + cue.start);
      const end = Math.min(p.start + p.dur, range.to, at + cue.end);
      if (end <= start) return [];
      return [{ start: start - range.from, end: end - range.from, text: cue.text }];
    });
  });

export const shortCaptions = (
  placed: ReadonlyArray<Placed>,
  short: ResolvedShort,
  range: { readonly from: number; readonly to: number },
): Array<CaptionCue> =>
  phraseCues(shortPhrases(placed, short)).flatMap((cue) => {
    const start = Math.max(range.from, cue.start);
    const end = Math.min(range.to, cue.end);
    if (end <= start) return [];
    return [{ start: start - range.from, end: end - range.from, text: cue.text }];
  });

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export const vttTime = (secs: number): string => {
  const ms = Math.max(0, Math.round(secs * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms % 1000, 3)}`;
};

export const webVtt = (cues: ReadonlyArray<CaptionCue>): string =>
  [
    'WEBVTT',
    ...cues.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}`),
  ].join('\n\n') + '\n';
