import { Effect, Option } from 'effect';

export const memoryStorage = (): Storage & { readonly items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => Option.getOrNull(Option.fromUndefinedOr(items.get(key))),
    key: (index) => Option.getOrNull(Option.fromUndefinedOr([...items.keys()][index])),
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
};

export const deniedStorage = (): Storage => Effect.runSync(Effect.die('SecurityError'));

export const refusingStorage = (): Storage => ({
  ...memoryStorage(),
  getItem: () => Effect.runSync(Effect.die('storage denied')),
  setItem: () => Effect.runSync(Effect.die('quota exceeded')),
});
