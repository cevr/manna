import { Scheduler } from 'effect';

/**
 * The yield-point scheduler, the one the app's tests share
 * (`../yield-points.test.ts`): it yields a fiber at its `at`-th yield check
 * alone. The task that resumes the fiber after that yield first calls
 * `deliver`, as a native event lands while the fiber waits. `counted` holds
 * the checks so far and whether the event landed. `base` runs every task.
 */
export const yieldingAt = (
  at: number,
  deliver: () => void,
  base: Scheduler.Scheduler = new Scheduler.MixedScheduler(),
) => {
  const counted = { checks: 0, delivered: false, pending: false };
  const scheduler: Scheduler.Scheduler = {
    executionMode: 'async',
    shouldYield: () => {
      counted.checks++;
      counted.pending = counted.checks === at;
      return counted.pending;
    },
    makeDispatcher: () => {
      const dispatcher = base.makeDispatcher();
      return {
        scheduleTask: (task, priority) => {
          if (!counted.pending) return dispatcher.scheduleTask(task, priority);
          counted.pending = false;
          dispatcher.scheduleTask(() => {
            counted.delivered = true;
            deliver();
            task();
          }, priority);
        },
        flush: () => dispatcher.flush(),
      };
    },
  };
  return { counted, scheduler };
};
