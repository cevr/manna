import { Data, Effect, Schema } from 'effect';
import type { MemberSpec } from './spec.ts';

/**
 * Where a member's figure comes from: the code-built `Parametric` spec, or a
 * generated `Mesh` (its glb, the glb's sha256 and the file that labels its
 * faces with part ids). The mesh path is declared so the verify command and
 * its manifest name it; building a figure from it is not written yet.
 */
export type FigureSource = Data.TaggedEnum<{
  Parametric: { readonly spec: MemberSpec };
  Mesh: { readonly glb: string; readonly sha256: string; readonly labels: string };
}>;

export const FigureSource = Data.taggedEnum<FigureSource>();

/** A source the figure builder cannot build yet. */
export class SourceUnbuilt extends Schema.TaggedError<SourceUnbuilt>()('SourceUnbuilt', {
  reason: Schema.String,
}) {}

/** The geometry stage's input: the member spec the page builds its figure from. */
export const specOf = (source: FigureSource): Effect.Effect<MemberSpec, SourceUnbuilt> =>
  FigureSource.$match(source, {
    Parametric: ({ spec }) => Effect.succeed(spec),
    Mesh: ({ glb }) =>
      Effect.fail(
        SourceUnbuilt.make({ reason: `the mesh source (${glb}) has no figure builder yet` }),
      ),
  });
