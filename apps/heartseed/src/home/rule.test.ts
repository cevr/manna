/* oxlint-disable effect/noGlobals -- a frame-rule table: it builds happy-dom nodes by hand in the document the rule reads. */

/**
 * Home's rule (hsstart's guard, `homeRuleFaults` in `src/test/root-rule.ts`)
 * as `rootFaults` holds every frame of every rig to it, with no app: a bare
 * frame of home with its one `Settings` row in the scroll view and the
 * Today card's `Start` above it holds no fault, and each frame that breaks
 * one clause names exactly that clause's fault beside the bare frame's
 * faults: `When I need…` on home and on Today, each of home's old nodes
 * (`counts`, `add-verses`, `add-row`), two `Add a list`, two primary
 * actions of each pair the cards can show (`Start`, `Practice anyway`,
 * `Practice <reference>`, `Learn <reference>`), each primary action inside
 * the scroll view, `Settings` outside it, and a number under a plant. Off
 * home the same nodes are no home fault.
 *
 * It catches a home whose one action is doubled or scrolled away, a gear or
 * a foot left in the fixed top, an old node kept, and a plant numbered.
 */

import { describe, expect, it } from 'bun:test';

import { rootFaults } from '../test/root-rule';

const element = (role: string, label: string, words = label) => {
  const node = document.createElement('div');
  node.setAttribute('role', role);
  node.setAttribute('aria-label', label);
  node.textContent = words;
  return node;
};

const tagged = (id: string, words = '') => {
  const node = document.createElement('div');
  node.setAttribute('data-testid', id);
  node.textContent = words;
  return node;
};

/** A scroll view as the rule finds one, holding `nodes`. */
const scrollOf = (nodes: readonly Element[]) => {
  const node = document.createElement('div');
  node.setAttribute('style', 'overflow-y: auto');
  node.append(...nodes);
  return node;
};

/** A plant's button, its name `<reference>, seed`, holding `words` as its one text. */
const plant = (words: string) => {
  const node = element('button', 'Made 1:1, seed', '');
  node.setAttribute('data-testid', 'field-plant');
  node.append(tagged('plant-image', words));
  return node;
};

/** The faults of a frame headed `screen` holding `fixed` above a scroll view of `scrolled`, sorted. */
const faultsOf = (screen: string, fixed: readonly Element[], scrolled: readonly Element[]) => {
  const host = document.createElement('div');
  host.append(element('heading', screen), ...fixed, scrollOf(scrolled));
  document.body.append(host);
  const faults = rootFaults(host, 'read').toSorted();
  host.remove();
  return faults;
};

const settings = () => element('button', 'Settings');
const how = () => element('button', 'How Heartseed works');
const start = () => element('button', 'Start');

/** Home's bare frame: `Start` fixed, a plant and the `Settings` row scrolled, with `fixed` and `scrolled` beside them. */
const home = (fixed: readonly Element[] = [], scrolled: readonly Element[] = []) =>
  faultsOf('Your field', [start(), ...fixed], [plant(''), settings(), how(), ...scrolled]);

const PRIMARY = ['Start', 'Practice anyway', 'Practice Isaiah 41:10', 'Learn Psalms 91:1'];

describe("home's rule", () => {
  it('holds no fault on a bare frame of home', () => {
    expect(home()).toEqual([]);
  });

  it('names one fault for each clause a frame of home breaks', () => {
    const bare = (fixed: readonly Element[], scrolled: readonly Element[]) =>
      faultsOf('Your field', fixed, [plant(''), settings(), how(), ...scrolled]);
    const cells = [
      { frame: home([element('button', 'When I need…')]), fault: 'When I need… on Your field' },
      { frame: home([tagged('counts', '1 to tend')]), fault: "home's old counts" },
      { frame: home([], [tagged('add-verses')]), fault: "home's old add-verses" },
      { frame: home([], [tagged('add-row')]), fault: "home's old add-row" },
      {
        frame: home([], [element('button', 'Add a list'), element('button', 'Add a list')]),
        fault: '2 Add a list controls',
      },
      ...PRIMARY.flatMap((first, at) =>
        PRIMARY.slice(at + 1).map((second) => ({
          frame: bare([element('button', first), element('button', second)], []),
          fault: `2 primary actions: ${first}, ${second}`,
        })),
      ),
      ...PRIMARY.map((name) => ({
        frame: bare([], [element('button', name)]),
        fault: `${name} inside the scroll view`,
      })),
      {
        frame: faultsOf('Your field', [start(), settings()], [plant(''), how()]),
        fault: 'Settings outside the scroll view',
      },
      {
        frame: faultsOf('Your field', [start()], [plant('10'), settings(), how()]),
        fault: 'a number in Made 1:1, seed',
      },
    ];
    expect(
      cells
        .filter(({ frame, fault }) => JSON.stringify(frame) !== JSON.stringify([fault]))
        .map(({ frame, fault }) => `${fault}: ${frame.join('; ')}`),
    ).toEqual([]);
    expect(cells).toHaveLength(17);
  });

  it('names When I need… on Today, and holds home’s clauses on no other screen', () => {
    const today = (nodes: readonly Element[]) =>
      faultsOf('Today', [element('button', 'Your field'), ...nodes], []);
    expect(today([element('button', 'When I need…')])).toEqual([
      ...today([]),
      'When I need… on Today',
    ]);
    expect(
      today([
        tagged('add-row'),
        element('button', 'Add a list'),
        element('button', 'Add a list'),
        element('button', 'Practice anyway'),
        element('button', 'Learn Psalms 91:1'),
      ]),
    ).toEqual(today([]));
  });
});

describe('the word range clause (hspiece)', () => {
  it('names a word range in a text and in an accessible name on any screen, the pending frame too, and nothing for a reference alone', () => {
    const today = (nodes: readonly Element[]) =>
      faultsOf('Today', [element('button', 'Your field'), ...nodes], []);
    const reference = (words: string) => tagged('reference', words);
    expect(today([reference('Psalms 91:1 [1-9]')])).toEqual(
      [...today([reference('Psalms 91:1')]), 'a word range [1-9] in a text'].toSorted(),
    );
    expect(today([element('img', 'Psalms 91:1 [10-19], seed', '')])).toEqual(
      [
        ...today([element('img', 'Psalms 91:1, seed', '')]),
        'a word range [10-19] in a name',
      ].toSorted(),
    );
    expect(home([], [plant('Psalms 91:2 [7-13]')])).toEqual(['a word range [7-13] in a text']);
    const named = plant('');
    named.setAttribute('aria-label', 'Psalms 91:2 [7-13], seed');
    expect(home([], [named])).toEqual(['a word range [7-13] in a name']);
    const pending = (words: string) => {
      const host = document.createElement('div');
      host.append(reference(words));
      document.body.append(host);
      const faults = rootFaults(host, 'read');
      host.remove();
      return faults;
    };
    expect(pending('Psalms 91:1 [1-9]')).toEqual([
      ...pending('Psalms 91:1'),
      'a word range [1-9] in a text',
    ]);
    const near = today([element('img', 'Psalms 91:1 [x-9]', '[1–9] [1 - 9] 1-9')]);
    expect(near.filter((fault) => fault.startsWith('a word range'))).toEqual([]);
  });
});
