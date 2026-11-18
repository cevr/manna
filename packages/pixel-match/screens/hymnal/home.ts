/**
 * The hymnal's home and Recent (`pm-hy-home`). Home is the root: the One
 * side opens it, on the web its route `/`.
 */
import type { Row, Step } from '../../src/model.ts';

const unit = 'pm-hy-home';

export const HOME: Step = { open: '/', expect: 'label=Sections' };

const tab = (name: string): ReadonlyArray<Step> => [HOME, { tap: `label=${name}` }, { wait: 600 }];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'home.sections',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [HOME] },
  },
  {
    id: 'home.scrolled',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [
        HOME,
        { scroll: 'label=100, Great Is Thy Faithfulness', direction: 'down' },
        { wait: 800 },
      ],
    },
  },
  {
    id: 'home.pinned-tabs',
    unit,
    kind: 'gap',
    fixture: 'hy-fresh',
    one: {
      steps: [
        HOME,
        { scroll: 'label=100, Great Is Thy Faithfulness', direction: 'down' },
        { scroll: 'screen', direction: 'up' },
        { wait: 800 },
      ],
    },
  },
  {
    id: 'home.lists-empty',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: tab('Lists') },
  },
  { id: 'home.lists', unit, kind: 'match', fixture: 'hy-used', one: { steps: tab('Lists') } },
  { id: 'home.topics', unit, kind: 'match', fixture: 'hy-fresh', one: { steps: tab('Topics') } },
  { id: 'home.metres', unit, kind: 'match', fixture: 'hy-fresh', one: { steps: tab('Metres') } },
  {
    id: 'home.scripture',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: tab('Scripture') },
  },
  { id: 'home.shelf', unit, kind: 'exact-only' },
  {
    id: 'home.row-pressed',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [HOME], hold: 'label=1, Praise to the Lord' },
  },
  {
    id: 'recent.page',
    unit,
    kind: 'match',
    fixture: 'hy-used',
    one: { steps: [{ open: 'recent', expect: 'label=Recent' }, { wait: 600 }] },
  },
  {
    id: 'recent.empty',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [{ open: 'recent', expect: 'label=Recent' }, { wait: 600 }] },
  },
];
