/* oxlint-disable effect/noNodeBuiltinImport -- read-only corpus fixture; compilation remains in memory. */
import { readFileSync } from 'node:fs';
import { Console, Effect, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';
import * as Align from './align.js';
import * as Midi from './midi.js';
import * as Score from './score.js';
import * as Chord from './chord.js';
import * as Placement from './placement.js';
import { type compile, compilePlacements } from './compile.js';
import { Hymn, type Syllable, sung } from './hymn.js';
import { Playback, PlacementData, metadataOf, placementPatches } from './playback.js';
import { secondsAt, timingOf } from './timing.js';
import { readPlayback } from '../scripts/playback.js';
import { decodeOrders, sourceOf } from '../scripts/sources.js';
import { decodeSourceText } from '../scripts/source-text.js';

const data = new URL('../data/', import.meta.url).pathname;
const read = (file: string) => readFileSync(`${data}${file}`, 'utf8');
const decode = Schema.decodeEffect(Schema.fromJsonString(Hymn));
const pad = (n: number) => String(n).padStart(3, '0');
const sameNotes = (actual: readonly Midi.Note[], expected: readonly Midi.Note[]) =>
  actual.length === expected.length &&
  actual.every(
    (note, i) =>
      note.start === expected[i]?.start &&
      note.end === expected[i]?.end &&
      note.key === expected[i]?.key,
  );
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

const refrainFaults = (
  hymn: Hymn,
  v: number,
  anchors: ReturnType<typeof Align.anchorsOf>,
  count: number,
  span: Score.Span,
  intro: number,
  shift: number,
  tpb: number,
) => {
  const heard = sung(hymn);
  const first = heard.findIndex((line) => line.verse === v + 1);
  const tail = anchors.slice(count);
  const faults: number[][] = [];
  const check = (at: number, move: number) => {
    for (const [l, line] of tail.entries()) {
      const timed = hymn.timing?.lines[at + l];
      if (timed?.even !== false) continue;
      for (const [k, anchor] of line.entries())
        if (timed.syllables[k] !== Math.round(((anchor.start + move) * 96) / tpb))
          faults.push([11, at + l, k]);
    }
  };
  if (heard[first + count]?.verse === 'refrain') check(first + count, shift);
  if (v === 0 && heard[0]?.verse === 'refrain' && tail.length > 0) check(0, intro - span.end);
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
    if (span !== undefined)
      faults.push(
        ...refrainFaults(
          fresh,
          v,
          anchors,
          linesOf(stanza.text).length,
          span,
          score.verses.spans[0]?.start ?? 0,
          shift,
          midi.ticksPerBeat,
        ),
      );
    checked += anchors.flat().length;
    melismas += anchors.flat().filter((a) => a.notes > 1).length;
    shared += anchors.flat().filter((a) => a.notes === 0).length;
  }
  return { faults, checked, melismas, shared };
};

const referenceStrongAfter = (grid: Placement.Grid, from: number, end: number) => {
  const slack = grid.ticksPerBeat / 16;
  for (const [j, m] of grid.meters.entries()) {
    const compound = m.numerator > 3 && m.numerator % 3 === 0;
    const b = ((grid.ticksPerBeat * 4) / m.denominator) * (compound ? 3 : 1);
    const beats = compound ? m.numerator / 3 : m.numerator;
    const limit = Math.min(end, grid.meters[j + 1]?.tick ?? end) - slack;
    for (let n = Math.max(0, Math.floor((from - m.tick) / b)); m.tick + n * b < limit; n++) {
      const t = m.tick + n * b;
      if (t > from + slack && (n % beats === 0 || (beats === 4 && n % 4 === 2))) return t;
    }
  }
  return from;
};

/** Independent event-list oracle. It never calls the production placement rules. */
const expectedChanges = (
  line: Placement.Line,
  grid: Placement.Grid,
  strong: boolean,
  simpler: boolean,
) => {
  const tick = (c: Placement.Change) => (line.syllables[c.syllable]?.start ?? 0) + c.at;
  const slack = grid.ticksPerBeat / 16;
  const meter = (at: number) =>
    grid.meters.filter((m) => m.tick <= at + slack).at(-1) ?? {
      tick: 0,
      numerator: 4,
      denominator: 4,
    };
  const beat = (m: Midi.TimeSignature) =>
    ((grid.ticksPerBeat * 4) / m.denominator) * (m.numerator > 3 && m.numerator % 3 === 0 ? 3 : 1);
  const count = (m: Midi.TimeSignature) =>
    m.numerator > 3 && m.numerator % 3 === 0 ? m.numerator / 3 : m.numerator;
  const isStrong = (at: number) => {
    const m = meter(at),
      b = beat(m),
      n = Math.round((at - m.tick) / b);
    return (
      Math.abs(at - m.tick - n * b) <= slack &&
      (n % count(m) === 0 || (count(m) === 4 && n % 4 === 2))
    );
  };
  let events = line.changes.map((c, i) => {
    const from = tick(c);
    let to = from;
    const held =
      c.syllable === 0 &&
      c.at === 0 &&
      (line.before === undefined || Chord.equals(line.before, c.chord));
    if (strong && !held && !isStrong(from)) {
      const next = line.changes[i + 1];
      const end = Math.min(line.until, next === undefined ? line.until : tick(next));
      to = referenceStrongAfter(grid, from, end);
    }
    let syllable = c.syllable;
    let offset = c.at;
    if (to !== from) {
      line.syllables.forEach((s, k) => {
        if (s.start <= to + slack) syllable = k;
      });
      offset = to - (line.syllables[syllable]?.start ?? to);
      if (Math.abs(offset) <= slack) offset = 0;
    }
    return {
      tick: (line.syllables[syllable]?.start ?? 0) + offset,
      chord: c.chord,
      syllable,
      at: Math.round((offset / grid.ticksPerBeat) * 1000) / 1000,
    };
  });
  if (simpler) {
    const kept: typeof events = [];
    events.forEach((event, i) => {
      const duration = (events[i + 1]?.tick ?? line.until) - event.tick;
      if (kept.length === 0 || duration >= beat(meter(event.tick))) kept.push(event);
    });
    if (kept[0] && kept[1] && kept[1].tick - kept[0].tick < beat(meter(kept[0].tick)))
      kept.splice(0, 2, { ...kept[0], chord: kept[1].chord });
    events = kept;
  }
  return events;
};

const rawPlacementLine = (
  alignment: Align.Alignment,
  l: number,
  original: readonly Syllable[],
  before: Chord.Chord | undefined,
  tpb: number,
) => {
  const aligned = alignment.lines[l] ?? [];
  const owned = aligned.flatMap((s, k) => (s.notes > 0 ? [k] : []));
  const syllables = owned.map((k) => {
    const s = aligned[k];
    const start = alignment.melody[s?.note ?? -1]?.start ?? 0;
    const end = s === undefined ? start : (alignment.melody[s.note + s.notes - 1]?.end ?? start);
    return { start, length: end - start, key: undefined };
  });
  const changes = owned.flatMap((k, j) =>
    (original[k]?.guitar ?? []).map((c) => ({
      syllable: j,
      at: Math.round(c.at * tpb),
      chord: c.chord,
    })),
  );
  const next = alignment.lines[l + 1]?.find((s) => s.notes > 0);
  const nextStart =
    next === undefined ? Infinity : (alignment.melody[next.note]?.start ?? Infinity);
  const last = syllables.at(-1);
  const input: Placement.Line = {
    syllables,
    changes,
    before,
    until: Math.min(nextStart, (last?.start ?? 0) + (last?.length ?? 0)),
  };
  return { owned, input };
};

const comparePlacementLine = (
  modes: Record<Placement.Placement, Hymn>,
  v: number,
  l: number,
  refrain: boolean,
  owned: readonly number[],
  input: Placement.Line,
  grid: Placement.Grid,
  confirmed: boolean,
) => {
  const faults: number[][] = [];
  for (const mode of ['beat', 'simpler', 'file'] as const) {
    const expected = expectedChanges(input, grid, mode !== 'file' && confirmed, mode === 'simpler');
    const part = refrain ? modes[mode].refrain?.part : modes[mode].stanzas[v];
    const actual =
      part?._tag !== 'Sung'
        ? []
        : owned.flatMap((k, j) =>
            (part.lines[l]?.[k]?.guitar ?? []).map((c) => ({ ...c, syllable: j })),
          );
    const same =
      actual.length === expected.length &&
      actual.every((c, i) => {
        const want = expected[i];
        return (
          want !== undefined &&
          c.syllable === want.syllable &&
          Math.abs(c.at - want.at) <= 0.00051 &&
          Chord.equals(c.chord, want.chord)
        );
      });
    if (!same) faults.push([v, l, ['beat', 'simpler', 'file'].indexOf(mode)]);
  }
  return faults;
};

const refrainLines = (text: string | undefined, lastOnly: boolean, stored: boolean) =>
  text === undefined || (lastOnly && !stored) ? [] : linesOf(text);

const generatedRuleMatches = (
  line: Placement.Line,
  grid: Placement.Grid,
  seed: number,
  mode: Placement.Placement,
) => {
  const confirmed = seed % 2 === 0;
  const expected = expectedChanges(line, grid, mode !== 'file' && confirmed, mode === 'simpler');
  const rule = confirmed ? 'strong+length' : 'length';
  const actual =
    mode === 'file' || (mode === 'beat' && !confirmed)
      ? line.changes
      : Placement.apply(mode === 'beat' ? 'strong' : rule, line, grid);
  return (
    actual.length === expected.length &&
    actual.every(
      (c, i) =>
        c.syllable === expected[i]?.syllable &&
        Math.abs(Math.round((c.at / 96) * 1000) / 1000 - (expected[i]?.at ?? Infinity)) <=
          0.00051 &&
        c.chord.root === expected[i]?.chord.root,
    )
  );
};

it.effect('P4 generated meters, boundaries and shared onsets obey each placement rule', () =>
  Effect.sync(() => {
    const meters = [
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
      [2, 4],
      [3, 4],
      [4, 4],
      [6, 4],
      [9, 4],
      [3, 8],
      [4, 8],
      [6, 8],
      [9, 8],
      [12, 8],
    ];
    const faults: number[][] = [];
    let checked = 0;
    for (let seed = 1; seed <= 128; seed++)
      for (const [m, values] of meters.entries()) {
        const [numerator = 4, denominator = 4] = values;
        const grid: Placement.Grid = {
          ticksPerBeat: 96,
          tonic: 0,
          meters: [
            { tick: 0, numerator, denominator },
            { tick: 1536, numerator: 3, denominator: 4 },
          ],
        };
        const line: Placement.Line = {
          syllables: Array.from({ length: 12 }, (_, k) => ({
            start: 384 + 96 * k + (k > 1 && seed % 3 === 0 ? -96 : 0),
            length: 96 * (1 + ((seed + k) % 5)),
            key: 60 + k,
          })),
          changes: [0, 1, 4, 5, 8, 11].map((syllable, k) => ({
            syllable,
            at: (k % 2) * (seed % 48),
            chord: { root: (k * 5) % 12, quality: '' },
          })),
          until: 1536 + (seed % 96),
          before: seed % 2 ? undefined : { root: 7, quality: '' },
        };
        for (const mode of ['beat', 'simpler', 'file'] as const) {
          if (!generatedRuleMatches(line, grid, seed, mode))
            faults.push([seed, m, ['beat', 'simpler', 'file'].indexOf(mode)]);
          checked++;
        }
      }
    expect(checked).toBe(5376);
    expect(faults.slice(0, 10)).toEqual([]);
  }),
);

const placementFaults = (
  modes: Record<Placement.Placement, Hymn>,
  score: Score.Score,
  source: Parameters<typeof compile>[0],
) => {
  const faults: number[][] = [];
  const file = modes.file;
  const texts = source.verses.filter((v) => v.id >= 0).toSorted((a, b) => a.id - b.id);
  const refrainText = source.verses.find((v) => v.id < 0);
  const lastOnly = source.order === 'first-and-last' || source.order === 'after-last';
  const storedFrom = lastOnly ? texts.length - 1 : 0;
  const grid: Placement.Grid = { ticksPerBeat: score.ticksPerBeat, meters: score.meters, tonic: 0 };
  const confirmed = Placement.confirms(
    {
      ...grid,
      ticksPerBeat: 96,
      meters: grid.meters.map((m) => ({ ...m, tick: (m.tick * 96) / grid.ticksPerBeat })),
    },
    Placement.judgedLines(file),
  );
  let lines = 0;
  for (const [v, text] of texts.entries()) {
    const tail = refrainLines(refrainText?.text, lastOnly, v === storedFrom);
    const count = linesOf(text.text).length;
    const alignment = Align.align(score, Math.min(v, score.verses.spans.length - 1), [
      ...linesOf(text.text),
      ...tail,
    ]);
    let before: Chord.Chord | undefined;
    for (const [l] of alignment.lines.entries()) {
      const refrain = l >= count;
      const part = refrain ? file.refrain?.part : file.stanzas[v];
      const lineIndex = refrain ? l - count : l;
      if (part?._tag !== 'Sung') continue;
      const original = part.lines[lineIndex] ?? [];
      const { owned, input } = rawPlacementLine(alignment, l, original, before, score.ticksPerBeat);
      before = input.changes.at(-1)?.chord ?? before;
      if (refrain && v !== storedFrom) continue; // Repeated occurrences share the stored refrain's anchors, checked below.
      lines++;
      faults.push(
        ...comparePlacementLine(modes, v, lineIndex, refrain, owned, input, grid, confirmed),
      );
    }
  }
  return { faults, lines };
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
        placementLines = 0,
        occurrences = 0,
        melismas = 0,
        shared = 0,
        plain = 0;
      for (const row of rows) {
        const bytes = readFileSync(`${data}midi/${pad(row.number)}.mid`);
        const source = yield* sourceOf({ ...row, name: row.title }, bytes, orders);
        const modes = yield* compilePlacements(source);
        const fresh = modes.beat;
        const metadata = yield* Schema.decodeEffect(Schema.fromJsonString(Playback))(
          read(`playback/${pad(row.number)}.json`),
        );
        const base = yield* metadataOf(fresh, metadata.sourceHash);
        const expected = yield* encode(base);
        const placements = {
          file: placementPatches(fresh, modes.file),
          simpler: placementPatches(fresh, modes.simpler),
        };
        const alternative = yield* Schema.decodeEffect(Schema.fromJsonString(PlacementData))(
          read(`playback/${pad(row.number)}.placements.json`),
        );
        if (
          (yield* Schema.encodeEffect(Schema.fromJsonString(PlacementData))(alternative)) !==
          (yield* Schema.encodeEffect(Schema.fromJsonString(PlacementData))({
            sourceHash: metadata.sourceHash,
            placements,
          }))
        )
          faults.push([row.number, 15]);
        if ((yield* encode(metadata)) !== expected) faults.push([row.number, 1]);
        for (const other of [modes.file, modes.simpler]) {
          const withoutGuitar = (m: Playback): Playback => {
            const parts = (parts: Playback['stanzas']) =>
              parts.map((p) => ({
                ...p,
                lines: p.lines.map((line) => line.map((s) => ({ ...s, guitar: [] }))),
              }));
            return { ...m, stanzas: parts(m.stanzas), refrain: parts(m.refrain) };
          };
          const numeric = yield* metadataOf(other, metadata.sourceHash);
          if ((yield* encode(withoutGuitar(numeric))) !== (yield* encode(withoutGuitar(base))))
            faults.push([row.number, 13]);
        }
        const actual = joined[row.number - 1];
        if (
          actual === undefined ||
          (yield* metadataOf(actual, metadata.sourceHash).pipe(Effect.flatMap(encode))) !== expected
        )
          faults.push([row.number, 2]);
        const midi = yield* Midi.parse(bytes);
        const placementsChecked = placementFaults(
          modes,
          Score.fromMidi(midi, source.verses.filter((v) => v.id >= 0).length),
          source,
        );
        placementLines += placementsChecked.lines;
        faults.push(...placementsChecked.faults.map((f) => [row.number, 14, ...f]));
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
      yield* Console.log(`P4 corpus placementLines=${placementLines} modes=3`);
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
        if (!sameNotes(Score.melodyOf(midi, [soprano]), melody)) faults.push([seed, 3]);
        const dedicated = {
          ...soprano,
          program: 68,
          notes: melody.map((note) => ({ ...note, key: note.key + 12 })),
        };
        if (
          !sameNotes(
            Score.melodyOf({ ...midi, tracks: [dedicated, soprano] }, [soprano]),
            dedicated.notes,
          )
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
