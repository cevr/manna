import {
  type Hex,
  at,
  ellipseShape,
  ground,
  line,
  multiplane,
  rectShape,
  rounded,
  stroke,
  sub,
} from '@manna/film/canvas';
import { type Key, lerp, rng } from '@manna/film/core';
import {
  type Stamp,
  ACCUSED,
  FIGURE_STAINS,
  GAVEL_REST,
  JUDGE,
  REST,
  STAMP_POP,
  benchStamp,
  judgeGavel,
} from '../../../righteousness-by-faith/court.ts';
import { C, person, piece } from '../../../righteousness-by-faith/kit.ts';
import type { CourtFrame } from '../../scenes/court.ts';

const SHEETS = (() => {
  const r = rng(1889);
  return Array.from({ length: 9 }, (_, i) => ({
    x: 765 + (r() - 0.5) * 12,
    y: 853 - i * 13,
    rot: (r() - 0.5) * 0.1,
  }));
})();

const SWING: ReadonlyArray<Key> = [
  [0, GAVEL_REST],
  [0.373, -0.3],
  [0.627, 1.62, 'inCubic'],
  [0.797, 1.4, 'outQuad'],
  [1, 1.58],
];

export const BENCH = {
  face: rectShape(860, 475, 640, 380),
  rim: rounded(1180, 472, 690, 34, 6),
  block: rounded(1436, 448, 76, 14, 4),
} as const;

const VERDICT = { fill: 1, shown: 0 } satisfies Stamp;

export const paperAccused = (f: CourtFrame) => {
  const bow = f.at('bow') * (1 - f.at('lift'));
  const face = {
    tilt: 0.2 * bow,
    nod: 6 * bow,
    look: [-2 * bow, 3 * bow] as const,
    stains: FIGURE_STAINS,
  };
  person(f.ctx, face, f.hand('accused'));
};

export interface Bench {
  readonly behind: (f: CourtFrame, lean: number) => void;
  readonly over: (f: CourtFrame, swing: number, lean: number, props: Props) => void;
}

const paperJudge: Bench = {
  behind: (f, lean) => {
    const { ctx } = f;
    at(ctx, { x: JUDGE[0], y: JUDGE[1] + 10 * lean }, () => {
      piece(ctx, rounded(0, 120, 250, 120, 40), C.ink, f.hand('judgeRobe'), {
        role: 'figure',
      });
      for (const x of [-9, 9])
        piece(ctx, rounded(x, 88, 14, 30, 3), C.paper, f.hand(`band${x}`), {
          role: 'figure',
          line: 2,
        });
      piece(ctx, ellipseShape(0, 0, 60, 65), C.figure, f.hand('judgeHead'), {
        role: 'figure',
      });
      const [ex, ey] = [-12 * lean, 5 * lean];
      ctx.fillStyle = C.outline;
      for (const x of [-22, 22]) {
        ctx.beginPath();
        ctx.ellipse(x + ex, -8 + ey, 4.5, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const side of [-1, 1] as const)
        stroke(
          ctx,
          line([side * 22 - 13, -28], [side * 22 + 13, -28]),
          { color: C.outline, width: 5, jitter: 0.3, taper: 0.2, boil: 'crawl' },
          f.hand(`judgeBrow${side}`),
        );
      stroke(
        ctx,
        line([-11, 30], [11, 30]),
        { color: C.outline, width: 4, jitter: 0.3, boil: 'crawl' },
        f.hand('judgeMouth'),
      );
    });
  },
  over: (f, swing, lean) => judgeGavel(f.ctx, f.hand, swing, lean, 10 * lean),
};

export interface Props {
  readonly bench: Hex;
  readonly rim: Hex;
  readonly panel: Hex;
  readonly block: Hex;
  readonly sheets: ReadonlyArray<Hex>;
  readonly sheetInk: Hex;
  readonly blockInk: Hex;
  readonly gavelInk: Hex;
}

export const paperProps: Props = {
  bench: C.paperTone,
  rim: C.inkSoft,
  panel: C.inkSoft,
  block: C.boardDeep,
  sheets: [C.paper],
  sheetInk: C.ink,
  blockInk: C.outline,
  gavelInk: C.outline,
};

export const courtWith =
  (accused: (f: CourtFrame) => void, judge: Bench = paperJudge, props: Props = paperProps) =>
  (f: CourtFrame) => {
    const { ctx, w, h } = f;

    VERDICT.fill = 1;
    VERDICT.shown = f.at('stamp');
    const popScale = f.keys('stamp', STAMP_POP);
    const swing = f.keys('gavel', SWING);
    const lean = f.at('lean');

    multiplane(
      ctx,
      REST,
      w,
      h,
      [
        {
          z: 1.35,
          draw: () => {
            for (const [x, k] of [
              [300, 1],
              [1580, 2],
            ] as const)
              piece(ctx, rectShape(x, 80, 200, 800), `${C.paperTone}30`, f.hand(`pillar${k}`), {
                role: 'scenery',
                kind: 'cut',
                line: 0,
                torn: 3,
                shadow: 0.2,
              });
            piece(ctx, rectShape(-400, 868, 2700, 400), `${C.paperTone}38`, f.hand('floor'), {
              role: 'scenery',
              line: 0,
              torn: 5,
              shadow: 0.25,
            });
          },
        },
        {
          z: 1,
          draw: () => {
            ground(ctx, 1180, 860, 820);
            judge.behind(f, lean);
            piece(ctx, BENCH.face, props.bench, f.hand('bench'), {
              role: 'scenery',
              kind: 'cut',
              torn: 2,
            });
            [980, 1180, 1380].forEach((x, i) => {
              const panel = rounded(x, 680, 170, 280, 10);
              stroke(
                ctx,
                [...panel, panel[0] ?? [x, 540]],
                { color: props.panel, width: 3, jitter: 0.5, taper: 0, boil: 'none', closed: true },
                f.hand(`panel${i}`),
              );
            });
            piece(ctx, BENCH.rim, props.rim, f.hand('rim'), {
              role: 'scenery',
              kind: 'cut',
            });
            piece(ctx, BENCH.block, props.block, f.hand('block'), {
              role: 'scenery',
              kind: 'cut',
              line: 2,
              outline: props.blockInk,
            });
            judge.over(f, swing, lean, props);
            benchStamp(ctx, f.hand, VERDICT, popScale);
          },
        },
        {
          z: 0.9,
          lift: 1.3,
          draw: () => {
            const landed = SHEETS.filter((_, i) => f.stagger('drop', i, SHEETS.length) > 0).length;
            if (landed > 0) ground(ctx, 765, 864, 150 + 10 * landed);
            SHEETS.forEach((s, i) => {
              const k = f.stagger('drop', i, SHEETS.length);
              if (k <= 0) return;
              const fall = lerp(-300, 0, k);
              at(ctx, { x: s.x, y: s.y + fall, rot: s.rot }, () =>
                piece(
                  ctx,
                  rectShape(-75, -5.5, 150, 11),
                  props.sheets[i % props.sheets.length] ?? C.paper,
                  sub(f.hand('sheet'), i),
                  { role: 'scenery', kind: 'cut', line: 2, outline: props.sheetInk },
                ),
              );
            });
            at(ctx, { x: ACCUSED[0], y: ACCUSED[1] }, () => accused(f));
          },
        },
      ],
      { rest: [REST.x, REST.y], haze: C.paper, thickness: 0.6 },
    );
  };

export const court = courtWith(paperAccused);
