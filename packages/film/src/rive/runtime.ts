import type { RiveCanvas } from '@rive-app/webgl2-advanced';
import { Context, type Effect } from 'effect';
import type { RiveEngine } from '../canvas/rive.ts';
import type { RigUnloadable } from '../core/errors.ts';

export class RiveRuntime extends Context.Service<
  RiveRuntime,
  {
    readonly runtime: (engine: RiveEngine) => Effect.Effect<RiveCanvas, RigUnloadable>;
    readonly read: (riv: string) => Effect.Effect<Uint8Array, RigUnloadable>;
    readonly paints: boolean;
  }
>()('@manna/film/rive/RiveRuntime') {}
