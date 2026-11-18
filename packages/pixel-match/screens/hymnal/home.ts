/**
 * The hymnal's home and Recent (`pm-hy-home`). Home is the root: the One
 * side opens it, on the web its route `/`. The web's home is One's web
 * file (`Home.tsx`): a title, Settings and the search field over the whole
 * list, with no tab row, so the tabs' rows are not drawn there.
 */
import type { Row, Step } from '../../src/model.ts';

const unit = 'pm-hy-home';

export const HOME: Step = { open: '/', expect: 'label=Sections' };
export const HOME_WEB: Step = { open: '/', expect: 'label=1, Praise to the Lord' };

/** Why a tab's row has no web cell. */
export const NO_TABS = "One's web home (Home.tsx) draws the list alone, with no tab row";

const tab = (name: string): Row['one'] => ({
  steps: [HOME, { tap: `label=${name}` }, { wait: 600 }],
  notDrawn: { web: NO_TABS },
});

const TO_100: Step = { scroll: 'label=100, Great Is Thy Faithfulness', direction: 'down' };
const RECENT: Step = { open: 'recent', expect: 'label=Recent' };

export const rows: ReadonlyArray<Row> = [
  {
    id: 'home.sections',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [HOME], web: [HOME_WEB] },
  },
  {
    id: 'home.scrolled',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [HOME, TO_100, { wait: 800 }], web: [HOME_WEB, TO_100, { wait: 800 }] },
  },
  {
    id: 'home.pinned-tabs',
    unit,
    kind: 'gap',
    fixture: 'hy-fresh',
    one: {
      steps: [HOME, TO_100, { scroll: 'screen', direction: 'up' }, { wait: 800 }],
      notDrawn: { web: NO_TABS },
    },
  },
  { id: 'home.lists-empty', unit, kind: 'match', fixture: 'hy-fresh', one: tab('Lists') },
  { id: 'home.lists', unit, kind: 'match', fixture: 'hy-used', one: tab('Lists') },
  { id: 'home.topics', unit, kind: 'match', fixture: 'hy-fresh', one: tab('Topics') },
  { id: 'home.metres', unit, kind: 'match', fixture: 'hy-fresh', one: tab('Metres') },
  { id: 'home.scripture', unit, kind: 'match', fixture: 'hy-fresh', one: tab('Scripture') },
  { id: 'home.shelf', unit, kind: 'exact-only' },
  {
    id: 'home.row-pressed',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [HOME], web: [HOME_WEB], hold: 'label=1, Praise to the Lord' },
  },
  {
    id: 'recent.page',
    unit,
    kind: 'match',
    fixture: 'hy-used',
    one: { steps: [RECENT, { wait: 600 }], web: [{ open: 'recent', expect: '' }] },
  },
  {
    id: 'recent.empty',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [RECENT, { wait: 600 }], web: [{ open: 'recent', expect: '' }] },
  },
];
