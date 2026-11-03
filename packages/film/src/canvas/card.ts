import { Option, Predicate, Result } from 'effect';
import { type Hand, sub } from './ink.ts';
import { type TextStyle, measure, write } from './type.ts';
import type { TakeWord } from '../core/schema.ts';
import { cardSaid } from '../core/narration.ts';
import { clamp, ease, lerp } from '../core/time.ts';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CardWord {
  readonly text: string;
  readonly at: number;
  readonly payoff: boolean;
}

export interface CardSpec<C extends string, F> {
  readonly cue: C;
  readonly from: string;
  readonly to?: string;
  readonly payoff: string;
  readonly flood?: {
    readonly cue: C;
    readonly mask?: (ctx: CanvasRenderingContext2D, box: Box, at: number, f: F) => void;
  };
  readonly draw: (f: F, words: ReadonlyArray<CardWord>) => void;
}

interface CardVoice {
  readonly words: ReadonlyArray<TakeWord>;
  readonly marks: ReadonlyMap<string, number>;
}

export const cardWords = (
  scene: string,
  voice: CardVoice,
  speechStart: number,
  card: { readonly from: string; readonly to?: string; readonly payoff: string },
): Result.Result<ReadonlyArray<CardWord>, string> =>
  Result.map(cardSaid(scene, voice.words, voice.marks, card), ({ said, payoff }) =>
    said.map((w, i) => ({
      text: w.text,
      at: speechStart + w.voiced.start,
      payoff: i === payoff,
    })),
  );

export interface CardStyle {
  readonly ground: string | ((ctx: CanvasRenderingContext2D, w: number, h: number) => void);
  readonly type: TextStyle;
  readonly payoffScale: number;
  readonly payoffColor: string;
  readonly payoffType?: Partial<Omit<TextStyle, 'size' | 'color'>>;
  readonly case?: 'said' | 'lower' | 'upper';
  readonly align?: 'left' | 'center';
  readonly margin?: number;
  readonly rise?: number;
  readonly treatment?: {
    readonly under?: boolean;
    readonly draw: (ctx: CanvasRenderingContext2D, box: Box, since: number) => void;
  };
}

const RISE = 0.05;

interface SetWord extends CardWord {
  readonly set: string;
  readonly style: TextStyle;
  readonly x: number;
  readonly y: number;
  readonly box: Box;
}

const cased = (text: string, how: CardStyle['case']) =>
  how === 'lower' ? text.toLowerCase() : how === 'upper' ? text.toUpperCase() : text;

interface Line {
  readonly words: Array<{ readonly word: CardWord; readonly set: string; readonly w: number }>;
  readonly style: TextStyle;
  width: number;
}

const cardLayout = (
  ctx: CanvasRenderingContext2D,
  words: ReadonlyArray<CardWord>,
  style: CardStyle,
  w: number,
  h: number,
): ReadonlyArray<SetWord> => {
  const margin = style.margin ?? w * 0.09;
  const room = w - 2 * margin;
  const lead = style.type;
  const big: TextStyle = {
    ...lead,
    ...style.payoffType,
    size: lead.size * style.payoffScale,
    color: style.payoffColor,
  };
  const lines: Line[] = [];
  const open = (s: TextStyle): Line => {
    const line: Line = { words: [], style: s, width: 0 };
    lines.push(line);
    return line;
  };
  let line: Line | undefined;
  for (const word of words) {
    const s = word.payoff ? big : lead;
    const set = cased(word.text, style.case);
    const ww = measure(ctx, set, s);
    const space = measure(ctx, ' ', s);
    const fits = line !== undefined && line.style === s && line.width + space + ww <= room;
    if (word.payoff || line === undefined || line.style !== s || !fits) line = open(s);
    if (line.words.length > 0) line.width += space;
    line.words.push({ word, set, w: ww });
    line.width += ww;
    if (word.payoff) line = undefined;
  }
  const leading = (s: TextStyle) => (s.leading ?? 1.15) * s.size;
  const total = lines.reduce((sum, l) => sum + leading(l.style), 0);
  let top = (h - total) / 2;
  const out: SetWord[] = [];
  for (const l of lines) {
    const tall = leading(l.style);
    const y = top + tall / 2 + l.style.size * 0.35;
    let x = style.align === 'center' ? (w - l.width) / 2 : margin;
    const space = measure(ctx, ' ', l.style);
    for (const { word, set, w: ww } of l.words) {
      out.push({ ...word, set, style: l.style, x, y, box: { x, y: top, w: ww, h: tall } });
      x += ww + space;
    }
    top += tall;
  }
  return out;
};

interface CardFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  readonly t: number;
  hand(key: string | number): Hand;
}

export const fullCard = (f: CardFrame, words: ReadonlyArray<CardWord>, style: CardStyle) => {
  const { ctx, w, h, t } = f;
  ctx.save();
  if (Predicate.isString(style.ground)) {
    ctx.fillStyle = style.ground;
    ctx.fillRect(0, 0, w, h);
  } else style.ground(ctx, w, h);
  const rise = style.rise ?? RISE;
  const set = cardLayout(ctx, words, style, w, h);
  for (const [i, word] of set.entries()) {
    if (t < word.at) continue;
    const since = t - word.at;
    const treat = word.payoff ? style.treatment : undefined;
    if (treat?.under === true) treat.draw(ctx, word.box, since);
    write(ctx, word.set, word.x, word.y, word.style, f.hand(`card${i}`), {
      progress: clamp(since / rise),
      reveal: 'rise',
      boil: 0,
    });
    if (treat !== undefined && treat.under !== true) treat.draw(ctx, word.box, since);
  }
  ctx.restore();
};

export const floodBox = (from: Box, w: number, h: number, p: number): Box => {
  const e = ease.inOutCubic(clamp(p));
  return {
    x: lerp(from.x, 0, e),
    y: lerp(from.y, 0, e),
    w: lerp(from.w, w, e),
    h: lerp(from.h, h, e),
  };
};

export interface Verse {
  readonly text: string;
  readonly phrase: string;
}

export interface VerseStyle {
  readonly type: TextStyle;
  readonly width: number;
  readonly highlight: string;
  readonly lit?: string;
  readonly pad?: { readonly x?: number; readonly y?: number };
}

interface VerseSet {
  readonly lines: ReadonlyArray<{ readonly text: string; readonly y: number }>;
  readonly phrase: ReadonlyArray<Box>;
}

const phraseAt = (words: ReadonlyArray<string>, phrase: ReadonlyArray<string>) => {
  for (let i = 0; i + phrase.length <= words.length; i++)
    if (phrase.every((p, k) => words[i + k] === p)) return Option.some(i);
  return Option.none<number>();
};

const verseLayout = (
  ctx: CanvasRenderingContext2D,
  verse: Verse,
  style: VerseStyle,
  x: number,
  y: number,
): VerseSet => {
  const words = verse.text.split(/\s+/).filter((s) => s.length > 0);
  const phrase = verse.phrase.split(/\s+/).filter((s) => s.length > 0);
  const found = Option.filter(phraseAt(words, phrase), () => phrase.length > 0);
  if (Option.isNone(found))
    throw new Error(
      `verse: the phrase "${verse.phrase}" is no run of the words of "${verse.text}" (set both verbatim)`,
    );
  const first = found.value;
  const s = style.type;
  const tall = (s.leading ?? 1.3) * s.size;
  const space = measure(ctx, ' ', s);
  const lines: Array<{ text: string; y: number }> = [];
  const boxes: Box[] = [];
  let line = '';
  let lx = 0;
  let row = 0;
  for (const [i, word] of words.entries()) {
    const ww = measure(ctx, word, s);
    if (line.length > 0 && lx + space + ww > style.width) {
      lines.push({ text: line, y: y + row * tall });
      line = '';
      lx = 0;
      row++;
    }
    const at = line.length === 0 ? 0 : lx + space;
    if (i >= first && i < first + phrase.length)
      boxes.push({ x: x + at, y: y + row * tall - s.size * 0.95, w: ww, h: s.size * 1.25 });
    line = line.length === 0 ? word : `${line} ${word}`;
    lx = at + ww;
  }
  if (line.length > 0) lines.push({ text: line, y: y + row * tall });
  return { lines, phrase: boxes };
};

const padded = (b: Box, x: number, y: number): Box => ({
  x: b.x - x,
  y: b.y - y,
  w: b.w + 2 * x,
  h: b.h + 2 * y,
});

const joined = (bars: ReadonlyArray<Box>): ReadonlyArray<Box> =>
  bars.reduce<Array<Box>>((out, b) => {
    const prev = out.at(-1);
    if (prev !== undefined && prev.y === b.y && b.x <= prev.x + prev.w) {
      out[out.length - 1] = { ...prev, w: Math.max(prev.x + prev.w, b.x + b.w) - prev.x };
      return out;
    }
    out.push(b);
    return out;
  }, []);

const boxAround = (boxes: ReadonlyArray<Box>): Box => {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const onFrame = (ctx: CanvasRenderingContext2D, b: Box): Box => {
  const m = ctx.getTransform();
  const corners = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([px = 0, py = 0]) => ({
    x: m.a * px + m.c * py + m.e,
    y: m.b * px + m.d * py + m.f,
    w: 0,
    h: 0,
  }));
  return boxAround(corners);
};

export const verse = (
  ctx: CanvasRenderingContext2D,
  v: Verse,
  style: VerseStyle,
  at: { readonly x: number; readonly y: number; readonly highlight: number },
  hand: Hand,
): Box => {
  const set = verseLayout(ctx, v, style, at.x, at.y);
  const padX = style.pad?.x ?? style.type.size * 0.12;
  const padY = style.pad?.y ?? 0;
  const total = set.phrase.reduce((sum, b) => sum + b.w + 2 * padX, 0);
  let left = clamp(at.highlight) * total;
  const swept: Box[] = [];
  for (const b of set.phrase) {
    if (left <= 0) break;
    const p = padded(b, padX, padY);
    swept.push({ ...p, w: Math.min(p.w, left) });
    left -= p.w;
  }
  const lit = joined(swept);
  ctx.save();
  ctx.fillStyle = style.highlight;
  for (const r of lit) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  const lines = (ink: string) => {
    for (const [i, l] of set.lines.entries())
      write(ctx, l.text, at.x, l.y, { ...style.type, color: ink, align: 'left' }, sub(hand, i), {
        boil: 0,
      });
  };
  lines(style.type.color);
  if (style.lit !== undefined && lit.length > 0) {
    ctx.save();
    ctx.beginPath();
    for (const r of lit) ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    lines(style.lit);
    ctx.restore();
  }
  const last = set.phrase.at(-1)?.y;
  const end = set.phrase.filter((b) => b.y === last).map((b) => padded(b, padX, padY));
  return onFrame(ctx, boxAround(end));
};
