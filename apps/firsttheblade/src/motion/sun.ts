export const ASPECT = 1.5;

export const SUN = { u: 0.868, v: 0.459, radius: 0.047 } as const;

export interface Ray {
  readonly angle: number;
  readonly width: number;
  readonly strength: number;
}

export const RAYS: ReadonlyArray<Ray> = [
  { angle: -3.02, width: 0.035, strength: 0.13 },
  { angle: -2.86, width: 0.05, strength: 0.16 },
  { angle: -2.66, width: 0.04, strength: 0.12 },
  { angle: -2.47, width: 0.06, strength: 0.15 },
  { angle: -2.24, width: 0.045, strength: 0.11 },
  { angle: -1.98, width: 0.055, strength: 0.12 },
  { angle: -1.62, width: 0.04, strength: 0.09 },
  { angle: -1.2, width: 0.05, strength: 0.08 },
];

export const GLOW = { reach: 0.09, strength: 0.24 } as const;

export const RAY_REACH = 0.42;

export const LIGHT: readonly [number, number, number] = [1, 0.965, 0.88];

export const TURN = { swing: 0.05, period: 60 } as const;

export const fromTheSun = (u: number, v: number) => {
  const du = u - SUN.u;
  const dv = (v - SUN.v) / ASPECT;
  return { distance: Math.hypot(du, dv), angle: Math.atan2(dv, du) };
};

const rayAt = (ray: Ray, angle: number) => {
  const off = Math.atan2(Math.sin(angle - ray.angle), Math.cos(angle - ray.angle)) / ray.width;
  return ray.strength * Math.exp(-off * off);
};

export const raysToward = (angle: number) => RAYS.reduce((sum, ray) => sum + rayAt(ray, angle), 0);

export const sunLight = (u: number, v: number) => {
  const { distance, angle } = fromTheSun(u, v);
  const beyond = Math.max(0, distance - SUN.radius);
  const glow = GLOW.strength * Math.exp(-beyond / GLOW.reach);
  const rays = raysToward(angle) * Math.exp((-beyond / RAY_REACH) * Math.LN2);
  return Math.min(1, glow + rays);
};
