import { Option, Result, Schema } from 'effect';
import { Matrix4, Quaternion, Vector3 } from 'three';

/** A GLB the mesh source cannot read: its header, a chunk, or a part the reader needs. */
export class GlbUnreadable extends Schema.TaggedError<GlbUnreadable>()('GlbUnreadable', {
  reason: Schema.String,
}) {}

/** One joint of the skin: its name, its parent joint (an index into the joints) and its head's rest position in world space. */
export interface Joint {
  readonly name: string;
  readonly parent: Option.Option<number>;
  readonly head: readonly [number, number, number];
}

/**
 * A skinned mesh's rest state in world space: positions skinned by the rest
 * pose (so the armature's own scale and turn are applied), the triangles, and
 * four joint indices and weights per vertex.
 */
export interface SkinnedRest {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly joints: Uint16Array;
  readonly weights: Float32Array;
  readonly skeleton: ReadonlyArray<Joint>;
}

const Vec3Json = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite]);

/** The parts of a glTF document the reader uses: accessors, buffer views, the node tree, meshes and skins. */
const GltfJson = Schema.fromJsonString(
  Schema.Struct({
    accessors: Schema.Array(
      Schema.Struct({
        bufferView: Schema.Finite,
        byteOffset: Schema.optionalKey(Schema.Finite),
        componentType: Schema.Finite,
        count: Schema.Finite,
        type: Schema.String,
      }),
    ),
    bufferViews: Schema.Array(
      Schema.Struct({
        byteOffset: Schema.optionalKey(Schema.Finite),
        byteLength: Schema.Finite,
        byteStride: Schema.optionalKey(Schema.Finite),
      }),
    ),
    nodes: Schema.Array(
      Schema.Struct({
        name: Schema.optionalKey(Schema.String),
        children: Schema.optionalKey(Schema.Array(Schema.Finite)),
        translation: Schema.optionalKey(Vec3Json),
        rotation: Schema.optionalKey(
          Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
        ),
        scale: Schema.optionalKey(Vec3Json),
        matrix: Schema.optionalKey(Schema.Array(Schema.Finite)),
        mesh: Schema.optionalKey(Schema.Finite),
        skin: Schema.optionalKey(Schema.Finite),
      }),
    ),
    meshes: Schema.Array(
      Schema.Struct({
        primitives: Schema.Array(
          Schema.Struct({
            attributes: Schema.Record(Schema.String, Schema.Finite),
            indices: Schema.optionalKey(Schema.Finite),
          }),
        ),
      }),
    ),
    skins: Schema.Array(
      Schema.Struct({
        joints: Schema.Array(Schema.Finite),
        inverseBindMatrices: Schema.Finite,
      }),
    ),
  }),
);

type Gltf = typeof GltfJson.Type;

type GltfNode = Gltf['nodes'][number];

const WIDTH = new Map([
  ['SCALAR', 1],
  ['VEC2', 2],
  ['VEC3', 3],
  ['VEC4', 4],
  ['MAT4', 16],
]);
const BYTES = new Map([
  [5121, 1],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const unreadable = (reason: string) => GlbUnreadable.make({ reason });

/** An accessor's values as numbers, in order, whatever their component type and stride. */
const readAccessor = (gltf: Gltf, bin: DataView, index: number): ReadonlyArray<number> => {
  const a = gltf.accessors[index];
  const view = a && gltf.bufferViews[a.bufferView];
  if (!a || !view) return [];
  const width = WIDTH.get(a.type) ?? 1;
  const size = BYTES.get(a.componentType) ?? 4;
  const stride = view.byteStride ?? width * size;
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const float = (at: number) => bin.getFloat32(at, true);
  const read = new Map([
    [5121, (at: number) => bin.getUint8(at)],
    [5123, (at: number) => bin.getUint16(at, true)],
    [5125, (at: number) => bin.getUint32(at, true)],
    [5126, float],
  ]);
  const get = read.get(a.componentType) ?? float;
  const out = Array.from<number>({ length: a.count * width });
  for (let i = 0; i < a.count; i++)
    for (let c = 0; c < width; c++) out[i * width + c] = get(start + i * stride + c * size);
  return out;
};

/** A node's local matrix from its matrix or its translation, rotation and scale. */
const localMatrix = (node: GltfNode): Matrix4 => {
  if (node.matrix) return new Matrix4().fromArray([...node.matrix]);
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  return new Matrix4().compose(
    new Vector3(t[0], t[1], t[2]),
    new Quaternion(r[0], r[1], r[2], r[3]),
    new Vector3(s[0], s[1], s[2]),
  );
};

/** Every node's world matrix and parent node, from the node tree. */
const worldMatrices = (nodes: ReadonlyArray<GltfNode>) => {
  const parent = nodes.map(() => -1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const world: Array<Matrix4> = nodes.map(() => new Matrix4());
  const done = nodes.map(() => false);
  const visit = (i: number): Matrix4 => {
    const w = world[i] ?? new Matrix4();
    if (done[i]) return w;
    const p = parent[i] ?? -1;
    const local = localMatrix(nodes[i] ?? {});
    w.copy(local);
    if (p >= 0) w.premultiply(visit(p));
    done[i] = true;
    return w;
  };
  nodes.forEach((_, i) => visit(i));
  return { world, parent };
};

/** The GLB's JSON and binary chunks. */
const chunks = (
  bytes: Uint8Array,
): Result.Result<{ readonly gltf: Gltf; readonly bin: DataView }, GlbUnreadable> => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67)
    return Result.fail(unreadable('not a GLB: no glTF magic'));
  const jsonLength = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== JSON_CHUNK) return Result.fail(unreadable('no JSON chunk'));
  const binAt = 20 + jsonLength;
  if (binAt + 8 > bytes.byteLength || dv.getUint32(binAt + 4, true) !== BIN_CHUNK)
    return Result.fail(unreadable('no binary chunk'));
  const text = new TextDecoder().decode(bytes.subarray(20, binAt));
  return Result.map(
    Result.mapError(Schema.decodeResult(GltfJson)(text), (e) =>
      unreadable(`its JSON: ${e.message}`),
    ),
    (gltf) => ({
      gltf,
      bin: new DataView(bytes.buffer, bytes.byteOffset + binAt + 8, dv.getUint32(binAt, true)),
    }),
  );
};

/** The rest state of `matrices` skinning `p`: the weighted sum of each joint's skin matrix applied to `p`. */
const skinnedAt = (
  p: Vector3,
  joints: ReadonlyArray<number>,
  weights: ReadonlyArray<number>,
  matrices: ReadonlyArray<Matrix4>,
): Vector3 => {
  const out = new Vector3();
  const v = new Vector3();
  joints.forEach((j, k) => {
    const w = weights[k] ?? 0;
    const m = matrices[j];
    if (w > 0 && m) out.addScaledVector(v.copy(p).applyMatrix4(m), w);
  });
  return out;
};

/**
 * The first skinned mesh of a GLB at rest, in world space: each vertex is
 * skinned by its joints' world matrices times their inverse binds, which
 * applies the armature's scale and turn; each joint's head is the
 * translation of its world matrix.
 */
export const readSkinned = (bytes: Uint8Array): Result.Result<SkinnedRest, GlbUnreadable> =>
  Result.flatMap(chunks(bytes), ({ gltf, bin }) => {
    const owner = gltf.nodes.find((n) => 'mesh' in n && 'skin' in n);
    const prim = owner && gltf.meshes[owner.mesh ?? 0]?.primitives[0];
    const skin = owner && gltf.skins[owner.skin ?? 0];
    if (!prim || !skin) return Result.fail(unreadable('no skinned mesh'));
    const attr = (name: string) =>
      Option.match(Option.fromUndefinedOr(prim.attributes[name]), {
        onNone: () => [],
        onSome: (i) => readAccessor(gltf, bin, i),
      });
    const raw = attr('POSITION');
    const joints = attr('JOINTS_0');
    const weights = attr('WEIGHTS_0');
    const indices = Option.match(Option.fromUndefinedOr(prim.indices), {
      onNone: () => Array.from({ length: raw.length / 3 }, (_, i) => i),
      onSome: (i) => readAccessor(gltf, bin, i),
    });
    if (raw.length === 0 || joints.length * 3 !== raw.length * 4)
      return Result.fail(unreadable('the mesh lacks positions or four joints per vertex'));
    const { world, parent } = worldMatrices(gltf.nodes);
    const ibm = readAccessor(gltf, bin, skin.inverseBindMatrices);
    const skinMatrices = skin.joints.map((node, j) =>
      new Matrix4()
        .copy(world[node] ?? new Matrix4())
        .multiply(new Matrix4().fromArray(ibm.slice(j * 16, j * 16 + 16))),
    );
    const count = raw.length / 3;
    const positions = new Float32Array(raw.length);
    const p = new Vector3();
    for (let i = 0; i < count; i++) {
      p.set(raw[i * 3] ?? 0, raw[i * 3 + 1] ?? 0, raw[i * 3 + 2] ?? 0);
      const at = skinnedAt(
        p,
        joints.slice(i * 4, i * 4 + 4),
        weights.slice(i * 4, i * 4 + 4),
        skinMatrices,
      );
      positions.set([at.x, at.y, at.z], i * 3);
    }
    const jointOf = new Map(skin.joints.map((node, j) => [node, j]));
    const skeleton = skin.joints.map((node): Joint => {
      const head = new Vector3().setFromMatrixPosition(world[node] ?? new Matrix4());
      return {
        name: gltf.nodes[node]?.name ?? `joint${node}`,
        parent: Option.fromUndefinedOr(jointOf.get(parent[node] ?? -1)),
        head: [head.x, head.y, head.z],
      };
    });
    return Result.succeed({
      positions,
      indices: Uint32Array.from(indices),
      joints: Uint16Array.from(joints),
      weights: Float32Array.from(weights),
      skeleton,
    });
  });
