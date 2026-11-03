import type { FileSystem } from 'effect';
import { Layer, Path } from 'effect';
import type { HttpClient } from 'effect/http';

import type { AI } from '../../src/services/ai.js';
import type { AppleScript } from '../../src/services/apple-script.js';
import type { Chime } from '../../src/services/chime.js';
import type { Quotations } from '../../src/services/quotations.js';

import { createMockAILayer, type MockAIConfig } from './mock-ai.js';
import {
  createMockAppleScriptLayer,
  type MockAppleScriptConfig,
  type MockAppleScriptState,
} from './mock-apple-script.js';
import { createMockChimeLayer, type MockChimeState } from './mock-chime.js';
import { createMockFileSystemLayer, type MockFileSystemConfig } from './mock-filesystem.js';
import { createMockHttpLayer, type MockHttpConfig } from './mock-http.js';
import {
  createMockQuotationsLayer,
  type MockQuotationsConfig,
  type MockQuotationsState,
} from './mock-quotations.js';
import { CallSequenceLayer, type CallSequence, type ServiceCall } from './sequence-recorder.js';

/**
 * Configuration for creating a test layer.
 */
export interface TestLayerConfig {
  /** Mock file system state */
  files?: MockFileSystemConfig;
  /** Mock AI responses */
  ai?: MockAIConfig;
  /** Mock HTTP responses */
  http?: MockHttpConfig;
  /** Mock AppleScript configuration */
  appleScript?: MockAppleScriptConfig;
  /** Quotation problems `manna check`/`manna export` should see */
  quotations?: MockQuotationsConfig;
}

/**
 * State returned from creating a test layer.
 * Includes cleanup functions and mutable state for assertions.
 */
export interface TestLayerState {
  /** The composed layer to provide to the CLI */
  layer: Layer.Layer<
    | FileSystem.FileSystem
    | Path.Path
    | HttpClient.HttpClient
    | AI
    | AppleScript
    | Chime
    | Quotations
    | CallSequence
  >;
  /** Get all calls recorded (from services and external) */
  getAllCalls: () => ServiceCall[];
}

/**
 * Create a composite test layer with all mocked services.
 *
 * This follows the Effect testing pattern of providing mock layers
 * for all external dependencies while running actual command logic.
 */
export const createTestLayer = (config: TestLayerConfig = {}): TestLayerState => {
  const appleScriptState: MockAppleScriptState = { calls: [] };
  const chimeState: MockChimeState = { calls: [] };
  const quotationsState: MockQuotationsState = { calls: [] };
  const mockHttp = createMockHttpLayer(config.http ?? { responses: {} });

  const mockFs = createMockFileSystemLayer(config.files ?? { files: {}, directories: [] });

  const mockAI = createMockAILayer(config.ai ?? { responses: { high: [], low: [] } });

  const mockAppleScript = createMockAppleScriptLayer(config.appleScript ?? {}, appleScriptState);

  const mockChime = createMockChimeLayer(chimeState);

  const mockPath = Path.layer;

  const composedLayer = Layer.mergeAll(
    mockFs.layer,
    mockAI.layer,
    mockAppleScript,
    mockChime,
    createMockQuotationsLayer(config.quotations ?? {}, quotationsState),
    mockHttp.layer,
    mockPath,
  ).pipe(Layer.provideMerge(CallSequenceLayer));

  return {
    layer: composedLayer,
    getAllCalls: () => [
      ...appleScriptState.calls,
      ...chimeState.calls,
      ...quotationsState.calls,
      ...mockAI.state.calls,
      ...mockHttp.state.calls,
    ],
  };
};
