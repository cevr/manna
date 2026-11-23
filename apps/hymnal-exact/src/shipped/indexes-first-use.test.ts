/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noGlobals -- the tests await the gate's Promise answers as Exact's data module gives them, the fake page module serves the indexes as the JSON text the build ships, and the fake page module refuses a read with a plain Error, as the browser's import does. */

/**
 * The indexes' first-use gate (`src/indexes/first-use.ts`) as `app.ts`
 * wires it: a search, an index tab's rows and tiles, a hymn page and its
 * About sheet asked before the indexes are read answer only after the one
 * read, and then exactly what they answer with the indexes at hand, so
 * nothing is first drawn without them; what the launch asks (no query, the
 * Sections and Lists tabs) answers at once with no read; a read that fails
 * answers as with no indexes and the next ask reads again. The reads go to
 * the page module's `indexes.read`, as on the web.
 */

import { describe, expect, it } from 'bun:test';

import { encoded } from '../chords/shipped.testing.ts';
import { bookOf } from '../hymns/book.ts';
import { book, indexes } from '../hymns/book.testing.ts';
import { indexesFirstUse } from '../indexes/first-use.ts';
import { indexesLoader, indexesOf } from '../indexes/load.ts';
import { sourcesAt } from '../sources.ts';

const ORIGIN = 'https://hymns.cvr.im';
const all = sourcesAt(ORIGIN, [], encoded, [], book);
const none = sourcesAt(ORIGIN, [], encoded);

/** The app's wiring over an empty loader, its reads answered by a page module that serves the shipped indexes unless `down`. */
const wired = () => {
  const loader = indexesLoader();
  const sources = sourcesAt(
    ORIGIN,
    [],
    encoded,
    [],
    bookOf(() => indexesOf(loader)),
  );
  const asked: Array<unknown> = [];
  const state = { down: false };
  const native = {
    available: true,
    later: (request: Readonly<Record<string, string | number>>) => {
      asked.push(request);
      return state.down || request['n'] !== 'all'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ text: JSON.stringify(indexes) });
    },
  };
  const gate = indexesFirstUse(loader, sources);
  const refused = {
    fs: { readFile: () => Promise.reject(new Error('the web reads no app files')) },
  };
  return { gate, asked, state, call: [undefined, refused, native] as const };
};

describe("the indexes' first-use gate", () => {
  it('answers each reader once the indexes are read, as with them at hand, reading them once', async () => {
    const { gate, asked, call } = wired();
    const found = gate.hymnRows(['psalm 23'], ...call);
    expect(found).toBeInstanceOf(Promise);
    expect(await found).toEqual(all.hymnRows(['psalm 23']));
    expect(gate.listTabRows(['Topics', [], []], ...call)).toEqual(
      all.listTabRows(['Topics', [], []]),
    );
    expect(gate.findGroupTiles(['Scripture', [], [], 0], ...call)).toEqual(
      all.findGroupTiles(['Scripture', [], [], 0]),
    );
    expect(gate.findFollowRow(['Metres', 100, [], []], ...call)).toEqual(
      all.findFollowRow(['Metres', 100, [], []]),
    );
    expect(gate.hymnPage(['100'], ...call)).toEqual(all.hymnPage(['100']));
    expect(gate.abouthymnPage(['100'], ...call)).toEqual(all.abouthymnPage(['100']));
    expect(asked).toEqual([{ op: 'indexes.read', n: 'all' }]);
    expect(all.listTabRows(['Topics', [], []]).length).toBeGreaterThan(0);
    expect(none.listTabRows(['Topics', [], []])).toEqual([]);
  });

  it('answers what the launch asks at once, reading nothing', () => {
    const { gate, asked, call } = wired();
    expect(gate.hymnRows([''], ...call)).toEqual(all.hymnRows(['']));
    for (const tab of ['Sections', 'Lists']) {
      expect(gate.listTabRows([tab, [], []], ...call)).toEqual(all.listTabRows([tab, [], []]));
      expect(gate.findGroupTiles([tab, [], [], 0], ...call)).toEqual(
        all.findGroupTiles([tab, [], [], 0]),
      );
    }
    expect(gate.hymnPage([''], ...call)).toEqual(all.hymnPage(['']));
    expect(asked).toEqual([]);
  });

  it('answers a failed read as with no indexes, and reads again at the next ask', async () => {
    const { gate, asked, state, call } = wired();
    state.down = true;
    expect(await gate.listTabRows(['Topics', [], []], ...call)).toEqual([]);
    expect(await gate.hymnPage(['100'], ...call)).toEqual(none.hymnPage(['100']));
    state.down = false;
    expect(await gate.listTabRows(['Topics', [], []], ...call)).toEqual(
      all.listTabRows(['Topics', [], []]),
    );
    expect(gate.hymnPage(['100'], ...call)).toEqual(all.hymnPage(['100']));
    expect(asked).toHaveLength(3);
    expect(none.hymnPage(['100'])).not.toEqual(all.hymnPage(['100']));
  });
});
