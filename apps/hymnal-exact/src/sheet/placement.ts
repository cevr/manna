/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a kept text no placement is reads as undefined. */

/**
 * Each hymn's own chord placement, kept as the current hymnal keeps it: its
 * `chords.placement.<n>` setting, `inherit` until the reader turns the
 * player sheet's placement dial for it, and the global placement (Settings'
 * `Chord placement`) while it inherits (`effectivePlacement`, `settings.ts`).
 * The port keeps the hymns' own placements in one persisted list of
 * strings, `"<number>:<placement>"`, read by the current hymnal's rule: an
 * entry is the hymn's own only when its text is exactly a placement, else
 * the hymn inherits, as a stored value its schema does not decode falls
 * back to `inherit`.
 */

import { placements } from '@manna/hymnal-app/chord-choices';

import { type Placement, placementOf } from '../settings/chords.ts';

/** A hymn's own placement, or `inherit` while it follows the global one. */
export type Own = Placement | 'inherit';

const entryOf = (entry: string): readonly [number, Placement] | readonly [] => {
  const at = entry.indexOf(':');
  if (at < 1) return [];
  const number = Number(entry.slice(0, at));
  const own = placements.find((choice) => choice.value === entry.slice(at + 1))?.value;
  if (!Number.isInteger(number) || number <= 0 || `${number}` !== entry.slice(0, at)) return [];
  if (own === undefined) return [];
  return [number, own];
};

/** Hymn `number`'s own placement in `kept`; `inherit` for a hymn with none, or an entry that does not read. */
export const ownOf = (kept: ReadonlyArray<string>, number: number): Own => {
  for (const entry of kept) {
    const read = entryOf(entry);
    if (read.length === 2 && read[0] === number) return read[1];
  }
  return 'inherit';
};

/** The placement hymn `number`'s chords fall at: its own, else the global one (`global`, any kept text, read by `placementOf`). */
export const effectiveOf = (
  kept: ReadonlyArray<string>,
  number: number,
  global: string,
): Placement => {
  const own = ownOf(kept, number);
  if (own === 'inherit') return placementOf(global);
  return own;
};

/**
 * `kept` with hymn `number` at `own`: its entry replaced, or left out at
 * `inherit` (or any text no placement is); every other hymn's readable
 * entry as it was.
 */
export const keptWith = (
  kept: ReadonlyArray<string>,
  number: number,
  own: string,
): Array<string> => {
  const others = kept.filter((entry) => {
    const read = entryOf(entry);
    return read.length === 2 && read[0] !== number;
  });
  const placement = placements.find((choice) => choice.value === own)?.value;
  if (placement === undefined || !Number.isInteger(number) || number <= 0) return others;
  return [...others, `${number}:${placement}`];
};

/** One stop of the placement dial: its placement and the mark it shows. */
export interface PlacementStop {
  readonly value: string;
  readonly mark: string;
}

/**
 * The player sheet's placement dial for hymn `number`, as the current
 * `PlacementDial` draws it: whether it shows (the hymn has chords), its
 * stops' marks in the current app's order, the stop of the effective
 * placement and its label (what VoiceOver says), whether the hymn
 * inherits, and the global placement's label beside `Use global`.
 */
export interface PlacementDial {
  readonly number: number;
  readonly has: boolean;
  readonly stops: Array<PlacementStop>;
  readonly index: number;
  readonly said: string;
  readonly inherit: boolean;
  readonly global: string;
}

export const placementDialOf = (
  kept: ReadonlyArray<string>,
  number: number,
  global: string,
  has: boolean,
): PlacementDial => {
  const effective = effectiveOf(kept, number, global);
  const index = Math.max(
    0,
    placements.findIndex((choice) => choice.value === effective),
  );
  return {
    number,
    has,
    stops: placements.map((choice) => ({ value: choice.value, mark: choice.mark })),
    index,
    said: placements[index]?.label ?? '',
    inherit: ownOf(kept, number) === 'inherit',
    global: placements.find((choice) => choice.value === placementOf(global))?.label ?? '',
  };
};
