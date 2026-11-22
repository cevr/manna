/**
 * The chord choices Settings offers, each its kept value and its label, in
 * the order Settings lists them: `chordStyles` (how chords are spelled,
 * `src/hymns/simple.ts`) and `placements` (where they fall, with the
 * compact mark the player's dial shows). Pure data, so the Exact port reads
 * the same lists.
 */

import type { Placement } from '@manna/hymnal/placement';

import type { ChordStyle } from './hymns/simple';

export const chordStyles: ReadonlyArray<{ readonly value: ChordStyle; readonly label: string }> = [
  { value: 'simple', label: 'Simple' },
  { value: 'advanced', label: 'Advanced' },
];

/** Long accessible labels and compact marks belong to the app's controls. */
export const placements = [
  { value: 'beat', label: 'On the beat', mark: 'Beat' },
  { value: 'simpler', label: 'Simpler', mark: 'Simpler' },
  { value: 'file', label: 'As the file plays', mark: 'File' },
] as const satisfies ReadonlyArray<{ value: Placement; label: string; mark: string }>;
