/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- a frame-rule table: it builds happy-dom nodes by hand in the document the rule reads, and awaits the microtask in which happy-dom hands the sheet's watch its frames. */

/**
 * The root's choices rule (`choicesFaults` in `src/test/root-rule.ts`), whole
 * over its domain, with no app: every screen a root frame shows by its
 * heading, and the pending frame, × a host registered by the choices seam or
 * not × each kind of choice (the `Minutes` group, each `<n> min` radio, the
 * `Voice` button) alone and all together. A kind under the host is the fault
 * `<name> on <screen>` exactly when the cell is not Today under a registered
 * host; the pending frame keeps its own rule. The same kinds outside the
 * host, where the Settings sheet lies, are no fault.
 *
 * The Settings sheet's look floor (`watchSheet` in `src/test/settings-rig.ts`),
 * with no app: a modal built by hand under an ancestor at opacity 0 has no
 * look-checked frame, and is the fault `a sheet shown with its look never
 * checked` whether it leaves or still shows at the watch's stop; the same
 * modal drawn is none.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';

import { allowChoicesOnToday, rootFaults } from '../test/root-rule';
import { watchSheet } from '../test/settings-rig';

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

const SEAMS = [
  { seamed: false, word: 'unseamed' },
  { seamed: true, word: 'seamed' },
] as const;

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

/** A frame of `screen` by its one heading, added to the document, registered by the seam when `seamed`. */
const screenFrame = (screen: string, seamed: boolean) => {
  const host = document.createElement('div');
  host.append(element('heading', screen, screen));
  document.body.append(host);
  if (seamed) allowChoicesOnToday(host);
  return host;
};

/** The pending frame: its reference alone, added to the document, registered by the seam when `seamed`. */
const pendingFrame = (seamed: boolean) => {
  const host = document.createElement('div');
  const reference = document.createElement('div');
  reference.setAttribute('data-testid', 'reference');
  reference.textContent = 'Isaiah 41:10';
  host.append(reference);
  document.body.append(host);
  if (seamed) allowChoicesOnToday(host);
  return host;
};

/** One cell of the table: the faults `kinds` add to the frame's own, and whether the frame's own stayed as they were. */
const cellOf = (screen: string, seam: (typeof SEAMS)[number], kinds: readonly Kind[]) => {
  const host = screenFrame(screen, seam.seamed);
  const bare = rootFaults(host, 'read');
  host.append(kindsNode(kinds));
  const all = rootFaults(host, 'read');
  host.remove();
  const exempt = screen === 'Today' && seam.seamed;
  return {
    cell: `${screen} ${seam.word} ${kinds.join('+')}`,
    kept: all.slice(0, bare.length).join('\n') === bare.join('\n'),
    added: all.slice(bare.length).toSorted(),
    wanted: wanted(kinds, screen).filter(() => !exempt),
  };
};

describe("the root's choices rule", () => {
  it('names each choice under the host on every screen but Today under a seamed host', () => {
    const cells = SCREENS.flatMap((screen) =>
      SEAMS.flatMap((seam) => KINDS.map((kinds) => cellOf(screen, seam, kinds))),
    );
    expect(
      cells.filter(
        (each) => !each.kept || JSON.stringify(each.added) !== JSON.stringify(each.wanted),
      ),
    ).toEqual([]);
    expect(cells.length).toBe(SCREENS.length * 2 * KINDS.length);
  });

  it('leaves the pending frame to its own rule, seamed or not', () => {
    const seen = SEAMS.flatMap((seam) =>
      KINDS.map((kinds) => {
        const host = pendingFrame(seam.seamed);
        host.append(kindsNode(kinds));
        const faults = rootFaults(host, 'read');
        host.remove();
        return {
          cell: `${seam.word} ${kinds.join('+')}`,
          controls: kinds.some((kind) => kind !== 'group'),
          faults,
        };
      }),
    );
    expect(
      seen.filter(
        ({ controls, faults }) =>
          (controls && faults.length === 0) ||
          faults.some((fault) => !fault.startsWith('the pending frame with')),
      ),
    ).toEqual([]);
  });

  it('counts no choice outside the host, where the Settings sheet lies', () => {
    const added = ['Your field', 'Today', 'About'].flatMap((screen) =>
      SEAMS.map((seam) => {
        const host = screenFrame(screen, seam.seamed);
        const bare = rootFaults(host, 'read');
        const sheet = kindsNode(ALL);
        document.body.append(sheet);
        const faults = rootFaults(host, 'read').filter((fault) => !bare.includes(fault));
        sheet.remove();
        host.remove();
        return faults;
      }),
    );
    expect(added).toEqual([[], [], [], [], [], []]);
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
