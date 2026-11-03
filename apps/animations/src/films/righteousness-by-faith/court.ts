import {
  type Camera,
  type Gesture,
  type Hand,
  type HandBody,
  type HandRoot,
  type HandStyle,
  type Place,
  type Pt,
  type WriteOptions,
  at,
  breathOf,
  ellipseShape,
  floatingHand,
  line,
  multiplane,
  probePlate,
  rectShape,
  stroke,
  write,
  sub,
  type Posed,
  blob,
  ground,
  glow,
  rounded,
  sky,
  mix,
  UNMOVED,
} from '@manna/film/canvas';
import { type Key, clamp, lerp } from '@manna/film/core';
import {
  C,
  F,
  type Hands,
  type GestureAt,
  type Person,
  christ,
  handOf,
  person,
  piece,
  turban,
} from './kit.ts';
import { arc, flight } from './spoken.ts';

export const REST: Camera = { x: 930, y: 560, zoom: 1.35 };
export const WIDE: Camera = { x: 930, y: 480, zoom: 1.3 };

export const ACCUSED: Pt = [640, 860];
const ADVOCATE: Pt = [820, 860];
export const JUDGE: Pt = [1180, 350];
const GAVEL: Pt = [1330, 445];

export const FIGURE_STAIN_SPOTS = [
  [10, -76, 30, 38, 7],
  [-14, -52, 14, 16, 11],
] as const;
export const FIGURE_STAINS = FIGURE_STAIN_SPOTS.map(([x, y, w, h, seed]) => blob(x, y, w, h, seed));

export const GAVEL_REST = 0.35;
export const GAVEL_DOWN = 1.45;
export const STAMP_POP: ReadonlyArray<Key> = [
  [0, 1.2],
  [0.6, 0.97, 'outCubic'],
  [1, 1, 'inOutCubic'],
];

const STAMP_AT: Pt = [1180, 672];
const STAMP_TILT = -0.07;
const STAMP_HUNG: Pt = [1180, 530];
export const STAMP_WIDE = (REST.zoom ?? 1) / (WIDE.zoom ?? 1);
export const STAMP_LANDS: ReadonlyArray<Key> = [
  [0, 1],
  [0.3, 1.05, 'outQuad'],
  [1, 1, 'inOutSine'],
];
const STAMP_LABEL = rectShape(-250, -78, 500, 118);
const STAMP_EDGE: Pt[] = [...rectShape(-262, -90, 524, 142), [-262, -90]];
const STAMP_WORD = {
  family: F.display,
  size: 100,
  weight: 700,
  color: C.gold,
  align: 'center',
} as const;
const HOLLOW_PLATE = 0.75;

export interface Stamp {
  readonly fill: number;
  readonly shown: number;
  readonly laid?: number;
}

export const stamp = (ctx: CanvasRenderingContext2D, hand: Hands, s: Stamp) => {
  const fill = clamp(s.fill);
  const plate = clamp(2 * s.shown) * lerp(lerp(HOLLOW_PLATE, 1, fill), 1, clamp(s.laid ?? 0));
  if (plate <= 0.01) return;
  const hollow = 1 - fill;
  ctx.save();
  ctx.globalAlpha *= plate;
  piece(ctx, STAMP_LABEL, mix(C.paper, C.cream, fill), hand('label'), {
    role: 'scenery',
    kind: 'cut',
    line: 0,
    torn: 3,
    shadow: 0.4,
  });
  if (hollow > 0.01)
    stroke(
      ctx,
      STAMP_EDGE,
      { color: C.gold, width: 4, jitter: 0.5, taper: 0, alpha: hollow, boil: 'none' },
      hand('labelEdge'),
    );
  probePlate(ctx, STAMP_LABEL, () =>
    write(ctx, 'Righteous', 0, 12, STAMP_WORD, hand('stamp'), {
      boil: 0.4,
      alpha: clamp(2 * s.shown - 1),
      fill,
      outline: hollow > 0 ? 3 : 0,
    }),
  );
  ctx.restore();
};

const BENCH_AT: Place = { x: 0, y: 0, rot: 0, scale: 1 };
const BENCH_STAMP = { fill: 1, shown: 0 } satisfies Stamp;

export const benchStamp = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  s: Stamp,
  pop: number,
  hung = 0,
) => {
  BENCH_AT.x = lerp(STAMP_AT[0], STAMP_HUNG[0], hung);
  BENCH_AT.y = lerp(STAMP_AT[1], STAMP_HUNG[1], hung);
  BENCH_AT.rot = STAMP_TILT * (1 - hung);
  BENCH_AT.scale = pop;
  at(ctx, BENCH_AT, () => stamp(ctx, hand, s));
};

const QUESTION = 'How should man be just with God?';
export const QUESTION_AT: Pt = [960, 205];
const questionStyle = {
  family: F.display,
  size: 84,
  weight: 600,
  color: C.ink,
  align: 'center',
} as const;
export const question = (ctx: CanvasRenderingContext2D, hand: Hand, opts: WriteOptions) =>
  write(ctx, QUESTION, QUESTION_AT[0], QUESTION_AT[1], questionStyle, hand, {
    boil: 0.4,
    ...opts,
  });

export const ADVOCATE_POSE: Person = { browTilt: 0.15 };

export const FIGURE_LANDED = {
  tilt: -0.05,
  look: [3, 0],
  browL: 2,
  browR: 2,
  smile: 0.7,
} as const satisfies Person;

interface Court {
  readonly cam: Camera;
  readonly drift?: number;
  readonly swing: number;
  readonly held: number;
  readonly stamp: number;
  readonly pop: number;
  readonly fill?: number;
  readonly hung?: number;
  readonly heart?: number;
  readonly offer?: number;
  readonly given?: number;
  readonly word?: number;
  readonly wordKept?: number;
  readonly sun?: number;
  readonly gold: number;
  readonly shine: number;
  readonly figure: Person;
  readonly advocate: Person;
}

export const landingCourt = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hand: Hands,
  s: Court,
) =>
  multiplane(
    ctx,
    s.cam,
    w,
    h,
    [
      {
        z: 1.35,
        draw: () => {
          courtSun(ctx, hand, s.sun);
          for (const [x, k] of [
            [300, 1],
            [1580, 2],
          ] as const)
            piece(ctx, rectShape(x, 80, 200, 800), C.boardLight, hand(`pillar${k}`), {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 3,
              shadow: 0.3,
            });
          piece(ctx, rectShape(-400, 868, 2700, 400), C.boardShade, hand('floor'), {
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
          glow(ctx, 1180, 560, 700, C.glow, 0.9 * s.gold);
          at(ctx, { x: JUDGE[0], y: JUDGE[1] }, () => {
            piece(ctx, JUDGE_ROBE, C.ink, hand('judgeRobe'), { role: 'figure' });
            for (const x of [-9, 9])
              piece(ctx, rounded(x, 88, 14, 30, 3), C.paper, hand(`band${x}`), {
                role: 'figure',
                line: 2,
              });
            piece(ctx, JUDGE_HEAD, C.figure, hand('judgeHead'), { role: 'figure' });
            ctx.fillStyle = C.outline;
            for (const x of [-22, 22]) {
              ctx.beginPath();
              ctx.ellipse(x - 6, -6, 4.5, 5.5, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            for (const side of [-1, 1] as const)
              stroke(
                ctx,
                line([side * 22 - 13, -30 + side * 2], [side * 22 + 13, -30 - side * 2]),
                { color: C.outline, width: 5, jitter: 0.3, taper: 0.2, boil: 'crawl' },
                hand(`judgeBrow${side}`),
              );
            stroke(
              ctx,
              [
                [-13, 27],
                [0, 33],
                [13, 27],
              ],
              { color: C.outline, width: 4, jitter: 0.3, boil: 'crawl' },
              hand('judgeMouth'),
            );
          });
          piece(ctx, rectShape(860, 475, 640, 380), mix(C.board, C.gold, s.gold), hand('bench'), {
            role: 'scenery',
            kind: 'cut',
            torn: 2,
          });
          [980, 1180, 1380].forEach((x, i) => {
            const panel = rounded(x, 680, 170, 280, 10);
            stroke(
              ctx,
              [...panel, panel[0] ?? [x, 540]],
              { color: C.boardShade, width: 3, jitter: 0.5, taper: 0, boil: 'none', closed: true },
              hand(`panel${i}`),
            );
          });
          piece(ctx, rounded(1180, 472, 690, 34, 6), C.boardDeep, hand('rim'), {
            role: 'scenery',
            kind: 'cut',
          });
          piece(ctx, rounded(1436, 448, 76, 14, 4), C.boardDeep, hand('block'), {
            role: 'scenery',
            kind: 'cut',
            line: 2,
          });
          judgeGavel(ctx, hand, s.swing, s.held);
          if (s.stamp > 0.01) {
            BENCH_STAMP.fill = s.fill ?? 1;
            BENCH_STAMP.shown = s.stamp;
            benchStamp(ctx, hand, BENCH_STAMP, s.pop, s.hung ?? 0);
          }
        },
      },
      {
        z: 0.9,
        lift: 1.3,
        draw: () => {
          glow(ctx, ADVOCATE[0], ADVOCATE[1] - 150, 260, C.glow, 0.7);
          glow(ctx, ACCUSED[0], ACCUSED[1] - 110, 200, C.glow, s.shine);
          at(ctx, { x: ADVOCATE[0], y: ADVOCATE[1], scale: ADVOCATE_S }, () =>
            christ(ctx, s.advocate, hand),
          );
          at(ctx, { x: ACCUSED[0], y: ACCUSED[1] }, () =>
            person(
              ctx,
              { ...s.figure, body: C.robe, shade: C.robe, garment: 'robe' },
              hand('figure'),
            ),
          );
          giftLight(ctx, s, hand('christ'));
          wordInHand(ctx, s, hand('figure'));
          const inner = Math.max(s.heart ?? 0, s.shine);
          if (inner > 0) {
            const [cx, cy] = HEART_IN;
            glow(ctx, cx, cy, 70, C.glow, 0.9 * inner);
            glow(ctx, cx, cy, 30, C.gold, 0.7 * inner);
          }
        },
      },
    ],
    { rest: [REST.x, REST.y], haze: C.tealLow, thickness: 0.4, drift: s.drift },
  );

const HEART_IN: Pt = [ACCUSED[0] + 4, ACCUSED[1] - 84];
const GIVEN_AT: Pt = [-104, -80];
const ADVOCATE_S = 1.12;

const giftLight = (ctx: CanvasRenderingContext2D, s: Court, christHand: Hand) => {
  const offer = s.offer ?? 0;
  const given = s.given ?? 0;
  const alpha = offer * (1 - given * given);
  if (alpha <= 0.01) return;
  const [hx, hy] = s.advocate.far === undefined ? GIVEN_AT : handOf(s.advocate, 'far', christHand);
  const x = lerp(ADVOCATE[0] + ADVOCATE_S * hx, HEART_IN[0], given);
  const y = lerp(ADVOCATE[1] + ADVOCATE_S * hy, HEART_IN[1], given);
  glow(ctx, x, y, 46, C.glow, 0.9 * alpha);
  glow(ctx, x, y, 16, C.gold, 0.9 * alpha);
};
const WORD_ABOVE = -160;
const WORD_SIDE = 90;
const WORD_MELT = 0.7;

const wordInHand = (ctx: CanvasRenderingContext2D, s: Court, figure: Hand) => {
  const word = s.word ?? 0;
  const kept = s.wordKept ?? 1;
  if (word <= 0 || kept <= 0.01) return;
  const [hx, hy] = handOf(s.figure, 'near', figure);
  const to: Pt = [ACCUSED[0] + hx, ACCUSED[1] + hy - 14];
  const melt = clamp((word - WORD_MELT) / (1 - WORD_MELT));
  ctx.save();
  ctx.globalAlpha *= kept;
  if (melt < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - melt;
    flight(
      ctx,
      arc([to[0] + WORD_SIDE, WORD_ABOVE], to, 40),
      word,
      sub(figure, 700),
      0.3 * (1 - 0.5 * melt),
      false,
    );
    ctx.restore();
  }
  if (melt > 0) {
    glow(ctx, to[0], to[1], 90, C.glow, 0.95 * melt);
    glow(ctx, to[0], to[1], 36, C.gold, 0.95 * melt);
    glow(ctx, to[0], to[1], 12, C.glow, melt);
  }
  ctx.restore();
};

const SUN_FROM: Pt = [470, 600];
const SUN_TO: Pt = [990, 600];
const SUN_RISE = 150;

const courtSun = (ctx: CanvasRenderingContext2D, hand: Hands, day: number | undefined) => {
  if (day === undefined || day <= 0 || day >= 1) return;
  const x = lerp(SUN_FROM[0], SUN_TO[0], day);
  const y = lerp(SUN_FROM[1], SUN_TO[1], day) - SUN_RISE * Math.sin(Math.PI * day);
  glow(ctx, x, y, 120, C.glow, 0.8);
  piece(ctx, ellipseShape(x, y, 34, 34), C.gold, hand('sun'), {
    role: 'scenery',
    line: 0,
    shadow: 0,
  });
};

export const courtWall = (ctx: CanvasRenderingContext2D, w: number, h: number) =>
  sky(ctx, w, h, [
    [0, C.glow],
    [0.55, C.peachLow],
    [1, C.boardLight],
  ]);

const COURT_WINDOW: Pt = [1045, 220];
export const COURT_BENCH: Pt = [1600, 750];

export const court = (ctx: CanvasRenderingContext2D, hand: Hands, sun = 0) => {
  const [wx, wy] = COURT_WINDOW;
  piece(ctx, rounded(wx, wy, 230, 260, 20), C.peachTop, hand('window'), {
    role: 'scenery',
    kind: 'cut',
    line: 5,
  });
  piece(ctx, ellipseShape(wx, wy + 52 + 150 * sun, 39, 39), C.gold, hand('sun'), {
    role: 'scenery',
    line: 0,
  });
  ctx.save();
  ctx.globalAlpha *= 0.33;
  ctx.fillStyle = C.glow;
  ctx.beginPath();
  ctx.moveTo(wx - 100, wy + 132);
  ctx.lineTo(wx + 100, wy + 132);
  ctx.lineTo(wx + 330, 960);
  ctx.lineTo(wx - 330, 960);
  ctx.fill();
  ctx.restore();
  for (const [x, k] of [
    [150, 34],
    [1790, 35],
  ] as const)
    piece(ctx, rectShape(x - 65, 60, 130, 1000), C.board, sub(hand('pillar'), k), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 3,
    });
  piece(ctx, rectShape(-40, 935, 2000, 160), C.boardShade, hand('floor'), {
    role: 'scenery',
    line: 0,
    torn: 4,
  });
  const [bx, by] = COURT_BENCH;
  piece(ctx, rectShape(bx - 240, by, 480, 200), C.board, hand('bench'), {
    role: 'scenery',
    kind: 'cut',
    line: 4,
  });
  piece(ctx, rectShape(bx - 260, by - 27, 520, 34), C.boardDeep, hand('benchTop'), {
    role: 'scenery',
    kind: 'cut',
    line: 4,
  });
};

export const accuser = (ctx: CanvasRenderingContext2D, hand: Hands, point = 0) => {
  glow(ctx, 20, -300, 380, C.boardDeep, 0.4);
  piece(ctx, ACCUSER_BODY, ACCUSER_GREY, hand('accuserBody'), { role: 'figure', line: 4 });
  ACCUSING.reach = point;
  const k = hand('accuserArm');
  ACCUSER_ROOT.breath = breathOf(k);
  floatingHand(ctx, ACCUSER_ROOT, ACCUSING, ACCUSER_HAND, k, ACCUSER_SEEN);
  at(ctx, { x: 0, y: -420 }, () => {
    piece(
      ctx,
      [
        [0, -70],
        [46, -10],
        [30, 50],
        [-30, 50],
        [-46, -10],
      ],
      ACCUSER_GREY,
      hand('accuserHead'),
      { role: 'figure', line: 4 },
    );
    ctx.fillStyle = C.outline;
    for (const x of [-14, 16]) {
      ctx.beginPath();
      ctx.ellipse(x, 6, 3.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
};
const ACCUSER_GREY = '#5f5a55';
const ACCUSER_BODY: ReadonlyArray<Pt> = [
  [-40, -370],
  [40, -370],
  [74, -6],
  [-74, -6],
];
const ACCUSER_SHAPES = [ACCUSER_BODY];
const ACCUSER_SEEN: HandBody = { over: true, body: () => ACCUSER_SHAPES };
const ACCUSER_HAND: HandStyle = {
  skin: ACCUSER_GREY,
  outline: C.outline,
  mitten: 46,
  line: 3.5,
  radius: 210,
};
const ACCUSER_ROOT: Posed<HandRoot> = {
  shoulder: [20, -342],
  rest: [90, -196],
  away: 1,
  breath: 0,
};
const ACCUSING: Posed<Gesture> = { to: [168, -262], reach: 0, grip: 'point' };

export const JOSHUA: Pt = [760, 950];
export const JS = 2;
const AS = 1.7;
const HELPERS = [
  [610, 1, 1],
  [910, -1, 2],
] as const;

const TUNIC: Pt[] = [
  [-39, -134],
  [39, -134],
  [48, -18],
  [-48, -18],
];
export const TUNIC_STAINS = [
  blob(-15, -105, 23, 19, 21),
  blob(18, -65, 29, 22, 22),
  blob(-20, -40, 20, 15, 23),
  blob(15, -118, 13, 11, 24),
];
const CHEEK: Pt = [-19, -160];
export const SPECKS = [blob(22, -100, 7, 6, 12), blob(-15, -60, 8, 6, 13)];

export const ZECH_REST = UNMOVED;
const ACCUSER_AT: Pt = [300, 950];
const ACCUSER_FROM = -260;
const ACCUSER_S = 0.9;
const ANGEL_AT: Pt = [1330, 950];
const ANGEL_S = 2.1;

interface ZechCourt {
  readonly sun: number;
  readonly accuser: { readonly enter: number; readonly shrink: number; readonly point: number };
  readonly angel: {
    readonly lift: number;
    readonly tilt: number;
    readonly reach?: Gesture;
  };
  readonly joshua: Person;
  readonly specks: number;
  readonly cheek: { readonly dy: number; readonly alpha: number };
  readonly tunic: { readonly at: Pt; readonly flare: (i: number) => number };
  readonly helpers: {
    readonly grip: number;
    readonly dx: number;
    readonly bob: number;
    readonly up: number;
  };
}

export const zechCourt = (ctx: CanvasRenderingContext2D, hand: Hands, s: ZechCourt) => {
  court(ctx, hand, s.sun);
  zechAccuser(ctx, hand, s.accuser);
  zechAngel(ctx, hand, s.angel);
  zechJoshua(ctx, hand, s);
  at(ctx, { x: s.tunic.at[0], y: s.tunic.at[1], scale: JS }, () => tunic(ctx, hand, s.tunic.flare));
  for (const helper of HELPERS) zechHelper(ctx, hand, helper, s);
};

const zechAccuser = (ctx: CanvasRenderingContext2D, hand: Hands, a: ZechCourt['accuser']) => {
  if (a.enter <= 0) return;
  const [x, y] = ACCUSER_AT;
  at(ctx, { x: lerp(ACCUSER_FROM, x, a.enter), y, scale: lerp(1.05, ACCUSER_S, a.shrink) }, () => {
    accuser(ctx, hand, a.point);
    glow(ctx, 0, -250, 330, C.boardDeep, 0.35 * a.shrink * (1 - a.shrink) * 4);
  });
};

const zechAngel = (ctx: CanvasRenderingContext2D, hand: Hands, a: ZechCourt['angel']) => {
  const [x, y] = ANGEL_AT;
  glow(ctx, x, y - 250, 310, C.glow, 0.8 + 0.2 * a.lift);
  ANGEL.tilt = a.tilt;
  ANGEL.far = a.reach;
  at(ctx, { x, y, scale: ANGEL_S }, () => christ(ctx, ANGEL, hand));
};
const ANGEL: Posed<Person> = { tilt: 0, look: [-3, 1], browTilt: 0.15 };

const zechJoshua = (ctx: CanvasRenderingContext2D, hand: Hands, s: ZechCourt) =>
  at(ctx, { x: JOSHUA[0], y: JOSHUA[1], scale: JS }, () => {
    person(ctx, { ...s.joshua, onHead: turban }, hand('joshua'));
    SPECKS.forEach((speck, i) =>
      piece(ctx, speck, C.scarlet, sub(hand('speck'), i), {
        role: 'figure',
        line: 0,
        shadow: 0.1,
        alpha: s.specks,
      }),
    );
    const [cx, cy] = CHEEK;
    piece(ctx, blob(cx, cy + s.cheek.dy, 6, 5, 11), C.scarlet, hand('cheek'), {
      role: 'figure',
      line: 0,
      shadow: 0.1,
      alpha: s.cheek.alpha,
    });
  });

const TUNIC_HOLD: Pt = [42, -50];

const zechHelper = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  [x0, side, k]: (typeof HELPERS)[number],
  s: ZechCourt,
) => {
  const { grip, dx, bob, up } = s.helpers;
  const x = x0 + dx;
  const y = JOSHUA[1] - (k === 1 ? bob : 5 - bob);
  const [tx, ty] = s.tunic.at;
  HOLDING.to[0] = (tx - side * TUNIC_HOLD[0] * JS - x) / AS;
  HOLDING.to[1] = (ty + TUNIC_HOLD[1] * JS - y) / AS;
  HOLDING.reach = grip;
  HELPER.look[0] = side * 2 * grip - side * 1.5 * (1 - grip);
  HELPER.look[1] = -2 * up;
  HELPER.near = side === 1 ? HOLDING : undefined;
  HELPER.far = side === 1 ? undefined : HOLDING;
  at(ctx, { x, y, scale: AS }, () => person(ctx, HELPER, sub(hand('helper'), k)));
};
const HOLDING: GestureAt = {
  to: [0, 0],
  reach: 0,
  grip: 'hold',
};
const HELPER: Posed<Person> & { look: [number, number] } = {
  body: C.figureShade,
  skin: C.figureShade,
  look: [0, 0],
};

export const tunic = (ctx: CanvasRenderingContext2D, hand: Hands, flare: (i: number) => number) => {
  piece(ctx, TUNIC, C.cutShade, hand('tunic'), { role: 'figure', torn: 2.5, line: 2 });
  TUNIC_STAINS.forEach((stain, i) => {
    const lit = flare(i);
    if (lit > 0) {
      const [sx, sy] = stain[0] ?? [0, 0];
      glow(ctx, sx + 10, sy, 36, C.scarlet, 0.6 * lit);
    }
    piece(ctx, stain, i % 2 === 0 ? C.scarlet : C.scarletShade, sub(hand('stain'), i), {
      role: 'figure',
      line: 0,
      torn: 3,
      shadow: 0.1,
    });
  });
};

export const gavel = (ctx: CanvasRenderingContext2D, hand: Hands, place: Place) =>
  at(ctx, place, () => {
    piece(ctx, GAVEL_HANDLE, C.inkSoft, hand('handle'), { role: 'figure', line: 2 });
    piece(ctx, GAVEL_HEAD, C.cutDeep, hand('gavelHead'), { role: 'figure', line: 2.5 });
  });
const GAVEL_HANDLE = rounded(0, -52, 12, 100, 4);
const GAVEL_HEAD = rounded(0, -104, 64, 34, 8);

const JUDGE_HAND: HandStyle = {
  skin: C.figure,
  outline: C.outline,
  mitten: 36,
  line: 2.5,
  radius: 170,
};
const JUDGE_SHOULDER: Pt = [74, 70];
const JUDGE_REST: Pt = [92, 104];
const JUDGE_ROBE = rounded(0, 120, 250, 120, 40);
const JUDGE_HEAD = ellipseShape(0, 0, 60, 65);
const GAVEL_GRIP = 16;
const JUDGE_ROOT: Posed<HandRoot> & { shoulder: [number, number]; rest: [number, number] } = {
  shoulder: [0, 0],
  rest: [0, 0],
  away: 1,
  breath: 0,
};
const ON_GAVEL: GestureAt = {
  to: [0, 0],
  reach: 0,
  grip: 'hold',
};
const JUDGE_BODY = [JUDGE_ROBE, JUDGE_HEAD].map((shape) =>
  shape.map(([x, y]): Pt => [JUDGE[0] + x, JUDGE[1] + y]),
);
const JUDGE_SEEN: HandBody = { over: true, body: () => JUDGE_BODY };

export const judgeGavel = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  rot: number,
  held: number,
  dy = 0,
) => {
  gavel(ctx, hand, { x: GAVEL[0], y: GAVEL[1], rot });
  JUDGE_ROOT.shoulder[0] = JUDGE[0] + JUDGE_SHOULDER[0];
  JUDGE_ROOT.shoulder[1] = JUDGE[1] + JUDGE_SHOULDER[1] + dy;
  JUDGE_ROOT.rest[0] = JUDGE[0] + JUDGE_REST[0];
  JUDGE_ROOT.rest[1] = JUDGE[1] + JUDGE_REST[1];
  ON_GAVEL.to[0] = GAVEL[0] + Math.sin(rot) * GAVEL_GRIP;
  ON_GAVEL.to[1] = GAVEL[1] - Math.cos(rot) * GAVEL_GRIP;
  ON_GAVEL.reach = held;
  const k = hand('judgeArm');
  JUDGE_ROOT.breath = breathOf(k);
  floatingHand(ctx, JUDGE_ROOT, ON_GAVEL, JUDGE_HAND, k, JUDGE_SEEN);
};
