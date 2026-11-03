import {
  type Pt,
  at,
  ellipseShape,
  line,
  probePlate,
  quad,
  spline,
  stroke,
  write,
  sub,
  glow,
  plate,
  rounded,
} from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { type GestureAt, C, F, type Person, christ, person, piece, type Hands } from './kit.ts';

const highPriest = (ctx: CanvasRenderingContext2D, pose: Person, hand: Hands, plate = 1) => {
  christ(ctx, pose, hand);
  if (plate <= 0) return;
  piece(ctx, rounded(0, -88, 40, 44, 5), C.gold, hand('breastplate'), {
    role: 'figure',
    line: 2.5,
    alpha: plate,
  });
  const gems = [C.scarlet, C.glow, C.cutLight];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      ctx.save();
      ctx.globalAlpha *= plate;
      ctx.fillStyle = gems[(r + c) % 3] ?? C.glow;
      ctx.beginPath();
      ctx.ellipse(-11 + c * 11, -103 + r * 10, 3.4, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
};

export const HOLY_PLACE: Pt = [-90, 0];
const MOST_HOLY: Pt = [230, 0];
export const IN_SANCTUARY = 1.55;

const VEIL_X = 120;

export const sanctuary = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  veil = 0,
  light = 0,
  inside: () => void = () => {},
) => {
  glow(ctx, 0, -280, 900, C.glow, 0.55 + 0.45 * light);
  piece(ctx, rounded(0, -300, 1160, 600, 24), C.gold, hand('walls'), {
    role: 'scenery',
    kind: 'cut',
    line: 5,
    shadow: 0.4,
  });
  piece(ctx, rounded(0, -620, 1220, 60, 16), C.gold, hand('roof'), {
    role: 'scenery',
    kind: 'cut',
    line: 5,
  });
  piece(ctx, rounded(-200, -265, 620, 510, 10), C.cream, hand('holy'), {
    role: 'scenery',
    kind: 'cut',
    line: 4,
    shadow: 0,
  });
  piece(ctx, rounded(345, -265, 390, 510, 10), C.glow, hand('mostHoly'), {
    role: 'scenery',
    kind: 'cut',
    line: 4,
    shadow: 0,
  });
  glow(ctx, 400, -250, 260, C.robe, 0.5 + 0.5 * light);

  at(ctx, { x: -420, y: 0 }, () => {
    piece(ctx, rounded(0, -130, 12, 260, 4), C.gold, hand('stem'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    piece(ctx, rounded(0, -4, 70, 12, 4), C.gold, hand('foot'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    for (const [i, r] of [
      [1, 30],
      [2, 58],
      [3, 86],
    ] as const)
      stroke(
        ctx,
        quad([-r, -250], [0, -250 + r * 1.6], [r, -250]),
        { color: C.gold, width: 9, jitter: 0.3, taper: 0, boil: 'none' },
        sub(hand('branch'), i),
      );
    for (const x of [-86, -58, -30, 0, 30, 58, 86]) {
      glow(ctx, x, -268, 26, C.glow, 0.9);
      piece(ctx, ellipseShape(x, -264, 6, 10, 14), C.glow, sub(hand('flame'), x), {
        role: 'scenery',
        line: 1.5,
      });
    }
  });
  at(ctx, { x: -230, y: 0 }, () => {
    piece(ctx, rounded(0, -110, 150, 16, 4), C.gold, hand('table'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    for (const x of [-60, 60])
      piece(ctx, rounded(x, -52, 12, 104, 3), C.gold, sub(hand('leg'), x), {
        role: 'scenery',
        kind: 'cut',
        line: 2,
      });
    for (const [x, k] of [
      [-36, 1],
      [36, 2],
    ] as const)
      for (let i = 0; i < 3; i++)
        piece(
          ctx,
          rounded(x, -126 - i * 12, 52, 12, 6),
          C.boardLight,
          sub(hand('bread'), k * 10 + i),
          {
            role: 'scenery',
            kind: 'cut',
            line: 2,
            shadow: 0.1,
          },
        );
  });

  inside();

  at(ctx, { x: 40, y: 0 }, () => {
    piece(ctx, rounded(0, -60, 64, 120, 6), C.gold, hand('altar'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    piece(ctx, rounded(0, -124, 80, 12, 4), C.gold, hand('altarTop'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    stroke(
      ctx,
      quad([0, -134], [-30, -190], [8, -240]),
      { color: C.robe, width: 10, jitter: 0.6, taper: 0.6, alpha: 0.8, boil: 'none' },
      hand('smoke'),
    );
  });

  at(ctx, { x: 420, y: 0 }, () => {
    piece(ctx, rounded(0, -45, 150, 90, 8), C.gold, hand('ark'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
    piece(ctx, rounded(0, -96, 170, 14, 4), C.gold, hand('mercySeat'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
    for (const side of [-1, 1] as const)
      piece(
        ctx,
        [
          [side * 70, -100],
          [side * 20, -190],
          [side * 8, -118],
        ],
        C.gold,
        sub(hand('wing'), side),
        { role: 'scenery', kind: 'cut', line: 2.5 },
      );
  });

  const drop = 510 * (1 - 0.88 * veil);
  const top = -520;
  piece(ctx, rounded(VEIL_X, top + drop / 2, 46, drop, 6), C.robe, hand('veil'), {
    role: 'scenery',
    kind: 'cut',
    line: 3,
  });
  for (const x of [-10, 8])
    stroke(
      ctx,
      line([VEIL_X + x, top + 12], [VEIL_X + x, top + drop - 12]),
      { color: C.paperTone, width: 2, jitter: 0.4, boil: 'none' },
      sub(hand('fold'), x),
    );
  piece(ctx, rounded(VEIL_X, top, 60, 14, 4), C.gold, hand('rod'), {
    role: 'scenery',
    kind: 'cut',
    line: 2.5,
  });
};

const PLEA_FAR: GestureAt = { to: [0, 0], reach: 0, grip: 'palm' };
const PLEA_NEAR: GestureAt = { to: [0, 0], reach: 0, grip: 'palm' };

export const priestAt = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  spot: Pt,
  plead: number,
  lift: number,
  plate: number,
) => {
  for (const [g, side] of [
    [PLEA_FAR, -1],
    [PLEA_NEAR, 1],
  ] as const) {
    g.to[0] = side * lerp(46, 72, lift);
    g.to[1] = lerp(-110, -196, lift);
    g.reach = plead;
  }
  at(ctx, { x: spot[0], y: spot[1], scale: IN_SANCTUARY }, () =>
    highPriest(
      ctx,
      {
        look: [3, -1 - 2 * plead * lift],
        browTilt: 0.3 + 0.2 * plead * lift,
        far: PLEA_FAR,
        near: PLEA_NEAR,
      },
      hand,
      plate,
    ),
  );
};

export const ministry = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  light: number,
  plead: number,
) => sanctuary(ctx, hand, 1, light, () => priestAt(ctx, hand, MOST_HOLY, plead, 1, 1));

const BANNER_X = -800;
const POLE: Pt = [-135, -125];
const ON_POLE: GestureAt = { to: [POLE[0], POLE[1]], reach: 0, grip: 'hold' };

export const angel = (ctx: CanvasRenderingContext2D, hand: Hands, flap: number, hold: number) => {
  const wing = (side: -1 | 1) =>
    at(ctx, { x: -18, y: -110, rot: side * (0.5 + 0.35 * flap) - 0.4 }, () =>
      piece(
        ctx,
        spline(
          [
            [0, 0],
            [-60, -40],
            [-150, -60],
            [-120, -20],
            [-150, 0],
            [-100, 20],
            [-40, 20],
          ],
          6,
          true,
        ),
        C.cream,
        sub(hand('wing'), side),
        { role: 'figure', line: 3.5 },
      ),
    );
  wing(-1);
  wing(1);
  ON_POLE.reach = hold;
  person(
    ctx,
    {
      body: C.robe,
      shade: C.robe,
      garment: 'robe',
      ground: 0,
      tilt: 0.08,
      look: [4, -1],
      browTilt: 0.1,
      far: ON_POLE,
    },
    hand('angel'),
  );
};

const BANNER = 'the commandments of God, and the faith of Jesus';

export const herald = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  t: number,
  written: number,
  hold: number,
) => {
  at(ctx, { x: BANNER_X, y: -150 + Math.sin(t * 3) * 6, rot: 0.01 * Math.sin(t * 2) }, () => {
    const banner = plate(0, 0, 1220, 110);
    piece(ctx, banner, C.cream, hand('banner'), {
      role: 'scenery',
      kind: 'cut',
      line: 3.5,
      torn: 2,
    });
    for (const side of [-1, 1] as const)
      piece(ctx, rounded(side * 628, 0, 36, 96, 6), C.gold, sub(hand('bannerEnd'), side), {
        role: 'scenery',
        kind: 'cut',
        line: 3,
      });
    if (written <= 0) return;
    probePlate(ctx, banner, () =>
      write(
        ctx,
        BANNER,
        0,
        17,
        { family: F.display, size: 50, weight: 600, color: C.ink, align: 'center' },
        hand('bannerText'),
        { progress: written, reveal: 'write', boil: 0.3 },
      ),
    );
  });
  at(ctx, { x: 0, y: 0, scale: 1.1, rot: 0.06 }, () =>
    angel(ctx, hand, 0.5 + 0.5 * Math.sin(t * 5), hold),
  );
};
