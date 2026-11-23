/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary -- the tests await the gate's Promise answers as Exact's data module gives them, and the fake page module refuses a read with a plain Error, as the browser's import does. */

/**
 * The chords' first-use gate (`src/chords/first-use.ts`) as `app.ts` wires
 * it: a source asked for a hymn whose chords are not read yet answers only
 * after the read, and then exactly what it answers with every hymn's chords
 * at hand, so nothing is first drawn without them; chords off, a route that
 * names no hymn, or a hymn already read answer at once with no read; a read
 * that fails answers as a hymn with none and the next ask reads again. The
 * reads go to the page module's `chords.read`, as on the web.
 */

import { describe, expect, it } from 'bun:test';

import { bundled, encoded } from '../chords/shipped.testing.ts';
import { chordsFirstUse } from '../chords/first-use.ts';
import { chordsLoader } from '../chords/load.ts';
import { book } from '../hymns/book.testing.ts';
import { sourcesAt } from '../sources.ts';

const ORIGIN = 'https://hymns.cvr.im';
const all = sourcesAt(ORIGIN, [], encoded);
const none = sourcesAt(ORIGIN, []);

/** The app's wiring over an empty loader, its reads answered by a page module that serves `bundled` unless `down`. */
const wired = () => {
  const loader = chordsLoader();
  const sources = sourcesAt(ORIGIN, [], loader.kept);
  const asked: Array<unknown> = [];
  const state = { down: false };
  const native = {
    available: true,
    later: (request: Readonly<Record<string, string | number>>) => {
      asked.push(request);
      const text = encoded.get(Number(request['n']));
      return state.down || text === undefined
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ text });
    },
  };
  const gate = chordsFirstUse(book, loader, sources);
  const refused = {
    fs: { readFile: () => Promise.reject(new Error('the web reads no app files')) },
  };
  return { gate, asked, state, call: [undefined, refused, native] as const };
};

describe("the chords' first-use gate", () => {
  it('answers each reader once its hymn is read, as with every hymn at hand', async () => {
    const { gate, asked, call } = wired();
    const page = gate.hymnPage(['100'], ...call);
    expect(page).toBeInstanceOf(Promise);
    expect(await page).toEqual(all.hymnPage(['100']));
    expect(await gate.chordsPage(['101', true, []], ...call)).toEqual(
      all.chordsPage(['101', true, []]),
    );
    expect(await gate.keysPage(['102', true, [], false, ''], ...call)).toEqual(
      all.keysPage(['102', true, [], false, '']),
    );
    expect(await gate.keysStep(['tap', 0, '103', true, [], false, ''], ...call)).toEqual(
      all.keysStep(['tap', 0, '103', true, [], false, '']),
    );
    expect(await gate.sheetPlacement([104, [], ''], ...call)).toEqual(
      all.sheetPlacement([104, [], '']),
    );
    expect(asked).toEqual(
      ['100', '101', '102', '103', '104'].map((n) => ({ op: 'chords.read', n })),
    );
  });

  it('answers at once a hymn already read, chords off, and a route that names no hymn, reading nothing more', async () => {
    const { gate, asked, call } = wired();
    await gate.hymnPage(['100'], ...call);
    expect(gate.chordsPage(['100', true, []], ...call)).toEqual(all.chordsPage(['100', true, []]));
    expect(gate.keysPage(['100', true, [], false, ''], ...call)).toEqual(
      all.keysPage(['100', true, [], false, '']),
    );
    expect(gate.chordsPage(['200', false, []], ...call)).toEqual(
      all.chordsPage(['200', false, []]),
    );
    for (const route of ['0', '696', 'abc', ''])
      expect(gate.hymnPage([route], ...call)).toEqual(all.hymnPage([route]));
    expect(gate.sheetPlacement([0, [], ''], ...call)).toEqual(all.sheetPlacement([0, [], '']));
    expect(asked).toHaveLength(1);
  });

  it('answers a failed read as a hymn with no chords, and reads again at the next ask', async () => {
    const { gate, asked, state, call } = wired();
    state.down = true;
    expect(await gate.hymnPage(['300'], ...call)).toEqual(none.hymnPage(['300']));
    expect(await gate.chordsPage(['300', true, []], ...call)).toEqual(
      none.chordsPage(['300', true, []]),
    );
    state.down = false;
    expect(await gate.chordsPage(['300', true, []], ...call)).toEqual(
      all.chordsPage(['300', true, []]),
    );
    expect(gate.hymnPage(['300'], ...call)).toEqual(all.hymnPage(['300']));
    expect(asked).toHaveLength(3);
    expect(all.chordsPage(['300', true, []]).kind).toBe('chords');
    expect(bundled.length).toBe(book.hymns.length);
  });
});
