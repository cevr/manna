/* oxlint-disable effect/noGlobals -- a frame-rule table: it builds happy-dom nodes by hand in the document the rule reads. */

/**
 * The root's frame rule at the Add verses sheet's seams (`rootFaults` in
 * `src/test/root-rule.ts`), with no app:
 *
 * - `Your field` on the chooser's `Add a passage` is the fault `Your field on
 *   Add a passage`, and on About is none;
 * - the `‹ Add verses` back on every screen a root frame shows by its
 *   heading, zero, one or two times, inside a scroll view or not: exactly one
 *   outside a scroll view on `Add a passage` and none elsewhere is no fault,
 *   and each other cell is exactly its words (`no Add verses back on Add a
 *   passage`, `<n> Add verses backs on Add a passage`, `the Add verses back
 *   on <screen>`, `the Add verses back inside a scroll view`);
 * - home's own `Add verses`, with no `‹ `, is no back on any screen;
 * - the listening clause's new names (`Plant Psalms 1:1-3`, `Add verses`,
 *   `Any passage`), alone and together, under the host or outside it, on
 *   every screen, with `Listening` under the host or not: while listening the
 *   faults ending ` in reach while listening` are exactly their names, and
 *   while not, none.
 */

import { describe, expect, it } from 'bun:test';

import { rootFaults } from '../test/root-rule';

const SCREENS = [
  'Your field',
  'Today',
  'When I need…',
  'Add a passage',
  'About',
  'Hear it',
  'Say it with help',
  'Say it alone',
  'Planted',
];

const ADDING = 'Add a passage';

const element = (role: string, label: string, words: string) => {
  const node = document.createElement('div');
  node.setAttribute('role', role);
  node.setAttribute('aria-label', label);
  node.textContent = words;
  return node;
};

/** The chooser's first back as the app draws it: named `Add verses`, its text `‹ Add verses`. */
const addBack = () => element('button', 'Add verses', '‹ Add verses');

/** A scroll view as the rule finds one: a node that scrolls its overflow. */
const scrollView = () => {
  const node = document.createElement('div');
  node.setAttribute('style', 'overflow-y: auto');
  return node;
};

/** A frame of `screen` by its one heading, added to the document. */
const screenFrame = (screen: string) => {
  const host = document.createElement('div');
  host.append(element('heading', screen, screen));
  document.body.append(host);
  return host;
};

/** The faults of `screen`'s frame with `nodes` under its host, sorted. */
const faultsWith = (screen: string, nodes: readonly Element[]) => {
  const host = screenFrame(screen);
  host.append(...nodes);
  const faults = rootFaults(host, 'read').toSorted();
  host.remove();
  return faults;
};

const ADD_BACK_WORDS = /Add verses back/;

/** The faults of `screen`'s bare frame that are not the Add verses back's. */
const others = (screen: string) =>
  faultsWith(screen, []).filter((each) => !ADD_BACK_WORDS.test(each));

/** The table's words for `count` backs on `screen`, inside a scroll view when `inScroll`. */
const backWords = (screen: string, count: number, inScroll: boolean) => {
  const out: string[] = [];
  if (screen === ADDING && count === 0) out.push(`no Add verses back on ${ADDING}`);
  if (screen === ADDING && count === 2) out.push(`2 Add verses backs on ${ADDING}`);
  if (screen !== ADDING && count > 0) out.push(`the Add verses back on ${screen}`);
  if (inScroll && count > 0) out.push('the Add verses back inside a scroll view');
  return out;
};

/** Where a cell's backs lie: under the host itself, or inside a scroll view under it. */
const PLACES = {
  fixed: (backs: readonly Element[]) => backs,
  scrolled: (backs: readonly Element[]) => {
    const scroll = scrollView();
    scroll.append(...backs);
    return [scroll];
  },
} as const;

/** One cell of the back table: `count` backs on `screen`, inside a scroll view or not. */
const backCell = (screen: string, count: number, place: keyof typeof PLACES) => {
  const backs = Array.from({ length: count }, addBack);
  return {
    cell: `${screen} ${count} ${place}`,
    faults: faultsWith(screen, PLACES[place](backs)),
    wanted: [...others(screen), ...backWords(screen, count, place === 'scrolled')].toSorted(),
  };
};

const IN_REACH = ' in reach while listening';

const REACH = ['Plant Psalms 1:1-3', 'Add verses', 'Any passage'];

const REACH_KINDS: readonly (readonly string[])[] = [...REACH.map((name) => [name]), REACH];

/** One cell of the listening table: the clause's faults `names` add, under the host or outside it, on `screen`, with `Listening` under the host or not. */
const reachCell = (
  screen: string,
  listening: boolean,
  place: 'host' | 'outside',
  names: readonly string[],
) => {
  const host = screenFrame(screen);
  if (listening) host.append(element('button', 'Listening', 'Listening'));
  const node = document.createElement('div');
  node.append(...names.map((name) => element('button', name, name)));
  if (place === 'host') host.append(node);
  if (place === 'outside') document.body.append(node);
  const all = rootFaults(host, 'read');
  node.remove();
  host.remove();
  return {
    cell: `${screen} listening=${listening} ${place} ${names.join('+')}`,
    added: all.filter((fault) => fault.endsWith(IN_REACH)).toSorted(),
    wanted: names
      .filter(() => listening)
      .map((name) => `${name}${IN_REACH}`)
      .toSorted(),
  };
};

describe("the root's rule at the Add verses sheet's seams", () => {
  it('faults Your field on Add a passage, and keeps it on About', () => {
    const cells = {
      adding: faultsWith(ADDING, [addBack(), element('button', 'Your field', '‹ Your field')]),
      about: faultsWith('About', [element('button', 'Your field', '‹ Your field')]),
    };
    expect(cells).toEqual({ adding: [`Your field on ${ADDING}`], about: [] });
    expect(Object.keys(cells).length).toBe(2);
  });

  it('holds the Add verses back to exactly one outside a scroll view on Add a passage, and none elsewhere', () => {
    const cells = SCREENS.flatMap((screen) =>
      [0, 1, 2].flatMap((count) =>
        (['fixed', 'scrolled'] as const).map((place) => backCell(screen, count, place)),
      ),
    );
    expect(
      cells.filter((each) => JSON.stringify(each.faults) !== JSON.stringify(each.wanted)),
    ).toEqual([]);
    expect(cells.find((each) => each.cell === `${ADDING} 1 fixed`)?.faults).toEqual([]);
    expect(cells.length).toBe(54);
  });

  it("takes home's own Add verses for no back", () => {
    const cells = SCREENS.map((screen) => ({
      screen,
      faults: faultsWith(screen, [element('button', 'Add verses', 'Add verses')]),
      wanted: faultsWith(screen, []),
    }));
    expect(
      cells.filter((each) => JSON.stringify(each.faults) !== JSON.stringify(each.wanted)),
    ).toEqual([]);
    expect(cells.find((each) => each.screen === ADDING)?.faults).toContain(
      `no Add verses back on ${ADDING}`,
    );
    expect(cells.length).toBe(9);
  });

  it('names Plant <title>, Add verses and Any passage anywhere in the document while a recital listens, and nothing while not', () => {
    const cells = SCREENS.flatMap((screen) =>
      [true, false].flatMap((listening) =>
        (['host', 'outside'] as const).flatMap((place) =>
          REACH_KINDS.map((names) => reachCell(screen, listening, place, names)),
        ),
      ),
    );
    expect(
      cells.filter((each) => JSON.stringify(each.added) !== JSON.stringify(each.wanted)),
    ).toEqual([]);
    expect(cells.length).toBe(144);
  });
});
