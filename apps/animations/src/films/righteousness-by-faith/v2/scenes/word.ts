import {
  type Frame,
  type Gesture,
  at,
  camera,
  drawing,
  line,
  measure,
  probePlate,
  stroke,
  write,
  sub,
  type Posed,
  ground,
  glow,
  rounded,
  plate,
  knobCamera,
  shotPath,
  UNMOVED,
} from '@manna/film/canvas';
import { clamp, hash2, lerp } from '@manna/film/core';
import { C, F, person, piece } from '../../kit.ts';
import { planet, ring, star, tablets } from '../../law.ts';
import { NAME } from './title.ts';

const WORD_CARD = 'Righteousness';
const MEANING = 'right doing';

const SKY: ReadonlyArray<readonly [number, number, number, string]> = [
  [360, -2.5, 34, C.peachTop],
  [520, -0.5, 26, C.tealTop],
  [700, 2.6, 44, C.boardLight],
  [840, -1.3, 30, C.scarletShade],
  [980, 0.7, 52, C.peachLow],
  [1150, -2.0, 36, C.tealMid],
];

const timeline = {
  match: { at: 'start', offset: 0.2, dur: 0.9, ease: 'inOutCubic' },
  fall: { at: 'start', dur: 0.6, ease: 'inQuad' },
  card: { after: 'match', dur: 0.3, ends: true, ease: 'outCubic' },
  shrug: { mark: 'church', offset: 0.2, dur: 0.4, ease: 'outBack' },
  unshrug: { mark: 'fair', dur: 0.5 },
  flip: { mark: 'right', offset: -0.1, dur: 0.5, ease: 'inOutSine' },
  cardOut: { mark: 'whose', offset: -0.2, dur: 0.4, ease: 'inCubic' },
  tape: { mark: 'whose', offset: 0.1, dur: 0.9, ease: 'outCubic' },
  wonder: { mark: 'whose', offset: 0.3, dur: 0.4 },
  tapeUp: { mark: 'psalm', offset: 0.2, dur: 0.6, ease: 'inCubic' },
  drop: { mark: 'all', dur: 0.5, ends: true, ease: 'outBack' },
  light: { mark: 'char', dur: 1.6 },
  grow: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inCubic' },
  awe: { mark: 'circle', offset: 0.3, dur: 0.5 },
  lean: { mark: 'all', offset: -0.3, dur: 2.4, ease: 'inOutSine' },
  wide: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inOutSine' },
} as const;
const knobs = {
  figure: [460, 1000],
  card: [1230, 330],
  law: [1230, 600],
  lean: [1060, 580],
  leanZoom: 1.18,
  wide: [960, 560],
  wideZoom: 0.92,
} as const;

type WordFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const word = drawing({
  timeline,
  knobs,
  draw: (f) => {
    const { ctx, w, h } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('lean'), knobCamera(f.knob('lean'), f.knob('leanZoom'))],
      [f.at('wide'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);
    camera(ctx, cam, w, h, () => page(f));
  },
});

const page = (f: WordFrame) => {
  const { ctx } = f;
  const [lx, ly] = f.knob('law');

  const light = f.at('light');
  glow(ctx, lx, ly - 60, lerp(200, 760, light), C.glow, light);
  glow(ctx, lx, ly - 60, lerp(100, 360, light), C.gold, 0.45 * light);
  universe(f, lx, ly);

  card(f);
  matchCut(f);
  tape(f);

  const drop = f.at('drop');
  if (drop > 0) {
    ground(ctx, lx, ly + 180, 520 * drop);
    at(ctx, { x: lx, y: lerp(-400, ly, drop), scale: 1.9 }, () =>
      tablets(ctx, f.hand, 10 * clamp(f.spoken('all', 'char') * 1.15)),
    );
  }

  viewer(f);
};

const SHRUG_FAR: Posed<Gesture> = { to: [-66, -104], reach: 0, grip: 'palm' };
const SHRUG_NEAR: Posed<Gesture> = { to: [66, -104], reach: 0, grip: 'palm' };

const viewer = (f: WordFrame) => {
  const { ctx } = f;
  const [x, y] = f.knob('figure');
  const shrug = f.at('shrug') * (1 - f.at('unshrug'));
  const wonder = f.at('wonder') * (1 - f.at('drop'));
  const awe = f.at('awe');
  SHRUG_FAR.reach = shrug;
  SHRUG_NEAR.reach = shrug;
  at(ctx, { x, y, scale: 2.6 }, () =>
    person(
      ctx,
      {
        look: [lerp(4, 3, awe), lerp(-1, -5, awe) - 2 * wonder],
        tilt: 0.12 * shrug - 0.08 * wonder - 0.06 * awe,
        nod: -3 * shrug,
        browL: 4 * shrug + 3 * wonder + 5 * awe,
        browR: 5 * shrug + 4 * wonder + 5 * awe,
        browTilt: 0.35 * shrug + 0.4 * wonder + 0.3 * awe,
        mouth: Math.max(0.35 * shrug, awe),
        far: SHRUG_FAR,
        near: SHRUG_NEAR,
      },
      f.hand('viewer'),
    ),
  );
};

const card = (f: WordFrame) => {
  const { ctx } = f;
  const [x, y] = f.knob('card');
  const show = f.at('card') * (1 - f.at('cardOut'));
  if (show <= 0.01) return;
  const face = Math.cos(f.at('flip') * Math.PI);
  const turned = face < 0;
  const text = turned ? MEANING : WORD_CARD;
  at(
    ctx,
    {
      x,
      y: y - 300 * f.at('cardOut'),
      scale: lerp(0.92, 1, f.at('card')) * (1 - 0.6 * f.at('cardOut')),
      rot: CARD_TILT,
    },
    () => {
      ctx.save();
      ctx.globalAlpha *= show;
      ctx.scale(1, Math.max(0.02, Math.abs(face)));
      const board = plate(0, 0, 820, 210);
      piece(ctx, board, C.cream, f.hand('card'), {
        role: 'scenery',
        kind: 'cut',
        line: 4,
        torn: 2,
      });
      if (f.at('match') >= 1)
        probePlate(ctx, board, () =>
          write(
            ctx,
            text,
            0,
            CARD_BASELINE,
            {
              family: turned ? F.hand : F.display,
              size: turned ? 120 : CARD_SIZE,
              weight: turned ? 400 : 700,
              color: turned ? C.inkSoft : C.ink,
              align: 'center',
            },
            f.hand(turned ? 'meaning' : 'word'),
            { boil: 0.4 },
          ),
        );
      ctx.restore();
    },
  );
};

const CARD_SIZE = 104;
const CARD_BASELINE = 34;
const CARD_TILT = -0.02;

const matchCut = (f: WordFrame) => {
  const match = f.at('match');
  if (match >= 1) return;
  const { ctx } = f;
  const style = { ...NAME.style, color: C.ink, align: 'left' } as const;
  const firstW = measure(ctx, NAME.first, style);
  const fullW = measure(ctx, NAME.first + NAME.rest, style);
  const left = NAME.x - fullW / 2;
  const [cx, cy] = f.knob('card');
  const k = CARD_SIZE / NAME.style.size;
  at(
    ctx,
    {
      x: lerp(left + firstW / 2, cx, match),
      y: lerp(NAME.y, cy + CARD_BASELINE, match),
      rot: CARD_TILT * match,
      scale: lerp(1, k, match),
    },
    () =>
      write(ctx, NAME.first, 0, 0, { ...style, align: 'center' }, f.hand('word'), { boil: 0.4 }),
  );
  const fall = f.at('fall');
  if (fall >= 1) return;
  at(ctx, { x: left + firstW, y: NAME.y + 900 * fall * fall, rot: 0.25 * fall }, () =>
    write(ctx, NAME.rest, 0, 0, style, f.hand('titleRest'), { alpha: 1 - fall, boil: 0.4 }),
  );
};

const tape = (f: WordFrame) => {
  const { ctx } = f;
  const [x] = f.knob('card');
  const len = 820 * f.at('tape') * (1 - f.at('tapeUp'));
  if (len <= 4) return;
  const sway = Math.sin(f.t * 1.6) * 0.02;
  at(ctx, { x, y: -30, rot: sway }, () => {
    piece(ctx, rounded(0, len / 2, 70, len, 4), C.gold, f.hand('tape'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
      shadow: 0.3,
    });
    for (let yy = 30; yy < len - 10; yy += 30) {
      const long = yy % 150 === 0;
      stroke(
        ctx,
        line([-35, yy], [-35 + (long ? 30 : 14), yy]),
        { color: C.ink, width: long ? 3.5 : 2.5, jitter: 0.3, boil: 'none' },
        sub(f.hand('tick'), yy),
      );
    }
    piece(ctx, rounded(0, len + 8, 84, 22, 4), C.boardDeep, f.hand('tapeEnd'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
  });
};

const universe = (f: WordFrame, x: number, y: number) => {
  const { ctx } = f;
  const grow = f.at('grow');
  if (grow <= 0) return;
  const r = lerp(250, 2300, grow);
  const cy = y - 20;
  for (let i = 0; i < 26; i++) {
    const d = 260 + 1300 * hash2(i, 41);
    if (d > r) continue;
    const a = 2 * Math.PI * hash2(i, 42);
    const pop = clamp((r - d) / 120);
    star(
      ctx,
      sub(f.hand('star'), i),
      x + Math.cos(a) * d,
      cy + Math.sin(a) * d * 0.62,
      (18 + 14 * hash2(i, 43)) * pop,
    );
  }
  SKY.forEach(([d, a, pr, color], i) => {
    if (d > r) return;
    const pop = clamp((r - d) / 160);
    planet(
      ctx,
      sub(f.hand('planet'), i),
      x + Math.cos(a) * d,
      cy + Math.sin(a) * d * 0.62,
      pr * 1.3 * pop,
      color,
    );
  });
  ring(ctx, f.hand('ring'), x, cy, r);
};
