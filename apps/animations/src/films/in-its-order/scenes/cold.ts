import { drawing, type PuppetLook } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import { Option } from 'effect';
import { RAISE_SEATED } from '../../../library/cast/lead-feast/cutout/raise-seated.ts';
import {
  BABY_BACK,
  DISTANCE,
  FAR_TABLE,
  NEAR,
  PANEL,
  PLANES,
  SKY,
  TABLE,
  WHAT,
} from '../plates/plates.ts';
import { SCROLL_OPEN, SCROLL_ROLLED, SCROLL_ROLLER } from '../plates/props.ts';
import {
  BABY_CROWD,
  BABY_SEATS,
  CROWD_ROWS,
  drawCrowdRow,
  drawCrowdTable,
  drawSeats,
} from './crowd.ts';
import { CROWD_PUPPETS } from '../../../library/cast/filler-bases/cutout/crowd.ts';
import { type Cues, eyesOf, numbersOf } from './lead.ts';
import {
  type GuestKey,
  MOTHER_SEAT,
  TABLE_PUPPETS,
  eyesLook,
  headMiddle,
  motherLook,
  motherNumbers,
  raising,
  seatTable,
  seatedLead,
} from './table.ts';

type Camera = { readonly x: number; readonly y: number; readonly k: number };

const CENTRE = [960, 540] as const;

const holding = (p: readonly [number, number], at: readonly [number, number], k: number) => ({
  x: p[0] - (at[0] - CENTRE[0]) / k,
  y: p[1] - (at[1] - CENTRE[1]) / k,
  k,
});

const BABY = {
  eyes: [790, 497],
  scale: 2,
  k: 1.12,
  on: [121, 238.5],
  back: 3,
} as const;

const FRONT = { on: [1450, 965], at: [960, 908], s: 2.75, z: 0.8 } as const;

const SWAPS = [
  ['turn', 'turn'],
  ['smile', 'smile'],
  ['read', 'turn'],
] as const satisfies ReadonlyArray<readonly [string, GuestKey]>;

const NODS = ['turn', 'read'] as const;

const START: Camera = { x: 1188, y: 846, k: 2.6 };
const MOVES = [
  ['truck', { x: 956, y: 846, k: 2.6 }],
  ['bottle', { x: 915, y: 836, k: 3 }],
  ['smile', { x: 950, y: 790, k: 1.9 }],
  ['read', { x: 956, y: 860, k: 2.8 }],
  ['quote', { x: 947, y: 881, k: 2.82 }],
  ['ouch', { x: 947, y: 820, k: 2.82 }],
] as const satisfies ReadonlyArray<readonly [string, Camera]>;

const FPS = 30;

const ARM_STILL = { shoulderRight: 0, elbowRight: 0, wristRight: 0 } as const;

const HEAD_MIDDLE = headMiddle(TABLE_PUPPETS.lead.skeleton);

const leadEyes = eyesLook(HEAD_MIDDLE);

const WINCE: PuppetLook = {
  boil: 0,
  amp: 0,
  swaps: [
    {
      part: 'head',
      drawing: 'wince',
      place: { s: 1.39, dx: 104, dy: 0 },
      pivot: HEAD_MIDDLE,
    },
  ],
};

const SCROLL = {
  x: 960,
  from: 280,
  land: 978,
  hop: 5,
  s: 0.28,
  lie: 0.5,
  roll: [114, 280],
} as const;

const LIFT = { from: { x: 960, y: 640, k: 1 }, to: { x: 960, y: 552, k: 1.03 } } as const;

const onPlane = (camera: Camera, z: number): Camera => ({
  k: 1 + (camera.k - 1) / z,
  x: CENTRE[0] + (camera.x - CENTRE[0]) / z,
  y: CENTRE[1] + (camera.y - CENTRE[1]) / z,
});

const between = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  k: lerp(a.k, b.k, t),
});

export const cold = drawing({
  timeline: {
    baby: { mark: 'baby', until: 'grown', ease: 'inOutSine' },
    truck: { mark: 'grown', until: 'bottle', ease: 'inOutCubic' },
    bottle: { mark: 'bottle', dur: 0.7, ease: 'outCubic' },
    raise: { mark: 'bottle', dur: RAISE_SEATED.frames / FPS, ease: 'linear' },
    turn: { mark: 'bottle', word: 'bottle', dur: 0 },
    smile: { mark: 'smile', dur: 1.6, ease: 'inOutCubic' },
    read: { mark: 'letter', dur: 1.6, ease: 'inOutCubic' },
    drop: { mark: 'letter', dur: 0.4, ease: 'inQuad' },
    hop: { after: 'drop', dur: 0.24, ease: 'linear' },
    unfurl: { after: 'hop', dur: 0.15, ease: 'linear' },
    unroll: { after: 'unfurl', dur: 1, ease: 'inOutCubic' },
    quote: { mark: 'quote', dur: 2.6, ease: 'inOutSine' },
    ouch: { mark: 'ouch', dur: 0.6, ease: 'inOutCubic' },
    what: { mark: 'what', until: { at: 'end' }, ease: 'inOutSine' },
  },
  puppets: { ...TABLE_PUPPETS, ...CROWD_PUPPETS },
  paintings: {
    sky: SKY,
    distance: DISTANCE,
    near: NEAR,
    table: TABLE,
    far: FAR_TABLE,
    back: BABY_BACK,
    what: WHAT,
    rolled: SCROLL_ROLLED,
    open: SCROLL_OPEN,
    roller: SCROLL_ROLLER,
  },
  draw: (f) => {
    const { ctx, w } = f;
    const plane = (camera: Camera, z: number, draw: () => void) => {
      const { k, x, y } = onPlane(camera, z);
      ctx.save();
      ctx.scale(w / 1920, w / 1920);
      ctx.translate(CENTRE[0], CENTRE[1]);
      ctx.scale(k, k);
      ctx.translate(-x, -y);
      draw();
      ctx.restore();
    };
    const panel = (draw: () => void) => {
      ctx.save();
      ctx.scale(PANEL.scale, PANEL.scale);
      ctx.translate(0, -PANEL.y);
      draw();
      ctx.restore();
    };
    const lead = () => {
      const raise = f.cue('raise').start;
      const cues: Cues = {
        raise,
        landed: raise + RAISE_SEATED.frames / FPS,
        turn: f.cue('turn').start,
        smile: f.cue('smile').start,
        read: f.cue('read').start,
      };
      const numbers = numbersOf(cues)(f.t);
      if (f.t >= f.cue('ouch').start) {
        seatedLead(f, { ...numbers, neck: 0, head: 0 }, WINCE);
        return;
      }
      const eyes = leadEyes(eyesOf(cues)(f.t));
      Option.match(RAISE_SEATED.key(Math.round(f.at('raise') * RAISE_SEATED.frames)), {
        onNone: () => seatedLead(f, numbers, eyes),
        onSome: (key) => seatedLead(f, { ...numbers, ...ARM_STILL }, raising(eyes, key)),
      });
    };
    const key = SWAPS.reduce<GuestKey>(
      (at, [cue, to]) => (f.t >= f.cue(cue).start ? to : at),
      'neutral',
    );
    const nods = NODS.map((cue) => f.cue(cue).start);

    const scroll = () => {
      const hop = f.at('hop');
      const foot = lerp(SCROLL.from, SCROLL.land, f.at('drop')) - SCROLL.hop * 4 * hop * (1 - hop);
      const unfurl = f.at('unfurl');
      ctx.save();
      ctx.translate(SCROLL.x, foot);
      ctx.scale(SCROLL.s, SCROLL.s);
      if (unfurl > 0) {
        const unroll = f.at('unroll');
        ctx.save();
        ctx.translate(0, -SCROLL_ROLLED.size[1]);
        ctx.scale(1, SCROLL.lie);
        if (unroll < 1) {
          const row = lerp(SCROLL.roll[0], SCROLL.roll[1], unroll);
          ctx.save();
          ctx.beginPath();
          ctx.rect(SCROLL_OPEN.at[0], 0, SCROLL_OPEN.size[0], row + 4);
          ctx.clip();
          f.painting('open');
          ctx.restore();
          ctx.translate(0, row - SCROLL_ROLLER.at[1]);
          f.painting('roller');
        } else f.painting('open');
        ctx.restore();
      }
      if (unfurl < 1) {
        ctx.globalAlpha = 1 - unfurl;
        f.painting('rolled');
      }
      ctx.restore();
    };

    if (f.t < f.cue('truck').start) {
      const camera = holding(BABY.eyes, BABY.eyes, lerp(1, BABY.k, f.at('baby')));
      const scale = BABY.scale / BABY.k;
      plane(camera, BABY.back, () => f.painting('back'));
      plane(camera, BABY_CROWD.z, () => {
        ctx.filter = `blur(${(BABY_CROWD.blur * w) / 1920}px) ${BABY_CROWD.haze}`;
        panel(() => {
          drawSeats(f, BABY_SEATS);
          drawCrowdTable(
            ctx,
            { x: BABY_CROWD.x, top: BABY_CROWD.top, size: BABY_CROWD.table },
            () => f.painting('far'),
          );
        });
      });
      plane(camera, 1, () =>
        f.puppet(
          'mother',
          {
            numbers: motherNumbers(f.t),
            root: [
              BABY.eyes[0] + scale * (MOTHER_SEAT.root[0] - BABY.on[0]),
              BABY.eyes[1] + scale * (MOTHER_SEAT.root[1] - BABY.on[1]),
            ],
            scale,
          },
          motherLook(f.t),
        ),
      );
      plane(camera, FRONT.z, () => {
        ctx.translate(FRONT.at[0], FRONT.at[1]);
        ctx.scale(FRONT.s, FRONT.s);
        ctx.translate(-FRONT.on[0], -FRONT.on[1]);
        f.painting('table');
      });
      return;
    }
    if (f.t >= f.cue('what').start) {
      const camera = between(LIFT.from, LIFT.to, f.at('what'));
      plane(camera, 1, () => f.painting('what'));
      return;
    }
    const camera = MOVES.reduce<Camera>((cam, [cue, to]) => between(cam, to, f.at(cue)), START);
    plane(camera, PLANES.sky, () => f.painting('sky'));
    plane(camera, PLANES.distance, () => f.painting('distance'));
    plane(camera, PLANES.near, () => f.painting('near'));
    for (const name of ['back', 'front'] as const) {
      const row = CROWD_ROWS[name];
      const on = onPlane(camera, row.z);
      const shown = (left: number, right: number) =>
        CENTRE[0] + on.k * (right * PANEL.scale - on.x) >= 0 &&
        CENTRE[0] + on.k * (left * PANEL.scale - on.x) <= 1920;
      plane(camera, row.z, () => {
        ctx.filter = `blur(${(row.blur * w) / 1920}px) ${row.haze}`;
        panel(() => drawCrowdRow(f, name, shown, () => f.painting('far')));
      });
    }
    plane(camera, PLANES.guests, () => panel(() => seatTable(f, key, nods, lead)));
    plane(camera, PLANES.table, () => {
      f.painting('table');
      if (f.t >= f.cue('drop').start) scroll();
    });
  },
});
