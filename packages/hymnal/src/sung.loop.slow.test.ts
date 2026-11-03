/**
 * The sung file's loop rule (`sung.ts`): a file whose read plays fewer
 * verses than the text has stanzas plays its last verse again for each
 * stanza past them, each pass running from the last verse's start to the
 * file's end, with the tempo, meter and key of that start in effect again at
 * each pass's start; any other file is sung as it stands. Held over files
 * drawn from a fixed seed, and over every hymn's own file. Only numbers,
 * ticks and indexes are reported.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Effect, Equal, FileSystem, Option, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from './midi.js';
import * as Score from './score.js';
import * as Sung from './sung.js';

const test = it.scopedLive.layer(BunServices.layer);

/** A fixed-seed source of numbers in [0, 1) (mulberry32), so each run draws the same files. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const at = <A>(items: ReadonlyArray<A>, index: number): A =>
  Option.getOrThrow(Arr.get(items, index));

const RESOLUTIONS = [96, 192, 384, 480] as const;
const METERS = [
  [4, 4],
  [3, 4],
  [6, 8],
  [2, 2],
  [3, 2],
] as const;

/** A drawn file and the stanzas its text has. */
interface Drawn {
  readonly midi: Midi.Midi;
  readonly stanzas: number;
}

/** One sung note drawn: its key, its length and the rest after it, in half beats. */
interface Step {
  readonly key: number;
  readonly halves: number;
  readonly rest: number;
}

const byStart = (notes: ReadonlyArray<Midi.Note>) =>
  [...notes].sort((a, b) => a.start - b.start || a.key - b.key);

/**
 * A file laid out as the hymnal's are: a tune on its own keyboard track (an
 * intro of up to four notes, then one verse of 8 to 16 notes played one to
 * three times over), a bass under each note (the last one sometimes held to
 * the file's end), a silent tail; tempo changes anywhere (sometimes none at
 * tick 0, sometimes one on the last verse's first note or at the file's
 * end), a meter at tick 0 and sometimes a second, a key signature or none.
 * The text has from one stanza up to four more than the verses played.
 */
const draw = (random: () => number): Drawn => {
  const int = (n: number) => Math.floor(random() * n);
  const chance = (p: number) => random() < p;
  const tpb = at(RESOLUTIONS, int(RESOLUTIONS.length));
  const half = tpb / 2;
  const [numerator, denominator] = at(METERS, int(METERS.length));
  const step = (): Step => ({
    key: 60 + int(13),
    halves: 1 + int(4),
    rest: Math.max(0, int(6) - 4),
  });
  const intro = Array.from({ length: int(5) }, step);
  const verse = Array.from({ length: 8 + int(9) }, step);
  const repeats = 1 + int(3);
  const tune: Array<Midi.Note> = [];
  const bass: Array<Midi.Note> = [];
  const starts: Array<number> = [];
  let tick = 0;
  const lay = (steps: ReadonlyArray<Step>) => {
    for (const { key, halves, rest } of steps) {
      const end = tick + halves * half;
      tune.push({ start: tick, end, key, channel: 0 });
      bass.push({ start: tick, end, key: 36 + (key % 12), channel: 1 });
      tick = end + rest * half;
    }
  };
  lay(intro);
  for (let r = 0; r < repeats; r++) {
    starts.push(tick);
    lay(verse);
  }
  const lastTick = tick + int(3) * half;
  const held = at(bass, bass.length - 1);
  bass[bass.length - 1] = { ...held, end: Math.max(held.end, Number(chance(0.5)) * lastTick) };
  const noteStart = () => at(tune, int(tune.length)).start;
  const tempoTicks = [
    ...[0].filter(() => chance(0.8)),
    ...Array.from({ length: int(4) }, () => 1 + int(lastTick - 1)),
    ...[at(starts, starts.length - 1)].filter(() => chance(0.3)),
    ...[lastTick].filter(() => chance(0.3)),
  ];
  const tempos = [...new Set(tempoTicks)]
    .sort((a, b) => a - b)
    .map((t) => ({ tick: t, microsPerQuarter: 400_000 + int(800_001) }));
  const timeSignatures = [
    { tick: 0, numerator, denominator },
    ...[noteStart()]
      .filter((t) => t > 0 && chance(0.3))
      .map((t) => ({ tick: t, numerator: 3, denominator: 4 })),
  ];
  const keySignatures = [{ tick: 0, fifths: int(15) - 7, minor: chance(0.2) }]
    .filter(() => chance(0.7))
    .flatMap((first) => [
      first,
      ...[noteStart()]
        .filter((t) => t > 0 && chance(0.3))
        .map((t) => ({ tick: t, fifths: int(15) - 7, minor: false })),
    ]);
  return {
    midi: {
      ticksPerBeat: tpb,
      tracks: [
        { name: 'tune', notes: byStart(tune), program: 5 },
        { name: 'bass', notes: byStart(bass), program: 5 },
      ],
      timeSignatures,
      keySignatures,
      tempos,
      lastTick,
    },
    stanzas: 1 + int(repeats + 4),
  };
};

/** The last of `events` at or before `tick`, as text; `none` when none is. */
const inEffect = <A extends { readonly tick: number }>(
  events: ReadonlyArray<A>,
  tick: number,
  text: (event: A) => string,
  none: string,
) =>
  Option.match(Option.fromUndefinedOr(events.findLast((event) => event.tick <= tick)), {
    onNone: () => none,
    onSome: text,
  });

/** The tempo, meter and key a file plays at `tick`: a file with no tempo event yet plays at 500000. */
const stateAt = (midi: Midi.Midi, tick: number) =>
  [
    inEffect(midi.tempos, tick, (e) => String(e.microsPerQuarter), '500000'),
    inEffect(midi.timeSignatures, tick, (e) => `${e.numerator}/${e.denominator}`, 'none'),
    inEffect(midi.keySignatures, tick, (e) => `${e.fifths}:${e.minor}`, 'none'),
  ].join(' ');

const noteText = (note: Midi.Note) => `${note.start}-${note.end}:${note.key}:${note.channel}`;
const sortedTexts = (notes: ReadonlyArray<Midi.Note>) => notes.map(noteText).sort();
const ascending = (ticks: ReadonlyArray<number>) =>
  ticks.every((t, i) => i === 0 || t >= at(ticks, i - 1));
const inOrder = (notes: ReadonlyArray<Midi.Note>) =>
  notes.every((note, k) => {
    const before = Arr.get(notes, k - 1);
    return Option.isNone(before) || byStart([before.value, note])[0] === before.value;
  });

/** A score's fields besides its verses. */
const scoreFields = (score: Score.Score) => [
  score.ticksPerBeat,
  score.beatsPerBar,
  score.meter,
  score.meters,
  score.key,
  score.harmony,
  score.melody,
];

/**
 * What `Sung.of` breaks of the loop rule on a file whose read plays fewer
 * verses than `stanzas`: its last verse runs from `a` (its start) to the
 * file's end, `length` ticks, and is played `stanzas - played + 1` times.
 */
const loopProblems = (midi: Midi.Midi, stanzas: number): ReadonlyArray<string> => {
  const read = Score.fromMidi(midi, stanzas);
  const played = read.verses.spans.length;
  const last = at(read.verses.spans, played - 1);
  const a = last.start;
  const length = midi.lastTick - a;
  const more = stanzas - played;
  const passes = Array.from({ length: more + 1 }, (_, j) => j);
  const sung = Sung.of(midi, stanzas);
  const out = sung.midi;
  const problems: Array<string> = [];
  const want = (name: string, ok: boolean) => {
    if (!ok) problems.push(name);
  };
  const spans = [
    ...read.verses.spans.slice(0, played - 1),
    ...passes.slice(0, more).map((j) => ({ start: a + j * length, end: a + (j + 1) * length })),
    { start: a + more * length, end: last.end + more * length },
  ];
  want('spans', Equal.equals(sung.score.verses.spans, spans));
  want('exact', sung.score.verses.exact === read.verses.exact);
  want('lastTick', out.lastTick === midi.lastTick + more * length);
  want('ticksPerBeat', out.ticksPerBeat === midi.ticksPerBeat);
  want(
    'tracks',
    Equal.equals(
      out.tracks.map((t) => [t.name, t.program]),
      midi.tracks.map((t) => [t.name, t.program]),
    ),
  );
  midi.tracks.forEach((track, i) => {
    const notes = Option.match(Arr.get(out.tracks, i), {
      onNone: () => [],
      onSome: (t) => t.notes,
    });
    const verse = track.notes.filter((note) => note.start >= a);
    const expected = [
      ...track.notes.filter((note) => note.start < a),
      ...passes.flatMap((j) =>
        verse.map((note) => ({
          ...note,
          start: note.start + j * length,
          end: note.end + j * length,
        })),
      ),
    ];
    want(`track ${i} notes`, Equal.equals(sortedTexts(notes), sortedTexts(expected)));
    want(`track ${i} order`, inOrder(notes));
  });
  const eventTicks = [...midi.tempos, ...midi.timeSignatures, ...midi.keySignatures].map(
    (event) => event.tick,
  );
  const probes = [
    ...new Set(
      [0, a, midi.lastTick - 1, ...eventTicks.flatMap((t) => [t - 1, t, t + 1])].filter(
        (t) => t >= 0 && t < midi.lastTick,
      ),
    ),
  ];
  for (const t of probes) {
    if (t < a) want(`state at ${t}`, stateAt(out, t) === stateAt(midi, t));
    else
      for (const j of passes)
        want(`state at ${t} pass ${j}`, stateAt(out, t + j * length) === stateAt(midi, t));
  }
  const seconds = Midi.secondsAt(midi);
  const outSeconds = Midi.secondsAt(out);
  const pass = seconds(midi.lastTick) - seconds(a);
  for (const j of passes)
    want(
      `pass ${j} seconds`,
      Math.abs(outSeconds(a + (j + 1) * length) - outSeconds(a + j * length) - pass) < 1e-9,
    );
  want('tempos by tick', ascending(out.tempos.map((e) => e.tick)));
  want('meters by tick', ascending(out.timeSignatures.map((e) => e.tick)));
  want('keys by tick', ascending(out.keySignatures.map((e) => e.tick)));
  want('score', Equal.equals(scoreFields(sung.score), scoreFields(Score.fromMidi(out, stanzas))));
  return problems;
};

/** What `Sung.of` breaks on a file whose read plays at least `stanzas` verses: it sings the file as it stands. */
const keptProblems = (midi: Midi.Midi, stanzas: number): ReadonlyArray<string> => {
  const sung = Sung.of(midi, stanzas);
  return [
    ...['midi'].filter(() => !Equal.equals(sung.midi, midi)),
    ...['score'].filter(() => !Equal.equals(sung.score, Score.fromMidi(midi, stanzas))),
  ];
};

const CASES = 300;

describe('the sung file', () => {
  it.effect(
    'plays the last verse once for each stanza past the verses a drawn file plays, and any other drawn file as it stands',
    () =>
      Effect.sync(() => {
        const random = seeded(663);
        const looped: Array<string> = [];
        const kept: Array<string> = [];
        let loops = 0;
        for (let k = 0; k < CASES; k++) {
          const { midi, stanzas } = draw(random);
          const played = Score.fromMidi(midi, stanzas).verses.spans.length;
          if (played < stanzas) {
            loops++;
            looped.push(...loopProblems(midi, stanzas).map((problem) => `case ${k}: ${problem}`));
          } else
            kept.push(...keptProblems(midi, stanzas).map((problem) => `case ${k}: ${problem}`));
        }
        expect(loops).toBeGreaterThanOrEqual(120);
        expect(CASES - loops).toBeGreaterThanOrEqual(100);
        expect(looped.slice(0, 12)).toEqual([]);
        expect(kept.slice(0, 12)).toEqual([]);
      }),
  );

  test("loops every hymn's file whose read plays fewer verses than its text has stanzas, today 663 alone, and sings every other as it stands", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const data = path.join(import.meta.dir, '..', 'data');
      const decode = Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Struct({ verses: Schema.Struct({ text: Schema.Int }) })),
      );
      const looped: Array<number> = [];
      const problems: Array<string> = [];
      for (let n = 1; n <= 695; n++) {
        const padded = String(n).padStart(3, '0');
        const text = yield* fs.readFileString(path.join(data, 'sdah-1985', `${padded}.json`));
        const stanzas = (yield* decode(text)).verses.text;
        const bytes = yield* fs.readFile(path.join(data, 'midi', `${padded}.mid`));
        const midi = yield* Midi.parse(bytes);
        const played = Score.fromMidi(midi, stanzas).verses.spans.length;
        if (played < stanzas) {
          looped.push(n);
          problems.push(...loopProblems(midi, stanzas).map((problem) => `${n}: ${problem}`));
        } else problems.push(...keptProblems(midi, stanzas).map((problem) => `${n}: ${problem}`));
      }
      expect(looped).toEqual([663]);
      expect(problems.slice(0, 12)).toEqual([]);
    }));

  test('sings 663 six times through: 9216 ticks a pass, 15.945102 s each', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const bytes = yield* fs.readFile(path.join(import.meta.dir, '..', 'data', 'midi', '663.mid'));
      const midi = yield* Midi.parse(bytes);
      const sung = Sung.of(midi, 6);
      expect(sung.score.verses.spans).toEqual([
        { start: 0, end: 9216 },
        { start: 9216, end: 18432 },
        { start: 18432, end: 27648 },
        { start: 27648, end: 36864 },
        { start: 36864, end: 46080 },
        { start: 46080, end: 55292 },
      ]);
      expect(sung.midi.lastTick).toBe(55296);
      const seconds = Midi.secondsAt(sung.midi);
      for (let k = 0; k < 6; k++)
        expect(Math.abs(seconds((k + 1) * 9216) - seconds(k * 9216) - 15.945102)).toBeLessThan(
          1e-6,
        );
      expect(Math.abs(Midi.secondsOf(sung.midi) - 95.670612)).toBeLessThan(1e-6);
    }));
});
