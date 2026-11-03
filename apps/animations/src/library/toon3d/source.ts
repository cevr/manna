import { Data, Effect, FileSystem, Schema } from 'effect';
import { armChain } from './figure.ts';
import { readSkinned } from './mesh/glb.ts';
import { prepareMesh, LABELS } from './mesh/prepare.ts';
import { toPayload } from './mesh/payload.ts';
import { armJoints, type ArmJoints } from './mesh/rig.ts';
import type { PageFigure } from './page.ts';
import { HEAD_PX } from './render.ts';
import type { MemberSpec, Pose } from './spec.ts';

/**
 * Where a member's figure comes from: the code-built `Parametric` spec, or a
 * generated `Mesh` painted with the spec's paints, light, face and ink, whose
 * `mesh.json` names its glb, its face labels and their sha256s.
 */
export type FigureSource = Data.TaggedEnum<{
  Parametric: { readonly spec: MemberSpec };
  Mesh: { readonly spec: MemberSpec; readonly manifest: string };
}>;

export const FigureSource = Data.taggedEnum<FigureSource>();

/** A source whose files are missing, do not match their sha256, or do not decode. */
export class SourceInvalid extends Schema.TaggedError<SourceInvalid>()('SourceInvalid', {
  reason: Schema.String,
}) {}

/** The sha256 of `bytes`, as lowercase hex. */
export const sha256 = (bytes: Uint8Array | string): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

/** `mesh.json`: the generated mesh, where it came from, how it is stored, its height on the kept front view and its face labels. */
const MeshManifest = Schema.fromJsonString(
  Schema.Struct({
    glb: Schema.String,
    sha256: Schema.String,
    fal: Schema.Struct({
      request: Schema.String,
      endpoint: Schema.String,
      views: Schema.Finite,
      texture: Schema.Boolean,
      rigging: Schema.Boolean,
      symmetry: Schema.Boolean,
    }),
    storage: Schema.String,
    heightPx: Schema.Finite,
    labels: Schema.String,
    labelsSha256: Schema.String,
  }),
);

/** The labels file: one label per glb triangle, in index-buffer order, each an index into `legend`. */
const FaceLabels = Schema.fromJsonString(
  Schema.Struct({
    faces: Schema.Finite,
    legend: Schema.Array(Schema.String),
    labels: Schema.Array(Schema.Finite),
  }),
);

/** The rounds of smoothing a mesh's label edges get. */
const LABEL_ROUNDS = 4;

/**
 * A figure ready for the page and the measures: the spec it paints with, what
 * the page builds, the posed right arm's joints (head units) the sleeve
 * measure reads along, and the sha256 of every input file by name.
 */
export interface BuiltFigure {
  readonly spec: MemberSpec;
  readonly page: PageFigure;
  readonly rightArm: (pose: Pose) => ArmJoints;
  readonly inputs: Readonly<Record<string, string>>;
}

const tuple = (v: { readonly x: number; readonly y: number; readonly z: number }) =>
  [v.x, v.y, v.z] as const;

/** The code-built right arm's joints for `pose`. */
const parametricRightArm =
  (spec: MemberSpec) =>
  (pose: Pose): ArmJoints => {
    const chain = armChain(spec.arms.right, pose.right, -1);
    return {
      shoulder: spec.arms.right.shoulder,
      elbow: tuple(chain.elbow),
      wrist: tuple(chain.wrist),
    };
  };

const invalid = (reason: string) => SourceInvalid.make({ reason });

/** A file's bytes, checked against the sha256 its manifest names. */
const readChecked = Effect.fnUntraced(function* (file: string, expected: string) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs
    .readFile(file)
    .pipe(Effect.mapError(() => invalid(`cannot read ${file}`)));
  const actual = sha256(bytes);
  if (actual !== expected)
    return yield* invalid(`${file} has sha256 ${actual}, its manifest says ${expected}`);
  return bytes;
});

const dirOf = (file: string): string => file.slice(0, file.lastIndexOf('/'));

/** The mesh source built: its glb read, its labels checked against the glb's triangles, the mesh stood and welded. */
const buildMesh = Effect.fnUntraced(function* (spec: MemberSpec, manifestFile: string) {
  const fs = yield* FileSystem.FileSystem;
  const manifestText = yield* fs
    .readFileString(manifestFile)
    .pipe(Effect.mapError(() => invalid(`cannot read ${manifestFile}`)));
  const manifest = yield* Schema.decodeEffect(MeshManifest)(manifestText).pipe(
    Effect.mapError((e) => invalid(`${manifestFile}: ${e.message}`)),
  );
  const dir = dirOf(manifestFile);
  const glb = yield* readChecked(`${dir}/${manifest.glb}`, manifest.sha256);
  const labelBytes = yield* readChecked(`${dir}/${manifest.labels}`, manifest.labelsSha256);
  const labels = yield* Schema.decodeEffect(FaceLabels)(new TextDecoder().decode(labelBytes)).pipe(
    Effect.mapError((e) => invalid(`${manifest.labels}: ${e.message}`)),
  );
  if (labels.legend.join(',') !== LABELS.join(','))
    return yield* invalid(
      `${manifest.labels} has legend ${labels.legend.join(',')}, not ${LABELS.join(',')}`,
    );
  const rest = yield* Effect.fromResult(readSkinned(glb)).pipe(
    Effect.mapError((e) => invalid(`${manifest.glb}: ${e.reason}`)),
  );
  const triangles = rest.indices.length / 3;
  if (labels.faces !== triangles || labels.labels.length !== triangles)
    return yield* invalid(
      `${manifest.labels} labels ${labels.labels.length} of ${labels.faces} faces, the glb has ${triangles}`,
    );
  const mesh = prepareMesh(rest, labels.labels, {
    height: manifest.heightPx / HEAD_PX,
    labelRounds: LABEL_ROUNDS,
  });
  const built: BuiltFigure = {
    spec,
    page: { _tag: 'Mesh', spec, mesh: toPayload(mesh) },
    rightArm: (pose) => armJoints(mesh.rig, spec.arms, pose, 'right'),
    inputs: {
      'mesh/mesh.json': sha256(manifestText),
      [`mesh/${manifest.glb}`]: manifest.sha256,
      [`mesh/${manifest.labels}`]: manifest.labelsSha256,
    },
  };
  return built;
});

/** The figure a source builds, with its input files' sha256s. */
export const buildSource = (
  source: FigureSource,
): Effect.Effect<BuiltFigure, SourceInvalid, FileSystem.FileSystem> =>
  FigureSource.$match(source, {
    Parametric: ({ spec }) =>
      Effect.succeed<BuiltFigure>({
        spec,
        page: { _tag: 'Parametric', spec },
        rightArm: parametricRightArm(spec),
        inputs: {},
      }),
    Mesh: ({ spec, manifest }) => buildMesh(spec, manifest),
  });
