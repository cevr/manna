/* oxlint-disable effect/noNodeBuiltinImport, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noGlobals, effect/noAsyncFunction -- the test reads the app's contracts as text, awaits the sources' Promise answers as Exact's data module gives them, keys each kept answer by its arguments' JSON as the screen compares them, and its fake page module refuses a read with a plain Error, as the browser's import does. */

/**
 * A hymn whose chords file failed once has its chords again on every page
 * and control that shows it, once a later read of the file lands: the
 * screen keeps each resource's answer while its arguments stand, as
 * Exact's does, so a page the pager asked for as a neighbour, whose read
 * failed, would otherwise stay without its chords once turned to. The
 * screen here asks each resource the contracts read the chords' sources
 * through as Exact asks it (again only when its arguments change), asks
 * `chordsRead` (`chordsHere`) for the hymn shown, and when that answers
 * `mended` asks again each resource `features/chords.contract`'s
 * `chordsMended` refreshes, read from the contract itself. Each case ends
 * with every page and control equal to its answer with every hymn's chords
 * at hand, the hymn's file read twice and no other file read again: a
 * neighbour reached by the pager, a hymn opened by its address, and the
 * hymn already shown whose reader turns chords on; with the hymn moved to
 * another key or a capo, and stepped while its read is out.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { encoded } from '../chords/shipped.testing.ts';
import { chordsFirstUse } from '../chords/first-use.ts';
import { chordsLoader } from '../chords/load.ts';
import { book } from '../hymns/book.testing.ts';
import { sourcesAt } from '../sources.ts';
import type { AppModule, ShippedFiles } from './load.ts';

const ORIGIN = 'https://hymns.cvr.im';
const all = sourcesAt(ORIGIN, [], encoded);
const features = join(import.meta.dir, '../../features');

/** The text of every feature contract. */
const contracts = readdirSync(features)
  .filter((name) => name.endsWith('.contract'))
  .map((name) => readFileSync(join(features, name), 'utf8'))
  .join('\n');

/** Each resource the contracts ask one of the chords' readers through. */
const readersAsked = [
  ...contracts.matchAll(/^\s*resource (\w+) = (hymnPage|chordsPage|keysPage|sheetPlacement)\(/gmu),
].map((found) => found[1] ?? '');

/**
 * `chordsMended` as `features/chords.contract` writes it: the state of
 * `chordsHere` its one `if` asks for, and the resources it then refreshes.
 */
const mended = (() => {
  const text = readFileSync(join(features, 'chords.contract'), 'utf8');
  const start = text.indexOf('  action chordsMended\n');
  if (start < 0) return { when: '', refreshed: [] };
  const body = text.slice(start).split('\n').slice(1);
  const end = body.findIndex((line) => !line.startsWith('   '));
  const lines = body.slice(0, end < 0 ? body.length : end);
  return {
    when:
      lines.flatMap((line) => /^ {4}if chordsHere\.state == "(\w+)"$/u.exec(line)?.[1] ?? [])[0] ??
      '',
    refreshed: lines.flatMap((line) => /^ {6}refresh (\w+)$/u.exec(line)?.[1] ?? []),
  };
})();
const { refreshed } = mended;

interface Ask {
  readonly on: boolean;
  readonly moves: ReadonlyArray<string>;
}

type Gate = ReturnType<typeof chordsFirstUse>;
type Call = readonly [undefined, ShippedFiles, AppModule];

interface Resource {
  readonly pager: boolean;
  readonly args: (n: string, ask: Ask) => ReadonlyArray<unknown>;
  readonly asked: (gate: Gate, n: string, ask: Ask, call: Call) => unknown;
  readonly wanted: (n: string, ask: Ask) => unknown;
}

/** How each resource asks its source for hymn `n`, the pager's for each page and the rest for the hymn shown. */
const RESOURCES = {
  pagerPages: {
    pager: true,
    args: (n) => [n],
    asked: (gate, n, _ask, call) => gate.hymnPage([n], ...call),
    wanted: (n) => all.hymnPage([n]),
  },
  pagerChords: {
    pager: true,
    args: (n, ask) => [n, ask.on, ask.moves],
    asked: (gate, n, ask, call) => gate.chordsPage([n, ask.on, ask.moves], ...call),
    wanted: (n, ask) => all.chordsPage([n, ask.on, ask.moves]),
  },
  hymnShown: {
    pager: false,
    args: (n) => [n],
    asked: (gate, n, _ask, call) => gate.hymnPage([n], ...call),
    wanted: (n) => all.hymnPage([n]),
  },
  chordsShown: {
    pager: false,
    args: (n, ask) => [n, ask.on, ask.moves],
    asked: (gate, n, ask, call) => gate.chordsPage([n, ask.on, ask.moves], ...call),
    wanted: (n, ask) => all.chordsPage([n, ask.on, ask.moves]),
  },
  keysShown: {
    pager: false,
    args: (n, ask) => [n, ask.on, ask.moves],
    asked: (gate, n, ask, call) => gate.keysPage([n, ask.on, ask.moves, false, ''], ...call),
    wanted: (n, ask) => all.keysPage([n, ask.on, ask.moves, false, '']),
  },
  sheetDial: {
    pager: false,
    args: (n) => [n],
    asked: (gate, n, _ask, call) => gate.sheetPlacement([Number(n), [], ''], ...call),
    wanted: (n) => all.sheetPlacement([Number(n), [], '']),
  },
} satisfies Record<string, Resource>;
/** The resource named `name` in the screen. */
const resourceOf = (name: string): Resource | undefined =>
  Object.entries(RESOURCES).find(([key]) => key === name)?.[1];

/** The app's chords wiring under a screen that keeps each answer while its arguments stand. */
const screen = () => {
  const loader = chordsLoader();
  const gate = chordsFirstUse(book, loader, sourcesAt(ORIGIN, [], loader.kept));
  const reads: Array<string> = [];
  const failing = new Map<string, number>();
  const native = {
    available: true,
    later: (request: Readonly<Record<string, string | number>>) => {
      const n = String(request['n']);
      reads.push(n);
      const left = failing.get(n) ?? 0;
      failing.set(n, left - 1);
      const text = encoded.get(Number(n));
      return left > 0 || text === undefined
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ text });
    },
  };
  const refused = {
    fs: { readFile: () => Promise.reject(new Error('the web reads no app files')) },
  };
  const call: Call = [undefined, refused, native];
  const kept = new Map<string, { args: string; answer: unknown }>();
  const here = { args: '', key: '' };
  const at = { shown: '', pager: [] as ReadonlyArray<string>, ask: { on: true, moves: [] } as Ask };

  /** Each resource's hymns: the pager's pages, or the hymn shown. */
  const hymnsOf = (pager: boolean) => (pager ? at.pager : [at.shown]);

  /** Asks `name` for each of its hymns whose arguments changed, or every one when `again`, all at once as one commit asks them. */
  const ask = (name: string, again: boolean): ReadonlyArray<Promise<void>> => {
    const resource = resourceOf(name);
    if (resource === undefined) throw new Error(`no resource ${name} in the screen`);
    return hymnsOf(resource.pager).flatMap((n) => {
      const args = JSON.stringify(resource.args(n, at.ask));
      const slot = `${name} ${n}`;
      if (!again && kept.get(slot)?.args === args) return [];
      return [
        Promise.resolve(resource.asked(gate, n, at.ask, call)).then((answer) => {
          kept.set(slot, { args, answer });
        }),
      ];
    });
  };

  /** Asks `chordsHere` when its arguments changed, and runs `chordsMended` as its task does when its key changes. */
  const mend = async () => {
    const args = JSON.stringify([at.shown, at.ask.on]);
    if (args === here.args) return;
    here.args = args;
    const read = await gate.chordsRead([at.shown, at.ask.on], ...call);
    const key = `${read.number} ${read.state}`;
    if (key === here.key) return;
    here.key = key;
    if (read.state === mended.when) await Promise.all(refreshed.flatMap((name) => ask(name, true)));
  };

  /** The screen once a commit's asks settle. */
  const settle = async () => {
    await Promise.all([...Object.keys(RESOURCES).flatMap((name) => ask(name, false)), mend()]);
  };

  /** Every resource's answer that differs from its answer with every hymn's chords at hand. */
  const stale = () =>
    Object.entries(RESOURCES).flatMap(([name, resource]) =>
      hymnsOf(resource.pager).flatMap((n) =>
        Bun.deepEquals(kept.get(`${name} ${n}`)?.answer, resource.wanted(n, at.ask))
          ? []
          : [`${name} ${n}`],
      ),
    );

  return {
    at,
    failing,
    gate,
    call,
    settle,
    stale,
    readsOf: (n: string) => reads.filter((each) => each === n).length,
    show: async (shown: string, pager: ReadonlyArray<string>) => {
      at.shown = shown;
      at.pager = pager;
      await settle();
    },
    turn: async (ask: Ask) => {
      at.ask = ask;
      await settle();
    },
  };
};

/**
 * A hymn whose words, too, the screen draws otherwise without its chords
 * (split into the chords' syllables), and its pager's neighbours.
 */
const split = (() => {
  const none = sourcesAt(ORIGIN, []);
  const hymn = book.hymns.find(
    ({ number }) =>
      number > 2 && !Bun.deepEquals(all.hymnPage([`${number}`]), none.hymnPage([`${number}`])),
  );
  const n = hymn?.number ?? 0;
  return { first: `${n - 2}`, before: `${n - 1}`, n: `${n}`, after: `${n + 1}` };
})();
const { first, before, n, after } = split;

describe('a hymn whose chords failed to load', () => {
  it("is read again by every resource the contracts read a hymn's chords through", () => {
    expect(readersAsked.toSorted()).toEqual(Object.keys(RESOURCES).toSorted());
    expect(refreshed.toSorted()).toEqual(readersAsked.toSorted());
    expect(Number(n)).toBeGreaterThan(2);
  });

  it('has its chords on every page once the pager turns to it and its read lands', async () => {
    const view = screen();
    view.failing.set(n, 1);
    await view.show(before, [first, before, n]);
    expect(view.stale()).toEqual([`pagerPages ${n}`, `pagerChords ${n}`]);
    await view.show(n, [before, n, after]);
    expect(view.stale()).toEqual([]);
    expect([first, before, n, after].map(view.readsOf)).toEqual([1, 1, 2, 1]);
  });

  it('has its chords once a hymn opened by its address is read again', async () => {
    const view = screen();
    view.failing.set(n, 1);
    await view.show(n, [before, n, after]);
    expect(view.stale()).toEqual([]);
    expect([before, n, after].map(view.readsOf)).toEqual([1, 2, 1]);
  });

  it('has its chords, shown already, once its reader turns chords off or on and the read lands', async () => {
    const view = screen();
    view.failing.set(n, 2);
    await view.show(n, [before, n, after]);
    expect(view.stale()).toEqual([
      `pagerPages ${n}`,
      `pagerChords ${n}`,
      `hymnShown ${n}`,
      `chordsShown ${n}`,
      `keysShown ${n}`,
      `sheetDial ${n}`,
    ]);
    await view.turn({ on: false, moves: [] });
    expect(view.stale()).toEqual([]);
    await view.turn({ on: true, moves: [] });
    expect(view.stale()).toEqual([]);
    expect([before, n, after].map(view.readsOf)).toEqual([1, 3, 1]);
  });

  it('has its chords in the key and capo it was moved to, and stepped while its read was out', async () => {
    await Promise.all(
      ['2:0', '0:3', '-3:2'].map(async (move) => {
        const moves = [`${n}:${move}`];
        const view = screen();
        view.at.ask = { on: true, moves };
        view.failing.set(n, 1);
        await view.show(before, [first, before, n]);
        await view.show(n, [before, n, after]);
        expect(view.stale()).toEqual([]);
        const page = all.chordsPage([n, true, moves]);
        expect([page.transpose, page.capo]).toEqual(move.split(':').map(Number));
        const step = ['step', 1, n, true, moves, false, ''] as const;
        const stepping = screen().gate.keysStep(step, ...view.call);
        expect(stepping).toBeInstanceOf(Promise);
        expect(await stepping).toEqual(all.keysStep(step));
        expect(view.gate.keysStep(step, ...view.call)).toEqual(all.keysStep(step));
      }),
    );
  });
});
