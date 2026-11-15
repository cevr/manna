/* oxlint-disable effect/noNullish, effect/noTernary -- a Bun test reading the current app's fingerings as plain values. */

/**
 * A shape is the current app's (A5): for every chord any hymn shows, under
 * every transpose of its hymn, the shape a tap opens names the chord as the
 * page does and holds each string at the fret and finger the current app's
 * `fingeringOf` gives, its drawing the same (a dot per held string off the
 * barre, a mark over each open or muted string, the nut at the first fret);
 * a chord no fingering plays has no shape, so its tap opens nothing; a
 * token that names no chord answers no shape.
 */

import { describe, expect, test } from 'bun:test';

import * as Chord from '@manna/hymnal/chord';
import {
  hasChords,
  type HymnChords,
  playedKey,
  still,
  transposed,
} from '@manna/hymnal-app/hymns/chords';
import { fingeringOf } from '@manna/hymnal-app/hymns/shapes';
import { simple } from '@manna/hymnal-app/hymns/simple';
import { Option } from 'effect';

import { chordsCode, keyCode, gripPageOf } from './shape.ts';
import { currentBook } from './shipped.testing.ts';

/** Every chord the page shows (Simple) and every chord compiled (Advanced), once each, with the key of its hymn. */
const shown = (() => {
  const seen = new Map<string, readonly [Chord.Chord, Chord.Key]>();
  const chordsOf = (hymn: HymnChords) =>
    [...hymn.stanzas, ...Option.toArray(hymn.refrain)].flatMap((part) =>
      part._tag === 'Sung' ? part.lines.flat(2).flatMap((box) => box.chords) : [],
    );
  for (let number = 1; number <= 695; number++) {
    const chords = currentBook.of(number);
    if (Option.isNone(chords) || !hasChords(chords.value)) continue;
    for (const hymn of [chords.value, simple(chords.value)])
      for (const chord of chordsOf(hymn))
        seen.set(`${hymn.key.tonic}${hymn.key.minor}:${chord.root}${chord.quality}/${chord.bass}`, [
          chord,
          hymn.key,
        ]);
  }
  return [...seen.values()];
})();

/** A fingering as a chart writes it: frets and fingers, the low E first. */
const chartOf = (fingering: ReturnType<typeof fingeringOf>) =>
  Option.map(fingering, (held) => ({
    frets: held.strings
      .map((play) =>
        play._tag === 'Fretted' ? play.fret.toString(16) : play._tag === 'Open' ? '0' : 'x',
      )
      .join(''),
    fingers: held.strings
      .map((play) => (play._tag === 'Fretted' ? `${play.finger}` : '-'))
      .join(''),
    first: held.first,
    barre: Option.getOrUndefined(held.barre),
  }));

describe('a shape is the current app’s (A5)', () => {
  test('every chord any hymn shows, under every transpose, opens the current app’s fingering', () => {
    expect(shown.length).toBeGreaterThan(50);
    let unplayable = 0;
    for (const [chord, key] of shown)
      for (let transpose = 0; transpose < 12; transpose++) {
        const played = playedKey(key, transposed(still, transpose));
        const code = chordsCode([chord], played);
        const chart = chartOf(fingeringOf(chord, played));
        if (Option.isNone(chart)) {
          unplayable += 1;
          expect(code).toBe('');
          continue;
        }
        const page = gripPageOf(`${keyCode(played)}_${code}`);
        const [box] = page.boxes;
        expect(page.has).toBe(true);
        expect(page.name).toBe(Chord.format(chord, played));
        expect(page.boxes.length).toBe(1);
        if (box === undefined) continue;
        expect([box.frets, box.fingers, box.first]).toEqual([
          chart.value.frets,
          chart.value.fingers,
          chart.value.first,
        ]);
        expect(box.nut).toBe(chart.value.first === 1);
        expect(box.firstLabel).toBe(chart.value.first === 1 ? '' : `${chart.value.first}fr`);
        const barreFret = chart.value.barre?.fret ?? -1;
        const held = [...box.frets].flatMap((fret, s) =>
          fret === 'x' || fret === '0' || Number.parseInt(fret, 16) === barreFret ? [] : [s],
        );
        expect(box.dots.map((dot) => box.stringsX.indexOf(dot.x))).toEqual(held);
        expect(box.dots.map((dot) => dot.finger)).toEqual(held.map((s) => Number(box.fingers[s])));
        expect(box.marks.map((mark) => [box.stringsX.indexOf(mark.x), mark.text])).toEqual(
          [...box.frets].flatMap((fret, s) =>
            fret === 'x' ? [[s, 'x']] : fret === '0' ? [[s, 'o']] : [],
          ),
        );
        expect(box.barres.map((barre) => barre.finger)).toEqual(
          chart.value.barre === undefined ? [] : [chart.value.barre.finger],
        );
      }
    expect(unplayable).toBeLessThan(shown.length * 12);
  });

  test('a token that names no chord, or no key, answers no shape', () => {
    for (const token of [
      '',
      'C',
      'C_',
      'H_0',
      'C_z',
      'C_0x',
      'C_0-z',
      'C_0-1-2',
      'Es_0',
      'Gm_c',
      'C_0_q',
    ])
      expect(gripPageOf(token)).toMatchObject({ has: false, name: '', boxes: [] });
    expect(gripPageOf('Fs_0').name).toBe('F#');
    expect(gripPageOf('Ebm_0m_7').name).toBe('Ebm Bb');
  });
});
