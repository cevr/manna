import {
  type Camera,
  type Frame,
  type Hand,
  type Posed,
  type Pt,
  at,
  camera,
  drawing,
  ellipseShape,
  ground,
  line,
  multiplane,
  pushInto,
  quad,
  rectShape,
  shotPath,
  stroke,
  sub,
  glow,
  knobCamera,
  rounded,
  sky,
  UNMOVED,
} from '@manna/film/canvas';
import { clamp, lerp } from '@manna/film/core';
import {
  C,
  type GestureAt,
  type HandPush,
  type Hands,
  type IconCount,
  type Three,
  type Person,
  handOf,
  icons,
  handCloseUp,
  person,
  pushZoom,
  pushedHand,
  piece,
} from '../../kit.ts';
import { FIGURE_STAINS, FIGURE_STAIN_SPOTS } from '../../court.ts';
import { apron } from '../../garden.ts';
import { herald } from '../../heaven.ts';
import { flight } from '../../spoken.ts';
import { crossShape, tabletShape, tablets } from '../../law.ts';

const STAGE_Y = 700;
const WINDOWS = [230, 590, 1330, 1690] as const;

interface Seat {
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly build: readonly [number, number];
  readonly side: -1 | 1;
  readonly k: number;
  readonly lift: number;
}
const BACK_LIFT = -196;
const FRONT_LIFT = -150;
const CROWD: ReadonlyArray<Seat> = [
  { x: 170, y: 975, s: 1.5, build: [1.1, 0.95], side: -1, k: 0, lift: BACK_LIFT },
  { x: 430, y: 975, s: 1.5, build: [0.9, 1.1], side: -1, k: 2, lift: BACK_LIFT },
  { x: 690, y: 975, s: 1.5, build: [1, 1], side: -1, k: 4, lift: BACK_LIFT },
  { x: 1230, y: 975, s: 1.5, build: [0.95, 1.05], side: 1, k: 4, lift: BACK_LIFT },
  { x: 1490, y: 975, s: 1.5, build: [1.15, 0.9], side: 1, k: 2, lift: BACK_LIFT },
  { x: 1750, y: 975, s: 1.5, build: [0.9, 1.12], side: 1, k: 0, lift: BACK_LIFT },
  { x: 290, y: 1170, s: 1.95, build: [1, 1.05], side: -1, k: 1, lift: FRONT_LIFT },
  { x: 640, y: 1170, s: 1.95, build: [1.12, 0.92], side: -1, k: 3, lift: FRONT_LIFT },
  { x: 1280, y: 1170, s: 1.95, build: [0.92, 1], side: 1, k: 3, lift: FRONT_LIFT },
  { x: 1630, y: 1170, s: 1.95, build: [1.05, 1.08], side: 1, k: 1, lift: FRONT_LIFT },
];
const HALF = 5;

const timeline = {
  lookUp: { mark: 'how', offset: 0.3, dur: 0.8, ease: 'inOutSine' },
  window: { mark: 'year', offset: -0.3, dur: 1.3, ease: 'inCubic' },
  push: { mark: 'two', dur: 1.2, ease: 'inOutSine' },
  lawUp: { mark: 'two', offset: 0.2, dur: 1.2, ease: 'outCubic', stagger: 0.4 },
  missing: { mark: 'rep', dur: 0.6, ease: 'inOutSine' },
  closer: { mark: 'rep', offset: 0.2, until: 'ew', ease: 'inOutSine' },
  across: { mark: 'ew', dur: 1.2, ease: 'inOutSine' },
  crossUp: { mark: 'ew', offset: 0.2, dur: 1.2, ease: 'outCubic', stagger: 0.4 },
  setDown: { mark: 'precious', dur: 0.8, ease: 'inOutSine' },
  letGo: { after: 'setDown', dur: 0.25 },
  handBack: { after: 'letGo', dur: 0.7, ease: 'inOutSine' },
  wide: { mark: 'what', until: 'answer', ease: 'inOutSine' },
  curious: { mark: 'what', dur: 0.4 },
  light: { mark: 'answer', offset: -0.2, dur: 1.4 },
  turn: { mark: 'answer', dur: 0.6 },
  toPulpit: { mark: 'answer', offset: 0.2, dur: 1.6, ease: 'inOutSine' },
  roof: { mark: 'angel', dur: 1.1, ease: 'inCubic' },
  fly: { mark: 'angel', offset: 0.4, dur: 1.5, ease: 'outCubic' },
  grasp: { with: 'fly', dur: 0 },
  flyOut: { mark: 'hand', offset: -0.2, dur: 0.9, ease: 'inCubic' },
  bannerOut: { with: 'flyOut', dur: 0.567, ease: 'inCubic' },
  meet: { mark: 'hand', offset: 0.2, dur: 0.9, ease: 'outCubic' },
  golden: { after: 'meet', dur: 0.6 },
  gilded: { with: 'golden', offset: 0.3, dur: 0 },
  through: { mark: 'three', offset: -0.1, dur: 0.6, ease: 'inCubic' },
  faith: { mark: 'faith', offset: -0.15, dur: 0.45, ease: 'outBack' },
  forgiveness: { mark: 'forgiveness', offset: -0.15, dur: 0.45, ease: 'outBack' },
  power: { mark: 'power', offset: -0.15, dur: 0.45, ease: 'outBack' },
  figureIn: { after: 'through', dur: 0.5, ease: 'outBack' },
  hear: { mark: 'three', offset: 0.9, dur: 0.5 },
  given: { mark: 'makes', offset: -0.6, dur: 0.8, ease: 'inOutSine' },
  warm: { after: 'given', until: 'gifts', untilOffset: -0.3 },
  offer: { with: 'handIn', dur: 0.6, ends: true },
  palmUp: { mark: 'gifts', offset: -0.7, dur: 0.3, ease: 'inOutSine' },
  handIn: { mark: 'gifts', offset: -0.4, dur: 0.7, ease: 'inOutCubic' },
  take: { mark: 'gifts', dur: 0.7, ease: 'inOutSine' },
  days: { mark: 'daily', until: { at: 'speechEnd' }, ease: 'linear' },
} as const;
const knobs = {
  outside: [960, 560],
  outsideZoom: 1,
  rest: [960, 560],
  restZoom: 1.1,
  law: [480, 830],
  lawZoom: 1.45,
  puzzled: [349, 775],
  puzzledZoom: 2.3,
  gospel: [1440, 830],
  gospelZoom: 1.45,
  pulpit: [960, 560],
  pulpitZoom: 1.15,
  roofRise: 60,
  roofZoom: 1,
  figureAt: [960, 1010],
  angelAt: [1620, 330],
  emblem: [960, 190],
  emblemZoom: 7,
  palm: [960, 720],
  gifts: [960, 730],
} as const;

export const GIFTS_AT = { palm: knobs.palm, gifts: knobs.gifts } as const;

type MessageFrame = Frame<keyof typeof timeline & string, typeof knobs>;

const hallWindow = (ctx: CanvasRenderingContext2D, hand: Hand, x: number, y: number) => {
  at(ctx, { x, y }, () => {
    piece(ctx, tabletShape(130, 300), C.peachTop, hand, { role: 'scenery', kind: 'cut', line: 5 });
    glow(ctx, 0, 40, 160, C.glow, 0.5);
    stroke(
      ctx,
      line([0, -85], [0, 150]),
      { color: C.boardDeep, width: 5, jitter: 0.3, boil: 'none' },
      sub(hand, 1),
    );
    stroke(
      ctx,
      line([-65, 20], [65, 20]),
      { color: C.boardDeep, width: 5, jitter: 0.3, boil: 'none' },
      sub(hand, 2),
    );
  });
};

const HALL_FRONT = { x: 600, y: 330, w: 900, h: 600 } as const;
const HALL_GROUND = 930;
const LIT_WINDOW: Pt = [1180, 560];
const LIT_WINDOW_SHAPE = tabletShape(150, 330);
const DARK_WINDOWS = [720, 900] as const;
const THROUGH_WINDOW: Camera = { x: LIT_WINDOW[0], y: LIT_WINDOW[1] - 90, zoom: 16 };
const LOOKER: Pt = [330, HALL_GROUND + 20];
const LOOKER_S = 1.7;
const LOOKER_LOOK: [number, number] = [0, 0];
const LOOKER_P: Person = { look: LOOKER_LOOK };

const outside = (f: MessageFrame, into: number, inside: () => void) => {
  const { ctx, w, h } = f;
  sky(ctx, w, h, [
    [0, C.sunsetTop],
    [0.7, C.peachTop],
    [1, C.peachLow],
  ]);
  const cam = shotPath(knobCamera(f.knob('outside'), f.knob('outsideZoom')), [
    [into, THROUGH_WINDOW, pushInto],
  ]);
  const up = f.at('lookUp');
  LOOKER_LOOK[0] = lerp(2, 4, up);
  LOOKER_LOOK[1] = lerp(1, -4, up);
  camera(
    ctx,
    cam,
    w,
    h,
    () => {
      piece(ctx, rectShape(-800, HALL_GROUND, 3500, 600), C.boardShade, f.hand('street'), {
        role: 'scenery',
        line: 0,
        torn: 4,
      });
      const { x, y, w: fw, h: fh } = HALL_FRONT;
      piece(ctx, rectShape(x, y, fw, fh), C.board, f.hand('front'), {
        role: 'scenery',
        kind: 'cut',
        line: 0,
        torn: 3,
        shadow: 0.4,
      });
      piece(
        ctx,
        [
          [x - 40, y + 4],
          [x + fw / 2, y - 190],
          [x + fw + 40, y + 4],
        ],
        C.boardDeep,
        f.hand('gable'),
        { role: 'scenery', kind: 'cut', line: 0, torn: 2 },
      );
      DARK_WINDOWS.forEach((wx, i) =>
        at(ctx, { x: wx, y: LIT_WINDOW[1] }, () =>
          piece(ctx, LIT_WINDOW_SHAPE, C.boardDeep, sub(f.hand('darkWindow'), i), {
            role: 'scenery',
            kind: 'cut',
            line: 4,
          }),
        ),
      );
      piece(ctx, rounded(1380, HALL_GROUND - 130, 120, 260, 10), C.boardDeep, f.hand('hallDoor'), {
        role: 'scenery',
        kind: 'cut',
        line: 4,
      });
      glow(ctx, LIT_WINDOW[0], LIT_WINDOW[1], 320, C.glow, 0.7);
      at(ctx, { x: LOOKER[0], y: LOOKER[1], scale: LOOKER_S }, () => {
        person(
          ctx,
          { ...LOOKER_P, tilt: -0.14 * up, browL: 2.5 * up, browR: 3 * up, browTilt: 0.3 * up },
          f.hand('looker'),
        );
        apron(ctx, f.hand('lookerApron'), 4, 1, 0);
      });
    },
    0,
  );
  ctx.save();
  const zoom = cam.zoom ?? 1;
  ctx.beginPath();
  let first = true;
  for (const [px, py] of LIT_WINDOW_SHAPE) {
    const sx = w / 2 + (LIT_WINDOW[0] + px - cam.x) * zoom;
    const sy = h / 2 + (LIT_WINDOW[1] + py - cam.y) * zoom;
    if (first) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    first = false;
  }
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = C.peachTop;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha *= clamp(2 * into);
  inside();
  ctx.restore();
};

export const message = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const through = f.at('through');

    if (through < 1) {
      sky(ctx, w, h, [
        [0, C.tealTop],
        [0.6, C.tealMid],
        [1, C.tealLow],
      ]);
      const REST = knobCamera(f.knob('rest'), f.knob('restZoom'));
      const cam = shotPath(REST, [
        [f.at('push'), knobCamera(f.knob('law'), f.knob('lawZoom'))],
        [f.at('closer'), knobCamera(f.knob('puzzled'), f.knob('puzzledZoom'))],
        [f.at('across'), knobCamera(f.knob('gospel'), f.knob('gospelZoom'))],
        [f.at('wide'), REST],
        [f.at('toPulpit'), knobCamera(f.knob('pulpit'), f.knob('pulpitZoom'))],
      ]);
      const roof = f.at('roof');
      const up: Camera = {
        ...cam,
        y: cam.y - f.knob('roofRise') * roof,
        zoom: lerp(cam.zoom ?? 1, f.knob('roofZoom'), roof),
      };
      const into = f.at('window');
      if (into < 1) outside(f, into, () => hall(f, up, roof));
      else hall(f, up, roof);

      const [ax, ay] = f.knob('angelAt');
      const fly = f.at('fly');
      const out = f.at('flyOut');
      if (fly > 0 && out < 1) {
        const x = lerp(-700, ax, fly) + 1500 * out;
        const y = ay + Math.sin(t * 2.2) * 8 - 120 * out;
        ctx.save();
        ctx.globalAlpha *= 1 - f.at('bannerOut');
        at(ctx, { x, y }, () =>
          herald(
            ctx,
            f.hand,
            t,
            fly < 1 ? 0 : Math.min(1, f.spoken('banner', 'hand') * 1.25),
            f.at('grasp'),
          ),
        );
        ctx.restore();
      }

      const meet = f.at('meet');
      if (meet > 0) {
        const [ex, ey] = f.knob('emblem');
        const cam = shotPath(UNMOVED, [
          [through, knobCamera(f.knob('emblem'), f.knob('emblemZoom')), pushInto],
        ]);
        camera(
          ctx,
          cam,
          w,
          h,
          () => at(ctx, { x: ex, y: ey, scale: 1.3 }, () => emblem(f, meet, f.at('golden'))),
          0,
        );
      }
    }

    if (through > 0) {
      ctx.save();
      ctx.globalAlpha *= through;
      page(f);
      ctx.restore();
    }
  },
});

const FIGURE_S = 2.6;
const HAND_S = 1.75;
export const GIFTS_S = 0.5;
const DAWN_X = 160;
const DUSK_X = 1760;
const HORIZON_Y = 1300;
const NOON_Y = 130;
const DAYS = 3;
const DAYS_EASE = 0.5;
const MAKES_FROM: Pt = [1420, -120];
const STAIN_REACH = FIGURE_STAIN_SPOTS.map(([x, y]) => Math.hypot(x, y + 80) / 40);
const WASH: number[] = FIGURE_STAIN_SPOTS.map(() => 0);
const LIT: [number, number, number] = [0, 0, 0];
const POPS: [number, number, number] = [0, 0, 0];

const page = (f: MessageFrame) => {
  const { ctx, w, h } = f;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);

  const days = f.at('days');
  const k = (days * DAYS) % 1;
  const noon = Math.sin(Math.PI * k);
  const settle = clamp(Math.min(days, 1 - days) * (DAYS / DAYS_EASE));
  const dusk = (1 - noon) * settle;
  if (days > 0 && days < 1) sun(ctx, f.hand('sun'), k, noon, dusk, w, h);

  const handIn = f.at('handIn');
  if (handIn < 1) pageFigure(f, handIn);

  if (handIn > 0) {
    const close = clamp(1 - 3 * noon) * settle;
    const [fx, fy] = f.knob('figureAt');
    const [hx, hy] = OFFERED.to;
    const push: HandPush = {
      from: [fx + hx * FIGURE_S, fy + hy * FIGURE_S],
      figureScale: FIGURE_S,
      to: f.knob('palm'),
      scale: HAND_S,
    };
    pushedHand(
      ctx,
      f.hand,
      push,
      handIn,
      (1 - TAKE_CURL * f.at('take')) * (1 - 0.3 * close),
      OFFERING_SIDE,
    );
    POPS[0] = f.at('faith');
    POPS[1] = f.at('forgiveness');
    POPS[2] = f.at('power');
    for (let i = 0; i < 3; i++) LIT[i] = (POPS[i] ?? 0) * (1 - dusk);
    giftRow(ctx, f.hand, f.knob('gifts'), LIT, POPS);
  }
};

const TAKE_CURL = 0.15;
export const TAKEN = 1 - TAKE_CURL;

const OFFERING_SIDE = 'near';

export const giftHand = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  [px, py]: Pt,
  shown: number,
  open: number,
  rise = shown,
) => {
  ctx.save();
  ctx.globalAlpha *= shown;
  at(ctx, { x: px, y: lerp(py + 400, py, rise), scale: HAND_S }, () =>
    handCloseUp(ctx, hand, open, OFFERING_SIDE),
  );
  ctx.restore();
};

export const giftRow = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  [gx, gy]: Pt,
  lit: Three,
  shown?: Three,
  scale = GIFTS_S,
  count?: IconCount,
) => at(ctx, { x: gx, y: gy, scale }, () => icons(ctx, hand, lit, shown, count));

const sun = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  k: number,
  noon: number,
  dusk: number,
  w: number,
  h: number,
) => {
  if (dusk > 0) {
    ctx.save();
    ctx.globalAlpha *= 0.35 * dusk;
    ctx.fillStyle = C.peachLow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const x = lerp(DAWN_X, DUSK_X, k);
  const y = lerp(HORIZON_Y, NOON_Y, noon);
  glow(ctx, x, y, 160, C.glow, 0.8);
  piece(ctx, ellipseShape(x, y, 44, 44), C.gold, hand, { role: 'scenery', line: 0, shadow: 0.2 });
};

const OFFERED: GestureAt = { to: [46, -140], reach: 0, grip: 'palm', turn: 0 };
const INTO_HAND = pushZoom(FIGURE_S, HAND_S);

const pageFigure = (f: MessageFrame, handIn: number) => {
  const { ctx } = f;
  const shown = f.at('figureIn');
  if (shown <= 0.01) return;
  const warm = f.at('warm');
  const hear = f.at('hear');
  for (let i = 0; i < WASH.length; i++) WASH[i] = clamp(2.2 * warm - (STAIN_REACH[i] ?? 0));
  const given = f.at('given');
  const [fx, fy] = f.knob('figureAt');
  const [px, py] = f.knob('palm');
  OFFERED.reach = f.at('offer');
  OFFERED.turn = f.at('palmUp');
  const scale = FIGURE_S * shown * INTO_HAND ** handIn;
  const [hx, hy] = OFFERED.to;
  const handX = lerp(fx + hx * FIGURE_S * shown, px, handIn);
  const handY = lerp(fy + hy * FIGURE_S * shown, py, handIn);
  ctx.save();
  ctx.globalAlpha *= 1 - clamp(1.6 * handIn);
  at(ctx, { x: handX - hx * scale, y: handY - hy * scale, scale }, () => {
    person(
      ctx,
      {
        look: [0, lerp(-4 * hear, 3, warm)],
        tilt: -0.08 * hear * (1 - warm),
        nod: 4 * warm,
        browL: 3 * hear + 2 * warm,
        browR: 4 * hear + 2 * warm,
        browTilt: 0.35 * hear * (1 - warm),
        smile: 0.8 * warm,
        stains: FIGURE_STAINS,
        washed: WASH,
        near: OFFERED,
      },
      f.hand('pageFigure'),
    );
    if (warm > 0) {
      glow(ctx, 0, -80, lerp(20, 70, warm), C.glow, 0.9 * warm);
      glow(ctx, 0, -80, 26, C.gold, 0.7 * warm);
    }
  });
  ctx.restore();
  if (given > 0 && given < 1)
    flight(
      ctx,
      quad(MAKES_FROM, [MAKES_FROM[0], fy - 80 * FIGURE_S], [fx, fy - 80 * FIGURE_S], 40),
      given,
      f.hand('given'),
      0.4,
    );
};

const hall = (f: MessageFrame, cam: Camera, roof: number) => {
  const { ctx, w, h } = f;
  const lift = -1150 * roof;
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: 1.3,
        draw: () => {
          if (roof >= 1) return;
          at(ctx, { x: 0, y: lift }, () => {
            piece(ctx, rectShape(-500, -300, 2920, 1080), C.boardLight, f.hand('wall'), {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 3,
            });
            glow(ctx, 960, 300, 900, C.peachLow, 0.5);
            WINDOWS.forEach((x, i) => hallWindow(ctx, sub(f.hand('window'), i), x, 330));
            piece(ctx, rectShape(-500, -320, 2920, 70), C.boardShade, f.hand('beam'), {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 3,
            });
          });
        },
      },
      {
        z: 1,
        draw: () => {
          const light = f.at('light');
          piece(ctx, rectShape(-500, 770, 2920, 500), C.board, f.hand('floor'), {
            role: 'scenery',
            line: 0,
            torn: 3,
          });
          glow(ctx, 960, 520, lerp(80, 560, light), C.glow, light);
          glow(ctx, 960, 540, lerp(40, 260, light), C.gold, 0.55 * light);
          piece(ctx, rectShape(500, STAGE_Y, 920, 90), C.boardShade, f.hand('stage'), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
            torn: 2,
          });
          piece(ctx, rounded(960, STAGE_Y - 100, 150, 200, 12), C.board, f.hand('pulpit'), {
            role: 'scenery',
            kind: 'cut',
            line: 3.5,
          });
          piece(ctx, rounded(960, STAGE_Y - 200, 190, 22, 6), C.boardDeep, f.hand('pulpitTop'), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
          });
          openBible(f);
        },
      },
      {
        z: 0.85,
        lift: 1.3,
        draw: () => CROWD.forEach((seat, i) => member(f, seat, i)),
      },
    ],
    { rest: [960, 540], haze: C.peachLow, thickness: 0.4 },
  );
};

const BIBLE_PAGE: ReadonlyArray<Pt> = [
  [0, 6],
  [0, -8],
  [-22, -15],
  [-50, -13],
  [-60, -6],
  [-60, 6],
];
const BIBLE_PAGES = [BIBLE_PAGE, BIBLE_PAGE.map(([x, y]): Pt => [-x, y])] as const;
const BIBLE_AT: Pt = [960, STAGE_Y - 218];
const BIBLE_S = 1.2;

const openBible = (f: MessageFrame) => {
  const { ctx } = f;
  const lit = f.at('curious');
  const [bx, by] = BIBLE_AT;
  at(ctx, { x: bx, y: by, scale: BIBLE_S }, () => {
    if (lit > 0) {
      glow(ctx, 0, -10, 150, C.glow, 0.8 * lit);
      glow(ctx, 0, -6, 70, C.gold, 0.45 * lit);
    }
    piece(ctx, rounded(0, 4, 128, 10, 3), C.boardDeep, f.hand('bibleCover'), {
      role: 'scenery',
      kind: 'cut',
      line: 2.5,
    });
    BIBLE_PAGES.forEach((pts, i) =>
      piece(ctx, pts, C.cream, sub(f.hand('biblePage'), i), {
        role: 'scenery',
        kind: 'cut',
        line: 2.5,
        shadow: 0.2,
      }),
    );
    for (const side of [-1, 1] as const)
      for (let r = 0; r < 2; r++)
        piece(
          ctx,
          rounded(side * 30, -8 + 6 * r, 34 - 8 * r, 2.5, 1),
          C.inkSoft,
          sub(f.hand('bibleLine'), 2 * r + (side + 1) / 2),
          { role: 'scenery', kind: 'ink', line: 0, shadow: 0 },
        );
  });
};

const TABLETS_UP: GestureAt = { to: [72, -196], reach: 0, grip: 'hold' };
const CROSS_UP: GestureAt = { to: [70, -196], reach: 0, grip: 'hold' };
const TABLETS_HELD: Posed<GestureAt> = {
  to: [-80, -100],
  reach: 0,
  grip: 'open',
  was: 'hold',
  change: 0,
};
const TABLETS_OUT: Pt = [-80, -100];
const TABLETS_FLOOR: Pt = [-62, -5];
const TABLETS_S = 0.3;
const TABLETS_ABOVE = 22;
const CROSS_S = 0.36;
const CROSS_ABOVE = 26;
const LOOK: [number, number] = [0, 0];

const member = (f: MessageFrame, seat: Seat, i: number) => {
  const { ctx, t } = f;
  const law = seat.side < 0;
  const turn = f.at('turn');
  const front = Math.max(f.at('curious'), turn);
  const curious = f.at('curious') * (1 - turn);
  const up = f.stagger(law ? 'lawUp' : 'crossUp', seat.k, HALF);
  const wander = law ? f.at('missing') * (1 - front) : 0;
  const atHeld = up * (1 - wander) * (1 - front);
  const toward = ((960 - seat.x) / 700) * 5;
  const glance = 4 * Math.sin(t * 1.7 + i * 1.3);
  LOOK[0] = lerp(lerp(lerp(toward, glance, wander), 4, atHeld), (960 - seat.x) / 180, front);
  LOOK[1] = lerp(lerp(lerp(-3, 1, wander), -5, atHeld), -4, front);
  const held = law ? TABLETS_UP : CROSS_UP;
  held.reach = up;
  held.to[1] = seat.lift;
  const down = law ? 0 : f.at('setDown');
  const letGo = law ? 0 : f.at('letGo');
  if (!law) {
    TABLETS_HELD.to[0] = lerp(TABLETS_OUT[0], TABLETS_FLOOR[0], down);
    TABLETS_HELD.to[1] = lerp(TABLETS_OUT[1], TABLETS_FLOOR[1], down);
    TABLETS_HELD.reach = up * (1 - f.at('handBack'));
    TABLETS_HELD.change = letGo;
  }
  const who: Person = {
    look: LOOK,
    build: seat.build,
    tilt: 0.12 * wander * Math.sin(t * 1.1 + i) + turn * ((960 - seat.x) / 4000),
    browL: 3 * wander + 3 * turn + 2 * curious,
    browR: 2 * wander + 4 * turn + 3 * curious,
    browTilt: 0.45 * wander + 0.25 * atHeld + 0.3 * turn + 0.3 * curious,
    mouth: 0.6 * turn * (i % 3 === 0 ? 1 : 0),
    near: held,
    far: law ? undefined : TABLETS_HELD,
  };
  const me = sub(f.hand('crowd'), i);
  const keyed = (k: string) => sub(f.hand(k), i);
  at(ctx, { x: seat.x, y: seat.y, scale: seat.s }, () => {
    if (up > 0) {
      const [hx, hy] = handOf(who, 'near', me);
      if (law)
        at(ctx, { x: hx, y: hy - TABLETS_ABOVE * up, scale: TABLETS_S * up }, () =>
          tablets(ctx, keyed),
        );
      else
        at(ctx, { x: hx, y: hy - CROSS_ABOVE * up, scale: up }, () =>
          piece(ctx, crossShape(CROSS_S), C.cutLight, sub(f.hand('heldCross'), i), {
            role: 'scenery',
            kind: 'cut',
            line: 3,
            shadow: 0.3,
          }),
        );
    }
    if (!law && up > 0) {
      const [tx, ty] = letGo > 0 ? TABLETS_FLOOR : handOf(who, 'far', me);
      if (letGo > 0) ground(ctx, tx, 2, 80);
      at(ctx, { x: tx, y: ty - TABLETS_ABOVE * up, scale: TABLETS_S * up }, () =>
        tablets(ctx, keyed),
      );
    }
    person(ctx, who, me);
  });
};

const emblem = (f: MessageFrame, meet: number, golden: number) => {
  const { ctx } = f;
  glow(ctx, 0, 0, 420, C.glow, golden);
  at(ctx, { x: lerp(-1300, -40, meet), y: 10, rot: lerp(-0.4, 0, meet) }, () =>
    tablets(ctx, f.hand, 10 * golden),
  );
  at(ctx, { x: lerp(1300, 70, meet), y: 0, rot: lerp(0.4, 0, meet) }, () =>
    piece(ctx, crossShape(1.35), f.at('gilded') > 0 ? C.gold : C.boardLight, f.hand('cross'), {
      role: 'scenery',
      kind: 'cut',
      line: 4.5,
      shadow: 0.5,
    }),
  );
  if (golden > 0) glow(ctx, 0, 0, 260, C.gold, 0.25 * golden);
};
