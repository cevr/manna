// A puppet drawn in our frame: a kept view cut into parts (a part sheet),
// each part a mesh of its own pixels skinned on a skeleton
// (`core/puppet.ts`), that a drawing declares (`drawing({ puppets })`) and
// poses by bone numbers each frame (`f.puppet(name, pose)`), drawn under the
// frame's own transform. This is the draw path: plain synchronous code, no
// Effect and no Promise. The film loads its puppets before its first frame
// (`src/puppet/load.ts`): each part's pixels, decoded once, belong to that
// load's scope.
//
// A frame is a function of its pose: its vertices are posed from the bind
// vertices by the pose's numbers alone, and written whole into the buffer
// the page draws them from (`canvas/puppet-gl.ts`), which clears the box it
// draws in first. Where nothing is drawn (Bun, `check --draw`) the puppet is
// still posed and its figure declared (`probeFigure`), as a rig's is.

import type { ConceptRef } from '../core/match.ts';
import {
  type Puppet,
  type PuppetPose,
  type Skeleton,
  boneTransforms,
  poseMesh,
} from '../core/puppet.ts';
import { probeFigure, probesFigures } from './probe.ts';
import { type PuppetGl, paintPuppetGl } from './puppet-gl.ts';

type Pt = readonly [number, number];

/**
 * A puppet as a drawing declares it: its key, its part sheet's size and
 * parts (front to back, each a PNG by the URL or path its module imported
 * it as), its skeleton, the sheet pixel our origin stands at, and the
 * concept it is held to (`film lab match`).
 */
export interface PuppetSpec {
  readonly key: string;
  readonly size: Pt;
  readonly parts: ReadonlyArray<{ readonly name: string; readonly png: string }>;
  readonly skeleton: Skeleton;
  readonly origin: Pt;
  readonly concept?: ConceptRef;
}

/** A puppet as its load leaves it: made from its parts' pixels, whether this host paints, and its GL state. */
export interface LoadedPuppet {
  readonly puppet: Puppet;
  readonly paints: boolean;
  readonly gl: PuppetGl;
}

/** A puppet's pose: its bone numbers in degrees, where its root stands and its one scale (`core/puppet.ts`). */
export type { PuppetPose };

/**
 * Pose `loaded` (as `spec` declares it) at `pose` and draw it at our origin
 * under the context's transform, declaring its figure: nothing once drawn,
 * else why it cannot be (no WebGL 2 context), which the film throws
 * (`f.puppet`).
 */
export const drawPuppet = (
  ctx: CanvasRenderingContext2D,
  spec: PuppetSpec,
  loaded: LoadedPuppet,
  pose: PuppetPose,
): string | undefined => {
  const { puppet, gl } = loaded;
  const m = boneTransforms(puppet.bones, pose.numbers);
  const t = ctx.getTransform();
  const [ox, oy] = spec.origin;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [k, part] of puppet.parts.entries()) {
    const out = gl.positions[k]!;
    poseMesh(part.mesh, m, puppet.root, pose, out);
    for (let i = 0; i < out.length; i += 2) {
      const [x, y] = [out[i]! - ox, out[i + 1]! - oy];
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      const px = t.a * x + t.c * y + t.e;
      const py = t.b * x + t.d * y + t.f;
      out[i] = px;
      out[i + 1] = py;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  if (probesFigures(ctx) && left <= right)
    probeFigure(ctx, {
      key: spec.key,
      left,
      top,
      right,
      bottom,
      face: false,
      concept: spec.concept,
    });
  if (!loaded.paints) return undefined;
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(maxX));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(maxY));
  if (x1 <= x0 || y1 <= y0) return undefined;
  const why = paintPuppetGl(ctx, puppet, gl, [x0, y0, x1, y1]);
  return why === undefined ? undefined : `puppet ${spec.key}: ${why}`;
};
