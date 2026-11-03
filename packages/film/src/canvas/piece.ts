import { cutout } from './cutout.ts';
import { type Boil, type Hand, type Pt, stroke, sub } from './ink.ts';

type PaperKind = 'cut' | 'torn' | 'ink';

type PieceRole = 'figure' | 'scenery';

export const PAPER_EDGES = {
  cut: { torn: 0.6, rim: 1.5 },
  torn: { torn: 3.5, rim: 3 },
  ink: { torn: 0.6, rim: 0 },
} satisfies Record<PaperKind, { readonly torn: number; readonly rim: number }>;

export const FIGURE_LINE = 3;

export interface PieceStyle {
  readonly color: string;
  readonly role: PieceRole;
  readonly outline: string;
  readonly kind?: PaperKind;
  readonly line?: number;
  readonly torn?: number;
  readonly shadow?: number;
  readonly grain?: number;
  readonly alpha?: number;
  readonly boil?: Boil;
}

export const kindOf = (style: Pick<PieceStyle, 'role' | 'kind'>): PaperKind =>
  style.kind ?? (style.role === 'figure' ? 'cut' : 'torn');

export const boilOf = (style: Pick<PieceStyle, 'role' | 'boil'>): Boil =>
  style.boil ?? (style.role === 'figure' ? 'crawl' : 'none');

export const lineOf = (style: Pick<PieceStyle, 'role' | 'line'>): number =>
  style.line ?? (style.role === 'figure' ? FIGURE_LINE : 0);

export const piece = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Pt>,
  style: PieceStyle,
  hand: Hand,
) => {
  const alpha = style.alpha ?? 1;
  if (alpha <= 0) return;
  const edge = PAPER_EDGES[kindOf(style)];
  const boil = boilOf(style);
  cutout(
    ctx,
    shape,
    {
      color: style.color,
      torn: style.torn ?? edge.torn,
      rim: edge.rim,
      shadow: style.shadow ?? 0.35,
      grain: style.grain ?? 0.5,
      alpha,
      boil,
    },
    hand,
  );
  const width = lineOf(style);
  if (width > 0)
    stroke(
      ctx,
      [...shape, shape[0] ?? [0, 0]],
      {
        color: style.outline,
        width,
        jitter: 0.7,
        taper: 0,
        pressure: 0.15,
        alpha,
        boil,
        closed: true,
      },
      sub(hand, 7),
    );
};
