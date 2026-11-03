import {
  type Hand,
  type Hex,
  type Light,
  type TextStyle,
  at,
  camera,
  drawing,
  knobCamera,
  mix,
  pushInto,
  pushOn,
  rounded,
  shotPath,
  write,
} from '@manna/film/canvas';
import { type Key, lerp } from '@manna/film/core';
import { EASE, type Expression, type Pt, acted, boilTime, reachAbout } from '@manna/film/style';
import {
  COURT_RIGS,
  type CourtFrame,
  type CourtPose,
  type SealPose,
  courtFigures,
  courtShadows,
  living,
  restPose,
  seal,
} from '../court-cast.ts';
import { contact, widePews, wideRoom } from '../court-set.ts';
import { C, F, piece } from '../kit.ts';
import { LIGHT } from '../light.ts';
import {
  PAGE,
  TABLET,
  type TabletsPose,
  cast,
  goldLine,
  leaf,
  shafts,
  standingTablets,
  tabletEdgeAt,
  tabletsAt,
} from '../page-set.ts';
import { LIFT } from '../palette.ts';
import { LEAD, LEAD_ARMS, LEAD_HAND_SIZE, LEAD_KNOBS, reachHands } from '../rigs/lead-rig.ts';
import { TITLE } from '../script.ts';
import { title } from './title.ts';

interface Spread {
  readonly lead: Pt;
  readonly prosecutor: Pt;
  readonly judge: Pt;
}

interface Wide {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly spread: Spread;
}

interface Strip {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly style: TextStyle;
}

const TITLE_CAST: Wide = {
  x: 425,
  y: 315,
  scale: 0.6,
  spread: { lead: [0, 0], prosecutor: [98, 27], judge: [258, 60] },
};
const TITLE_NAME: Strip = {
  x: 990,
  y: 200,
  w: 1000,
  h: 140,
  style: { family: F.display, size: 82, weight: 700, color: C.cream, align: 'center' },
};
const TITLE_POSE: CourtPose = (() => {
  const p = restPose();
  p.stack = 1;
  Object.assign(p.lead.numbers, { gazeX: 520, browTilt: 0.3, browY: -1, mouth: -0.6 });
  Object.assign(p.prosecutor.numbers, {
    gazeX: -520,
    browY: 0.6,
    browTilt: -0.34,
    eyes: 1.1,
    mouthLine: 0,
    mouthOpen: 0,
    shout: 0.75,
    lean: -0.05,
    tilt: -0.05,
  });
  p.prosecutor.hands[0] = [598, 430];
  Object.assign(p.judge.numbers, { browY: 1.6, browTilt: -0.3, mouth: -1 });
  return p;
})();
const TITLE_LIGHT: Light = { ...LIGHT.room, vignette: 0.1 };

const titleCourt = (f: CourtFrame, w: number, h: number, hands: (key: string) => Hand) => {
  const { ctx } = f;
  const n = TITLE_NAME;
  ctx.save();
  ctx.translate(w / 2, h * 0.55);
  ctx.scale(w / 1920, w / 1920);
  ctx.translate(-960, -594);
  wideRoom(ctx);
  at(ctx, { x: TITLE_CAST.x, y: TITLE_CAST.y, scale: TITLE_CAST.scale }, () => {
    courtShadows(ctx, TITLE_CAST.spread);
    courtFigures(f, TITLE_POSE, TITLE_CAST.spread);
  });
  widePews(ctx);
  piece(ctx, rounded(n.x, n.y, n.w, n.h, 0), C.ink, hands('strip'), {
    role: 'scenery',
    kind: 'torn',
    torn: 5,
    shadow: 0.3,
    alpha: 1,
  });
  write(ctx, TITLE, n.x, n.y + 28, n.style, hands('title'), { alpha: 1, boil: 0 });
  ctx.restore();
};

interface Sheet {
  readonly w: number;
  readonly h: number;
}
const SHEET: Sheet = { w: 2000, h: 1160 };

const raisedLight = (color: Hex, edge: Hex): Light => {
  const raised = mix(color, '#ffffff', LIFT / 2);
  return { color: raised, edge: mix(edge, raised, LIFT) };
};

const PEACH: Light = { ...raisedLight('#fffaf4', '#f9ecec'), vignette: 0.1 };

const LEAD_AT: Pt = [500, 820];

const HAND_SCALE = LEAD_HAND_SIZE;

interface Sides {
  readonly far: Pt;
  readonly near: Pt;
}
const HAND_REST: Sides = { far: LEAD_ARMS.left.rest, near: LEAD_ARMS.right.rest };
const SHOULDER: Sides = { far: LEAD_ARMS.left.shoulder, near: LEAD_ARMS.right.shoulder };

interface Gazes {
  readonly us: Pt;
  readonly aside: Pt;
  readonly floor: Pt;
  readonly tablets: Pt;
  readonly top: Pt;
  readonly chest: Pt;
}
const GAZE: Gazes = {
  us: [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY],
  aside: [230, -430],
  floor: [160, 20],
  tablets: [330, -170],
  top: [430, -690],
  chest: [-10, -150],
};

const ASKING: Expression = { ...EASE, browY: -2.4, browTilt: 0.18, eyes: 1.1, mouth: -0.2 };
const WONDERING: Expression = { ...EASE, browY: -1.2, browTilt: 0.3, eyes: 1.05, mouth: -0.3 };
const INTENT: Expression = { ...EASE, browY: -0.8, browTilt: 0.16, eyes: 1.12, mouth: 0 };
const LIT_UP: Expression = {
  ...EASE,
  browY: -2.2,
  browTilt: 0.24,
  eyes: 1.18,
  eyeW: 1.05,
  mouth: 0.5,
};
const SOBER: Expression = { ...EASE, browY: -0.6, browTilt: 0.3, eyes: 0.95, mouth: -0.6 };
const DWARFED: Expression = { ...EASE, browY: -1.8, browTilt: 0.38, eyes: 1.12, mouth: -1.1 };
const CAUGHT: Expression = { ...EASE, browY: 0.6, browTilt: 0.28, eyes: 0.85, mouth: -0.8 };
const BUSY: Expression = { ...EASE, browY: -0.4, browTilt: 0.26, eyes: 0.95, mouth: -0.5 };
const LEVEL: Expression = { ...EASE, browY: 1.4, browTilt: 0.02, eyes: 0.7, mouth: -0.2 };

const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };
const SEAL: SealPose = { x: 0, y: 0, rot: 0, scale: 1, shown: 1, glint: 0 };

const TABLETS_AT: Pt = [671, 820];
const DOORWAY = 2.43;

interface LineRun {
  readonly from: number;
  readonly to: number;
  readonly y: number;
  readonly width: number;
  readonly rise: number;
}
const LINE: LineRun = {
  from: LEAD_AT[0] - 150,
  to: TABLETS_AT[0] + 2 * TABLET.w + TABLET.gap,
  y: LEAD_AT[1] + 2,
  width: 10,
  rise: 22,
};
const FOLD_POINTS = 64;

const TABS: TabletsPose = tabletsAt(TABLETS_AT[0], TABLETS_AT[1]);

export const fromLead = (p: Pt): Pt => [p[0] - LEAD_AT[0], p[1] - LEAD_AT[1]];
export const onLead = (p: Pt): Pt => [LEAD_AT[0] + p[0], LEAD_AT[1] + p[1]];

export const onHim = (p: Pt, lean: number): Pt => {
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  return [LEAD_AT[0] + p[0] * c - p[1] * s, LEAD_AT[1] + p[0] * s + p[1] * c];
};

interface LeafCues {
  readonly fall: 'fall1' | 'fall2' | 'fall3' | 'fall4';
  readonly pin: 'pin1' | 'pin2' | 'pin3' | 'pin4';
  readonly push: 'push1' | 'push2' | 'push3' | 'push4';
}

interface Place {
  readonly at: Pt;
  readonly rot: number;
}

interface Drift {
  readonly from: Pt;
  readonly bend: Pt;
  readonly sway: number;
  readonly sways: number;
  readonly spin: number;
}

const bent = (a: number, b: number, c: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * t * (1 - t) * b + t * t * c;

interface Pinned {
  readonly cues: LeafCues;
  readonly drift: Drift;
  readonly pin: Place;
  readonly fallen: Place;
}

const PINNED: ReadonlyArray<Pinned> = [
  {
    cues: { fall: 'fall1', pin: 'pin1', push: 'push1' },
    drift: { from: [330, 220], bend: [380, 640], sway: 30, sways: 3, spin: 0.9 },
    pin: { at: [-29, -24], rot: -0.85 },
    fallen: { at: [-66, 6], rot: -1.4 },
  },
  {
    cues: { fall: 'fall2', pin: 'pin2', push: 'push2' },
    drift: { from: [690, 215], bend: [640, 640], sway: -28, sways: 3, spin: -1 },
    pin: { at: [25, -24], rot: 0.8 },
    fallen: { at: [70, 8], rot: 1.1 },
  },
  {
    cues: { fall: 'fall3', pin: 'pin3', push: 'push3' },
    drift: { from: [300, 230], bend: [370, 650], sway: 32, sways: 4, spin: 1.2 },
    pin: { at: [-29, 28], rot: -2.3 },
    fallen: { at: [-108, 10], rot: 2.3 },
  },
  {
    cues: { fall: 'fall4', pin: 'pin4', push: 'push4' },
    drift: { from: [700, 225], bend: [640, 660], sway: -30, sways: 4, spin: -1.3 },
    pin: { at: [24, 30], rot: 2.35 },
    fallen: { at: [112, 6], rot: -2.6 },
  },
];

interface Stray {
  readonly drift: Drift;
  readonly lies: Place;
  readonly from: number;
  readonly to: number;
}
const STRAYS: ReadonlyArray<Stray> = [
  {
    drift: { from: [330, 225], bend: [300, 560], sway: 30, sways: 5, spin: 0.6 },
    lies: { at: [292, 828], rot: -1.2 },
    from: 0,
    to: 0.85,
  },
  {
    drift: { from: [700, 225], bend: [680, 560], sway: -30, sways: 4, spin: -0.5 },
    lies: { at: [640, 832], rot: 1.3 },
    from: 0.15,
    to: 1,
  },
];

const FALLEN: ReadonlyArray<Place> = [
  ...PINNED.map((p): Place => ({
    at: [LEAD_AT[0] + p.fallen.at[0], LEAD_AT[1] + p.fallen.at[1]],
    rot: p.fallen.rot,
  })),
  ...STRAYS.map((s) => s.lies),
];

export const LAST_FRAME = {
  sheet: SHEET,
  light: PEACH,
  lead: LEAD_AT,
  hands: HAND_REST,
  handScale: HAND_SCALE,
  face: LEVEL,
  tablets: TABLETS_AT,
  leaves: FALLEN,
} as const;

const PRESS_ON = 10;
const PRESS: ReadonlyArray<Key> = [
  [0, 0],
  [0.4, 1],
  [1, 0],
];
const SQUASH = 0.08;

export const word = drawing({
  timeline: {
    turn: { at: 'start', dur: 0.55, ease: 'outCubic', track: 'page' },
    creep: { after: 'turn', until: 'right', ease: 'linear', track: 'camera' },
    ask: { at: 'speech', offset: 0.5, dur: 0.6, track: 'lead' },
    wonder: { mark: 'right', offset: -0.5, dur: 1.4, ends: true, track: 'lead' },
    line: { mark: 'right', dur: 1.5, ease: 'inOutSine', track: 'law' },
    down: { mark: 'right', offset: 0.1, dur: 0.6, track: 'lead' },
    follow: { mark: 'right', dur: 1.6, ease: 'inOutSine', track: 'camera' },
    onLine: { after: 'follow', until: 'measure', ease: 'linear', track: 'camera' },
    rise: { mark: 'measure', dur: 0.45, ease: 'outCubic', track: 'law' },
    fold: {
      mark: 'measure',
      offset: 0.25,
      dur: 1.2,
      stagger: 0.45,
      ease: 'inOutCubic',
      track: 'law',
    },
    stone: { with: 'fold', offset: 0.6, dur: 0.7, track: 'law' },
    watch: { mark: 'measure', offset: 0.2, dur: 0.6, track: 'lead' },
    toLaw: { mark: 'measure', dur: 1.6, ease: 'inOutSine', track: 'camera' },
    onLaw: { after: 'toLaw', until: 'all', ease: 'linear', track: 'camera' },
    lean: { mark: 'all', dur: 1, track: 'lead' },
    toNear: { mark: 'all', dur: 1.4, ease: 'inOutSine', track: 'camera' },
    quoted: { mark: 'all', word: 'righteousness', dur: 0, track: 'law' },
    lit: {
      mark: 'all',
      word: 'all',
      until: { cue: 'quoted', edge: 'start' },
      stagger: 0.8,
      ease: 'outCubic',
      track: 'law',
    },
    awe: { mark: 'all', word: 'all', dur: 0.6, track: 'lead' },
    pulse: { mark: 'all', word: 'character', dur: 0.9, track: 'law' },
    hold: { after: 'toNear', until: 'short', ease: 'linear', track: 'camera' },
    straighten: { mark: 'all', word: 'measure', dur: 0.6, track: 'lead' },
    tower: { mark: 'short', dur: 1, ease: 'outBack', track: 'law' },
    toShort: { mark: 'short', offset: -0.1, dur: 1, ease: 'inOutSine', track: 'camera' },
    onShort: { after: 'toShort', until: 'cover', ease: 'linear', track: 'camera' },
    lookUp: { mark: 'short', offset: 0.15, dur: 0.6, track: 'lead' },
    shrink: { mark: 'short', word: 'short', dur: 0.4, track: 'lead' },
    settle: { mark: 'cover', dur: 1.1, ease: 'inOutSine', track: 'law' },
    toFig: { mark: 'cover', dur: 1.2, ease: 'inOutSine', track: 'camera' },
    onFig: { after: 'toFig', until: 'going', ease: 'linear', track: 'camera' },
    glance: { mark: 'cover', offset: 0.5, dur: 0.5, track: 'lead' },
    reach: { mark: 'cover', word: 'cover', dur: 0.5, ends: true, track: 'hand' },
    press: { mark: 'cover', word: 'cover', dur: 0.35, track: 'hand' },
    fall1: { mark: 'fig', word: 'leaves', dur: 1.4, ends: true, track: 'leaves' },
    fall2: { mark: 'fig', word: 'excuses', dur: 1.5, ends: true, track: 'leaves' },
    fall3: { mark: 'fig', word: 'coat', dur: 2, ends: true, track: 'leaves' },
    fall4: { mark: 'fig', word: 'stain', dur: 2.2, ends: true, track: 'leaves' },
    pin1: { mark: 'fig', word: 'leaves', dur: 0.45, ends: true, track: 'hand' },
    pin2: { mark: 'fig', word: 'excuses', dur: 0.45, ends: true, track: 'hand' },
    pin3: { mark: 'fig', word: 'coat', dur: 0.45, ends: true, track: 'hand' },
    pin4: { mark: 'fig', word: 'stain', dur: 0.45, ends: true, track: 'hand' },
    push1: { mark: 'fig', word: 'leaves', dur: 0.3, track: 'hand' },
    push2: { mark: 'fig', word: 'excuses', dur: 0.3, track: 'hand' },
    push3: { mark: 'fig', word: 'coat', dur: 0.3, track: 'hand' },
    push4: { mark: 'fig', word: 'stain', dur: 0.3, track: 'hand' },
    home: { after: 'push4', dur: 0.5, track: 'hand' },
    stray: { mark: 'fig', offset: -1, dur: 4, ease: 'linear', track: 'leaves' },
    curl: { mark: 'going', dur: 0.5, stagger: 0.5, track: 'leaves' },
    drop: {
      mark: 'going',
      offset: 0.25,
      dur: 0.8,
      stagger: 0.4,
      ease: 'inQuad',
      track: 'leaves',
    },
    look: { mark: 'going', offset: 0.3, dur: 0.5, track: 'lead' },
    toLook: { mark: 'going', until: { at: 'speechEnd' }, ease: 'inOutSine', track: 'camera' },
  },
  knobs: {
    open: [642, 578],
    openZoom: 1.9,
    creep: 1.05,
    line: [690, 640],
    lineZoom: 1.75,
    law: [680, 616],
    lawZoom: 1.7,
    near: [718, 612],
    nearZoom: 2.55,
    short: [950, 510],
    shortZoom: 1.15,
    fig: [721, 610],
    figZoom: 1.65,
    look: [540, 636],
    lookZoom: 2.55,
  },
  rigs: COURT_RIGS,
  light: (f) => {
    const k = f.at('turn');
    return {
      color: mix(TITLE_LIGHT.color, PEACH.color, k),
      edge: mix(TITLE_LIGHT.edge ?? TITLE_LIGHT.color, PEACH.edge ?? PEACH.color, k),
      vignette: lerp(TITLE_LIGHT.vignette ?? 1, PEACH.vignette ?? 1, k),
    };
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const turn = f.at('turn');

    if (turn < 1) titleCourt(f, w, h, f.handsOf(title));

    acted(LN, EASE, [
      [ASKING, f.at('ask')],
      [WONDERING, f.at('wonder')],
      [INTENT, f.at('down')],
      [LIT_UP, f.at('awe')],
      [SOBER, f.at('straighten')],
      [DWARFED, f.at('lookUp')],
      [CAUGHT, f.at('glance')],
      [BUSY, f.at('reach')],
      [LEVEL, f.at('look')],
    ]);
    const gaze = (axis: 0 | 1) => {
      let g = GAZE.us[axis];
      g = lerp(g, GAZE.aside[axis], f.at('wonder'));
      g = lerp(g, GAZE.floor[axis], f.at('down'));
      g = lerp(g, GAZE.tablets[axis], f.at('watch'));
      g = lerp(g, GAZE.chest[axis], f.at('straighten'));
      g = lerp(g, GAZE.top[axis], f.at('lookUp'));
      g = lerp(g, GAZE.us[axis], f.at('glance'));
      g = lerp(g, GAZE.chest[axis], f.at('reach'));
      return lerp(g, GAZE.us[axis], f.at('look'));
    };
    LN.gazeX = gaze(0);
    LN.gazeY = gaze(1);
    const leaning = f.at('lean') * (1 - f.at('straighten'));
    const up = f.at('lookUp') * (1 - f.at('glance'));
    const looking = f.at('down') * (1 - f.at('watch'));
    const busy = f.at('reach') * (1 - f.at('look'));
    const lean = 0.17 * leaning - 0.04 * up;
    LN.lean = lean;
    LN.nod = 7 * looking + 4 * leaning - 6 * up + 3 * busy;
    LN.gazeY +=
      120 * looking + 100 * f.at('straighten') * (1 - f.at('lookUp')) - 100 * up + 140 * busy;
    LN.tilt =
      0.08 * f.at('wonder') * (1 - f.at('down')) +
      0.07 * leaning +
      0.05 * f.at('look') +
      0.012 * Math.sin(f.t * 0.7);

    const [sx, sy] = onHim([LEAD.stain.x, LEAD.stain.y], lean);
    SEAL.x = sx;
    SEAL.y = sy;

    const restOf = (side: Pt): Pt => onHim(side, lean);
    let far = reachAbout(
      onHim(SHOULDER.far, lean),
      restOf(HAND_REST.far),
      onHim([-40, -150], lean),
      0.5 * f.at('shrink') * (1 - f.at('settle')),
    );
    const nearShoulder = onHim(SHOULDER.near, lean);
    const pinOf = (p: Pinned): Pt =>
      onHim([LEAD.stain.x + p.pin.at[0], LEAD.stain.y + p.pin.at[1]], lean);
    let near = reachAbout(nearShoulder, restOf(HAND_REST.near), [sx, sy], f.at('reach'));
    for (const p of PINNED) {
      const [px, py] = pinOf(p);
      const a = p.pin.rot + lean;
      const middle: Pt = [px + PRESS_ON * Math.sin(a), py - PRESS_ON * Math.cos(a)];
      near = reachAbout(nearShoulder, near, middle, f.at(p.cues.pin));
    }
    near = reachAbout(nearShoulder, near, restOf(HAND_REST.near), f.at('home'));
    const reached = reachHands(LN, fromLead(far), fromLead(near));
    far = onLead(reached.left);
    near = onLead(reached.right);
    const pressing = Math.max(
      f.keys('press', PRESS),
      ...PINNED.map((p) => f.keys(p.cues.push, PRESS)),
    );
    const hand = (p: Pt, squash: number) =>
      at(ctx, { x: p[0], y: p[1] }, () =>
        f.rive('leadHand', {
          timelines: [['boil', boilTime(f.boil)]],
          size: HAND_SCALE * (1 - SQUASH * squash),
        }),
      );

    const leaves = () => {
      PINNED.forEach((p, i) => {
        const fall = f.at(p.cues.fall);
        if (!(fall > 0)) return;
        const [px, py] = pinOf(p);
        const { from, bend } = p.drift;
        const drop = f.stagger('drop', i, PINNED.length);
        const s = Math.sin(fall * Math.PI * p.drift.sways) * (1 - fall);
        leaf(ctx, {
          x: lerp(
            bent(from[0], bend[0], px, fall) + p.drift.sway * s,
            LEAD_AT[0] + p.fallen.at[0],
            drop,
          ),
          y: lerp(bent(from[1], bend[1], py, fall), LEAD_AT[1] + p.fallen.at[1], drop),
          rot: lerp(lerp(p.drift.spin, p.pin.rot + lean, fall) + 0.5 * s, p.fallen.rot, drop),
          scale: 1,
          curl: f.stagger('curl', i, PINNED.length),
          lie: lerp(1 - 0.3 * Math.abs(s), 0.5, drop),
        });
      });
      STRAYS.forEach((s, i) => {
        const k = f.keys('stray', [
          [s.from, 0],
          [s.to, 1, 'inOutSine'],
        ]);
        if (!(k > 0)) return;
        const sway = Math.sin(k * Math.PI * s.drift.sways) * (1 - k);
        const lying = f.keys('stray', [
          [s.to - 0.1, 1],
          [s.to, 0.5],
        ]);
        const { from, bend } = s.drift;
        leaf(ctx, {
          x: bent(from[0], bend[0], s.lies.at[0], k) + s.drift.sway * sway,
          y: bent(from[1], bend[1], s.lies.at[1], k),
          rot: lerp(s.drift.spin, s.lies.rot, k) + 0.5 * sway,
          scale: 1,
          curl: f.stagger('curl', i, STRAYS.length),
          lie: lying - 0.3 * Math.abs(sway),
        });
      });
    };

    TABS.stone = f.at('stone');
    TABS.scale = lerp(lerp(1, DOORWAY, f.at('tower')), 1, f.at('settle'));
    for (let i = 0; i < TABS.lit.length; i++) TABS.lit[i] = f.stagger('lit', i, TABS.lit.length);
    TABS.swell = f.keys('pulse', [
      [0, 0],
      [0.35, 1],
      [1, 0],
    ]);
    const law = () => {
      standingTablets(ctx, TABS);
      const drawn = f.at('line');
      if (drawn <= 0 || TABS.stone >= 1) return;
      const risen = f.at('rise');
      const lift = LINE.rise * risen;
      const nearEnd = lerp(LINE.from, TABLETS_AT[0], risen);
      if (!(f.at('fold') > 0)) {
        goldLine(
          ctx,
          [
            [nearEnd, LINE.y - lift],
            [lerp(LINE.from, LINE.to, drawn), LINE.y - lift],
          ],
          LINE.width,
          1,
        );
        return;
      }
      const parted = TABLETS_AT[0] + TABLET.w + TABLET.gap / 2;
      for (let t = 0; t < 2; t++) {
        const x0 = TABLETS_AT[0] + t * (TABLET.w + TABLET.gap);
        const from = t === 0 ? nearEnd : parted;
        const to = t === 0 ? parted : LINE.to;
        const pts: Pt[] = [];
        for (let j = 0; j <= FOLD_POINTS; j++) {
          const u = j / FOLD_POINTS;
          const k = f.staggerAt('fold', (t + Math.abs(2 * u - 1)) / 2);
          const [ox, oy] = tabletEdgeAt(x0, TABLETS_AT[1], 1, u);
          pts.push([lerp(lerp(from, to, u), ox, k), lerp(LINE.y - lift, oy, k)]);
        }
        goldLine(ctx, pts, LINE.width, 1 - TABS.stone);
      }
    };

    const creep = f.knob('creep');
    const open = knobCamera(f.knob('open'), f.knob('openZoom'));
    const lineShot = knobCamera(f.knob('line'), f.knob('lineZoom'));
    const lawShot = knobCamera(f.knob('law'), f.knob('lawZoom'));
    const close = knobCamera(f.knob('near'), f.knob('nearZoom'));
    const short = knobCamera(f.knob('short'), f.knob('shortZoom'));
    const fig = knobCamera(f.knob('fig'), f.knob('figZoom'));
    const cam = shotPath(open, [
      [f.at('creep'), pushOn(open, creep, 1)],
      [f.at('follow'), lineShot],
      [f.at('onLine'), pushOn(lineShot, creep, 1)],
      [f.at('toLaw'), lawShot],
      [f.at('onLaw'), pushOn(lawShot, creep, 1)],
      [f.at('toNear'), close, pushInto],
      [f.at('hold'), pushOn(close, creep, 1)],
      [f.at('toShort'), short],
      [f.at('onShort'), pushOn(short, creep, 1)],
      [f.at('toFig'), fig],
      [f.at('onFig'), pushOn(fig, creep, 1)],
      [f.at('toLook'), knobCamera(f.knob('look'), f.knob('lookZoom')), pushInto],
    ]);

    at(ctx, { x: lerp(SHEET.w + 40, 0, turn), y: 0, rot: lerp(0.05, 0, turn) }, () => {
      piece(ctx, rounded(w / 2, h / 2, SHEET.w, SHEET.h, 0), PAGE, f.hand('page'), {
        role: 'scenery',
        kind: 'torn',
        torn: 4,
        shadow: 0,
      });
      shafts(ctx, w, h);
      if (turn < 1) {
        ctx.beginPath();
        ctx.rect(w / 2 - SHEET.w / 2 + 10, h / 2 - SHEET.h / 2 + 10, SHEET.w - 20, SHEET.h - 20);
        ctx.clip();
      }
      camera(ctx, cam, w, h, () => {
        cast(ctx, LEAD_AT[0] - 46, LEAD_AT[0] + 46, LEAD_AT[1], LEAD.height, 0.6);
        contact(ctx, LEAD_AT[0], LEAD_AT[1] + 2, 95);
        law();
        at(ctx, { x: LEAD_AT[0], y: LEAD_AT[1] }, () =>
          f.rive('lead', { timelines: living(f, 4, 2.1), numbers: LN }),
        );
        leaves();
        seal(ctx, SEAL);
        hand(far, 0);
        hand(near, pressing);
      });
    });
  },
});
