/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a fingering, a key or a chord the current app's decoders leave out is undefined, and its rules branch plainly. */

/**
 * Each hymn's move, kept as the current hymnal keeps it: a transpose and a
 * capo of its own, by its number, reaching no other hymn (its `move.<n>`
 * setting), and the hymn as printed (`still`) until moved. The port keeps
 * the moves in one persisted list of strings, `"<number>:<transpose>:<capo>"`,
 * a hymn at `still` left out, and an entry only for a move the current
 * app's own `transposed` and `capoed` keep (the key dial's and the capo
 * dial's moves, `src/keys`).
 */

import { capoed, type Move, still, transposed } from '@manna/hymnal-app/hymns/chords';

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

/**
 * `moves` with hymn `number` at `move`: its entry replaced, or left out at
 * `still`; every other hymn's entry as it was. A move the current app could
 * not store, or a number that is not whole, changes nothing.
 */
export const movesTo = (
  moves: ReadonlyArray<string>,
  number: number,
  move: Move,
): Array<string> => {
  if (!Number.isInteger(number) || !kept(move)) return [...moves];
  const others = moves.filter((entry) => {
    const read = entryOf(entry);
    return read.length === 2 && read[0] !== number;
  });
  if (move.transpose === still.transpose && move.capo === still.capo) return others;
  return [...others, `${number}:${move.transpose}:${move.capo}`];
};
