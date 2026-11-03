import { Effect, Layer } from 'effect';

import { Chime, type ChimeService } from '../../src/services/chime.js';
import type { ServiceCall } from './sequence-recorder.js';

export interface MockChimeState {
  calls: ServiceCall[];
}

export const createMockChimeLayer = (state: MockChimeState) => {
  const service: ChimeService = {
    play: Effect.sync(() => {
      state.calls.push({ _tag: 'Chime.play' });
    }),
  };

  return Layer.succeed(Chime, service);
};
