// In Its Order's sound: act 1's code sounds (`feast`: the cold open, the
// title card and the milk page).
//
// The score is not declared: it is generated, so it costs money, and it waits
// for the owner's yes. Every sound here is a code sound from the library
// (`apps/animations/sounds/library.ts`).
//
// Beds: the courtyard's air under the cold open and the title card; the paper
// room under the milk page; the milk's pour from where its ribbon reaches the
// cup until the stream stops, once for each cup.
//
// Effects: what the picture does by hand is a one-shot on the cue that draws
// it. The scroll drops on the table, bounces once and unrolls; the dropper
// comes down over the cup and goes. On `need` the drinking row's four come in
// on a rising chime each, and the grown lead comes in on the baby's note: the
// library's five chimes rotate from each effect's name, so `comeIn` rings
// D5 E5 F#5 A5 and `lastIn` rings D5. The bottle in the cold open has no
// sound: the camera pushes in on it and it never moves.

import type { Sound } from '@manna/film/core';

import { milk } from './scenes/milk.ts';

/**
 * Where each of the drinking row's four (the baby, the toddler, the child
 * and the grown villager) starts coming in, seconds after the `row` cue
 * starts: the scene staggers them (`f.stagger`), so their starts spread
 * evenly over the cue's `stagger` share of its `dur`, the first at its start.
 */
const comingIn = (count: number): ReadonlyArray<number> => {
  const { dur, stagger } = milk.timeline.row;
  return Array.from({ length: count }, (_, i) => (dur * stagger * i) / (count - 1));
};

export const sound: Sound = {
  beds: [
    {
      sound: 'amb.courtyard',
      level: -16,
      from: { scene: 'cold', at: 'start' },
      to: { scene: 'title', at: 'end' },
    },
    {
      sound: 'room.paper',
      level: -25,
      from: { scene: 'milk', at: 'start' },
      to: { scene: 'milk', at: 'end' },
    },
    {
      sound: 'milk.pour',
      level: -22,
      fade: 0.3,
      from: { scene: 'milk', cue: 'fill' },
      to: { scene: 'milk', cue: 'stop', edge: 'end' },
    },
    {
      sound: 'milk.pour',
      level: -22,
      fade: 0.3,
      from: { scene: 'milk', cue: 'fill2' },
      to: { scene: 'milk', cue: 'stop2', edge: 'end' },
    },
  ],
  effects: {
    // ── The cold open: the scroll ──────────────────────────────────────────
    // It lands as `drop` ends, lands again softer as its bounce (`hop`)
    // ends, and its unroll's last flop lands near `unroll`'s end.
    drop: {
      sound: 'scroll.drop',
      level: -16,
      sync: 'hit',
      at: [{ scene: 'cold', cue: 'drop', edge: 'end' }],
    },
    hop: {
      sound: 'scroll.drop',
      level: -23,
      sync: 'hit',
      at: [{ scene: 'cold', cue: 'hop', edge: 'end' }],
    },
    unroll: {
      sound: 'scroll.unroll',
      level: -20,
      sync: 'onset',
      at: [{ scene: 'cold', cue: 'unfurl' }],
    },

    // ── The milk page: the dropper ─────────────────────────────────────────
    // It comes down fastest as `ink` starts and leaves fastest as `away`
    // ends; its bead hangs and no drop falls, so it has no drip.
    lower: {
      sound: 'paper.whoosh',
      level: -24,
      sync: 'onset',
      at: [{ scene: 'milk', cue: 'ink' }],
    },
    lift: {
      sound: 'paper.whoosh',
      level: -24,
      sync: 'hit',
      at: [{ scene: 'milk', cue: 'away', edge: 'end' }],
    },

    // ── The milk page: the drinking row ────────────────────────────────────
    comeIn: {
      sound: 'tone.chime',
      level: -24,
      at: comingIn(4).map((offset) => ({ scene: 'milk', cue: 'row', offset })),
    },
    lastIn: { sound: 'tone.chime', level: -24, at: [{ scene: 'milk', cue: 'lead' }] },
  },
};
