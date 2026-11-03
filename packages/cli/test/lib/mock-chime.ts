import { Effect, Layer } from 'effect';

import { Chime, type ChimeService } from '../../src/services/chime.js';
import type { ServiceCall } from './sequence-recorder.js';

/**
 * State for tracking Chime calls.
 */
export interface MockChimeState {
  calls: ServiceCall[];
}

/**
 * Create a mock Chime layer that records all calls.
 */
export const createMockChimeLayer = (state: MockChimeState) => {
  const service: ChimeService = {
    play: Effect.sync(() => {
      state.calls.push({ _tag: 'Chime.play' });
    }),
  };

  return Layer.succeed(Chime, service);
};
