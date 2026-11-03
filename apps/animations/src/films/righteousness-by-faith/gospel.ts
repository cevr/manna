import {
  type Camera,
  type Pt,
  at,
  inset,
  multiplane,
  quad,
  rectShape,
  spline,
  stroke,
  sub,
  blob,
  ground,
  glow,
  type Hex,
  mix,
  rounded,
  sky,
} from '@manna/film/canvas';
import { clamp, lerp, staggered } from '@manna/film/core';
import {
  type GestureAt,
  C,
  CHEST,
  HEART,
  ICON_LEAD,
  type HeadPiece,
  type Hands,
  type Person,
  christ,
  handOf,
  person,
  piece,
  shifted,
  tracePath,
} from './kit.ts';
import { tablets } from './law.ts';

const clothShape = (rx: number, ry: number, drape: number): Pt[] =>
  spline(
    [
      [-1.12 * rx, (0.2 + 0.9 * drape) * ry],
      [-1.2 * rx, -0.3 * ry],
      [-1.02 * rx, -0.98 * ry],
      [-0.45 * rx, -1.28 * ry],
      [0.45 * rx, -1.28 * ry],
      [1.02 * rx, -0.98 * ry],
      [1.2 * rx, -0.3 * ry],
      [1.12 * rx, (0.2 + 0.9 * drape) * ry],
      [0.86 * rx, (0.1 + 0.85 * drape) * ry],
      [0.9 * rx, -0.1 * ry],
      [0.7 * rx, -0.55 * ry],
      [0, -0.66 * ry],
      [-0.7 * rx, -0.55 * ry],
      [-0.9 * rx, -0.1 * ry],
      [-0.86 * rx, (0.1 + 0.85 * drape) * ry],
    ],
    6,
    true,
  );

const headcloth = (color: string, drape: number, cord?: string): HeadPiece => {
  let shape: Pt[] | undefined;
  return (ctx, [cx, cy], [rx, ry], hand) => {
    shape ??= clothShape(rx, ry, drape);
    piece(ctx, shifted(shape, cx, cy), color, sub(hand, 5), { role: 'figure' });
    if (cord !== undefined)
      stroke(
        ctx,
        quad(
          [cx - 1.1 * rx, cy - 0.62 * ry],
          [cx, cy - 0.78 * ry],
          [cx + 1.1 * rx, cy - 0.62 * ry],
        ),
        { color: cord, width: 5, jitter: 0.4, taper: 0.1, boil: 'crawl' },
        sub(hand, 6),
      );
  };
};

interface Onlooker {
  readonly at: Pt;
  readonly s: number;
  readonly build: readonly [number, number];
  readonly head?: HeadPiece;
  readonly body: Hex;
  readonly look: Pt;
}

const ROOF_TOP = 300;
const SLAB = 46;
const FLOOR = 930;
const HOUSE_L = 140;
const HOUSE_R = 1780;
const HOLE: Pt = [560, 920];
const BED_X = 720;
const BED_W = 320;
const BED_H = 40;
const BED_DOWN = FLOOR - 26;
const BED_UP = ROOF_TOP + 12;
const MAN_S = 1.5;
const HIP_X = BED_X + 30;
const HIP_LIE = 48;
const HIP_STAND = 60 * MAN_S;
const WALK_TO = 380;
const LIE = -Math.PI / 2 + 0.14;
const JESUS_HOUSE: Pt = [1260, FLOOR];
const JESUS_HOUSE_S = 2.1;

export const WENT: Camera = { x: 430, y: 690, zoom: 1.7 };

const FRIENDS: ReadonlyArray<{
  readonly x: number;
  readonly side: -1 | 1;
  readonly build: readonly [number, number];
  readonly head?: HeadPiece;
  readonly body: Hex;
}> = [
  { x: 400, side: -1, build: [1.1, 0.95], head: headcloth(C.cutShade, 0.7), body: C.figure },
  {
    x: 495,
    side: -1,
    build: [0.9, 1.15],
    head: headcloth(C.stone, 0.4, C.cutDeep),
    body: C.figureShade,
  },
  { x: 985, side: 1, build: [1.2, 0.9], body: C.figure },
  { x: 1080, side: 1, build: [0.95, 1.05], head: headcloth(C.cutLight, 0.9), body: C.figure },
];
const FRIEND_S = 1.1;
const FRIEND_HOLD = 40;
const FRIEND_HOLD_Y = -52;
const ON_ROPE_R: GestureAt = { to: [FRIEND_HOLD, FRIEND_HOLD_Y], reach: 0, grip: 'hold' };
const ON_ROPE_L: GestureAt = { to: [-FRIEND_HOLD, FRIEND_HOLD_Y], reach: 0, grip: 'hold' };

const TILES: ReadonlyArray<readonly [from: number, to: Pt]> = [
  [620, [290, ROOF_TOP - 23]],
  [740, [1190, ROOF_TOP - 23]],
  [860, [290, ROOF_TOP - 69]],
];
const TILE = rounded(0, 0, 116, SLAB, 6);
const TILES_SHARE = 2 / 7;

const ROOM_CROWD: ReadonlyArray<Onlooker> = [
  {
    at: [300, 912],
    s: 1.3,
    build: [1.1, 1],
    head: headcloth(C.cutShade, 0.8),
    body: C.figure,
    look: [3, 1],
  },
  { at: [420, 915], s: 1.45, build: [0.9, 1.1], body: C.figureShade, look: [3, 0] },
  {
    at: [960, 910],
    s: 1.35,
    build: [1, 0.95],
    head: headcloth(C.stone, 0.5, C.cutDeep),
    body: C.figure,
    look: [-3, 1],
  },
  {
    at: [1085, 914],
    s: 1.25,
    build: [1.15, 0.9],
    head: headcloth(C.cutLight, 1),
    body: C.figure,
    look: [-2, 0],
  },
];

const SCRIBES: ReadonlyArray<{
  readonly x: number;
  readonly build: readonly [number, number];
  readonly head: HeadPiece;
  readonly body: Hex;
}> = [
  { x: 1450, build: [1.1, 1.05], head: headcloth(C.cutDeep, 0.8, C.gold), body: C.figureShade },
  { x: 1570, build: [0.95, 1.1], head: headcloth(C.inkSoft, 0.6, C.cutShade), body: C.figure },
];
const SCRIBE_S = 1.3;
const BENCH_Y = FLOOR - 150;
const ON_KNEE: GestureAt = { to: [-18, -34], reach: 1, grip: 'open' };
const AT_CHIN: GestureAt = { to: [30, -122], reach: 0, grip: 'hold' };
const SCRIBE_LOOK: [number, number] = [-4, 0];
const SCRIBE: Person = { look: SCRIBE_LOOK, sit: 1, ground: 0, far: ON_KNEE };
const NEAR_CROWD: ReadonlyArray<Onlooker> = [
  {
    at: [30, 1240],
    s: 2.8,
    build: [1.1, 1],
    head: headcloth(C.cutShade, 0.9),
    body: C.figureShade,
    look: [4, 0],
  },
  {
    at: [250, 1260],
    s: 2.45,
    build: [0.95, 1.1],
    head: headcloth(C.stone, 0.4),
    body: C.figure,
    look: [3, -1],
  },
  { at: [1830, 1255], s: 2.6, build: [1.05, 0.95], body: C.figure, look: [-3, -1] },
  {
    at: [1910, 1240],
    s: 2.9,
    build: [0.9, 1.05],
    head: headcloth(C.cutLight, 0.7, C.cutShade),
    body: C.figureShade,
    look: [-4, 0],
  },
];

const NEAR_PART = 420;
const ROOM_PART = 260;

const TOWN: ReadonlyArray<readonly [number, number, number]> = [
  [-200, 260, 170],
  [60, 220, 120],
  [300, 300, 200],
  [620, 240, 140],
  [880, 280, 190],
  [1160, 230, 110],
  [1400, 300, 180],
  [1690, 260, 130],
  [1960, 280, 200],
];

const SPECKS_SHARE = 3 / 13;
const MAN_SPECKS = [
  blob(10, -86, 22, 18, 51),
  blob(-16, -56, 16, 13, 52),
  blob(14, -40, 12, 10, 53),
];

export interface House {
  readonly cam: Camera;
  readonly tiles: number;
  readonly lower: number;
  readonly ropes: number;
  readonly lookUp: number;
  readonly reach: number;
  readonly lookAfter: number;
  readonly specks: number;
  readonly rise: number;
  readonly roll: number;
  readonly steady: number;
  readonly walk: number;
  readonly bob: number;
  readonly glad: number;
  readonly wonder: number;
  readonly doubt: number;
  readonly holeLit: number;
  readonly robed: number;
  readonly heart: number;
}

export const house = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hand: Hands,
  s: House,
) => {
  sky(ctx, w, h, PEACH);
  multiplane(
    ctx,
    s.cam,
    w,
    h,
    [
      {
        z: 1.8,
        draw: () =>
          TOWN.forEach(([x, bw, top], i) =>
            piece(
              ctx,
              rectShape(x - bw / 2, top, bw, 1100 - top),
              C.boardShade,
              sub(hand('town'), i),
              {
                role: 'scenery',
                kind: 'cut',
                line: 0,
                torn: 3,
                shadow: 0.4,
              },
            ),
          ),
      },
      {
        z: 1.25,
        draw: () => {
          piece(ctx, rectShape(60, ROOF_TOP, 1800, 760), C.boardLight, hand('wall'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 3,
          });
          piece(ctx, rounded(1500, 520, 150, 190, 20), C.peachTop, hand('window'), {
            role: 'scenery',
            kind: 'cut',
            line: 4,
          });
          piece(ctx, rounded(300, 720, 170, 320, 16), C.boardDeep, hand('door'), {
            role: 'scenery',
            kind: 'cut',
            line: 4,
          });
        },
      },
      {
        z: 1,
        lift: 1.3,
        draw: () => {
          room(ctx, hand, s);
          roofTop(ctx, hand, s);
        },
      },
      {
        z: 0.8,
        draw: () => onlookers(ctx, hand, NEAR_CROWD, 'near', s.wonder, BED_X, NEAR_PART * s.walk),
      },
    ],
    { rest: [960, 560], haze: C.peachLow, thickness: 0.35 },
  );
};

const PEACH = [
  [0, C.peachTop],
  [0.75, C.peachLow],
  [1, C.peachLow],
] as const;

const onlookers = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  crowd: ReadonlyArray<Onlooker>,
  key: string,
  wonder: number,
  toward: number,
  part = 0,
) =>
  crowd.forEach((o, i) => {
    const turn = clamp((toward - o.at[0]) / 500, -1, 1) * 4;
    const x = o.at[0] + (o.at[0] < 960 ? -part : part);
    at(ctx, { x, y: o.at[1], scale: o.s }, () =>
      person(
        ctx,
        {
          body: o.body,
          build: o.build,
          onHead: o.head,
          look: [lerp(o.look[0], turn, wonder), lerp(o.look[1], -1, wonder)],
          browL: 2.5 * wonder,
          browR: 3 * wonder,
          browTilt: 0.2 + 0.2 * wonder,
          mouth: i % 2 === 0 ? 0.5 * wonder : 0,
        },
        sub(hand(key), i),
      ),
    );
  });

const bedY = (lower: number) => lerp(BED_UP, BED_DOWN, lower);

const roofTop = (ctx: CanvasRenderingContext2D, hand: Hands, s: House) => {
  piece(ctx, rectShape(HOUSE_L, ROOF_TOP, HOLE[0] - HOUSE_L, SLAB), C.board, hand('slabL'), {
    role: 'scenery',
    kind: 'cut',
    line: 0,
    torn: 2,
  });
  piece(ctx, rectShape(HOLE[1], ROOF_TOP, HOUSE_R - HOLE[1], SLAB), C.board, hand('slabR'), {
    role: 'scenery',
    kind: 'cut',
    line: 0,
    torn: 2,
  });
  TILES.forEach(([x, [tx, ty]], i) => {
    const k = staggered(s.tiles, i / (TILES.length - 1), TILES_SHARE);
    at(
      ctx,
      {
        x: lerp(x, tx, k),
        y: lerp(ROOF_TOP + SLAB / 2, ty, k) - 90 * Math.sin(Math.PI * k),
        rot: 0.3 * Math.sin(Math.PI * k),
      },
      () =>
        piece(ctx, TILE, C.board, sub(hand('tile'), i), {
          role: 'scenery',
          kind: 'cut',
          line: 0,
          torn: 2,
        }),
    );
  });
  if (s.holeLit > 0) {
    const cx = (HOLE[0] + HOLE[1]) / 2;
    glow(ctx, cx, ROOF_TOP + SLAB, 420, C.glow, 0.9 * s.holeLit);
    glow(ctx, cx, ROOF_TOP + SLAB, 180, C.gold, 0.5 * s.holeLit);
  }
  ON_ROPE_R.reach = s.ropes;
  ON_ROPE_L.reach = s.ropes;
  FRIENDS.forEach((fr, i) => {
    at(ctx, { x: fr.x, y: ROOF_TOP, scale: FRIEND_S }, () =>
      person(
        ctx,
        {
          body: fr.body,
          build: fr.build,
          onHead: fr.head,
          look: [-2 * fr.side, 4],
          nod: 3,
          browTilt: 0.3,
          smile: 0.4 * s.lower,
          ...(fr.side < 0 ? { near: ON_ROPE_R } : { far: ON_ROPE_L }),
        },
        sub(hand('friend'), i),
      ),
    );
  });
};

const ropes = (ctx: CanvasRenderingContext2D, hand: Hands, s: House) => {
  const shown = s.ropes;
  if (shown <= 0) return;
  const y = bedY(s.lower);
  FRIENDS.forEach((fr, i) =>
    stroke(
      ctx,
      [
        [fr.x - fr.side * FRIEND_HOLD * FRIEND_S, ROOF_TOP + FRIEND_HOLD_Y * FRIEND_S],
        [BED_X + fr.side * (BED_W / 2 - 18 - 14 * (i % 2)), y - 6],
      ],
      { color: C.cutDeep, width: 3, jitter: 0.4, taper: 0, alpha: shown, boil: 'crawl' },
      sub(hand('rope'), i),
    ),
  );
};

const MAN_LOOK: [number, number] = [0, 0];
const ROLL_W = 110;
const ROLL_H = 44;
const ON_SHOULDER: Pt = [58, -222];
const ROLL_TILT = -0.15;
const ON_ROLL: GestureAt = { to: [38, -128], reach: 0, grip: 'hold' };
const FOLDED_NEAR: GestureAt = { to: [14, -96], reach: 1, grip: 'open' };
const FOLDED_FAR: GestureAt = { to: [-6, -60], reach: 1, grip: 'open' };
const OUT_TO_HIM: GestureAt = { to: [-104, -104], reach: 0, grip: 'open' };
const MAN_WASH: [number, number, number] = [0, 0, 0];
const MAN: Person = { look: MAN_LOOK, stains: MAN_SPECKS, washed: MAN_WASH };
const MAN_BODY = [C.figure, C.robe] as const;
const MAN_SHADE = [C.figureShade, mix(C.figureShade, C.robe, 0.8)] as const;

const litHeart = (ctx: CanvasRenderingContext2D, hand: Hands, lit: number) => {
  const [cx, cy] = CHEST;
  glow(ctx, cx, cy, 90, C.glow, 0.9 * lit);
  at(ctx, { x: cx, y: cy, scale: 0.2 * lerp(0.6, 1, lit) }, () =>
    piece(ctx, HEART, C.gold, hand('litHeart'), {
      role: 'figure',
      line: 5,
      shadow: 0.2,
      alpha: clamp(2 * lit),
    }),
  );
};

const room = (ctx: CanvasRenderingContext2D, hand: Hands, s: House) => {
  for (const [x, k] of [
    [HOUSE_L - 40, 'wallL'],
    [HOUSE_R, 'wallR'],
  ] as const)
    piece(ctx, rectShape(x, ROOF_TOP, 40, FLOOR - ROOF_TOP + 10), C.board, hand(k), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 2,
    });
  piece(ctx, rectShape(-800, FLOOR, 3500, 600), C.boardShade, hand('floor'), {
    role: 'scenery',
    line: 0,
    torn: 4,
  });
  const [jx, jy] = JESUS_HOUSE;
  glow(ctx, jx, jy - 240, 330, C.glow, 0.6);
  ropes(ctx, hand, s);
  onlookers(
    ctx,
    hand,
    ROOM_CROWD,
    'crowd',
    s.wonder,
    lerp(BED_X, HIP_X + (WALK_TO - HIP_X) * s.walk, s.rise),
    ROOM_PART * s.walk,
  );
  scribes(ctx, hand, s);

  const up = s.lookUp * (1 - s.reach);
  OUT_TO_HIM.reach = s.reach;
  at(ctx, { x: jx, y: jy, scale: JESUS_HOUSE_S }, () =>
    christ(
      ctx,
      {
        tilt: -0.12 * up - 0.05 * s.reach,
        look: [lerp(lerp(-3, -2, up), -4, s.lookAfter), lerp(1, -4, up)],
        browTilt: 0.2 + 0.15 * up,
        browL: 2 * up,
        browR: 2 * up,
        smile: 0.3 + 0.3 * s.lookAfter,
        far: OUT_TO_HIM,
      },
      hand,
    ),
  );

  const y = bedY(s.lower);
  const flat = 1 - s.roll;
  if (flat > 0.02) {
    if (s.lower >= 1 && s.rise <= 0) ground(ctx, BED_X, FLOOR - 2, BED_W + 40);
    piece(ctx, rounded(BED_X, y, lerp(90, BED_W, flat), BED_H, 12), C.cutDeep, hand('bed'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
  }

  const rise = s.rise;
  const hx = lerp(HIP_X, WALK_TO, s.walk);
  const hy = lerp(y - BED_H / 2 - HIP_LIE, FLOOR - HIP_STAND - s.bob, rise);
  MAN_LOOK[0] = lerp(1, -3 * s.walk + 2 * (1 - s.walk), rise);
  MAN_LOOK[1] = -1 - 2 * s.glad;
  MAN.ground = rise;
  MAN.skin = rise > 0.3 ? C.figure : C.figureShade;
  MAN.eyes = lerp(0.7, 1, Math.max(rise, s.glad));
  MAN.smile = 0.8 * s.glad;
  MAN.browL = 2 + 1.5 * s.glad;
  MAN.browR = 2 + 1.5 * s.glad;
  MAN.browTilt = 0.35;
  MAN.mouth = 0.4 * s.glad * (1 - s.walk);
  ON_ROLL.reach = s.steady;
  FOLDED_NEAR.reach = 1 - rise;
  FOLDED_FAR.reach = 1 - rise;
  MAN.near = s.steady > 0 ? ON_ROLL : FOLDED_NEAR;
  MAN.far = FOLDED_FAR;
  for (let i = 0; i < MAN_WASH.length; i++) MAN_WASH[i] = s.specks > 0 ? 1 : 0;
  MAN.body = inWhite(MAN_BODY, s.robed);
  MAN.shade = inWhite(MAN_SHADE, s.robed);
  if (s.roll > 0) {
    const onShoulder = clamp(2 * s.roll - 1);
    at(
      ctx,
      {
        x: lerp(BED_X, hx + ON_SHOULDER[0], onShoulder),
        y: lerp(y, FLOOR + ON_SHOULDER[1] - s.bob, onShoulder),
        rot: ROLL_TILT * onShoulder,
      },
      () =>
        piece(
          ctx,
          rounded(0, 0, lerp(BED_W, ROLL_W, clamp(2 * s.roll)), lerp(BED_H, ROLL_H, s.roll), 20),
          C.cutDeep,
          hand('roll'),
          { role: 'figure', line: 3 },
        ),
    );
  }
  at(ctx, { x: hx, y: hy, rot: lerp(LIE, 0, rise) }, () =>
    at(ctx, { x: 0, y: HIP_STAND, scale: MAN_S }, () => {
      person(ctx, MAN, hand('man'));
      if (s.heart > 0) litHeart(ctx, hand, s.heart);
    }),
  );
  if (s.specks > 0 && s.specks < 1)
    MAN_SPECKS.forEach((speck, i) => {
      const k = staggered(s.specks, i / MAN_SPECKS.length, SPECKS_SHARE);
      at(ctx, { x: hx, y: hy, rot: LIE }, () =>
        at(ctx, { x: 90 * k, y: HIP_STAND - 30 * k, scale: MAN_S }, () =>
          piece(ctx, speck, C.scarlet, sub(hand('speck'), i), {
            role: 'figure',
            line: 0,
            shadow: 0.1,
            alpha: 1 - k,
          }),
        ),
      );
    });
  const blanket = clamp(1 - 2.5 * rise);
  if (blanket > 0)
    piece(ctx, rounded(BED_X + 70, y - BED_H / 2 - 16, 220, 46, 16), C.cream, hand('blanket'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
      alpha: blanket,
    });
};

const scribes = (ctx: CanvasRenderingContext2D, hand: Hands, s: House) => {
  const [first, last] = [SCRIBES[0], SCRIBES.at(-1)];
  if (first === undefined || last === undefined) return;
  const half = 70 * SCRIBE_S;
  piece(
    ctx,
    rectShape(first.x - half, BENCH_Y, last.x - first.x + 2 * half, FLOOR - BENCH_Y + 4),
    C.boardDeep,
    hand('bench'),
    { role: 'scenery', kind: 'cut', line: 3 },
  );
  const doubt = s.doubt * (1 - s.wonder);
  SCRIBE_LOOK[0] = lerp(-4, -5, s.wonder);
  SCRIBE_LOOK[1] = lerp(0.5, -0.5, s.wonder);
  SCRIBE.nod = 3 * doubt;
  SCRIBE.browTilt = lerp(0, -0.35, doubt) + 0.3 * s.wonder;
  SCRIBE.browL = -1.5 * doubt + 2.5 * s.wonder;
  SCRIBE.browR = -1.5 * doubt + 2.5 * s.wonder;
  SCRIBE.smile = -0.5 * doubt;
  SCRIBE.mouth = 0.5 * s.wonder;
  AT_CHIN.reach = doubt;
  SCRIBES.forEach((sc, i) => {
    SCRIBE.build = sc.build;
    SCRIBE.onHead = sc.head;
    SCRIBE.body = sc.body;
    SCRIBE.near = i === 0 ? AT_CHIN : undefined;
    at(ctx, { x: sc.x, y: BENCH_Y, scale: SCRIBE_S }, () =>
      person(ctx, SCRIBE, sub(hand('scribe'), i)),
    );
  });
};

const COURT_FLOOR = 950;
const WOMAN_AT: Pt = [640, COURT_FLOOR];
const WOMAN_S = 2.3;
const JESUS_AT: Pt = [1330, COURT_FLOOR];
const JESUS_S = 2.3;
const WOMAN_OUT = -420;

export const COURT_WIDE: Camera = { x: 960, y: 560, zoom: 1 };

const STOOP: readonly [number, number] = [1.1, 0.62];
const WRITING_HAND: Pt = [-70, -10];

const DUST_MARKS: ReadonlyArray<readonly [Pt, Pt, number]> = [
  [[1040, 962], [1085, 956], 1],
  [[1095, 968], [1120, 958], 2],
  [[1030, 982], [1070, 988], 3],
  [[1080, 986], [1135, 978], 4],
  [[1145, 972], [1175, 966], 5],
];

const STONE_SHAPES = [61, 62, 63, 64].map((seed, i) =>
  blob(0, 0, 30 + 6 * (i % 2), 21 + 3 * (i % 3), seed),
);

const WOMAN_STAINS = [
  blob(8, -92, 30, 34, 71),
  blob(-16, -54, 18, 20, 72),
  blob(16, -30, 16, 13, 73),
];
const HER_VEIL = headcloth(C.cutLight, 1);
const HER_VEIL_WHITE = headcloth(C.stone, 1);

const ACCUSERS: ReadonlyArray<{
  readonly from: number;
  readonly to: number;
  readonly s: number;
  readonly build: readonly [number, number];
  readonly head?: HeadPiece;
  readonly body: Hex;
  readonly lands: Pt;
}> = [
  {
    from: 300,
    to: -300,
    s: 1.85,
    build: [1.2, 1.1],
    head: headcloth(C.cutDeep, 0.6),
    body: C.figureShade,
    lands: [350, 968],
  },
  {
    from: 900,
    to: 2350,
    s: 1.75,
    build: [0.95, 1.2],
    head: headcloth(C.inkSoft, 0.9, C.cutShade),
    body: C.figure,
    lands: [950, 990],
  },
  {
    from: 440,
    to: -200,
    s: 1.7,
    build: [0.9, 1.1],
    head: headcloth(C.figureShade, 0.4),
    body: C.figure,
    lands: [480, 1004],
  },
  {
    from: 1030,
    to: 2250,
    s: 1.8,
    build: [1.1, 0.95],
    body: C.figureShade,
    lands: [1000, 965],
  },
];
const ACCUSER_FLOOR = COURT_FLOOR - 26;
const DROP_STAGGER = 0.2;
const LEAVE_STAGGER = 0.15;
const CHARGER = 3;
const STONE_HAND: GestureAt = { to: [34, -92], reach: 1, grip: 'hold' };
const STONE_HAND_FAR: GestureAt = { to: [-20, -92], reach: 1, grip: 'hold' };
const CHARGE_UP: GestureAt = { to: [58, -170], reach: 0, grip: 'hold' };
const ACCUSER_LOOK: [number, number] = [0, 0];
const ACCUSER: Person = { look: ACCUSER_LOOK, nod: 3, browTilt: -0.1 };
const CHARGE_S = 0.34;
const CHARGE_ABOVE = 24;
const STONE_AT: [number, number] = [0, 0];

export interface Temple {
  readonly cam: Camera;
  readonly charge: number;
  readonly drop: number;
  readonly leave: number;
  readonly leaveBob: number;
  readonly writing: number;
  readonly writes: number;
  readonly sends: number;
  readonly stand: number;
  readonly speak: number;
  readonly look: Pt;
  readonly woman: {
    readonly walk: number;
    readonly bob: number;
    readonly washed: number;
    readonly look: Pt;
    readonly bowed: number;
    readonly glad: number;
    readonly white: number;
    readonly faith: number;
    readonly heart: number;
  };
}

const COURTS = mix(C.stone, C.boardShade, 0.35);
const CORNICE = mix(C.stone, C.boardShade, 0.5);
const COURT_GROUND = mix(C.board, C.peachLow, 0.35);
const HER_BODY = [mix(C.stone, C.robe, 0), mix(C.stone, C.robe, 1)] as const;
const HER_SHADE = [mix(C.figureShade, C.robe, 0), mix(C.figureShade, C.robe, 1)] as const;
const inWhite = (ends: readonly [Hex, Hex], white: number) =>
  white <= 0 ? ends[0] : white >= 1 ? ends[1] : mix(ends[0], ends[1], white);

export const temple = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hand: Hands,
  s: Temple,
) => {
  sky(ctx, w, h, PEACH);
  multiplane(
    ctx,
    s.cam,
    w,
    h,
    [
      {
        z: 1.9,
        draw: () => {
          for (const [x, top, bw, k] of [
            [200, 380, 440, 'courtL'],
            [1300, 380, 440, 'courtR'],
          ] as const)
            piece(ctx, rectShape(x, top, bw, 700), COURTS, hand(k), {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 2,
              shadow: 0.4,
            });
          piece(ctx, rectShape(640, 90, 660, 1000), C.stone, hand('sanctuary'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 2,
            shadow: 0.5,
          });
          piece(ctx, rectShape(610, 60, 720, 50), CORNICE, hand('cornice'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 2,
          });
          piece(ctx, rounded(970, 700, 220, 460, 30), C.boardDeep, hand('porch'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
          });
        },
      },
      {
        z: 1.3,
        draw: () => {
          piece(ctx, rectShape(-400, 150, 2720, 50), C.boardShade, hand('lintel'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 2,
          });
          for (const [x, k] of [
            [60, 1],
            [380, 2],
            [1540, 3],
            [1860, 4],
          ] as const)
            piece(ctx, rectShape(x - 55, 200, 110, 720), C.boardLight, sub(hand('pillar'), k), {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 2,
            });
          piece(ctx, rectShape(-400, 860, 2720, 60), C.boardShade, hand('lowWall'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 3,
          });
        },
      },
      {
        z: 1,
        lift: 1.3,
        draw: () => court(ctx, hand, s),
      },
      {
        z: 0.75,
        draw: () =>
          piece(ctx, rectShape(-330, -200, 260, 1500), C.board, hand('nearPillar'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 3,
            shadow: 0.6,
          }),
      },
    ],
    { rest: [960, 560], haze: C.peachLow, thickness: 0.35 },
  );
};

const accusers = (ctx: CanvasRenderingContext2D, hand: Hands, s: Temple) => {
  ACCUSERS.forEach((a, i) => {
    const dropped = clamp((s.drop - DROP_STAGGER * i) / (1 - DROP_STAGGER * (ACCUSERS.length - 1)));
    const gone = clamp((s.leave - LEAVE_STAGGER * i) / (1 - LEAVE_STAGGER * (ACCUSERS.length - 1)));
    const x = lerp(a.from, a.to, gone);
    const y = ACCUSER_FLOOR - (gone > 0 && gone < 1 ? s.leaveBob : 0);
    const away = Math.sign(a.to - a.from);
    const charger = i === CHARGER;
    const held = charger ? STONE_HAND_FAR : STONE_HAND;
    held.reach = 1 - dropped;
    CHARGE_UP.reach = s.charge;
    ACCUSER_LOOK[0] = lerp(lerp(640 < a.from ? -3 : 3, -2 * away, s.drop), 3 * away, gone);
    ACCUSER_LOOK[1] = lerp(0.5, 2, dropped) * (1 - gone);
    ACCUSER.body = a.body;
    ACCUSER.build = a.build;
    ACCUSER.onHead = a.head;
    ACCUSER.browL = -1 * (1 - dropped);
    ACCUSER.browR = -1 * (1 - dropped);
    ACCUSER.browTilt = lerp(-0.3, 0.2, dropped);
    ACCUSER.near = charger ? CHARGE_UP : held;
    ACCUSER.far = charger ? held : undefined;
    const me = sub(hand('accuser'), i);
    at(ctx, { x, y, scale: a.s }, () => {
      if (charger && s.charge > 0) {
        const [cx, cy] = handOf(ACCUSER, 'near', me);
        at(ctx, { x: cx, y: cy - CHARGE_ABOVE, scale: CHARGE_S }, () => tablets(ctx, hand));
      }
      person(ctx, ACCUSER, me);
    });
    const [hx, hy] = handOf(ACCUSER, charger ? 'far' : 'near', me);
    const fall = clamp(3 * dropped);
    const heldX = a.from + hx * a.s;
    const heldY = ACCUSER_FLOOR + (hy - 9) * a.s;
    STONE_AT[0] = lerp(heldX, a.lands[0], fall);
    STONE_AT[1] = lerp(heldY, a.lands[1], fall * fall);
    if (fall >= 1) ground(ctx, a.lands[0], a.lands[1] + 10, 44);
    const stone = STONE_SHAPES[i];
    if (stone === undefined) return;
    at(ctx, { x: STONE_AT[0], y: STONE_AT[1], rot: 2 * fall }, () =>
      piece(ctx, stone, C.stone, sub(hand('stone'), i), {
        role: 'scenery',
        kind: 'cut',
        line: 3,
        shadow: 0.3,
      }),
    );
  });
};

const HER_LOOK: [number, number] = [0, 0];
const HER_WASH: [number, number, number] = [0, 0, 0];
const HER: Person = { garment: 'robe', look: HER_LOOK, stains: WOMAN_STAINS, washed: HER_WASH };
const HIS_LOOK: [number, number] = [0, 0];
const HIS_BUILD: [number, number] = [1, 1];
const WRITES: GestureAt = { to: [WRITING_HAND[0], WRITING_HAND[1]], reach: 0, grip: 'point' };
const SENDS: GestureAt = { to: [-66, -98], reach: 0, grip: 'open' };
const HIM: Person = { look: HIS_LOOK, build: HIS_BUILD, far: WRITES };

const court = (ctx: CanvasRenderingContext2D, hand: Hands, s: Temple) => {
  piece(ctx, rectShape(-800, COURT_FLOOR - 40, 3500, 700), COURT_GROUND, hand('floor'), {
    role: 'scenery',
    line: 0,
    torn: 4,
  });
  DUST_MARKS.forEach(([a, b, k], i) => {
    const drawn = clamp(s.writing * DUST_MARKS.length - i);
    if (drawn <= 0) return;
    stroke(
      ctx,
      [a, [lerp(a[0], b[0], drawn), lerp(a[1], b[1], drawn)]],
      { color: C.boardDeep, width: 4, jitter: 0.6, taper: 0.3, alpha: 0.7, boil: 'none' },
      sub(hand('dust'), k),
    );
  });
  accusers(ctx, hand, s);

  const stand = s.stand;
  const [jx, jy] = JESUS_AT;
  glow(ctx, jx, jy - 250 + 90 * (1 - stand), 340, C.glow, 0.6);
  HIS_LOOK[0] = s.look[0];
  HIS_LOOK[1] = s.look[1];
  HIS_BUILD[0] = lerp(STOOP[0], 1, stand);
  HIS_BUILD[1] = lerp(STOOP[1], 1, stand);
  WRITES.reach = s.writes;
  SENDS.reach = s.sends;
  HIM.far = s.sends > 0 ? SENDS : WRITES;
  HIM.tilt = -0.2 * (1 - stand);
  HIM.nod = 6 * (1 - stand);
  HIM.browTilt = 0.2;
  HIM.browL = 1.5 * stand;
  HIM.browR = 1.5 * stand;
  HIM.mouth = s.speak;
  HIM.smile = 0.25 * stand;
  at(ctx, { x: jx, y: jy, scale: JESUS_S }, () => christ(ctx, HIM, hand));

  const wm = s.woman;
  const white = wm.white;
  HER_LOOK[0] = wm.look[0];
  HER_LOOK[1] = wm.look[1];
  for (let i = 0; i < HER_WASH.length; i++) HER_WASH[i] = Math.max(wm.washed, white);
  HER.body = inWhite(HER_BODY, white);
  HER.shade = inWhite(HER_SHADE, white);
  HER.onHead = white > 0.5 ? HER_VEIL_WHITE : HER_VEIL;
  HER.nod = 5 * wm.bowed;
  HER.tilt = 0.08 * wm.bowed;
  HER.browTilt = 0.4 - 0.1 * wm.glad;
  HER.browL = 3 * (1 - wm.bowed);
  HER.browR = 3 * (1 - wm.bowed);
  HER.smile = 0.7 * wm.glad;
  const [wx, wy] = WOMAN_AT;
  at(ctx, { x: lerp(wx, WOMAN_OUT, wm.walk), y: wy - wm.bob, scale: WOMAN_S }, () => {
    if (wm.faith > 0) {
      glow(ctx, FACE_LIGHT[0], FACE_LIGHT[1], 150, C.glow, 0.95 * wm.faith);
      glow(ctx, FACE_LIGHT[0], FACE_LIGHT[1], 80, C.gold, 0.45 * wm.faith);
    }
    person(ctx, HER, hand('woman'));
    if (wm.heart > 0) litHeart(ctx, hand, wm.heart);
  });
};
const FACE_LIGHT: Pt = [30, -190];

const FRAME_W = 1920;
const FRAME_H = 1080;
const RECALL_K = 0.31;
const ICON_R = 150;
const RECALL_GAP = 30;
const RECALL_RIM = 10;
const RECALL_Y = ICON_R + RECALL_GAP + RECALL_RIM + (FRAME_H * RECALL_K) / 2;
const RECALL_PLATE = rounded(
  0,
  RECALL_Y,
  FRAME_W * RECALL_K + 2 * RECALL_RIM,
  FRAME_H * RECALL_K + 2 * RECALL_RIM,
  22,
);
const RECALL_WINDOW = rounded(0, RECALL_Y, FRAME_W * RECALL_K, FRAME_H * RECALL_K, 14);

export const RECALL_RISE = 150;

export const recall = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  shown: number,
  draw: () => void,
  lead = 0,
) => {
  if (shown <= 0) return;
  ctx.save();
  ctx.translate(0, ICON_R * ICON_LEAD * Math.max(0, lead));
  ctx.globalAlpha *= shown;
  piece(ctx, RECALL_PLATE, C.paper, hand('recall'), { role: 'scenery', kind: 'cut', line: 6 });
  ctx.beginPath();
  tracePath(ctx, RECALL_WINDOW);
  ctx.clip();
  ctx.translate(0, RECALL_Y);
  ctx.scale(RECALL_K, RECALL_K);
  ctx.translate(-FRAME_W / 2, -FRAME_H / 2);
  inset(ctx, draw);
  ctx.restore();
};

export const COURT_GONE = {
  charge: 0,
  drop: 1,
  leave: 1,
  leaveBob: 0,
  writing: 1,
  writes: 0,
  sends: 0,
  stand: 1,
  speak: 0,
} as const satisfies Partial<Temple>;
export const GONE_LOOK: Pt = [-4, 0.5];

export const COURT_FORGIVEN: Temple = {
  ...COURT_GONE,
  cam: COURT_WIDE,
  look: GONE_LOOK,
  woman: {
    walk: 0,
    bob: 0,
    washed: 1,
    look: [3, 0],
    bowed: 0,
    glad: 1,
    white: 1,
    faith: 0,
    heart: 0,
  },
};

const WENT_HOUSE = {
  cam: WENT,
  tiles: 1,
  lower: 1,
  ropes: 0,
  lookUp: 1,
  reach: 0,
  lookAfter: 1,
  specks: 1,
  rise: 1,
  roll: 1,
  steady: 1,
  walk: 0,
  bob: 0,
  glad: 1,
  wonder: 1,
  doubt: 1,
  holeLit: 0,
  robed: 0,
  heart: 0,
} satisfies House;

export const AT_THE_HOLE: Omit<House, 'cam'> = {
  tiles: 1,
  lower: 0.35,
  ropes: 1,
  lookUp: 1,
  reach: 0,
  lookAfter: 0,
  specks: 0,
  rise: 0,
  roll: 0,
  steady: 0,
  walk: 0,
  bob: 0,
  glad: 0,
  wonder: 0,
  doubt: 0,
  holeLit: 1,
  robed: 0,
  heart: 0,
};

export const went = (walk: number, bob: number): House => {
  WENT_HOUSE.walk = walk;
  WENT_HOUSE.bob = bob;
  return WENT_HOUSE;
};
