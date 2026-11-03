import { describe, expect, test } from 'bun:test';

import { FIELD_FRAGMENT, NIGHT_FRAGMENT } from './shaders.ts';
import { TURN } from './sun.ts';
import { turnAt } from './testing.ts';

const turnsIn = (source: string) =>
  Array.from(
    source.matchAll(
      /float turn = u_turning \* ([0-9.e-]+) \* sin\(([0-9.e-]+) \* t \/ ([0-9.e-]+)\);/g,
    ),
    (m) => ({ swing: Number(m[1]), tau: Number(m[2]), period: Number(m[3]) }),
  );

const writesTurn = (source: string) => {
  const turns = turnsIn(source);
  return (
    turns.length === 1 &&
    turns.every(({ swing, period }) => swing === TURN.swing && period === TURN.period)
  );
};

const SWAY_FLOOR = 0.016;

const pushIn = (source: string) =>
  Array.from(source.matchAll(/float push = .*\* sway \* ([0-9.e-]+) \* u_ramp;/g), (m) =>
    Number(m[1]),
  );

const calls = (source: string, name: string) => {
  const found: Array<ReadonlyArray<string>> = [];
  let from = source.indexOf(`${name}(`);
  while (from >= 0) {
    const args: Array<string> = [];
    let depth = 0;
    let arg = '';
    for (const char of source.slice(from + name.length + 1)) {
      if (depth === 0 && (char === ',' || char === ')')) {
        args.push(arg.trim());
        arg = '';
        if (char === ')') break;
        continue;
      }
      if (char === '(') depth++;
      if (char === ')') depth--;
      arg += char;
    }
    found.push(args);
    from = source.indexOf(`${name}(`, from + 1);
  }
  return found;
};

const unorderedEdges = (source: string) =>
  calls(source, 'smoothstep').flatMap(([a = '', b = '']) => {
    const low = Number(a);
    const high = Number(b);
    if (a === '' || b === '' || Number.isNaN(low) || Number.isNaN(high) || low < high) return [];
    return [`smoothstep(${a}, ${b}, …)`];
  });

describe('the motion shaders', () => {
  test('write each smoothstep with its lower edge first', () => {
    expect({
      field: unorderedEdges(FIELD_FRAGMENT),
      night: unorderedEdges(NIGHT_FRAGMENT),
    }).toEqual({ field: [], night: [] });
  });

  test('sway the hero’s plants at least as far as the owner asked', () => {
    const pushes = pushIn(FIELD_FRAGMENT);
    expect(pushes.length).toBe(1);
    expect(pushes.every((push) => push >= SWAY_FLOOR)).toBe(true);
  });

  test('a sway below the floor is refused', () => {
    const lowered = FIELD_FRAGMENT.replace(
      /\* sway \* [0-9.e-]+ \* u_ramp/,
      '* sway * 0.012 * u_ramp',
    );
    expect(pushIn(lowered)).toEqual([0.012]);
    expect(pushIn(lowered).every((push) => push >= SWAY_FLOOR)).toBe(false);
  });

  test('turn the rays by the swing and period of the one definition, as `turnAt` does', () => {
    expect(writesTurn(FIELD_FRAGMENT)).toBe(true);
    const [written = { swing: 0, tau: 0, period: 0 }] = turnsIn(FIELD_FRAGMENT);
    let state = 0x7a11;
    const off: Array<number> = [];
    for (let n = 0; n < 1000; n++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const t = (state / 2 ** 32) * 3e5;
      const shader = written.swing * Math.sin((written.tau * t) / written.period);
      if (Math.abs(shader - turnAt(t)) > 1e-9) off.push(t);
    }
    expect(off).toEqual([]);
  });

  test('a turn written with another swing or period, or not multiplied by u_turning, is refused', () => {
    const wider = FIELD_FRAGMENT.replace(
      /u_turning \* [0-9.e-]+ \*/,
      `u_turning * ${TURN.swing * 2} *`,
    );
    const faster = FIELD_FRAGMENT.replace(/t \/ [0-9.e-]+\)/, 't / 7.0)');
    const always = FIELD_FRAGMENT.replace('float turn = u_turning * ', 'float turn = ');
    expect([wider, faster, always].map(writesTurn)).toEqual([false, false, false]);
    expect(writesTurn(FIELD_FRAGMENT)).toBe(true);
  });

  test('a smoothstep that falls from its first edge to its second is refused', () => {
    expect(
      unorderedEdges(
        'float a = smoothstep(0.47, 0.4, uv.y); float b = 1.0 - smoothstep(0.4, 0.47, max(uv.x, 0.2)); float c = smoothstep(0.2, 0.2, l);',
      ),
    ).toEqual(['smoothstep(0.47, 0.4, …)', 'smoothstep(0.2, 0.2, …)']);
  });
});
