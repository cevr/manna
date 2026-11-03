import { type Accessor, createContext, useContext } from 'solid-js';

export interface CompositeRootContextValue {
  highlightedIndex: Accessor<number>;
  settled: Accessor<boolean>;
  onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
}

export const CompositeRootContext = createContext<CompositeRootContextValue | null>(null);

export function useCompositeRootContext(): CompositeRootContextValue {
  const context = useContext(CompositeRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: CompositeRootContext is missing. Composite parts must be placed within <Composite.Root>.',
    );
  }
  return context;
}
