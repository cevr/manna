export const OFF = -2;

export const WHOLE = -3;

export interface Marks {
  readonly markOf: (line: number) => number;
  readonly subscribe: (line: number, listener: () => void) => () => void;
  readonly set: (line: number, syllable: number) => void;
  readonly line: () => number;
}

export const marksOf = (): Marks => {
  let current = { line: -1, syllable: -1 };
  const listeners = new Map<number, Set<() => void>>();
  const tell = (line: number) => listeners.get(line)?.forEach((listener) => listener());
  return {
    markOf: (line) => {
      if (line !== current.line) return OFF;
      return current.syllable;
    },
    subscribe: (line, listener) => {
      const set = listeners.get(line) ?? new Set();
      set.add(listener);
      listeners.set(line, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(line);
      };
    },
    set: (line, syllable) => {
      const was = current;
      if (was.line === line && was.syllable === syllable) return;
      current = { line, syllable };
      tell(was.line);
      if (line !== was.line) tell(line);
    },
    line: () => current.line,
  };
};
