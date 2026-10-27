/* oxlint-disable effect/noNodeBuiltinImport -- read-only corpus fixture; compilation remains in memory. */
import { readFileSync } from 'node:fs';
import { Console, Effect, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';
import * as Align from './align.js';
import * as Midi from './midi.js';
import * as Score from './score.js';
import { compile } from './compile.js';
import { Hymn, sung } from './hymn.js';
import { Playback, metadataOf } from './playback.js';
import { secondsAt, timingOf } from './timing.js';
import { readPlayback } from '../scripts/playback.js';
import { decodeOrders, sourceOf } from '../scripts/sources.js';
import { decodeSourceText } from '../scripts/source-text.js';

const data = new URL('../data/', import.meta.url).pathname;
const read = (file: string) => readFileSync(`${data}${file}`, 'utf8');
const decode = Schema.decodeEffect(Schema.fromJsonString(Hymn));
const pad = (n: number) => String(n).padStart(3, '0');
const encode = Schema.encodeEffect(Schema.fromJsonString(Playback));
const linesOf = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

const groupFaults = (alignment: Align.Alignment, start: number) => {
  const faults: number[][] = [];
  const owned = alignment.lines
    .flat()
    .flatMap((s) => Array.from({ length: s.notes }, (_, i) => s.note + i));
  if (owned.length !== alignment.melody.length || owned.some((n, i) => n !== i)) faults.push([3]);
  const anchors = Align.anchorsOf(alignment, start);
  for (const [l, line] of anchors.entries())
    for (const [k, anchor] of line.entries()) {
      const prior = line[k - 1];
      if (prior !== undefined && prior.start > anchor.start) faults.push([4, l, k]);
      if (
        anchor.notes > 0 &&
        (anchor.start !== alignment.melody[anchor.note]?.start ||
          anchor.end !== alignment.melody[anchor.note + anchor.notes - 1]?.end)
      )
        faults.push([5, l, k]);
      // A shared note inherits the preceding anchor; leading shared notes use
      // the line's first owned onset (tested independently on generated shapes).
    }
  return { faults, anchors };
};

const stanzaFaults = (
  hymn: Hymn,
  v: number,
  anchors: ReturnType<typeof Align.anchorsOf>,
  shift: number,
  tpb: number,
) => {
  const part = hymn.stanzas[v];
  if (part?._tag !== 'Sung') return [];
  const occurrence = sung(hymn).findIndex((line) => line.verse === v + 1);
  const faults: number[][] = [];
  for (const [l, line] of anchors.slice(0, part.lines.length).entries()) {
    const timed = hymn.timing?.lines[occurrence + l];
    if (timed?.even !== false) continue;
    for (const [k, anchor] of line.entries()) {
      if (timed.syllables[k] !== Math.round(((anchor.start + shift) * 96) / tpb))
        faults.push([6, l, k]);
      const s = part.lines[l]?.[k];
      if (
        s?.notes !== anchor.notes ||
        Math.abs((s?.beats ?? 0) - (anchor.end - anchor.start) / tpb) > 0.00051
      )
        faults.push([7, l, k]);
    }
  }
  return faults;
};

const occurrenceFaults = (hymn: Hymn) => {
  const faults: number[][] = [];
  for (const [i, line] of sung(hymn).entries()) {
    const timed = hymn.timing?.lines[i];
    if (
      timed === undefined ||
      (line.part._tag === 'Sung' && timed.syllables.length !== line.part.lines[line.line]?.length)
    )
      faults.push([8, i]);
    if (line.part._tag === 'Plain' && !timed?.even) faults.push([9, i]);
    if (timed?.syllables.some((s, k) => s < (timed.syllables[k - 1] ?? timed.start)))
      faults.push([10, i]);
  }
  return faults;
};

const alignmentFaults = (
  fresh: Hymn,
  score: Score.Score,
  source: Parameters<typeof compile>[0],
  midi: Midi.Midi,
) => {
  const stanzas = source.verses.filter((v) => v.id >= 0).toSorted((a, b) => a.id - b.id);
  const refrain = source.verses.find((v) => v.id < 0);
  const lastOnly = source.order === 'first-and-last' || source.order === 'after-last';
  const faults: number[][] = [];
  let checked = 0,
    melismas = 0,
    shared = 0;
  for (const [v, stanza] of stanzas.entries()) {
    const tail =
      refrain === undefined || (lastOnly && v !== stanzas.length - 1) ? [] : linesOf(refrain.text);
    const index = Math.min(v, score.verses.spans.length - 1);
    const span = score.verses.spans[index];
    const alignment = Align.align(score, index, [...linesOf(stanza.text), ...tail]);
    if (!Number.isFinite(alignment.cost)) continue;
    const { faults: groups, anchors } = groupFaults(alignment, span?.start ?? 0);
    faults.push(...groups.map((f) => [v, ...f]));
    const shift =
      v < score.verses.spans.length || span === undefined
        ? 0
        : midi.lastTick + (v - score.verses.spans.length) * (span.end - span.start) - span.start;
    faults.push(...stanzaFaults(fresh, v, anchors, shift, midi.ticksPerBeat).map((f) => [v, ...f]));
    for (const a of anchors.flat()) {
      checked++;
      if (a.notes > 1) melismas++;
      if (a.notes === 0) shared++;
    }
  }
  return { faults, checked, melismas, shared };
};

it.effect(
  'P3 every stored part and sung occurrence uses the selected melody and deterministic sidecar',
  () =>
    Effect.gen(function* () {
      const sources = yield* decodeSourceText(read('source-text.json'));
      const orders = yield* decodeOrders(read('fixes/refrains.json'));
      const rows = sources.hymns.filter((row) => row.number <= 695);
      const baseline = yield* Effect.forEach(rows, (row) =>
        decode(read(`sdah-1985/${pad(row.number)}.json`)),
      );
      const joined = readPlayback(baseline);
      const faults: number[][] = [];
      let checked = 0,
        occurrences = 0,
        melismas = 0,
        shared = 0,
        plain = 0;
      for (const row of rows) {
        const bytes = readFileSync(`${data}midi/${pad(row.number)}.mid`);
        const source = yield* sourceOf({ ...row, name: row.title }, bytes, orders);
        const fresh = yield* compile(source);
        const metadata = yield* Schema.decodeEffect(Schema.fromJsonString(Playback))(
          read(`playback/${pad(row.number)}.json`),
        );
        const expected = yield* metadataOf(fresh, metadata.sourceHash).pipe(Effect.flatMap(encode));
        if ((yield* encode(metadata)) !== expected) faults.push([row.number, 1]);
        const actual = joined[row.number - 1];
        if (
          actual === undefined ||
          (yield* metadataOf(actual, metadata.sourceHash).pipe(Effect.flatMap(encode))) !== expected
        )
          faults.push([row.number, 2]);
        const midi = yield* Midi.parse(bytes);
        const result = alignmentFaults(
          fresh,
          Score.fromMidi(midi, source.verses.filter((v) => v.id >= 0).length),
          source,
          midi,
        );
        faults.push(
          ...result.faults.map((f) => [row.number, ...f]),
          ...occurrenceFaults(fresh).map((f) => [row.number, ...f]),
        );
        checked += result.checked;
        melismas += result.melismas;
        shared += result.shared;
        occurrences += sung(fresh).length;
        plain += fresh.stanzas.filter((p) => p._tag === 'Plain').length;
      }
      yield* Console.log(
        `P3 corpus checked=${checked} occurrences=${occurrences} melismas=${melismas} shared=${shared} plain=${plain}`,
      );
      if (faults.length)
        yield* Console.log(
          `P3 corpus faults=${faults
            .slice(0, 30)
            .map((f) => f.join(','))
            .join(';')} count=${faults.length}`,
        );
      expect(faults.slice(0, 30)).toEqual([]);
      expect(checked).toBeGreaterThan(100000);
      expect(occurrences).toBeGreaterThan(10000);
      expect(melismas).toBeGreaterThan(6000);
      expect(shared).toBeGreaterThan(0);
      expect(plain).toBeGreaterThanOrEqual(7);
    }),
);

const caseOf = (seed: number) => {
  const size = 1 + (seed % 65);
  const melody = Array.from({ length: size + 2 }, (_, i) => ({
    start: 384 + i * 96,
    end: 448 + i * 96,
    key: 60 + (i % 12),
    channel: 0,
  }));
  const s = (at: number, notes: number, word: number): Align.Syllable => ({
    text: 'ta',
    note: at,
    notes,
    word,
  });
  const alignment: Align.Alignment = {
    melody,
    lines: [
      [s(0, size, 0), s(size - 1, 0, 1)],
      [s(size - 1, 0, 0), s(size, 1, 1), s(size + 1, 1, 2)],
    ],
    cost: 0,
    melismas: size - 1,
    shared: { inWord: 0, acrossWords: 2 },
  };
  const tick = 384 + (seed % 17);
  const clock = {
    ticksPerBeat: 384,
    lastTick: (melody.at(-1)?.end ?? 0) + 384,
    tempos: [
      { tick: 0, microsPerQuarter: 500000 },
      { tick, microsPerQuarter: 750000 },
    ],
  };
  return { size, melody, alignment, tick, clock };
};

it.effect(
  'P3 generated shared notes, melismas, rests, meters and tempos preserve group anchors',
  () =>
    Effect.gen(function* () {
      const faults: number[][] = [];
      for (let seed = 1; seed <= 128; seed++) {
        const { size, melody, alignment, tick, clock } = caseOf(seed);
        const anchors = Align.anchorsOf(alignment, 384);
        if (
          anchors[0]?.[0]?.end !== melody[size - 1]?.end ||
          anchors[0]?.[1]?.start !== 384 ||
          anchors[1]?.[0]?.start !== melody[size]?.start
        )
          faults.push([seed, 1]);
        const part = {
          _tag: 'Sung',
          level: 'syllable',
          why: [],
          fit: {
            notes: size + 2,
            syllables: 5,
            melismas: size - 1,
            shared: { inWord: 0, acrossWords: 2 },
            cost: 0,
          },
          lines: alignment.lines.map((line) =>
            line.map((s) => ({ text: 'ta', word: s.word, notes: s.notes, beats: s.notes })),
          ),
        };
        const candidate = {
          version: 1,
          book: 'sdah-1985',
          number: 1,
          title: 'Synthetic 1',
          key: { tonic: 'C', minor: false },
          meter: { numerator: seed % 2 ? 6 : 3, denominator: 8 },
          verses: { text: 1, midi: 1, exact: true },
          stanzas: [part],
        };
        const hymn = yield* Schema.decodeUnknownEffect(Hymn)(candidate);
        const timing = timingOf(hymn, clock, [
          {
            played: true,
            span: { start: 384, end: clock.lastTick },
            stanza: 2,
            tail: 0,
            starts: anchors.map((line) => line.map((a) => a.start)),
          },
        ]);
        for (const line of timing.lines)
          for (const at of line.syllables) {
            const rawTick = at * 4;
            const expected =
              (Math.min(rawTick, tick) * 500000 + Math.max(0, rawTick - tick) * 750000) / 384 / 1e6;
            // Rounding a tempo event onto the 1/96-beat grid permits at most 4 ms here.
            if (Math.abs(secondsAt(timing)(at) - expected) > 0.004) faults.push([seed, 2]);
          }
        // A dedicated monophonic tune survives; a polyphonic distractor does not.
        const soprano = { name: '', program: 5, notes: melody };
        const accompaniment = {
          name: '',
          program: 105,
          notes: melody.flatMap((n) => [n, { ...n, key: n.key - 7 }]),
        };
        const midi: Midi.Midi = {
          ...clock,
          tracks: [accompaniment, soprano],
          keySignatures: [],
          timeSignatures: [
            { tick: 0, numerator: 6, denominator: 8 },
            { tick: 768, numerator: 3, denominator: 4 },
          ],
        };
        if (Score.melodyOf(midi, [soprano]).some((n, i) => n !== melody[i])) faults.push([seed, 3]);
        if (
          Score.melodyOf({ ...midi, tracks: [{ ...soprano, program: 68 }, soprano] }, [
            soprano,
          ]).some((n, i) => n !== melody[i])
        )
          faults.push([seed, 4]);
      }
      if (faults.length)
        yield* Console.log(
          `P3 synthetic faults=${faults
            .slice(0, 30)
            .map((f) => f.join(','))
            .join(';')} count=${faults.length}`,
        );
      expect(faults).toEqual([]);
    }),
);
