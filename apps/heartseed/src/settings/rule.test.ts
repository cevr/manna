/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- a frame-rule table: it builds happy-dom nodes by hand in the document the rule reads, and awaits the microtask in which happy-dom hands the sheet's watch its frames. */

/**
 * The root's choices rule (`choicesFaults` in `src/test/root-rule.ts`), whole
 * over its domain, with no app: every screen a root frame shows by its
 * heading, and the pending frame, × each kind of choice (the `Minutes`
 * group, each `<n> min` radio, the `Voice` button) alone and all together.
 * A kind under the host is the fault `<name> on <screen>` in every cell, on
 * every screen; the pending frame keeps its own rule. The same kinds
 * outside the host, where the Settings sheet lies, are no fault while
 * nothing listens, nor is anything that makes the plan.
 *
 * The root's listening clause (`listeningFaults` in the same file), whole
 * over its domain: every screen × `Listening` under the host or not × the
 * place (under the host, or a node appended to the document's body outside
 * it, where the sheet's portal lies) × each kind alone and all together
 * (`Settings`, `Your field`, `Plant`, `Remove`, a `Remove <reference>`, the
 * four `<n> min` radios, `Voice`, the `Minutes` group, an `[aria-modal]`
 * node). While listening, the faults ending ` in reach while listening` are
 * exactly the kinds' names; while not, none; the frame's bare faults stay.
 *
 * The Settings sheet's look floor (`watchSheet` in `src/test/settings-rig.ts`),
 * with no app: a modal built by hand under an ancestor at opacity 0 has no
 * look-checked frame, and is the fault `a sheet shown with its look never
 * checked` whether it leaves or still shows at the watch's stop; the same
 * modal drawn is none.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';

import { rootFaults } from '../test/root-rule';
import { watchSheet } from '../test/settings-rig';

const SCREENS = [
  'Your field',
  'Today',
  'Add a passage',
  'About',
  'Hear it',
  'Say it with help',
  'Say it alone',
  'Planted',
];

/** Each kind of choice and the name the rule's words give it. */
const NAMES = {
  group: 'Minutes',
  '2 min': '2 min',
  '5 min': '5 min',
  '10 min': '10 min',
  '20 min': '20 min',
  Voice: 'Voice',
} as const;

type Kind = keyof typeof NAMES;

const RADIOS: readonly Kind[] = ['2 min', '5 min', '10 min', '20 min'];

const ALL: readonly Kind[] = ['group', '2 min', '5 min', '10 min', '20 min', 'Voice'];

const KINDS: readonly (readonly Kind[])[] = [...ALL.map((kind) => [kind]), ALL];

/** The faults the rule's words name for `kinds` on `screen`, sorted. */
const wanted = (kinds: readonly Kind[], screen: string) =>
  kinds.map((kind) => `${NAMES[kind]} on ${screen}`).toSorted();

const element = (role: string, label: string, words: string) => {
  const node = document.createElement('div');
  node.setAttribute('role', role);
  node.setAttribute('aria-label', label);
  node.textContent = words;
  return node;
};

/** The kinds as the app draws them: the radios inside the group when both are given, else each alone. */
const kindsNode = (kinds: readonly Kind[]) => {
  const node = document.createElement('div');
  const radios = kinds
    .filter((kind) => RADIOS.includes(kind))
    .map((kind) => element('radio', kind, kind));
  const group = element('radiogroup', 'Minutes', '');
  if (kinds.includes('group')) group.append(...radios);
  if (kinds.includes('group')) node.append(group);
  if (!kinds.includes('group')) node.append(...radios);
  if (kinds.includes('Voice')) node.append(element('button', 'Voice', 'Voice: Her'));
  return node;
};

/** A frame of `screen` by its one heading, added to the document. */
const screenFrame = (screen: string) => {
  const host = document.createElement('div');
  host.append(element('heading', screen, screen));
  document.body.append(host);
  return host;
};

/** The pending frame: its reference alone, added to the document. */
const pendingFrame = () => {
  const host = document.createElement('div');
  const reference = document.createElement('div');
  reference.setAttribute('data-testid', 'reference');
  reference.textContent = 'Isaiah 41:10';
  host.append(reference);
  document.body.append(host);
  return host;
};

/** One cell of the table: the faults `kinds` add to the frame's own, and whether the frame's own stayed as they were. */
const cellOf = (screen: string, kinds: readonly Kind[]) => {
  const host = screenFrame(screen);
  const bare = rootFaults(host, 'read');
  host.append(kindsNode(kinds));
  const all = rootFaults(host, 'read');
  host.remove();
  return {
    cell: `${screen} ${kinds.join('+')}`,
    kept: all.slice(0, bare.length).join('\n') === bare.join('\n'),
    added: all.slice(bare.length).toSorted(),
    wanted: wanted(kinds, screen),
  };
};

describe("the root's choices rule", () => {
  it('names each choice under the host on every screen', () => {
    const cells = SCREENS.flatMap((screen) => KINDS.map((kinds) => cellOf(screen, kinds)));
    expect(
      cells.filter(
        (each) => !each.kept || JSON.stringify(each.added) !== JSON.stringify(each.wanted),
      ),
    ).toEqual([]);
    expect(cells.length).toBe(SCREENS.length * KINDS.length);
  });

  it('leaves the pending frame to its own rule', () => {
    const seen = KINDS.map((kinds) => {
      const host = pendingFrame();
      host.append(kindsNode(kinds));
      const faults = rootFaults(host, 'read');
      host.remove();
      return {
        cell: kinds.join('+'),
        controls: kinds.some((kind) => kind !== 'group'),
        faults,
      };
    });
    expect(
      seen.filter(
        ({ controls, faults }) =>
          (controls && faults.length === 0) ||
          faults.some((fault) => !fault.startsWith('the pending frame with')),
      ),
    ).toEqual([]);
  });

  it('counts no choice and nothing that makes the plan outside the host while nothing listens', () => {
    const added = SCREENS.map((screen) => {
      const host = screenFrame(screen);
      const bare = rootFaults(host, 'read');
      const sheet = kindsNode(ALL);
      sheet.append(reachNode(REACH));
      document.body.append(sheet);
      const faults = rootFaults(host, 'read');
      sheet.remove();
      host.remove();
      return { screen, same: JSON.stringify(faults) === JSON.stringify(bare) };
    });
    expect(added.filter((each) => !each.same)).toEqual([]);
    expect(added.length).toBe(SCREENS.length);
  });
});

const IN_REACH = ' in reach while listening';

/** Each kind the listening clause reads, and the name the clause's words give it. */
const REACH_NAMES = {
  Settings: 'Settings',
  'Your field': 'Your field',
  Plant: 'Plant',
  Remove: 'Remove',
  'Remove Isaiah 41:10': 'Remove Isaiah 41:10',
  '2 min': '2 min',
  '5 min': '5 min',
  '10 min': '10 min',
  '20 min': '20 min',
  Voice: 'Voice',
  group: 'Minutes',
  modal: 'a sheet',
} as const;

type Reach = keyof typeof REACH_NAMES;

const REACH: readonly Reach[] = [
  'Settings',
  'Your field',
  'Plant',
  'Remove',
  'Remove Isaiah 41:10',
  '2 min',
  '5 min',
  '10 min',
  '20 min',
  'Voice',
  'group',
  'modal',
];

const REACH_KINDS: readonly (readonly Reach[])[] = [...REACH.map((kind) => [kind]), REACH];

const REACH_RADIOS: readonly Reach[] = ['2 min', '5 min', '10 min', '20 min'];

const BUTTONS: readonly Reach[] = [
  'Settings',
  'Your field',
  'Plant',
  'Remove',
  'Remove Isaiah 41:10',
];

/** The listening clause's kinds as the app draws them: the radios inside the group when both are given, the rest each alone. */
const reachNode = (kinds: readonly Reach[]) => {
  const node = document.createElement('div');
  for (const kind of BUTTONS.filter((each) => kinds.includes(each)))
    node.append(element('button', kind, kind));
  const radios = REACH_RADIOS.filter((kind) => kinds.includes(kind)).map((kind) =>
    element('radio', kind, kind),
  );
  const group = element('radiogroup', 'Minutes', '');
  if (kinds.includes('group')) group.append(...radios);
  if (kinds.includes('group')) node.append(group);
  if (!kinds.includes('group')) node.append(...radios);
  if (kinds.includes('Voice')) node.append(element('button', 'Voice', 'Voice: Her'));
  if (kinds.includes('modal')) {
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    node.append(modal);
  }
  return node;
};

/** A fault of a control owed and missing on a bare frame, which a kind under the host supplies. */
const owed = (fault: string) => fault.startsWith('no ') || / Settings controls on /.test(fault);

/** One cell of the listening table: the clause's faults that `kinds` add, placed under the host or outside it, on `screen`, with `Listening` under the host or not. */
const reachCell = (
  screen: string,
  listening: boolean,
  place: 'host' | 'outside',
  kinds: readonly Reach[],
) => {
  const host = screenFrame(screen);
  if (listening) host.append(element('button', 'Listening', 'Listening'));
  const bare = rootFaults(host, 'read');
  const node = reachNode(kinds);
  if (place === 'host') host.append(node);
  if (place === 'outside') document.body.append(node);
  const all = rootFaults(host, 'read');
  node.remove();
  host.remove();
  const rest = all.filter((fault) => !fault.endsWith(IN_REACH));
  return {
    cell: `${screen} listening=${listening} ${place} ${kinds.join('+')}`,
    kept:
      (place === 'outside' && JSON.stringify(rest) === JSON.stringify(bare)) ||
      (place === 'host' && bare.every((fault) => owed(fault) || all.includes(fault))),
    added: all.filter((fault) => fault.endsWith(IN_REACH)).toSorted(),
    wanted: kinds
      .filter(() => listening)
      .map((kind) => `${REACH_NAMES[kind]}${IN_REACH}`)
      .toSorted(),
  };
};

describe("the root's listening clause", () => {
  it('names everything that makes the plan anywhere in the document while a recital listens, and nothing else', () => {
    const cells = SCREENS.flatMap((screen) =>
      [true, false].flatMap((listening) =>
        (['host', 'outside'] as const).flatMap((place) =>
          REACH_KINDS.map((kinds) => reachCell(screen, listening, place, kinds)),
        ),
      ),
    );
    expect(
      cells.filter(
        (each) => !each.kept || JSON.stringify(each.added) !== JSON.stringify(each.wanted),
      ),
    ).toEqual([]);
    expect(cells.length).toBe(SCREENS.length * 2 * 2 * REACH_KINDS.length);
    expect(cells.length).toBe(416);
  });
});

const UNLOOKED = 'a sheet shown with its look never checked';

/** Lets the watch's observer take the frames made so far: happy-dom delivers them in a microtask, which React's `act` drains. */
const settle = () => act(async () => {});

/** A modal node built by hand, as react-native-web draws a sheet, inside a wrapper at `opacity` added to the document. */
const shownModal = (opacity: string) => {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('style', `opacity: ${opacity}`);
  const modal = document.createElement('div');
  modal.setAttribute('aria-modal', 'true');
  wrapper.append(modal);
  document.body.append(wrapper);
  return wrapper;
};

/** The look-floor faults and counts of one sheet shown at `opacity`, removed before the watch stops when `removed`. */
const episode = async (opacity: string, removed: boolean) => {
  const watch = watchSheet();
  const wrapper = shownModal(opacity);
  await settle();
  if (removed) wrapper.remove();
  await settle();
  watch.stop();
  wrapper.remove();
  return {
    unlooked: watch.faults.includes(UNLOOKED),
    open: watch.frames.open > 0,
    looked: watch.frames.looked,
  };
};

describe("the Settings sheet's look floor", () => {
  it('faults each sheet shown with no look-checked frame, gone or still open, and no sheet drawn', async () => {
    expect({
      hidden: await episode('0', true),
      hiddenOpen: await episode('0', false),
      drawn: await episode('1', true),
      drawnOpen: await episode('1', false),
    }).toEqual({
      hidden: { unlooked: true, open: true, looked: 0 },
      hiddenOpen: { unlooked: true, open: true, looked: 0 },
      drawn: { unlooked: false, open: true, looked: 1 },
      drawnOpen: { unlooked: false, open: true, looked: 1 },
    });
  });
});
