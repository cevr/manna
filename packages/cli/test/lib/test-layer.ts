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

export interface TestLayerConfig {
  files?: MockFileSystemConfig;
  ai?: MockAIConfig;
  http?: MockHttpConfig;
  appleScript?: MockAppleScriptConfig;
  quotations?: MockQuotationsConfig;
}

export interface TestLayerState {
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
  getAllCalls: () => ServiceCall[];
}

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
