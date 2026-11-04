import { Result } from 'effect';
import { Base64 } from 'effect/encoding';
import type { Vec3 } from '../spec.ts';
import type { MeshLabels } from './labels.ts';
import type { MeshFigure } from './prepare.ts';

/** A mesh figure as JSON carries it to the page: each typed array's bytes in base64, the rest as they are. */
export interface MeshPayload {
  readonly positions: string;
  readonly joints: string;
  readonly weights: string;
  readonly names: ReadonlyArray<string>;
  readonly heads: ReadonlyArray<Vec3>;
  readonly indices: string;
  readonly labels: MeshLabels;
  readonly arms: string;
  readonly hands: string;
  readonly faceZ: number;
  readonly bodyZ: number;
}

const bytes = (a: Float32Array | Uint32Array | Uint16Array): string =>
  Base64.encode(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));

/** A mesh figure as its payload. */
export const toPayload = (m: MeshFigure): MeshPayload => ({
  positions: bytes(m.rig.positions),
  joints: bytes(m.rig.joints),
  weights: bytes(m.rig.weights),
  names: m.rig.names,
  heads: m.rig.heads,
  indices: bytes(m.indices),
  labels: m.labels,
  arms: bytes(m.arms),
  hands: bytes(m.hands),
  faceZ: m.faceZ,
  bodyZ: m.bodyZ,
});

/** A copy of base64 `text`'s bytes on a fresh buffer, so a typed array can view it at offset 0; empty if `text` is not base64. */
const unbase = (text: string): ArrayBuffer => {
  const raw = Result.getOrElse(Base64.decode(text), () => new Uint8Array());
  const out = new Uint8Array(raw.byteLength);
  out.set(raw);
  return out.buffer;
};

/** A payload as the mesh figure it carries. */
export const fromPayload = (p: MeshPayload): MeshFigure => ({
  rig: {
    positions: new Float32Array(unbase(p.positions)),
    joints: new Uint16Array(unbase(p.joints)),
    weights: new Float32Array(unbase(p.weights)),
    names: p.names,
    heads: p.heads,
  },
  indices: new Uint32Array(unbase(p.indices)),
  labels: p.labels,
  arms: new Float32Array(unbase(p.arms)),
  hands: new Float32Array(unbase(p.hands)),
  faceZ: p.faceZ,
  bodyZ: p.bodyZ,
});
