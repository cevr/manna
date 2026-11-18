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

export const rows: ReadonlyArray<Row> = [
  {
    id: 'hymn.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [hymn(1), { wait: 600 }] },
  },
  {
    id: 'hymn.refrain',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [hymn(100), { wait: 600 }] },
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
  },
  {
    id: 'hymn.favourite',
    unit,
    kind: 'match',
    fixture: 'hy-used',
    one: { steps: [hymn(1), { wait: 600 }] },
  },
  {
    id: 'hymn.chords',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-chords',
    one: { steps: [{ open: 'hymns/1', expect: 'id=key-button' }, { wait: 600 }] },
  },
  {
    id: 'hymn.chords-none',
    unit,
    kind: 'match',
    fixture: 'hy-chords',
    one: { steps: [hymn(NO_CHORDS), { wait: 600 }] },
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
