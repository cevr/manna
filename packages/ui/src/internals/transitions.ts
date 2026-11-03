import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';

import { NOOP } from '../utils/dom.ts';
import { useAnimationFrame } from '../utils/timers.ts';
import type { StateAttributesMapping } from './getStateAttributesProps.ts';

export type TransitionStatus = 'starting' | 'ending' | undefined;

const TransitionStatusDataAttributes = {
  startingStyle: 'data-starting-style',
  endingStyle: 'data-ending-style',
} as const;

export function computeStartingStyle(element: Element | null | undefined): void {
  if (element?.isConnected) {
    void getComputedStyle(element).transitionProperty;
  }
}

const STARTING_HOOK = { [TransitionStatusDataAttributes.startingStyle]: '' };
const ENDING_HOOK = { [TransitionStatusDataAttributes.endingStyle]: '' };

export const transitionStatusMapping: StateAttributesMapping<{
  transitionStatus: TransitionStatus;
}> = {
  transitionStatus(value) {
    if (value === 'starting') {
      return STARTING_HOOK;
    }
    if (value === 'ending') {
      return ENDING_HOOK;
    }
    return null;
  },
};

interface TransitionStatusReturn {
  mounted: Accessor<boolean>;
  transitionStatus: Accessor<TransitionStatus>;
  unmount(): void;
}

function createTransitionStatus(
  open: Accessor<boolean>,
  element: Accessor<HTMLElement | null | undefined>,
): TransitionStatusReturn {
  const initiallyOpen = untrack(open);
  const [kept, setKept] = createSignal(initiallyOpen);
  const [started, setStarted] = createSignal(initiallyOpen);
  const frame = useAnimationFrame();

  const mounted = createMemo(() => open() || kept());
  const transitionStatus = createMemo<TransitionStatus>(() => {
    if (open()) {
      return started() ? undefined : 'starting';
    }
    return mounted() ? 'ending' : undefined;
  });

  createEffect(open, (isOpen) => {
    frame.cancel();
    if (isOpen) {
      setKept(true);
      frame.request(() => {
        computeStartingStyle(untrack(element));
        setStarted(true);
      });
    } else {
      setStarted(false);
    }
  });

  return {
    mounted,
    transitionStatus,
    unmount() {
      if (!untrack(open)) {
        setKept(false);
      }
    },
  };
}

function getFiniteAnimations(element: Element): Animation[] {
  return element.getAnimations().filter((animation) => {
    const timing = animation.effect?.getTiming();
    return timing?.duration !== Infinity && timing?.iterations !== Infinity;
  });
}

function useAnimationsFinished(element: Accessor<HTMLElement | null | undefined>) {
  const frame = useAnimationFrame();

  return (fnToExecute: () => void, signal: AbortSignal | null = null) => {
    frame.cancel();
    const resolvedElement = untrack(element);
    if (resolvedElement == null) {
      return;
    }

    if (typeof resolvedElement.getAnimations !== 'function') {
      fnToExecute();
      return;
    }

    const exec = () => {
      Promise.all(
        getFiniteAnimations(resolvedElement).map((animation) => animation.finished.then(NOOP)),
      ).then(
        () => {
          if (!signal?.aborted) {
            fnToExecute();
          }
        },
        () => {
          if (signal?.aborted) {
            return;
          }
          const current = getFiniteAnimations(resolvedElement);
          if (current.some((a) => a.pending || a.playState !== 'finished')) {
            exec();
            return;
          }
          fnToExecute();
        },
      );
    };

    frame.request(exec);
  };
}

interface OpenChangeCompleteParameters {
  enabled?: Accessor<boolean> | undefined;
  open: Accessor<boolean>;
  element: Accessor<HTMLElement | null | undefined>;
  onComplete: () => void;
}

export function useOpenChangeComplete(parameters: OpenChangeCompleteParameters) {
  const { enabled = () => true, open, element, onComplete } = parameters;
  const runOnceAnimationsFinish = useAnimationsFinished(element);

  createEffect(
    () => [enabled(), open()] as const,
    ([isEnabled]) => {
      if (!isEnabled) {
        return undefined;
      }
      const abortController = new AbortController();
      runOnceAnimationsFinish(onComplete, abortController.signal);
      return () => abortController.abort();
    },
  );
}

interface UnmountAfterCloseParameters {
  open: Accessor<boolean>;
  element: Accessor<HTMLElement | null | undefined>;
  onUnmount: () => void;
}

export function createUnmountAfterClose(parameters: UnmountAfterCloseParameters) {
  const { open, element, onUnmount } = parameters;
  const status = createTransitionStatus(open, element);

  useOpenChangeComplete({
    enabled: () => status.mounted() && !open(),
    open,
    element,
    onComplete() {
      if (!untrack(status.mounted) || untrack(open)) {
        return;
      }
      status.unmount();
      onUnmount();
    },
  });

  return status;
}
