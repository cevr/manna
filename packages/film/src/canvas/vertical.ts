import { hookAlpha } from '../core/shorts.ts';
import type { ShortLook } from './film.ts';
import { type Probe, recordText } from './probe.ts';

interface HookLayout {
  readonly centre: number;
  readonly hook: { readonly y: number; readonly width: number };
}

interface SetLine {
  readonly text: string;
  readonly y: number;
  readonly width: number;
}

interface LineBox {
  readonly ascent: number;
  readonly descent: number;
}

const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): ReadonlyArray<string> => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
};

interface SetBlock {
  readonly lines: ReadonlyArray<SetLine>;
  readonly box: LineBox;
}

const setBlock = (
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  width: number,
  y: number,
): SetBlock => {
  ctx.save();
  ctx.font = font;
  const m = ctx.measureText('Hg');
  const box = { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
  const step = (box.ascent + box.descent) * 1.08;
  const broken = wrap(ctx, text, width);
  const top = y - ((broken.length - 1) * step) / 2;
  const lines = broken.map((line, i) => ({
    text: line,
    y: top + i * step,
    width: ctx.measureText(line).width,
  }));
  ctx.restore();
  return { lines, box };
};

interface VerticalHook {
  readonly draw: (ctx: CanvasRenderingContext2D, T: number, probe: Probe | undefined) => void;
}

export const verticalHook = (
  text: string | undefined,
  style: ShortLook['hook'],
  k: number,
  layout: HookLayout,
): VerticalHook => {
  let hook: SetBlock | undefined;
  const hookOf = (ctx: CanvasRenderingContext2D, line: string) =>
    (hook ??= setBlock(ctx, line, style.font, layout.hook.width, layout.hook.y));

  const draw = (ctx: CanvasRenderingContext2D, T: number, probe: Probe | undefined) => {
    const alpha = hookAlpha(T);
    if (text === undefined || alpha <= 0) return;
    const set = hookOf(ctx, text);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.font = style.font;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = alpha;
    for (const line of set.lines) {
      const baseline = line.y + (set.box.ascent - set.box.descent) / 2;
      ctx.fillText(line.text, layout.centre, baseline);
      if (probe !== undefined)
        recordText(
          ctx,
          probe,
          line.text,
          layout.centre - line.width / 2,
          baseline - set.box.ascent,
          line.width,
          set.box.ascent + set.box.descent,
          alpha,
        );
    }
    ctx.restore();
  };
  return { draw };
};
