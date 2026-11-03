/**
 * The render's source is the sung file: hymn 663, whose file plays one verse
 * for six stanzas, renders that verse six times through, under a source hash
 * of its own, in the printed key and in another; every other hymn renders
 * its file as it stands, under its bytes' hash, so its recordings stand.
 * Only hymn numbers, hashes' equality and seconds are reported.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Effect, FileSystem, Path } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from '../../src/midi.js';
import { sourceOf } from './run.js';
import { sha256Hex } from './sfizz.js';
import { STYLE } from './style.js';

const test = it.scopedLive.layer(BunServices.layer);

/** A hymn's MIDI file's bytes. */
const bytesOf = (hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFile(
      path.join(
        import.meta.dir,
        '..',
        '..',
        'data',
        'midi',
        `${String(hymn).padStart(3, '0')}.mid`,
      ),
    );
  });

/** 663's verse plays 15.945102 s; sung six times it plays this long. */
const SUNG_SECONDS = 6 * 15.945102;

describe('the render source', () => {
  test("is every hymn's file as it stands, under its bytes' hash, but 663's", () =>
    Effect.gen(function* () {
      const problems: Array<string> = [];
      for (const hymn of Arr.range(1, 695).filter((n) => n !== 663)) {
        const bytes = yield* bytesOf(hymn);
        const source = yield* sourceOf(STYLE, hymn);
        const file = yield* Midi.parse(bytes);
        problems.push(
          ...[`${hymn}: sha256`].filter(() => source.sha256 !== sha256Hex(bytes)),
          ...[`${hymn}: lastTick`].filter(() => source.midi.lastTick !== file.lastTick),
          ...[`${hymn}: seconds`].filter(
            () => source.expected.seconds !== Midi.secondsOf(file) + STYLE.tail,
          ),
        );
      }
      expect(problems.slice(0, 12)).toEqual([]);
    }));

  test("is 663's verse six times through, under a hash that is not its file's, in any key", () =>
    Effect.gen(function* () {
      const bytes = yield* bytesOf(663);
      const file = yield* Midi.parse(bytes);
      expect(Math.abs(Midi.secondsOf(file) - 15.945102)).toBeLessThan(1e-6);
      const problems: Array<string> = [];
      for (const transpose of [0, 2, -3]) {
        const source = yield* sourceOf(STYLE, 663, transpose);
        const seconds = Midi.secondsOf(source.midi);
        problems.push(
          ...[`${transpose}: sha256 is the file's`].filter(
            () => source.sha256 === sha256Hex(bytes),
          ),
          ...[`${transpose}: sung ${seconds.toFixed(6)} s`].filter(
            () => Math.abs(seconds - SUNG_SECONDS) > 0.01,
          ),
          ...[`${transpose}: expected ${source.expected.seconds.toFixed(6)} s`].filter(
            () => Math.abs(source.expected.seconds - (seconds + STYLE.tail)) > 1e-9,
          ),
        );
      }
      expect(problems).toEqual([]);
    }));
});
