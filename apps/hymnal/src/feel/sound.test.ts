/* oxlint-disable effect/noNewPromise, effect/noNewError -- the fake stands in for One's native module, whose calls are promises the adapter wraps; a refused play rejects with an Error as a native call does. */

/**
 * The iOS sound adapter over a fake native module: it loads each sound once
 * with its content hash, plays exactly the id `load` gave it, plays nothing
 * for a sound not loaded yet or refused, and calls nothing else.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import type { SoundName } from './body';
import { type VoiceNative, voiceOver } from './sound';
import { RECIPES } from './voice';

type Call =
  | readonly ['load', string, string, number]
  | readonly ['ready', number]
  | readonly ['play', number, string];

/** A native side that answers id 100 + n for the n-th sound, and refuses `refused`. */
const fakeNative = (refused: string, failPlay = false) => {
  const calls: Array<Call> = [];
  let next = 100;
  const native: VoiceNative = {
    load: (name, hash, wav) => {
      calls.push(['load', name, hash, wav.length]);
      const id = next;
      next += 1;
      return Promise.resolve([id, 0][Number(name === refused)] ?? id);
    },
    ready: (sounds) => {
      calls.push(['ready', sounds]);
      return Promise.resolve(true);
    },
    play: (id, name) => {
      calls.push(['play', id, name]);
      return (failPlay && Promise.reject(new Error('changed'))) || Promise.resolve();
    },
  };
  return { native, calls };
};

const names = RECIPES.map(([name]) => name);

describe('the iOS sound adapter', () => {
  it.effect('plays nothing before the pass has loaded a sound', () =>
    Effect.sync(() => {
      const fake = fakeNative('');
      const voice = voiceOver(fake.native, () => 0);
      voice.port.play('thock');
      expect(fake.calls).toEqual([]);
    }),
  );

  it.effect(
    'loads every sound once, then plays exactly the id load gave each, and nothing else',
    () =>
      Effect.gen(function* () {
        const fake = fakeNative('thock');
        const voice = voiceOver(fake.native, () => 0);
        yield* voice.load;
        yield* voice.load;
        const loads = fake.calls.filter((call) => call[0] === 'load');
        expect(loads.map((call) => call[1])).toEqual(names);
        expect(loads.every((call) => /^[0-9a-f]{8}$/.test(String(call[2])))).toBe(true);
        expect(fake.calls.filter((call) => call[0] === 'ready')).toEqual([
          ['ready', names.length - 1],
        ]);
        const before = fake.calls.length;
        for (const name of names) voice.port.play(name);
        const ids = new Map(loads.map((call, k) => [call[1], 100 + k]));
        expect(fake.calls.slice(before)).toEqual(
          names
            .filter((name) => name !== 'thock')
            .map((name): Call => ['play', ids.get(name) ?? 0, name]),
        );
      }),
  );

  it.effect('a failed play is never awaited, and the rest still play', () =>
    Effect.gen(function* () {
      const fake = fakeNative('', true);
      const voice = voiceOver(fake.native, () => 0);
      yield* voice.load;
      const sound: SoundName = 'thock';
      voice.port.play(sound);
      voice.port.play(sound);
      yield* Effect.promise(() => Promise.resolve());
      expect(fake.calls.filter((call) => call[0] === 'play')).toHaveLength(2);
    }),
  );
});
