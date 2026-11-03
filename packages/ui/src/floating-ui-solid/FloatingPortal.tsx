import { type JSX, Portal } from '@solidjs/web';
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  omit,
  Show,
  untrack,
  useContext,
} from 'solid-js';

import { createChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { ownerVisuallyHidden } from '../internals/constants.ts';
import { REASONS } from '../internals/reasons.ts';
import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { addEventListener, mergeCleanups } from '../utils/dom.ts';
import { FocusGuard } from '../utils/FocusGuard.tsx';
import { onClientCleanup } from '../utils/onClientCleanup.ts';
import { createAttribute } from './utils/element.ts';
import {
  disableFocusInside,
  enableFocusInside,
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
} from './utils/tabbable.ts';

export type MaybeRef<T> = T | { current: T };

export function resolveRef<T extends Element | null | undefined>(maybeRef: MaybeRef<T>): T {
  if (maybeRef == null) {
    return maybeRef as T;
  }
  return typeof maybeRef === 'object' && 'current' in maybeRef ? maybeRef.current : maybeRef;
}

interface FocusManagerState {
  modal: boolean;
  open: boolean;
  onOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  domReference: Element | null;
  closeOnFocusOut: boolean;
}

interface PortalContextValue {
  portalNode: Accessor<HTMLElement | null>;
  setFocusManagerState(state: FocusManagerState | null): void;
  beforeInsideRef: { current: HTMLSpanElement | null };
  afterInsideRef: { current: HTMLSpanElement | null };
  beforeOutsideRef: { current: HTMLSpanElement | null };
  afterOutsideRef: { current: HTMLSpanElement | null };
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortalContext(): PortalContextValue | null {
  return useContext(PortalContext);
}

const attr = createAttribute('portal');

interface FloatingPortalState {}

export interface FloatingPortalProps extends BaseUIComponentProps<'div', FloatingPortalState> {
  inline?: boolean | undefined;
}

export function FloatingPortal(props: FloatingPortalProps): JSX.Element {
  const parent = usePortalContext();
  const [portalNode, setPortalNode] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const [focusManagerState, setFocusManagerState] = createSignal<FocusManagerState | null>(null, {
    ownedWrite: true,
  });
  const shouldRenderGuards = () => {
    const state = focusManagerState();
    return !!state && !state.modal && state.open && !!portalNode();
  };

  const beforeOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  let afterOutsideElement: HTMLSpanElement | null = null;
  const afterOutsideRef: { current: HTMLSpanElement | null } = {
    get current() {
      return untrack(shouldRenderGuards) ? afterOutsideElement : null;
    },
    set current(element) {
      afterOutsideElement = element;
    },
  };
  const beforeInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const id = createUniqueId();
  let focusInsideDisabled = false;

  const mount = () => parent?.portalNode() ?? document.body;

  createEffect(
    () => [portalNode(), focusManagerState()?.modal] as const,
    ([node, modal]) => {
      if (!node || modal) {
        return undefined;
      }
      const onFocus = (event: FocusEvent) => {
        if (event.relatedTarget && isOutsideEvent(event)) {
          if (event.type === 'focusin') {
            if (focusInsideDisabled) {
              enableFocusInside(node);
              focusInsideDisabled = false;
            }
          } else {
            disableFocusInside(node);
            focusInsideDisabled = true;
          }
        }
      };
      return mergeCleanups(
        addEventListener(node, 'focusin', onFocus, true),
        addEventListener(node, 'focusout', onFocus, true),
      );
    },
  );

  createEffect(
    () => [focusManagerState()?.open, portalNode()] as const,
    ([open, node]) => {
      if (!node || open !== true || !focusInsideDisabled) {
        return;
      }
      enableFocusInside(node);
      focusInsideDisabled = false;
    },
  );

  const context: PortalContextValue = {
    portalNode,
    setFocusManagerState: (state) => setFocusManagerState(() => state),
    beforeInsideRef,
    afterInsideRef,
    beforeOutsideRef,
    afterOutsideRef,
  };

  const elementProps = omit(props, 'class', 'style', 'render', 'inline');

  function PortalElement() {
    onClientCleanup(() => setPortalNode(null));
    return useRenderElement('div', props, {
      ref: (node: HTMLElement) => setPortalNode(node),
      props: [{ id, [attr]: '' }, elementProps],
    });
  }

  return (
    <>
      <Show when={shouldRenderGuards()}>
        <FocusGuard
          data-type="outside"
          ref={(el) => {
            beforeOutsideRef.current = el;
          }}
          onFocus={(event) => {
            const node = portalNode();
            if (node && isOutsideEvent(event, node)) {
              beforeInsideRef.current?.focus();
            } else {
              getPreviousTabbable(focusManagerState()?.domReference ?? null)?.focus();
            }
          }}
        />
        <span aria-owns={id} style={ownerVisuallyHidden} />
      </Show>
      <PortalContext value={context}>
        <Show
          when={props.inline === true}
          fallback={
            <Portal mount={mount()}>
              <PortalElement />
            </Portal>
          }
        >
          <PortalElement />
        </Show>
      </PortalContext>
      {}
      <FocusGuard
        data-type="outside"
        hidden={!shouldRenderGuards()}
        ref={(el) => {
          afterOutsideRef.current = el;
        }}
        onFocus={(event) => {
          const node = portalNode();
          if (node && isOutsideEvent(event, node)) {
            afterInsideRef.current?.focus();
          } else {
            const state = focusManagerState();
            getNextTabbable(state?.domReference ?? null)?.focus();
            if (state?.closeOnFocusOut) {
              state.onOpenChange(false, createChangeEventDetails(REASONS.focusOut, event));
            }
          }
        }}
      />
    </>
  );
}
