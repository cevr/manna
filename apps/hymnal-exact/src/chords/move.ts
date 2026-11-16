/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a fingering, a key or a chord the current app's decoders leave out is undefined, and its rules branch plainly. */

/**
 * Each hymn's move, kept as the current hymnal keeps it: a transpose and a
 * capo of its own, by its number, reaching no other hymn (its `move.<n>`
 * setting), and the hymn as printed (`still`) until moved. The port keeps
 * the moves in one persisted list of strings, `"<number>:<transpose>:<capo>"`,
 * a hymn at `still` left out; the steps are the current app's own
 * `transposed` (the key wraps through the twelve) and `capoed` (the capo
 * stops at each end).
 */

import { capoed, type Move, still, transposed } from '@manna/hymnal-app/hymns/chords';

/** A press on the page's key and capo buttons, or the move put back. */
export type MoveStep = 'up' | 'down' | 'capo-up' | 'capo-down' | 'reset';

const STEPS: ReadonlyArray<MoveStep> = ['up', 'down', 'capo-up', 'capo-down', 'reset'];

/** Whether `move` is one the current app could store: each part inside the range its steps keep. */
const kept = (move: Move): boolean =>
  Number.isInteger(move.transpose) &&
  Number.isInteger(move.capo) &&
  transposed(move, 0).transpose === move.transpose &&
  capoed(move, 0).capo === move.capo;

const entryOf = (entry: string): readonly [number, Move] | readonly [] => {
  const parts = entry.split(':');
  if (parts.length !== 3) return [];
  const [number, transpose, capo] = parts.map(Number);
  const move = { transpose: transpose ?? Number.NaN, capo: capo ?? Number.NaN };
  if (!Number.isInteger(number) || !kept(move)) return [];
  return [number ?? 0, move];
};

/** Hymn `number`'s move in `moves`; `still` for a hymn never moved, or an entry that does not read. */
export const moveOf = (moves: ReadonlyArray<string>, number: number): Move => {
  for (const entry of moves) {
    const read = entryOf(entry);
    if (read.length === 2 && read[0] === number) return read[1];
  }
  return still;
};

const stepped = (move: Move, step: MoveStep): Move => {
  if (step === 'up') return transposed(move, 1);
  if (step === 'down') return transposed(move, -1);
  if (step === 'capo-up') return capoed(move, 1);
  if (step === 'capo-down') return capoed(move, -1);
  return still;
};

/** Whether `step` changes `move`: false at the capo's ends, as the current app's dial stops there. */
export const canStep = (move: Move, step: MoveStep): boolean => {
  const next = stepped(move, step);
  return next.transpose !== move.transpose || next.capo !== move.capo;
};

/**
 * `moves` after `step` on hymn `number`: its entry replaced, or left out at
 * `still`; every other hymn's entry as it was. An unknown step changes
 * nothing.
 */
export const movesAfter = (
  moves: ReadonlyArray<string>,
  number: number,
  step: string,
): Array<string> => {
  const known = STEPS.find((each) => each === step);
  const others = moves.filter((entry) => {
    const read = entryOf(entry);
    return read.length === 2 && read[0] !== number;
  });
  if (known === undefined || !Number.isInteger(number)) return [...moves];
  const next = stepped(moveOf(moves, number), known);
  if (next.transpose === still.transpose && next.capo === still.capo) return others;
  return [...others, `${number}:${next.transpose}:${next.capo}`];
};
