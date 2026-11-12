/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noGlobals, eslint/no-await-in-loop -- a React screen test: it drives the root through the bar rig's promise-based taps, one list after another, reads happy-dom nodes whose absent attributes are null, and writes the device's stored lists as the store keeps them, in JSON. */

/**
 * A list's own page (hslist L3) as the reader meets it, opened from home by
 * each furrow's `Open <title>`, in light and in dark, through the bar rig
 * (`src/test/bar-rig.tsx`), which holds every frame to the root's rule
 * (one heading, `Your field` and `Practice this list` fixed, every
 * `Remove <name>` and the ask in the scroll view) and every seen text at
 * WCAG AA on what lies behind it (`Remove this list` in `miss` on the
 * ground among them). The device holds the promise, the Fear collection
 * taught, a held passage part grown, a held Handbook list with a verse
 * planted, and a loose verse. Each page reads, written out: its heading,
 * its caption, `Practice this list` and its line (or neither), each row's
 * reference and stage words in the list's order, each row a button named
 * as home's plant only where a tap starts its verse, and `Remove <name>`
 * only on the held passage and the Handbook list. Over unread passages a
 * page offers no remove.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { TAUGHT } from '../promises';
import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { DAY } from '../test/garden-model';
import { LISTS } from '../test/handbook-model';
import { setSystem } from '../test/look';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';
import { START } from '../test/clock';
import type { Scheme } from '../theme';

const by = (host: Element, id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];

/** The page shown: its heading, caption, `Practice this list` and its line, its rows (`<reference> · <stage words>`, then `→ <name>` on a button), and its `Remove …`. */
const pageOf = (host: Element) => ({
  heading: [...host.querySelectorAll('[role="heading"]')].map(text),
  caption: by(host, 'list-caption').map(text),
  practice: [...host.querySelectorAll('[role="button"]')]
    .map(labelOf)
    .filter((label) => label === 'Practice this list').length,
  line: by(host, 'list-line').map(text),
  rows: by(host, 'list-row').map((row) => {
    const words = `${text(row.querySelector('[data-testid="list-reference"]'))} · ${text(row.querySelector('[data-testid="list-stage"]'))}`;
    return row.getAttribute('role') === 'button' ? `${words} → ${labelOf(row)}` : words;
  }),
  remove: [...host.querySelectorAll('[role="button"]')]
    .map(labelOf)
    .filter((label) => label.startsWith('Remove ')),
});

/** The device: the promise planted two days back, a held passage with its first verse planted, the Handbook list Smyrna held with its third verse planted, and a loose verse. */
const launch = () => {
  const now = START;
  device.launch([
    record(recallOf(passage.reference, now - 2 * DAY, 3, 0)),
    record(recallOf('Psalms 46:1', now - DAY, 3, 0)),
    record(recallOf('Revelation 2:10', now - DAY, 3, 0)),
    record(recallOf('Genesis 1:1', now - DAY, 3, 0)),
    [KEY, storedText([{ book: 19, chapter: 46, first: 1, last: 3 }])],
    [LISTS, JSON.stringify(['bhb-1816'])],
  ]);
};

/** Opens each furrow `titles` names in turn, reads its page, and goes back home. */
const pagesOf = async (scheme: Scheme, reads: number, titles: readonly string[]) => {
  setSystem(scheme);
  launch();
  const rig = await mountBar(reads, reads > 0, null, { now: START }, TAUGHT);
  const pages: Record<string, ReturnType<typeof pageOf>> = {};
  expect(await rig.until(() => rig.control(`Open ${titles[0]}`) !== undefined)).toBe(true);
  for (const title of titles) {
    expect(await rig.tap(`Open ${title}`)).toBe(true);
    expect(await rig.until(() => by(rig.host, 'list-screen').length === 1)).toBe(true);
    pages[title] = pageOf(rig.host);
    expect(await rig.tap('Your field')).toBe(true);
    expect(await rig.until(() => rig.control('Settings') !== undefined)).toBe(true);
  }
  const faults = rig.faults.splice(0);
  await rig.leave();
  setSystem('light');
  return { pages, faults };
};

const TITLES = [passage.reference, 'Psalms 46:1-3', 'Protection & Fear', 'Smyrna', 'Genesis 1:1'];

/** Fear's fourteen verses in the collection's order, none planted, each a button that learns it. */
const FEAR = [
  'Psalms 91:1',
  'Psalms 91:2',
  'Psalms 91:4',
  'Psalms 91:11',
  'Isaiah 43:2',
  '2 Timothy 1:7',
  'Psalms 34:7',
  'Isaiah 54:17',
  'Psalms 121:7',
  'Psalms 121:8',
  'Deuteronomy 31:6',
  'Proverbs 18:10',
  'Psalms 56:3',
  'Isaiah 41:13',
].map((verse) => `${verse} · Not planted yet → ${verse}, not planted`);

const PROMISE_PAGE = {
  heading: [passage.reference],
  caption: ['1 verse · 1 planted'],
  practice: 1,
  line: ['1 ready today · about 1 min'],
  rows: [`${passage.reference} · A seed · ready today → ${passage.reference}, seed, ready today`],
  remove: [],
};

const FEAR_PAGE = {
  heading: ['Protection & Fear'],
  caption: ['14 verses · none planted yet'],
  practice: 1,
  line: ['Starts with Psalms 91:1, new today'],
  rows: FEAR,
  remove: [],
};

describe.each(['light', 'dark'] as const)('a list’s own page in %s', (scheme) => {
  it('shows each list’s heading, caption, practice, rows and remove as written', async () => {
    const { pages, faults } = await pagesOf(scheme, 0, TITLES);
    expect(faults).toEqual([]);
    expect(pages).toEqual({
      [passage.reference]: PROMISE_PAGE,
      'Psalms 46:1-3': {
        heading: ['Psalms 46:1-3'],
        caption: ['3 verses · 1 planted'],
        practice: 1,
        line: ['2 ready today · about 1 min'],
        rows: [
          'Psalms 46:1 · A seed · ready today → Psalms 46:1, seed, ready today',
          'Psalms 46:2 · Not planted yet · ready today → Psalms 46:2, not planted, ready today',
          'Psalms 46:3 · Not planted yet → Psalms 46:3, not planted',
        ],
        remove: ['Remove Psalms 46:1-3'],
      },
      'Protection & Fear': FEAR_PAGE,
      Smyrna: {
        heading: ['Smyrna'],
        caption: ['4 verses · 1 planted'],
        practice: 1,
        line: ['1 ready today · about 1 min'],
        rows: [
          'Revelation 2:8 · Not planted yet → Revelation 2:8, not planted',
          'Revelation 2:9 · Not planted yet → Revelation 2:9, not planted',
          'Revelation 2:10 · A seed · ready today → Revelation 2:10, seed, ready today',
          'Revelation 2:11 · Not planted yet → Revelation 2:11, not planted',
        ],
        remove: ['Remove Smyrna'],
      },
      'Genesis 1:1': {
        heading: ['Genesis 1:1'],
        caption: ['1 verse · 1 planted'],
        practice: 1,
        line: ['Starts with Genesis 1:1, nothing is due'],
        rows: ['Genesis 1:1 · A seed → Genesis 1:1, seed'],
        remove: [],
      },
    });
  });
});

/** A page with no plan: its heading, caption and rows as text alone, nothing to tap but the way back. */
const still = (reference: string) => ({
  heading: [reference],
  caption: ['1 verse · 1 planted'],
  practice: 0,
  line: [],
  rows: [`${reference} · A seed`],
  remove: [],
});

describe('a list’s own page over unread passages', () => {
  it('offers no remove, and with no plan no Practice this list and no row button', async () => {
    const titles = [passage.reference, 'Protection & Fear', 'Psalms 46:1', 'Revelation 2:10'];
    const { pages, faults } = await pagesOf('light', 3, titles);
    expect(faults).toEqual([]);
    expect(pages).toEqual({
      [passage.reference]: still(passage.reference),
      'Protection & Fear': {
        ...FEAR_PAGE,
        practice: 0,
        line: [],
        rows: FEAR.map((row) => row.slice(0, row.indexOf(' → '))),
      },
      'Psalms 46:1': still('Psalms 46:1'),
      'Revelation 2:10': still('Revelation 2:10'),
    });
  });
});
