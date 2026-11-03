import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { deniedStorage, memoryStorage, refusingStorage } from './fixtures/storage.ts';
import { keptJson, keptText, storeOver } from './storage.ts';

const page = (storage: () => Storage) => {
  const kept = keptText(storeOver(storage), 'film-lab-mic');
  const registry = AtomRegistry.make();
  registry.mount(kept);
  return {
    read: () => registry.get(kept),
    keep: (text: string) => registry.set(kept, text),
  };
};

describe('keptText', () => {
  test('none until kept, then the text, on the next page too, stored as it is', () => {
    const storage = memoryStorage();
    const first = page(() => storage);
    expect(first.read()).toEqual(Option.none());
    first.keep('usb-1');
    expect(first.read()).toEqual(Option.some('usb-1'));
    expect(storage.items.get('film-lab-mic')).toBe('usb-1');
    expect(page(() => storage).read()).toEqual(Option.some('usb-1'));
    page(() => storage).keep('');
    expect(storage.items.get('film-lab-mic')).toBe('');
    expect(page(() => storage).read()).toEqual(Option.some(''));
  });

  test('storage that throws, or that the page may not use, keeps the text while the page lives', () => {
    for (const storage of [refusingStorage, deniedStorage]) {
      const kept = page(storage);
      expect(kept.read()).toEqual(Option.none());
      kept.keep('usb-2');
      expect(kept.read()).toEqual(Option.some('usb-2'));
    }
  });
});

describe('keptJson', () => {
  const Rate = Schema.Struct({ rate: Schema.Finite });
  const kept = (storage: () => Storage) =>
    keptJson(storeOver(storage), 'film-rate', Rate, () => ({ rate: 1 }));

  test('the default until kept, then what was kept, on the next page too, as its JSON', () => {
    const storage = memoryStorage();
    const first = kept(() => storage);
    expect(first.get()).toEqual({ rate: 1 });
    first.set({ rate: 0.5 });
    expect(first.get()).toEqual({ rate: 0.5 });
    expect(storage.items.get('film-rate')).toBe('{"rate":0.5}');
    expect(kept(() => storage).get()).toEqual({ rate: 0.5 });
    storage.items.set('film-rate', '{"rate":"fast"}');
    expect(kept(() => storage).get()).toEqual({ rate: 1 });
  });

  test('a store that refuses, or that the page may not use, keeps it while the page lives', () => {
    for (const storage of [refusingStorage, deniedStorage]) {
      const page = kept(storage);
      page.set({ rate: 0.25 });
      expect(page.get()).toEqual({ rate: 0.25 });
    }
  });
});
