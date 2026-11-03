import { at, unprobed } from '@manna/film/canvas';
import { type Pt, boilTime } from '@manna/film/style';
import {
  BENCH_TOP,
  LAID_SHEETS,
  PLACE,
  STACK_SHEETS,
  bench,
  benchLit,
  benchShadow,
  block,
  blottedAt,
  chair,
  contact,
  dock,
  dockShadow,
  gavel,
  sheet,
  table,
  tableShadow,
} from './court-set.ts';
import { C } from './kit.ts';
import { SEAL_GOLD, type SeedPose, noSeed, seed as seedProp } from './props.ts';
import { CHRIST_KNOBS } from './rigs/christ-rig.ts';
import { JUDGE_KNOBS } from './rigs/judge-rig.ts';
import { LEAD, LEAD_ARMS, LEAD_HAND_SIZE, LEAD_KNOBS, reachHands } from './rigs/lead-rig.ts';
import { HAND_OUT_STEPS } from './rigs/hand-rig.ts';
import { PROSECUTOR_KNOBS } from './rigs/prosecutor-rig.ts';
import {
  christFrontProp,
  christHandOutProps,
  christHandProp,
  christProp,
  judgeProp,
  leadHandProp,
  leadProp,
  prosecutorProp,
  skinHandProp,
} from './rigs/rigs.ts';

export const COURT_RIGS = {
  lead: leadProp,
  leadHand: leadHandProp,
  judge: judgeProp,
  prosecutor: prosecutorProp,
  skinHand: skinHandProp,
} as const;

export const LANDING_RIGS = {
  ...COURT_RIGS,
  christ: christProp,
  christFront: christFrontProp,
  christHand: christHandProp,
  christHandOut1: christHandOutProps[0],
  christHandOut2: christHandOutProps[1],
  christHandOut3: christHandOutProps[2],
  christHandOut4: christHandOutProps[3],
} as const;

type HandRig = 'leadHand' | 'skinHand' | 'christHand' | `christHandOut${1 | 2 | 3 | 4}`;

export interface CourtFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly t: number;
  readonly boil: number;
  rive(name: 'lead', pose: { timelines: Timelines<'breath' | 'boil'>; numbers: LeadNumbers }): void;
  rive(
    name: 'judge',
    pose: { timelines: Timelines<'breath' | 'boil'>; numbers: JudgeNumbers },
  ): void;
  rive(
    name: 'prosecutor',
    pose: { timelines: Timelines<'breath' | 'boil'>; numbers: ProsecutorNumbers },
  ): void;
  rive(
    name: 'christ' | 'christFront',
    pose: { timelines: Timelines<'breath' | 'boil'>; numbers: ChristNumbers },
  ): void;
  rive(name: HandRig, pose: { timelines: Timelines<'boil'>; size: number }): void;
}
type Timelines<T extends string> = ReadonlyArray<readonly [T, number]>;
type LeadNumbers = Record<keyof typeof LEAD_KNOBS, number>;
type JudgeNumbers = Record<keyof typeof JUDGE_KNOBS, number>;
type ProsecutorNumbers = Record<keyof typeof PROSECUTOR_KNOBS, number>;
type ChristNumbers = Record<keyof typeof CHRIST_KNOBS, number>;

export interface SealPose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  shown: number;
  glint: number;
}

export interface CourtPose {
  readonly lead: {
    numbers: LeadNumbers;
    hands: [Pt, Pt];
    seal: SealPose;
    dx: number;
    back: number;
    seed: SeedPose;
  };
  readonly prosecutor: {
    numbers: ProsecutorNumbers;
    hands: [Pt, Pt];
    carried: CarriedSheet;
    shown: number;
  };
  readonly judge: {
    numbers: JudgeNumbers;
    hands: [Pt, Pt];
    grip: [number, number];
    rot: number;
    glow: number;
  };
  readonly christ: {
    numbers: ChristNumbers;
    hands: [Pt, Pt];
    shown: number;
    front: number;
    reach: number;
    seed: SeedPose;
  };
  stack: number;
  laid: number;
  blot: number;
}

export interface CarriedSheet {
  x: number;
  y: number;
  rot: number;
  shown: number;
}

export const HANDS = {
  lead: [
    [PLACE.lead[0] + LEAD_ARMS.left.rest[0], PLACE.lead[1] + LEAD_ARMS.left.rest[1]],
    [PLACE.lead[0] + LEAD_ARMS.right.rest[0], PLACE.lead[1] + LEAD_ARMS.right.rest[1]],
  ],
  prosecutor: [
    [632, 548],
    [866, 552],
  ],
  judge: [
    [1192, BENCH_TOP - 6],
    [1360, BENCH_TOP - 6],
  ],
  christ: [
    [390, 576],
    [546, 573],
  ],
} as const satisfies Record<string, readonly [Pt, Pt]>;

export const GAVEL_REST = { grip: [1132, 364], rot: 0.57 } as const satisfies {
  readonly grip: Pt;
  readonly rot: number;
};

export const restPose = (): CourtPose => ({
  lead: {
    numbers: { ...LEAD_KNOBS },
    hands: [[...HANDS.lead[0]], [...HANDS.lead[1]]],
    seal: { x: 0, y: 0, rot: 0, scale: 1, shown: 0, glint: 0 },
    dx: 0,
    back: 0,
    seed: noSeed(),
  },
  prosecutor: {
    numbers: { ...PROSECUTOR_KNOBS },
    hands: [[...HANDS.prosecutor[0]], [...HANDS.prosecutor[1]]],
    carried: { x: 0, y: 0, rot: 0, shown: 0 },
    shown: 1,
  },
  judge: {
    numbers: { ...JUDGE_KNOBS },
    hands: [[...HANDS.judge[0]], [...HANDS.judge[1]]],
    grip: [GAVEL_REST.grip[0], GAVEL_REST.grip[1]],
    rot: GAVEL_REST.rot,
    glow: 0,
  },
  christ: {
    numbers: { ...CHRIST_KNOBS },
    hands: [[...HANDS.christ[0]], [...HANDS.christ[1]]],
    shown: 0,
    front: 0,
    reach: 1,
    seed: noSeed(),
  },
  stack: 6,
  laid: 1,
  blot: 0,
});

export const stainAt = (lean: number): Pt => {
  const [fx, fy] = PLACE.lead;
  const { x, y } = LEAD.stain;
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  return [fx + x * c - y * s, fy + x * s + y * c];
};

const SEAL = { wax: 23, ring: 16, letter: 22, ribbon: 0.85 } as const;

export const seal = (ctx: CanvasRenderingContext2D, s: SealPose) => {
  if (s.shown <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, s.shown);
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.scale(s.scale, s.scale);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.outline;
  ctx.save();
  ctx.scale(SEAL.ribbon, SEAL.ribbon);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 4, 10);
    ctx.lineTo(side * 18, 48);
    ctx.lineTo(side * 10, 42);
    ctx.lineTo(side * 4, 50);
    ctx.lineTo(side * -6, 14);
    ctx.closePath();
    ctx.fillStyle = SEAL_GOLD.ribbon;
    ctx.fill();
    ctx.lineWidth = 2.5 / SEAL.ribbon;
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
  const wax = () => {
    ctx.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const r = SEAL.wax + 1.4 * Math.sin(a * 6 + 0.7);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(-17, -20, 17, 20);
  g.addColorStop(0, SEAL_GOLD.wax);
  g.addColorStop(0.62, SEAL_GOLD.wax);
  g.addColorStop(0.63, SEAL_GOLD.shade);
  g.addColorStop(1, SEAL_GOLD.shade);
  ctx.fillStyle = g;
  wax();
  ctx.fill();
  if (s.glint > 0 && s.glint < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, SEAL.wax - 3, 0, 2 * Math.PI);
    ctx.clip();
    const x = -45 + 90 * s.glint;
    const shine = ctx.createLinearGradient(x - 14, -5, x + 14, 5);
    shine.addColorStop(0, '#fff6d000');
    shine.addColorStop(0.5, '#fff6d080');
    shine.addColorStop(1, '#fff6d000');
    ctx.fillStyle = shine;
    ctx.fillRect(-SEAL.wax, -SEAL.wax, 2 * SEAL.wax, 2 * SEAL.wax);
    ctx.restore();
  }
  ctx.lineWidth = 3;
  wax();
  unprobed(ctx, () => ctx.stroke());
  ctx.beginPath();
  ctx.arc(0, 0, SEAL.ring, 0, 2 * Math.PI);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = SEAL_GOLD.rim;
  unprobed(ctx, () => ctx.stroke());
  ctx.fillStyle = SEAL_GOLD.letter;
  ctx.font = `700 ${SEAL.letter}px Fraunces`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  unprobed(ctx, () => ctx.fillText('R', 0, 1.3));
  ctx.restore();
};

const handAt = (f: CourtFrame, rig: HandRig, p: Pt, size: number) =>
  at(f.ctx, { x: p[0], y: p[1] }, () =>
    f.rive(rig, { timelines: [['boil', boilTime(f.boil)]], size }),
  );

export const living = (f: CourtFrame, period: number, offset: number) =>
  [
    ['breath', (f.t + offset) % period],
    ['boil', boilTime(f.boil)],
  ] as const;

const HAND = { judge: 1.23, prosecutor: 1.14, christ: 1.08 } as const;

const CHRIST_HANDS = [
  [1, 'christHand'],
  [HAND_OUT_STEPS[0], 'christHandOut1'],
  [HAND_OUT_STEPS[1], 'christHandOut2'],
  [HAND_OUT_STEPS[2], 'christHandOut3'],
  [HAND_OUT_STEPS[3], 'christHandOut4'],
] as const;

const heldOut = (f: CourtFrame, p: Pt, reach: number) => {
  const off = (size: number) => Math.abs(Math.log(reach / size));
  const [size, rig] = CHRIST_HANDS.reduce((a, b) => (off(b[0]) < off(a[0]) ? b : a));
  handAt(f, rig, p, (HAND.christ * reach) / size);
};

const judgeGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  chair(ctx);
  at(ctx, { x: PLACE.judge[0], y: PLACE.judge[1] }, () =>
    f.rive('judge', { timelines: living(f, 5, 1.3), numbers: p.judge.numbers }),
  );
  bench(ctx);
  benchLit(ctx, p.judge.glow);
  block(ctx);
  gavel(ctx, p.judge.grip, p.judge.rot);
  for (const h of p.judge.hands) handAt(f, 'skinHand', h, HAND.judge);
};

const prosecutorGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  const here = p.prosecutor.shown > 0;
  if (here) {
    contact(ctx, PLACE.prosecutor[0], PLACE.prosecutor[1] + 2, 130);
    at(ctx, { x: PLACE.prosecutor[0], y: PLACE.prosecutor[1] }, () =>
      f.rive('prosecutor', { timelines: living(f, 4.5, 0.4), numbers: p.prosecutor.numbers }),
    );
  }
  table(ctx);
  if (p.laid > 0)
    for (const [i, s] of LAID_SHEETS.entries()) sheet(ctx, s, 31 + i, 0.32, blottedAt(s.x, p.blot));
  const whole = Math.floor(p.stack);
  for (const [i, s] of STACK_SHEETS.entries()) {
    if (i >= Math.ceil(p.stack)) break;
    const fall = i === whole ? 1 - (p.stack - whole) : 0;
    sheet(
      ctx,
      { x: s.x, y: s.y - 30 * fall, rot: s.rot + 0.2 * fall },
      11 + i,
      0.32,
      blottedAt(s.x, p.blot),
    );
  }
  const c = p.prosecutor.carried;
  if (c.shown > 0) sheet(ctx, c, 97, 0.55);
  if (here) for (const h of p.prosecutor.hands) handAt(f, 'skinHand', h, HAND.prosecutor);
};

const BACK = { scale: 0.28, rise: 100 } as const;

const leadGroup = (f: CourtFrame, p: CourtPose) => {
  const { ctx } = f;
  const christ = p.christ.shown > 0;
  const behind = p.lead.back > 0;
  const lx = PLACE.lead[0] + p.lead.dx;
  const ly = PLACE.lead[1];
  const s = 1 - BACK.scale * p.lead.back;
  const asLead = (draw: () => void) => {
    ctx.save();
    ctx.translate(lx, ly - BACK.rise * p.lead.back);
    ctx.scale(s, s);
    ctx.translate(-lx, -ly);
    draw();
    ctx.restore();
  };
  const [left, right] = p.lead.hands;
  const reached = reachHands(
    p.lead.numbers,
    [left[0] - lx, left[1] - ly],
    [right[0] - lx, right[1] - ly],
  );
  const hands = [reached.left, reached.right].map(([x, y]): Pt => [lx + x, ly + y]);
  const leadFigure = () =>
    asLead(() => {
      contact(ctx, lx, ly + 2, 95);
      at(ctx, { x: lx, y: ly }, () =>
        f.rive('lead', { timelines: living(f, 4, 2.1), numbers: p.lead.numbers }),
      );
      seal(ctx, p.lead.seal);
    });
  const christFigure = () => {
    if (!christ) return;
    contact(ctx, PLACE.christ[0], PLACE.christ[1] + 2, 100);
    at(ctx, { x: PLACE.christ[0], y: PLACE.christ[1] }, () =>
      f.rive(p.christ.front >= 0.5 ? 'christFront' : 'christ', {
        timelines: living(f, 5, 3.4),
        numbers: p.christ.numbers,
      }),
    );
  };
  if (behind) {
    leadFigure();
    christFigure();
  } else {
    christFigure();
    leadFigure();
  }
  dock(ctx);
  asLead(() => {
    for (const h of hands) handAt(f, 'leadHand', h, LEAD_HAND_SIZE);
    seedProp(ctx, p.lead.seed);
  });
  if (!christ) return;
  const [near, far] = p.christ.hands;
  handAt(f, 'christHand', far, HAND.christ);
  heldOut(f, near, p.christ.reach);
  seedProp(ctx, p.christ.seed);
};

interface CourtSpread {
  readonly lead: Pt;
  readonly prosecutor: Pt;
  readonly judge: Pt;
}
const IN_PLACE: CourtSpread = { lead: [0, 0], prosecutor: [0, 0], judge: [0, 0] };

const moved = (ctx: CanvasRenderingContext2D, by: Pt, draw: () => void) => {
  ctx.save();
  ctx.translate(by[0], by[1]);
  draw();
  ctx.restore();
};

export const courtShadows = (ctx: CanvasRenderingContext2D, spread = IN_PLACE) => {
  moved(ctx, spread.judge, () => benchShadow(ctx));
  moved(ctx, spread.prosecutor, () => tableShadow(ctx));
  moved(ctx, spread.lead, () => dockShadow(ctx));
};

export const courtFigures = (f: CourtFrame, p: CourtPose, spread = IN_PLACE) => {
  moved(f.ctx, spread.judge, () => judgeGroup(f, p));
  moved(f.ctx, spread.prosecutor, () => prosecutorGroup(f, p));
  moved(f.ctx, spread.lead, () => leadGroup(f, p));
};
