import { glCanvas } from '@manna/film/canvas';
import { WebGLRenderer } from 'three';
import { type World, world } from './shade.ts';
import { type Textures, textures } from './textures.ts';

export const LOW = { w: 320, h: 180 } as const;

export interface Rig {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly world: World;
  readonly tex: Textures;
}

const rigs = new WeakMap<WebGL2RenderingContext, Rig>();

export const rigOf = (): Rig | undefined => {
  const gl = glCanvas('cold-studies/ps1', LOW.w, LOW.h);
  if (gl === undefined) return undefined;
  const have = rigs.get(gl.gl);
  if (have !== undefined) return have;
  const renderer = new WebGLRenderer({ canvas: gl.canvas, context: gl.gl, antialias: false });
  renderer.setPixelRatio(1);
  renderer.autoClear = true;
  const made: Rig = { canvas: gl.canvas, renderer, world: world(LOW.w, LOW.h), tex: textures() };
  rigs.set(gl.gl, made);
  return made;
};

export const keptFor = <S>(build: (r: Rig) => S) => {
  const sets = new WeakMap<Rig, S>();
  return (r: Rig): S => {
    const have = sets.get(r);
    if (have !== undefined) return have;
    const made = build(r);
    sets.set(r, made);
    return made;
  };
};

export const present = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
) => {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, w, h);
  ctx.restore();
};
