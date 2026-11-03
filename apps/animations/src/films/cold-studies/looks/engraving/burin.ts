import {
  DoubleSide,
  FrontSide,
  Matrix4,
  ShaderMaterial,
  type Texture,
  Vector3,
  Vector4,
} from 'three';
import { FRAGMENT, VERTEX } from './shader.ts';

const unmade = (): Texture | null => null;

export const hallLight = () => ({
  uL: { value: new Vector3(0.88, -0.33, -0.36).normalize() },
  uWin: { value: new Vector4(-7, -3, 5.6, 1.1) },
  uWinH: { value: 1.3 },
  uL2: { value: new Vector3(0, -1, 1).normalize() },
  uRose: { value: new Vector4(-9.45, 2.5, 7.4, 1.15) },
  uRoseOn: { value: 0 },
  uRoseTurn: { value: 0 },
  uShadow: { value: unmade() },
  uLightMat: { value: new Matrix4() },
  uShadowTexel: { value: 1 / 2048 },
  uPool: { value: new Vector3(-0.9, 0.5, -2.6) },
  uPeriod: { value: 6 },
  uAir: { value: 0.15 },
  uKey: { value: 1.5 },
  uFill: { value: 0.55 },
});

export type HallLight = ReturnType<typeof hallLight>;

export interface Cut {
  readonly albedo: number;
  readonly mode?: 0 | 2 | 5;
  readonly rot?: number;
  readonly cross?: number;
  readonly radius?: number;
  readonly spacing?: number;
  readonly joints?: readonly [number, number, number];
  readonly tint?: {
    readonly rgb: readonly [number, number, number];
    readonly amount: number;
    readonly at: readonly [number, number, number];
    readonly r: number;
  };
  readonly dark?: number;
  readonly rim?: number;
  readonly glow?: boolean;
  readonly seed?: number;
  readonly both?: boolean;
}

export const burin = (light: HallLight, cut: Cut): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: cut.both === true ? DoubleSide : FrontSide,
    uniforms: {
      ...light,
      uAlbedo: { value: cut.albedo },
      uMode: { value: cut.mode ?? 0 },
      uRot: { value: cut.rot ?? 0 },
      uCross: { value: cut.cross ?? 1.2 },
      uRadius: { value: cut.radius ?? 0.3 },
      uSpacing: { value: cut.spacing ?? 0.08 },
      uJoints: { value: new Vector3(...(cut.joints ?? [1, 1, 0])) },
      uTint: {
        value: new Vector4(...(cut.tint?.rgb ?? [0, 0, 0]), cut.tint?.amount ?? 0),
      },
      uTintAt: { value: new Vector4(...(cut.tint?.at ?? [0, 0, 0]), cut.tint?.r ?? 1) },
      uDark: { value: cut.dark ?? 0 },
      uRim: { value: cut.rim ?? 0 },
      uGlow: { value: cut.glow === true ? 1 : 0 },
      uSeed: { value: cut.seed ?? 0 },
    },
  });
