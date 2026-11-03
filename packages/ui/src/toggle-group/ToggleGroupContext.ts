import { createContext, useContext } from 'solid-js';

export interface ToggleGroupContextValue<Value> {
  readonly value: readonly Value[];
  setGroupValue: (newValue: Value, nextPressed: boolean) => void;
  holdsFocus: () => boolean;
  releaseFocus: () => void;
}

export const ToggleGroupContext = createContext<ToggleGroupContextValue<string> | null>(null);

export function useToggleGroupContext(): ToggleGroupContextValue<string> {
  const context = useContext(ToggleGroupContext);
  if (context === null) {
    throw new Error('Base UI: a <Toggle> must be placed within a <ToggleGroup>.');
  }
  return context;
}
