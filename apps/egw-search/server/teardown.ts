import { Cause, Exit, Runtime } from 'effect';

export const teardown: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
    return onExit(0);
  }
  return Runtime.defaultTeardown(exit, onExit);
};
