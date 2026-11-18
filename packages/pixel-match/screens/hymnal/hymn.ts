/**
 * The hymnal's hymn page, its chords and its star (`pm-hy-hymn`), opened by
 * route: `hymns/<n>`.
 */
import type { Row, Step } from '../../src/model.ts';

const unit = 'pm-hy-hymn';

/** The first hymn the chord book holds no chords for (`hasChords` false over `vite/chords.ts`'s book, read at the One commit). */
export const NO_CHORDS = 181;

export const hymn = (number: number): Step => ({
  open: `hymns/${number}`,
  expect: 'label=Stanza 1',
});

/** The port's ops to its hymn `number`'s page, by route, its data in and still. */
const exactHymn = (number: number): ReadonlyArray<string> => [
  'clock data',
  `type root /hymns/${number}`,
  'clock settle',
  'clock data',
  'clock settle',
];

/** The port's page scrolled down three screens, as One's row pans. */
const EXACT_END = [
  ...exactHymn(1),
  'tap hymn-words drag 0 -600',
  'tap hymn-words drag 0 -600',
  'tap hymn-words drag 0 -600',
  'clock settle',
];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'hymn.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [hymn(1), { wait: 600 }] },
    exact: { ops: exactHymn(1) },
  },
  {
    id: 'hymn.refrain',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [hymn(100), { wait: 600 }] },
    exact: { ops: exactHymn(100) },
  },
  {
    id: 'hymn.end',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [
        hymn(1),
        { scroll: 'screen', direction: 'down' },
        { scroll: 'screen', direction: 'down' },
        { scroll: 'screen', direction: 'down' },
        { wait: 800 },
      ],
    },
    exact: { ops: EXACT_END },
  },
  {
    id: 'hymn.favourite',
    unit,
    kind: 'match',
    fixture: 'hy-used',
    one: { steps: [hymn(1), { wait: 600 }] },
    exact: { ops: exactHymn(1) },
  },
  {
    id: 'hymn.chords',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-chords',
    one: { steps: [{ open: 'hymns/1', expect: 'id=key-button' }, { wait: 600 }] },
    exact: { ops: exactHymn(1) },
  },
  {
    id: 'hymn.chords-none',
    unit,
    kind: 'match',
    fixture: 'hy-chords',
    one: { steps: [hymn(NO_CHORDS), { wait: 600 }] },
    exact: { ops: exactHymn(NO_CHORDS) },
  },
  {
    id: 'hymn.chord-sheet',
    unit,
    kind: 'match',
    fixture: 'hy-chords',
    one: {
      steps: [
        { open: 'hymns/1', expect: 'id=key-button' },
        { tap: 'id=chord-1-1-1' },
        { wait: 1000 },
      ],
    },
    exact: {
      ops: [...exactHymn(1), 'tap chord-1-1-1', 'clock settle', 'clock data', 'clock settle'],
    },
  },
  {
    id: 'hymn.none',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [{ open: 'hymns/999', expect: 'label=No hymn 999' }, { wait: 600 }],
      web: [{ open: 'hymns/999', expect: 'label=No hymn 999.' }, { wait: 600 }],
    },
    exact: {
      ops: exactHymn(999),
      masks: [
        {
          x: 20,
          y: 280,
          width: 252,
          height: 63,
          reason:
            "the port's Home link (notfound-home), Exact-only: the port's drives and tests leave not-found by it, and One's page has none (measured by layout on iOS)",
        },
      ],
    },
  },
  {
    id: 'hymn.reading',
    unit: 'ex-hy-follow',
    kind: 'gap',
    fixture: 'hy-fresh',
    one: {
      steps: [
        hymn(1),
        { tap: 'label=Open player' },
        { scroll: 'label=Text size', direction: 'down' },
        { wait: 800 },
      ],
    },
  },
  {
    id: 'hymn.rail',
    unit: 'ex-hy-follow',
    kind: 'gap',
    fixture: 'hy-fresh',
    one: {
      steps: [
        hymn(1),
        { tap: 'label=Play hymn 1' },
        { wait: 2500 },
        { tap: 'label=Pause hymn 1' },
        { wait: 800 },
      ],
    },
  },
  {
    id: 'hymn.about',
    unit: 'ex-hy-follow',
    kind: 'gap',
    fixture: 'hy-fresh',
    one: { steps: [hymn(1), { tap: 'label=About this hymn' }, { wait: 1000 }] },
  },
];
