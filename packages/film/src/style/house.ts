import { type Hex, type Ramp, type Shading, ramp } from '../canvas/colour.ts';
import { lerp, progress } from '../core/time.ts';

export const keyLight: Hex = '#f3e9c8';

export const shading: Shading = {
  turn: 20,
  dark: 0.22,
  lift: 0.4,
  deep: 13.5,
  neutral: 0.65,
  warm: 8.5,
  fade: 0.6,
};

export const shaded = (base: Hex): Ramp => ramp(base, keyLight, shading);

export const peoplePaper: Hex = '#b7b2a8';

export const parchment: Hex = '#eeddc8';

export const ramps = {
  figure: shaded(peoplePaper),
  paper: shaded(parchment),
} as const satisfies Record<string, Ramp>;

export const RIM = 5.5;

export const LIGHT = { toward: 0.42, crease: 0.63 } as const;

type Outline = 'line' | 'thick' | 'edge' | 'both';

const INKS = { warm: '#2b2622', black: '#000000' } as const satisfies Record<string, Hex>;

export interface Direction {
  readonly outline: Outline;
  readonly ink: keyof typeof INKS;
  readonly weight?: number;
  readonly baked?: boolean;
}

export const DIRECTION: Direction = { outline: 'both', ink: 'warm' };

export const inkOf = (d: Direction): Hex => INKS[d.ink];

const HEAD = 144;

const CLOSE_SHOT = { from: 0.2, full: 0.3, ink: 0.75 } as const;

export const inkAt = (scale: number): number =>
  lerp(
    1,
    CLOSE_SHOT.ink,
    progress(HEAD * scale, CLOSE_SHOT.from, CLOSE_SHOT.full - CLOSE_SHOT.from),
  );
