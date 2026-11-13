/**
 * hsintro's rule (`introRuleFaults` in `src/test/root-rule.ts`) as
 * `rootFaults` holds every frame of every rig to it, with no app: bare
 * frames of the welcome, of how a verse grows (first run and replay) and
 * of home with and without its tips hold no fault, and each frame that
 * breaks one clause names exactly that clause's fault beside the bare
 * frame's.
 *
 * It is the guard of the lesson `heartseed-first-open`: a first open that
 * never says what the app is, or a home whose tips stray, double or cover
 * a control, fails every rig that mounts the root.
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

const button = (label: string) => element('button', label);

/** `make`'s nodes when `flag` holds, else none. */
const when = (flag: boolean, make: () => readonly Element[]) =>
  [make].filter(() => flag).flatMap((each) => each());

/** A scroll view as the rule finds one, holding `nodes`. */
const scrollOf = (nodes: readonly Element[]) => {
  const node = document.createElement('div');
  node.setAttribute('style', 'overflow-y: auto');
  node.append(...nodes);
  return node;
};

/** The faults of a frame headed `screen` holding `scrolled` in a scroll view above `fixed`, sorted. */
const faultsOf = (screen: string, scrolled: readonly Element[], fixed: readonly Element[]) => {
  const host = document.createElement('div');
  host.append(scrollOf([element('heading', screen), ...scrolled]), ...fixed);
  document.body.append(host);
  const faults = rootFaults(host, 'read').toSorted();
  host.remove();
  return faults;
};

const welcome = (
  scrolled: readonly Element[] = [],
  fixed: readonly Element[] = [button('Begin'), button('Skip')],
) => faultsOf('Heartseed', [tagged('growing'), ...scrolled], fixed);

const grows = (
  scrolled: readonly Element[] = [],
  fixed: readonly Element[] = [button('Plant your first verse')],
) => faultsOf('Every verse is a plant', scrolled, fixed);

/** A plant's button, named `<reference>, seed`. */
const plant = () => {
  const node = element('button', 'Made 1:1, seed', '');
  node.setAttribute('data-testid', 'field-plant');
  return node;
};

/** Home: `Start` and `fixed` above a scroll view of a plant, `Add a list`, the end rows and `scrolled`; with `tips`, tip-1 under `Start`, tip-2 under the plant, tip-3 under `Add a list` and `Got it` fixed below. */
const home = ({
  tips = false,
  fixed = [] as readonly Element[],
  scrolled = [] as readonly Element[],
  foot = [] as readonly Element[],
  how = 1,
  add = true,
} = {}) => {
  const host = document.createElement('div');
  const addList = element('button', 'Add a list');
  addList.setAttribute('data-testid', 'add-list');
  host.append(
    element('heading', 'Your field'),
    button('Start'),
    ...when(tips, () => [tagged('tip-1', '1 Come back each day.')]),
    ...fixed,
    scrollOf([
      plant(),
      ...when(tips, () => [tagged('tip-2', '2 A list is a set of verses.')]),
      ...when(add, () => [addList]),
      ...when(tips && add, () => [tagged('tip-3', '3 Add a psalm.')]),
      button('Settings'),
      ...Array.from({ length: how }, () => button('How Heartseed works')),
      ...scrolled,
    ]),
    ...when(tips, () => [button('Got it')]),
    ...foot,
  );
  document.body.append(host);
  const faults = rootFaults(host, 'read').toSorted();
  host.remove();
  return faults;
};

describe('the rule of the screens before the first verse and of home’s tips', () => {
  it('holds no fault on bare frames of the welcome, how a verse grows and home with and without its tips', () => {
    expect({
      welcome: welcome(),
      lone: welcome([], [button('Begin')]),
      grows: grows(),
      replay: grows([], [button('See your field')]),
      home: home(),
      tips: home({ tips: true }),
      limit: home({ tips: true, add: false }),
    }).toEqual({ welcome: [], lone: [], grows: [], replay: [], home: [], tips: [], limit: [] });
  });

  it('names one fault for each clause a frame breaks', () => {
    const word = tagged('word-0', 'Fear');
    const tipButton = tagged('tip-3', '3 A list');
    tipButton.append(button('Open'));
    const cases: readonly (readonly [string, readonly string[], readonly string[]])[] = [
      ['no Begin', welcome([], [button('Skip')]), ['0 Begin on Heartseed']],
      [
        'two Begin',
        welcome([], [button('Begin'), button('Begin'), button('Skip')]),
        ['2 Begin on Heartseed'],
      ],
      [
        'two Skip',
        welcome([], [button('Begin'), button('Skip'), button('Skip')]),
        ['2 Skip on Heartseed'],
      ],
      [
        'Begin scrolled',
        welcome([button('Begin')], [button('Skip')]),
        ['Begin inside the scroll view'],
      ],
      [
        'Listen on the welcome',
        welcome([], [button('Begin'), button('Skip'), button('Listen')]),
        ['Listen on Heartseed'],
      ],
      ['a word node', welcome([word]), ["a node of the verse's phases or Today on Heartseed"]],
      [
        'the reading view',
        grows([tagged('reading')]),
        ["a node of the verse's phases or Today on Every verse is a plant"],
      ],
      [
        'a stage',
        grows([tagged('stage')]),
        [
          "a node of the verse's phases or Today on Every verse is a plant",
          "Today's stage on Every verse is a plant",
        ],
      ],
      [
        'home on the welcome',
        welcome([tagged('sown', '1 day sown')]),
        ["home's sown on Heartseed"],
      ],
      [
        'two buttons on grows',
        grows([], [button('Plant your first verse'), button('See your field')]),
        ['2 controls on Every verse is a plant'],
      ],
      ['no button on grows', grows([], []), ['0 controls on Every verse is a plant']],
      [
        'grows scrolled',
        grows([button('See your field')], []),
        ['See your field inside the scroll view'],
      ],
      ['Begin on home', home({ fixed: [button('Begin')] }), ['Begin on Your field']],
      [
        'See your field on home',
        home({ foot: [button('See your field')] }),
        ['See your field on Your field'],
      ],
      [
        'Plant your first verse on hear',
        faultsOf('Hear it', [], [button('Plant your first verse')]),
        ['Plant your first verse on Hear it'],
      ],
      [
        'a tip on Today',
        faultsOf('Today', [tagged('tip-1')], [button('Your field')]),
        ['a tip on Today'],
      ],
      [
        'Got it on About',
        faultsOf('About', [], [button('Got it'), button('Your field'), button('Licences')]),
        ['Got it on About'],
      ],
      [
        'four tips',
        home({ tips: true, scrolled: [tagged('tip-4')] }),
        ['the tips tip-1|tip-2|tip-3|tip-4'],
      ],
      [
        'a tip twice',
        home({ tips: true, scrolled: [tagged('tip-3')] }),
        ['the tips tip-1|tip-2|tip-3|tip-3'],
      ],
      ['no Got it', home({ fixed: [tagged('tip-1')] }), ['0 Got it for 1 tips']],
      ['Got it with no tip', home({ foot: [button('Got it')] }), ['1 Got it for 0 tips']],
      ['two Got it', home({ tips: true, foot: [button('Got it')] }), ['2 Got it for 3 tips']],
      [
        'Got it scrolled',
        home({ fixed: [tagged('tip-1')], scrolled: [button('Got it')] }),
        ['Got it inside the scroll view'],
      ],
      [
        'tip-1 scrolled',
        home({ scrolled: [tagged('tip-1')], foot: [button('Got it')] }),
        ['tip-1 inside the scroll view'],
      ],
      [
        'tip-3 fixed',
        home({ fixed: [tagged('tip-3')], foot: [button('Got it')] }),
        ['tip-3 outside the scroll view'],
      ],
      [
        'tip-3 at the limit',
        home({ add: false, scrolled: [tagged('tip-3')], foot: [button('Got it')] }),
        ['tip-3 without Add a list'],
      ],
      [
        'a control in a tip',
        home({ scrolled: [tipButton], foot: [button('Got it')] }),
        ['a control in tip-3'],
      ],
      ['no How Heartseed works', home({ how: 0 }), ['0 How Heartseed works on Your field']],
      ['two How Heartseed works', home({ how: 2 }), ['2 How Heartseed works on Your field']],
      [
        'How Heartseed works fixed',
        home({ fixed: [button('How Heartseed works')] }),
        ['2 How Heartseed works on Your field', 'How Heartseed works outside the scroll view'],
      ],
    ];
    for (const [name, faults, want] of cases)
      expect({ name, faults }).toEqual({ name, faults: [...want].toSorted() });
  });
});
