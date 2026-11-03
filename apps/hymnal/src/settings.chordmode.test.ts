/* oxlint-disable effect/noNodeBuiltinImport -- b5 reads the player layer's own source from disk, synchronously, as findplace.static.test.ts does. */

import { describe, expect, it } from 'bun:test';
import { Effect, Layer } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Move, still } from './hymns/chords';
import { settingsOn } from './settings';

const storeOver = (map: Map<string, string>) =>
  Layer.succeed(KeyValueStore.KeyValueStore)(
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => map.get(key)),
      set: (key, value) => Effect.sync(() => void map.set(key, value)),
      remove: (key) => Effect.sync(() => void map.delete(key)),
      clear: Effect.sync(() => map.clear()),
      size: Effect.sync(() => map.size),
      keys: Effect.sync(() => Array.from(map.keys())),
    }),
  );

const launch = (map: Map<string, string>) => {
  const settings = settingsOn(storeOver(map));
  const registry = AtomRegistry.make();
  return { settings, registry };
};

const moves: ReadonlyArray<Move> = Array.from({ length: 12 }, (_, t) =>
  Array.from({ length: 12 }, (__, capo) => ({ transpose: t - 5, capo })),
).flat();

const sample: ReadonlyArray<number> = [1, 2, 99, 100, 101, 373, 694, 695];

const heardWith = (chords: boolean, move: Move): Move => {
  if (chords) return move;
  return still;
};

const stored = (move: Move) => `{"transpose":${move.transpose},"capo":${move.capo}}`;

const allBut = (map: Map<string, string>, key: string) =>
  [...map.entries()].filter(([k]) => k !== key).toSorted(([a], [b]) => a.localeCompare(b));

describe('the chords switch', () => {
  it('b1 is off at first, and nothing but off is kept under chords until it is set', () => {
    const device = new Map<string, string>();
    const { settings, registry } = launch(device);
    expect(registry.get(settings.chords)).toBe(false);
    registry.dispose();
    expect({
      chords: device.get('chords') ?? 'absent',
      others: allBut(device, 'chords'),
    }).toEqual({ chords: expect.stringMatching(/^(?:absent|false)$/), others: [] });

    const again = launch(device);
    expect(again.registry.get(again.settings.chords)).toBe(false);
    again.registry.dispose();
  });

  it('b2 is kept under chords when the app is opened again, on and then off', () => {
    const device = new Map<string, string>();
    const first = launch(device);
    first.registry.set(first.settings.chords, true);
    first.registry.dispose();
    expect(device.get('chords')).toBe('true');

    const second = launch(device);
    expect(second.registry.get(second.settings.chords)).toBe(true);
    second.registry.set(second.settings.chords, false);
    second.registry.dispose();
    expect(device.get('chords')).toBe('false');

    const third = launch(device);
    expect(third.registry.get(third.settings.chords)).toBe(false);
    third.registry.dispose();
  });
});

describe('the heard move', () => {
  it('b3 is the stored move with chords on and still with chords off, for every move of every sampled hymn', () => {
    const misses: Array<{
      number: number;
      move: Move;
      chords: boolean;
      by: string;
      heard: Move;
    }> = [];
    let checked = 0;
    const seen = new Set<string>();
    for (let r = 0; r < moves.length; r++) {
      const device = new Map<string, string>(
        sample.map((number, i) => [
          `move.${number}`,
          stored(moves[(r + 37 * i) % moves.length] ?? still),
        ]),
      );
      if (r % 2 === 0) device.set('chords', 'true');
      const { settings, registry } = launch(device);
      const look = (by: string) => {
        const chords = registry.get(settings.chords);
        sample.forEach((number, i) => {
          const move = moves[(r + 37 * i) % moves.length] ?? still;
          const heard = registry.get(settings.heardMove(number));
          const want = heardWith(chords, move);
          checked += 1;
          seen.add(`${number} ${move.transpose} ${move.capo} ${chords}`);
          if (heard.transpose !== want.transpose || heard.capo !== want.capo) {
            if (misses.length < 3) misses.push({ number, move, chords, by, heard });
          }
        });
      };
      look('stored');
      registry.set(settings.chords, r % 2 !== 0);
      look('flipped');
      registry.dispose();
    }
    expect({ checked, seen: seen.size, misses }).toEqual({
      checked: moves.length * sample.length * 2,
      seen: moves.length * sample.length * 2,
      misses: [],
    });
  });

  it('b4 keeps every stored move while chords turn off and on, and is heard again once on', () => {
    const device = new Map<string, string>([
      ['move.100', stored({ transpose: 2, capo: 3 })],
      ['move.695', stored({ transpose: -5, capo: 11 })],
    ]);
    const kept = allBut(device, 'chords');
    const { settings, registry } = launch(device);
    const offset = Atom.map(settings.heardMove(100), (move) => move.transpose);
    const told: Array<number> = [];
    const stop = registry.subscribe(offset, (value) => told.push(value), { immediate: true });
    const read = () => ({
      offset: registry.get(offset),
      told: told.at(-1),
      heard: registry.get(settings.heardMove(100)),
      heard695: registry.get(settings.heardMove(695)),
      stored: registry.get(settings.move(100)),
    });

    const off = read();
    expect({ off, kept: allBut(device, 'chords') }).toEqual({
      off: {
        offset: 0,
        told: 0,
        heard: still,
        heard695: still,
        stored: { transpose: 2, capo: 3 },
      },
      kept,
    });

    const steps: Array<{ chords: boolean; read: ReturnType<typeof read> }> = [];
    for (const chords of [true, false, true, false, true]) {
      registry.set(settings.chords, chords);
      steps.push({ chords, read: read() });
      expect({ chords, kept: allBut(device, 'chords') }).toEqual({ chords, kept });
    }
    const heardOn = {
      offset: 2,
      told: 2,
      heard: { transpose: 2, capo: 3 },
      heard695: { transpose: -5, capo: 11 },
      stored: { transpose: 2, capo: 3 },
    };
    const heardOff = { ...heardOn, offset: 0, told: 0, heard: still, heard695: still };
    expect(steps).toEqual([
      { chords: true, read: heardOn },
      { chords: false, read: heardOff },
      { chords: true, read: heardOn },
      { chords: false, read: heardOff },
      { chords: true, read: heardOn },
    ]);

    registry.set(settings.move(100), { transpose: -1, capo: 0 });
    const turned = read();
    registry.set(settings.chords, false);
    const turnedOff = read();
    stop();
    registry.dispose();
    expect({ turned, turnedOff, stored: device.get('move.100') }).toEqual({
      turned: {
        offset: -1,
        told: -1,
        heard: { transpose: -1, capo: 0 },
        heard695: { transpose: -5, capo: 11 },
        stored: { transpose: -1, capo: 0 },
      },
      turnedOff: {
        offset: 0,
        told: 0,
        heard: still,
        heard695: still,
        stored: { transpose: -1, capo: 0 },
      },
      stored: stored({ transpose: -1, capo: 0 }),
    });

    const again = launch(device);
    expect(again.registry.get(again.settings.heardMove(100))).toEqual(still);
    again.registry.set(again.settings.chords, true);
    expect({
      heard: again.registry.get(again.settings.heardMove(100)),
      heard695: again.registry.get(again.settings.heardMove(695)),
    }).toEqual({ heard: { transpose: -1, capo: 0 }, heard695: { transpose: -5, capo: 11 } });
    again.registry.dispose();
  });
});

const argumentsOf = (source: string, callee: string): ReadonlyArray<string> => {
  const start = source.indexOf(`${callee}(`);
  if (start < 0) return [];
  const args: Array<string> = [];
  let depth = 0;
  let current = '';
  for (const char of source.slice(start + callee.length + 1)) {
    if (depth === 0 && (char === ')' || char === ',')) {
      args.push(current.trim());
      current = '';
      if (char === ')') break;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
    current += char;
  }
  return args.filter((arg) => arg !== '');
};

describe('the player layer, in the source', () => {
  it('b5 hands playerOn the heard move as its moveFor, and never the stored move', () => {
    const args = argumentsOf(
      readFileSync(join(import.meta.dir, 'player', 'LivePlayer.tsx'), 'utf8'),
      'playerOn',
    );
    expect({
      found: args.length >= 3,
      moveFor: args[2],
      stored: args.filter((arg) => /\bsettings\.move\b/.test(arg)),
    }).toEqual({
      found: true,
      moveFor: expect.stringMatching(/\bsettings\.heardMove\b/),
      stored: [],
    });
  });
});
