/* oxlint-disable effect/noNullish, effect/noTernary -- a Bun test drawing generated presses with the app's seeded generator (no effect's FastCheck: Exact's type check stages what an app file imports). */

/**
 * Transpose and capo over the whole domain (A2): for generated hymns with
 * chords and generated runs of presses on the key and capo buttons, the
 * kept move is the one the current app's own `transposed` and `capoed`
 * reach, and the page names every chord, the key played and the key
 * sounding as the current app does for that move (`playedKey`,
 * `soundingKey`, `keyName`, `Chord.format`). A run of n up then n down
 * shows the first names again; the capo stops at 0 and 11 as the current
 * app's dial does, and the key wraps through the twelve; a hymn's move never
 * reaches another hymn.
 */

import { describe, expect, test } from 'bun:test';

import { capoed, hasChords, type Move, still, transposed } from '@manna/hymnal-app/hymns/chords';

import { book } from '../hymns/book.ts';
import { sourcesAt } from '../sources.ts';
import { below, pick, seeded } from '../test/random.ts';
import { canStep, type MoveStep, moveOf, movesAfter } from './move.ts';
import type { ChordsPage } from './page.ts';
import { bundled, currentBook, shownByCurrent, shownByPort } from './shipped.testing.ts';

const sources = sourcesAt('https://hymns.cvr.im', [], bundled);

const chorded = book.hymns.flatMap((hymn) => {
  const chords = currentBook.of(hymn.number);
  return chords._tag === 'Some' && hasChords(chords.value) ? [hymn.number] : [];
});

const STEPS: ReadonlyArray<MoveStep> = ['up', 'down', 'capo-up', 'capo-down', 'reset'];

/** The current app's move after `step`: its own `transposed` and `capoed`. */
const modelStep = (move: Move, step: MoveStep): Move => {
  if (step === 'up') return transposed(move, 1);
  if (step === 'down') return transposed(move, -1);
  if (step === 'capo-up') return capoed(move, 1);
  if (step === 'capo-down') return capoed(move, -1);
  return still;
};

/** Every chord's name on the page, in page order. */
const names = (page: ChordsPage) =>
  page.parts.flatMap((part) =>
    part.lines.flatMap((line) => line.words.flatMap((word) => word.boxes.map((box) => box.chord))),
  );

describe('transpose and capo, over the whole domain (A2)', () => {
  test('generated presses keep the current app’s move, and every name shown is the current app’s for it', () => {
    const random = seeded(7);
    for (let run = 0; run < 60; run++) {
      const number = pick(random, chorded);
      const other = pick(random, chorded);
      let moves: Array<string> = other === number ? [] : [`${other}:3:2`];
      let model = still;
      for (let press = 0; press < 1 + below(random, 30); press++) {
        const step = pick(random, STEPS);
        const next = modelStep(model, step);
        expect(canStep(model, step)).toBe(
          next.transpose !== model.transpose || next.capo !== model.capo,
        );
        model = next;
        moves = movesAfter(moves, number, step);
        expect(moveOf(moves, number)).toEqual(model);
      }
      if (other !== number) expect(moveOf(moves, other)).toEqual({ transpose: 3, capo: 2 });
      const page = sources.chordsPage([`${number}`, true, moves]);
      expect(shownByPort(page)).toEqual(shownByCurrent(number, model));
      expect([page.transpose, page.capo]).toEqual([model.transpose, model.capo]);
      expect(page.capoDown).toBe(model.capo > capoed(model, -1).capo);
      expect(page.capoUp).toBe(model.capo < capoed(model, 1).capo);
    }
  });

  test('every transpose in the range and every capo names the keys as the current app does', () => {
    const number = pick(seeded(3), chorded);
    let moves: Array<string> = [];
    for (let transpose = 0; transpose < 12; transpose++) {
      for (let capo = 0; capo < 12; capo++) {
        const page = sources.chordsPage([`${number}`, true, moves]);
        expect(shownByPort(page)).toEqual(
          shownByCurrent(number, { transpose: page.transpose, capo }),
        );
        expect(page.transpose).toBe(transposed(still, transpose).transpose);
        moves = movesAfter(moves, number, 'capo-up');
      }
      for (let capo = 0; capo < 12; capo++) moves = movesAfter(moves, number, 'capo-down');
      moves = movesAfter(moves, number, 'up');
    }
    expect(moves).toEqual([]);
  });

  test('n up then n down, or n capo up then n capo down from no capo, shows the first names again', () => {
    const random = seeded(11);
    for (let run = 0; run < 20; run++) {
      const number = pick(random, chorded);
      const first = names(sources.chordsPage([`${number}`, true, []]));
      const n = 1 + below(random, 11);
      const up = pick(random, [
        ['up', 'down'],
        ['capo-up', 'capo-down'],
      ] as const);
      let moves: Array<string> = [];
      for (let k = 0; k < n; k++) moves = movesAfter(moves, number, up[0]);
      expect(names(sources.chordsPage([`${number}`, true, moves]))).not.toEqual(first);
      for (let k = 0; k < n; k++) moves = movesAfter(moves, number, up[1]);
      expect(moves).toEqual([]);
      expect(names(sources.chordsPage([`${number}`, true, moves]))).toEqual(first);
    }
  });

  test('the capo stops at 0 and 11 and refuses past them; the key wraps through the twelve', () => {
    const number = chorded[0] ?? 1;
    expect(movesAfter([], number, 'capo-down')).toEqual([]);
    expect(sources.chordsPage([`${number}`, true, []]).capoDown).toBe(false);
    let moves: Array<string> = [];
    for (let k = 0; k < 15; k++) moves = movesAfter(moves, number, 'capo-up');
    expect(moveOf(moves, number).capo).toBe(11);
    expect(sources.chordsPage([`${number}`, true, moves]).capoUp).toBe(false);
    expect(movesAfter(moves, number, 'capo-up')).toEqual(moves);
    let keys: Array<string> = [];
    for (let k = 0; k < 12; k++) keys = movesAfter(keys, number, 'up');
    expect(keys).toEqual([]);
    expect(movesAfter(['x', `${number}:9:0`, `${number}:1:12`, '1:2'], number, 'nonsense')).toEqual(
      ['x', `${number}:9:0`, `${number}:1:12`, '1:2'],
    );
    expect(moveOf(['x', `${number}:9:0`, `${number}:1:12`, '1:2'], number)).toEqual(still);
  });
});
