import { type Hand, sub } from './ink.ts';
import { probeOf, recordText, textExtent } from './probe.ts';
import { hash2, noise1 } from '../core/random.ts';
import { clamp, ease } from '../core/time.ts';

export interface TextStyle {
  family: string;
  size: number;
  weight?: number;
  italic?: boolean;
  color: string;
  align?: 'left' | 'center' | 'right';
  tracking?: number;
  leading?: number;
}

const font = (s: TextStyle) =>
  `${s.italic === true ? 'italic ' : ''}${s.weight ?? 400} ${s.size}px "${s.family}"`;

type Reveal = 'write' | 'rise' | 'pop';

export interface WriteOptions {
  progress?: number;
  reveal?: Reveal;
  boil?: number;
  alpha?: number;
  outline?: number;
  fill?: number;
}

const glyphs = (ctx: CanvasRenderingContext2D, text: string, style: TextStyle) => {
  ctx.font = font(style);
  const track = (style.tracking ?? 0) * style.size;
  const chars = Array.from(graphemes.segment(text), (g) => g.segment);
  const xs: number[] = [];
  const ws: number[] = [];
  let x = 0;
  let prefix = '';
  let before = 0;
  for (const ch of chars) {
    xs.push(x);
    prefix += ch;
    const after = ctx.measureText(prefix).width;
    const w = after - before;
    before = after;
    ws.push(w);
    x += w + track;
  }
  return { chars, xs, ws, width: Math.max(0, x - track) };
};

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const graphemeCount = (text: string) => {
  let n = 0;
  for (const _ of graphemes.segment(text)) n++;
  return n;
};

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export const measure = (ctx: CanvasRenderingContext2D, text: string, style: TextStyle) => {
  ctx.font = font(style);
  const track = (style.tracking ?? 0) * style.size;
  return Math.max(0, ctx.measureText(text).width + track * (graphemeCount(text) - 1));
};

const leftEdge = (align: NonNullable<TextStyle['align']>, x: number, width: number) =>
  align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;

const popTilt = (reveal: Reveal, i: number, seed: number, local: number) =>
  reveal === 'pop' ? (hash2(i, seed) - 0.5) * 0.12 * (1 - local) : 0;

const shownOpacity = (reveal: Reveal, local: number) =>
  reveal === 'rise' ? ease.outCubic(local) : reveal === 'pop' ? clamp(local * 3) : 1;

const revealGlyph = (
  ctx: CanvasRenderingContext2D,
  reveal: Reveal,
  local: number,
  gw: number,
  size: number,
  baseAlpha: number,
) => {
  if (reveal === 'write') {
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    ctx.rect(-gw / 2 - 4, -size * 1.2, (gw + 8) * local, size * 1.6);
    ctx.clip();
  } else if (reveal === 'rise') {
    const e = ease.outCubic(local);
    ctx.globalAlpha = baseAlpha * e;
    ctx.translate(0, (1 - e) * size * 0.25);
  } else {
    const e = ease.outBack(local);
    ctx.globalAlpha = baseAlpha * clamp(local * 3);
    ctx.scale(e, e);
  }
};

const GLYPH_FOOT = 0.3;
const GLYPH_TOP = -1;

const OUTLINE_THIN = 0.2;

const fillLevel = (fill: number | undefined) =>
  fill === undefined ? 1 : Number.isNaN(fill) ? 0 : clamp(fill);

const inks = (fill: number, outline: number) => fill > 0 || outline > 0;

const inkText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  tx: number,
  ty: number,
  left: number,
  width: number,
  style: TextStyle,
  fill: number,
  outline: number,
) => {
  if (fill >= 1) ctx.fillText(text, tx, ty);
  else if (fill > 0) {
    const foot = ty + GLYPH_FOOT * style.size;
    const level = foot + (GLYPH_TOP - GLYPH_FOOT) * style.size * fill;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left - style.size, level, width + 2 * style.size, foot - level);
    ctx.clip();
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }
  const line = outline * clamp((1 - fill) / OUTLINE_THIN);
  if (line <= 0) return;
  ctx.lineWidth = line;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.color;
  ctx.strokeText(text, tx, ty);
};

export const write = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  hand: Hand,
  opts: WriteOptions = {},
) => {
  if (RTL.test(text)) return writeWhole(ctx, text, x, y, style, hand, opts);
  const { chars, xs, ws, width } = glyphs(ctx, text, style);
  const fill = fillLevel(opts.fill);
  const outline = opts.outline ?? 0;
  if (!inks(fill, outline)) return width;
  const x0 = leftEdge(style.align ?? 'left', x, width);
  const progress = clamp(opts.progress ?? 1);
  const reveal = opts.reveal ?? 'rise';
  const n = chars.length;
  const boil = opts.boil ?? 0.6;
  ctx.save();
  ctx.font = font(style);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = style.color;
  const baseAlpha = ctx.globalAlpha * (opts.alpha ?? 1);
  const spread = reveal === 'write' ? 1 : 3;
  const probe = probeOf(ctx);
  let shownFrom = Infinity;
  let shownTo = -Infinity;
  let shownAlpha = 0;
  for (let i = 0; i < n; i++) {
    const ch = chars[i] ?? '';
    if (ch === ' ') continue;
    const local = clamp(progress * (n + spread) - i, 0, spread) / spread;
    if (local <= 0) continue;
    const gx = x0 + (xs[i] ?? 0);
    const gw = ws[i] ?? 0;
    if (probe !== undefined) {
      shownFrom = Math.min(shownFrom, gx);
      shownTo = Math.max(shownTo, gx + gw);
      shownAlpha = Math.max(shownAlpha, shownOpacity(reveal, local));
    }
    const jx = boil * noise1(hand.boil * 1.3 + i * 7.1, hand.seed);
    const jy = boil * noise1(hand.boil * 1.7 + i * 3.3, hand.seed + 1);
    const rot = boil * 0.006 * noise1(hand.boil + i * 5.3, hand.seed + 2);
    ctx.save();
    ctx.translate(gx + gw / 2 + jx, y + jy);
    ctx.rotate(rot + popTilt(reveal, i, hand.seed, local));
    revealGlyph(ctx, reveal, local, gw, style.size, baseAlpha);
    inkText(ctx, ch, -gw / 2, 0, -gw / 2, gw, style, fill, outline);
    ctx.restore();
  }
  if (probe !== undefined && shownTo > shownFrom) {
    const { ascent, descent } = textExtent(ctx, text);
    recordText(
      ctx,
      probe,
      text,
      shownFrom,
      y - ascent,
      shownTo - shownFrom,
      ascent + descent,
      baseAlpha * shownAlpha,
      hand.seed,
    );
  }
  ctx.restore();
  return width;
};

export const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  style: TextStyle,
): string[] => {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/)) {
      const next = cur.length === 0 ? word : `${cur} ${word}`;
      if (cur.length > 0 && measure(ctx, next, style) > maxWidth) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }
  return lines;
};

export const block = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  style: TextStyle,
  hand: Hand,
  opts: WriteOptions = {},
) => {
  const lines = wrap(ctx, text, maxWidth, style);
  const lead = (style.leading ?? 1.25) * style.size;
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  const progress = clamp(opts.progress ?? 1);
  let done = 0;
  lines.forEach((l, i) => {
    const start = done / total;
    const span = l.length / total;
    done += l.length;
    const p = span === 0 ? 1 : clamp((progress - start) / span);
    if (p > 0) write(ctx, l, x, y + i * lead, style, sub(hand, i * 101), { ...opts, progress: p });
  });
  return lines.length * lead;
};

const writeWhole = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  hand: Hand,
  opts: WriteOptions,
) => {
  ctx.save();
  ctx.font = font(style);
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  const width = ctx.measureText(text).width;
  const fill = fillLevel(opts.fill);
  const outline = opts.outline ?? 0;
  if (!inks(fill, outline)) {
    ctx.restore();
    return width;
  }
  const align = style.align ?? 'left';
  const right = align === 'center' ? x + width / 2 : align === 'right' ? x : x + width;
  const p = clamp(opts.progress ?? 1);
  const b = opts.boil ?? 0.6;
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.beginPath();
  ctx.rect(right - (width + 20) * p, y - style.size * 1.3, (width + 20) * p + 10, style.size * 1.8);
  ctx.clip();
  ctx.fillStyle = style.color;
  ctx.textAlign = 'right';
  const tx = right + b * noise1(hand.boil * 1.3, hand.seed);
  inkText(
    ctx,
    text,
    tx,
    y + b * noise1(hand.boil * 1.7, hand.seed + 1),
    tx - width,
    width,
    style,
    fill,
    outline,
  );
  const probe = probeOf(ctx);
  if (probe !== undefined && p > 0) {
    const { ascent, descent } = textExtent(ctx, text);
    const shown = Math.min(width, (width + 20) * p);
    recordText(
      ctx,
      probe,
      text,
      right - shown,
      y - ascent,
      shown,
      ascent + descent,
      ctx.globalAlpha,
      hand.seed,
    );
  }
  ctx.restore();
  return width;
};
