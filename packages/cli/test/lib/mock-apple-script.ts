import { Cause, Effect, Layer } from 'effect';

import { AppleScript, type AppleScriptService } from '../../src/services/apple-script.js';
import type { ServiceCall } from './sequence-recorder.js';

export interface MockAppleScriptConfig {
  success?: boolean;
  response?: string;
}

export interface MockAppleScriptState {
  calls: ServiceCall[];
}

export const createMockAppleScriptLayer = (
  config: MockAppleScriptConfig = {},
  state: MockAppleScriptState,
) => {
  const service: AppleScriptService = {
    exec: (script: string) =>
      Effect.gen(function* () {
        state.calls.push({ _tag: 'AppleScript.exec', script });

        if (config.success === false) {
          return yield* new Cause.UnknownError('AppleScript execution failed');
        }

        return config.response ?? 'Success';
      }),
    execJxa: (script: string) =>
      Effect.gen(function* () {
        state.calls.push({ _tag: 'AppleScript.execJxa', script });

        if (config.success === false) {
          return yield* new Cause.UnknownError('AppleScript (JXA) execution failed');
        }

        return config.response ?? 'Success';
      }),
  };

  return Layer.succeed(AppleScript, service);
};
