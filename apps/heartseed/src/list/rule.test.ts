/* oxlint-disable effect/noGlobals -- a frame-rule table: it builds happy-dom nodes by hand in the document the rule reads. */

/**
 * The list rule (hslist's guard, `listRuleFaults` and home's `Open` and
 * `Remove` clauses in `src/test/root-rule.ts`) as `rootFaults` holds every
 * frame of every rig to it, with no app. A bare frame of home whose one
 * furrow holds its `Open <title>`, and a bare frame of a list's own page
 * (found by `id=list-screen`: its one heading the list's title, `Your
 * field` and `Practice this list` fixed, its rows, `Remove <name>` and the
 * ask in the scroll view) hold no fault; each frame that breaks one clause
 * names exactly that clause's faults. On home: a `Remove` or a `Remove
 * <name>`, a furrow with no `Open <title>` or with two, and an `Open …`
 * outside a furrow. On the page: two headings, no `Your field`, two, or
 * one in the scroll view, two `Practice this list` or one in the scroll
 * view, a `Remove <name>` or the ask outside the scroll view, Today's
 * action or node, and home's `today-card`, `chosen` or `add-list`. Off the
 * page, `Practice this list`.
 *
 * It catches a furrow's title that is no door again (the owner's note 4 of
 * 2026-11-11), a remove back on home, and a list page whose way back,
 * practice or remove moved.
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

const tagged = (id: string, words = '', children: readonly Element[] = []) => {
  const node = document.createElement('div');
  node.setAttribute('data-testid', id);
  node.textContent = words;
  node.append(...children);
  return node;
};

/** A scroll view as the rule finds one, holding `nodes`. */
const scrollOf = (nodes: readonly Element[]) => {
  const node = document.createElement('div');
  node.setAttribute('style', 'overflow-y: auto');
  node.append(...nodes);
  return node;
};

/** The faults of `nodes` under one host, sorted. */
const faultsOf = (nodes: readonly Element[]) => {
  const host = document.createElement('div');
  host.append(...nodes);
  document.body.append(host);
  const faults = rootFaults(host, 'read').toSorted();
  host.remove();
  return faults;
};

const TITLE = 'Protection & Fear';

/** A furrow's row on home titled `title`, holding `controls`. */
const row = (title: string, controls: readonly Element[]) =>
  tagged('row', '', [tagged('row-title', title), ...controls]);

/** Home's frame: its heading and `Start` fixed, then in the scroll view the furrows `rows`, `Settings` and `scrolled`. */
const home = (rows: readonly Element[], scrolled: readonly Element[] = []) =>
  faultsOf([
    element('heading', 'Your field'),
    element('button', 'Start'),
    scrollOf([...rows, element('button', 'Settings'), ...scrolled]),
  ]);

const opened = () => row(TITLE, [element('button', `Open ${TITLE}`)]);

/** A list's own page: `fixed` above the scroll view of `scrolled`, all under `id=list-screen`. */
const page = (fixed: readonly Element[], scrolled: readonly Element[]) =>
  faultsOf([tagged('list-screen', '', [...fixed, scrollOf(scrolled)])]);

const heading = () => element('heading', TITLE);
const back = () => element('button', 'Your field', '‹ Your field');
const practice = () => element('button', 'Practice this list');
const listRow = () => {
  const node = element('button', 'Psalms 91:1, not planted');
  node.setAttribute('data-testid', 'list-row');
  return node;
};
const remove = () => element('button', 'Remove Psalms 91:1-16', 'Remove this list');
const ask = () => tagged('ask', 'Remove Psalms 91:1-16? Its plants stay in your field.');

/** The bare page with `fixed` and `scrolled` beside its own nodes. */
const bare = (fixed: readonly Element[] = [], scrolled: readonly Element[] = []) =>
  page([heading(), back(), practice(), ...fixed], [listRow(), remove(), ...scrolled]);

describe('the list rule', () => {
  it('holds no fault on a bare frame of home or of a list’s own page', () => {
    expect([home([opened()]), bare(), page([heading(), back()], [listRow(), ask()])]).toEqual([
      [],
      [],
      [],
    ]);
  });

  it('names each clause a frame of home or of a list’s own page breaks', () => {
    const cells = [
      {
        frame: home([row(TITLE, [element('button', `Open ${TITLE}`), remove()])]),
        faults: ['Remove Psalms 91:1-16 on home'],
      },
      { frame: home([opened()], [element('button', 'Remove')]), faults: ['Remove on home'] },
      {
        frame: home([row(TITLE, [])]),
        faults: [`0 Open ${TITLE} in its row`, '0 Open controls for 1 rows'],
      },
      {
        frame: home([
          row(TITLE, [element('button', `Open ${TITLE}`), element('button', `Open ${TITLE}`)]),
        ]),
        faults: [`2 Open ${TITLE} in its row`, '2 Open controls for 1 rows'],
      },
      {
        frame: home([opened()], [element('button', 'Open Made 1:1')]),
        faults: ['2 Open controls for 1 rows'],
      },
      {
        frame: bare([element('heading', 'Your field')]),
        faults: [`the headings ${TITLE}|Your field`],
      },
      {
        frame: page([heading(), practice()], [listRow(), remove()]),
        faults: [`no Your field on ${TITLE}`],
      },
      { frame: bare([back()]), faults: [`2 Your field controls on ${TITLE}`] },
      {
        frame: page([heading(), practice()], [back(), listRow(), remove()]),
        faults: [`Your field inside a scroll view on ${TITLE}`],
      },
      { frame: bare([practice()]), faults: ['2 Practice this list'] },
      {
        frame: page([heading(), back()], [practice(), listRow(), remove()]),
        faults: ['Practice this list inside the scroll view'],
      },
      {
        frame: page([heading(), back(), practice(), remove()], [listRow()]),
        faults: ['Remove Psalms 91:1-16 outside the scroll view'],
      },
      {
        frame: page([heading(), back(), ask()], [listRow()]),
        faults: ['the ask outside the scroll view'],
      },
      { frame: bare([element('button', 'Say it')]), faults: [`Say it on ${TITLE}`] },
      { frame: bare([tagged('session', '1 to tend')]), faults: [`Today's session on ${TITLE}`] },
      {
        frame: bare([tagged('today-card')]),
        faults: [`home's today-card on ${TITLE}`, "home's today-card on a list"],
      },
      {
        frame: bare([tagged('chosen')]),
        faults: [`home's chosen on ${TITLE}`, "home's chosen on a list"],
      },
      { frame: bare([], [tagged('add-list')]), faults: ["home's add-list on a list"] },
      {
        frame: faultsOf([element('heading', 'Today'), back(), practice()]),
        faults: ['Practice this list on Today'],
      },
    ];
    expect(
      cells
        .filter(({ frame, faults }) => JSON.stringify(frame) !== JSON.stringify(faults))
        .map(({ frame, faults }) => `${faults.join(', ')}: ${frame.join('; ')}`),
    ).toEqual([]);
    expect(cells).toHaveLength(19);
  });
});
