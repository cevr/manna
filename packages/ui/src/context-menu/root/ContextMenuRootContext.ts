import { type Accessor, createContext, useContext } from 'solid-js';

export interface ContextMenuAnchor {
  getBoundingClientRect: () => DOMRect;
}

export interface ContextMenuRootContext {
  anchor: Accessor<ContextMenuAnchor>;
  setAnchor: (anchor: ContextMenuAnchor) => void;
  opener: Accessor<symbol | null>;
  setOpener: (trigger: symbol) => void;
  internalBackdropRef: { current: HTMLElement | null };
  allowMouseUpTriggerRef: { current: boolean };
  initialCursorPointRef: { current: { x: number; y: number } | null };
  rootId: string;
}

export const ContextMenuRootContext = createContext<ContextMenuRootContext | null>(null);

export function useContextMenuRootContext(): ContextMenuRootContext | null {
  return useContext(ContextMenuRootContext);
}

export function useContextMenuRootContextStrict(): ContextMenuRootContext {
  const context = useContext(ContextMenuRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: ContextMenuRootContext is missing. ContextMenu parts must be placed within <ContextMenu.Root>.',
    );
  }
  return context;
}
