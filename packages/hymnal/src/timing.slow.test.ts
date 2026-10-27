/* oxlint-disable effect/noNodeBuiltinImport -- read-only corpus and MIDI test boundary. */
/** Playback sidecars carry corrected timing; the corpus is a frozen text input. */
import { readFileSync } from 'node:fs';
import { Console, Effect, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';
import { readPlayback } from '../scripts/playback.js';
import { Hymn } from './hymn.js';
import * as Midi from './midi.js';
import { secondsAt } from './timing.js';

it.effect('all playback tempo maps match MIDI at their stored grid endpoints', () =>
  Effect.gen(function* () {
    const data = new URL('../data/', import.meta.url).pathname;
    const decode = Schema.decodeEffect(Schema.fromJsonString(Hymn));
    const baseline = yield* Effect.forEach(
      Array.from({ length: 695 }, (_, i) => i + 1),
      (n) => decode(readFileSync(`${data}sdah-1985/${String(n).padStart(3, '0')}.json`, 'utf8')),
    );
    const faults: number[] = [];
    for (const hymn of readPlayback(baseline)) {
      const midi = yield* Midi.parse(
        readFileSync(`${data}midi/${String(hymn.number).padStart(3, '0')}.mid`),
      );
      const timing = hymn.timing;
      if (timing === undefined) {
        faults.push(hymn.number);
        continue;
      }
      const endpoint = (timing.end * midi.ticksPerBeat) / timing.perBeat;
      let seconds = 0,
        tick = 0,
        tempo = 500000;
      for (const change of midi.tempos) {
        if (change.tick > endpoint) break;
        seconds += ((change.tick - tick) * tempo) / midi.ticksPerBeat / 1e6;
        tick = change.tick;
        tempo = change.microsPerQuarter;
      }
      seconds += ((endpoint - tick) * tempo) / midi.ticksPerBeat / 1e6;
      if (Math.abs(secondsAt(timing)(timing.end) - seconds) > 0.000002) faults.push(hymn.number);
    }
    if (faults.length) yield* Console.log(`P3 tempo-end faults=${faults.join(',')}`);
    expect(faults).toEqual([]);
  }),
);
