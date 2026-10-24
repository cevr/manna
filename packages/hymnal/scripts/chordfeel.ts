/**
 * The chordfeel study: where a guitarist would strike each chord change,
 * by each candidate rule in `src/placement.ts`, set beside where the
 * compiler puts the changes today.
 *
 *   bun packages/hymnal/scripts/chordfeel.ts --out <dir> [--seed <n>]
 *
 * It takes hymns 373 and 388 and, for each meter, 12 hymns picked with a
 * fixed seed (every hymn of a meter with fewer), each with a sung first
 * stanza and timing. For each line of the first stanza and of the refrain
 * it lays out the beat grid (from the MIDI file's meters, bars counted from
 * tick 0), the melody note, today's guitar chords and each rule's chords.
 * A table counts, for each rule, the chords that move or fold and the lines
 * that change; a rule that does not put 373's refrain line 0 on the owner's
 * syllables 3 and 7 is marked so.
 *
 * For 388 (and 373 beside it) it measures each guitar chord's syllable
 * today, its onset in the file (the start of the guitar-level harmony span
 * that holds it), and the syllable whose start is nearest that onset with
 * the words as laid today and with the same words laid on the file's
 * soprano. The cause of a chord that is not on its soprano syllable: held
 * over (a line's first chord sounding from before the line), syllable
 * split (today's chord stands at the file's change, so only the laying of
 * the words differs), timing (its syllable has no note), else the
 * placement rule.
 *
 * Writes `<dir>/index.html`, which shows each syllable's text read live from
 * the compiled hymns for the owner (never commit it), and
 * `<dir>/summary.json`, numbers and syllable indices only.
 */

import { Effect, Schema } from 'effect';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import * as Align from '../src/align.js';
import * as Chord from '../src/chord.js';
import * as Harmony from '../src/harmony.js';
import { Hymn, PER_BEAT, type Syllable, sung } from '../src/hymn.js';
import * as Midi from '../src/midi.js';
import * as Placement from '../src/placement.js';
import * as Score from '../src/score.js';

const usage = 'usage: bun packages/hymnal/scripts/chordfeel.ts --out <dir> [--seed <n>]';

const DATA = path.resolve(import.meta.dir, '../data');
const STUDY = [373, 388] as const;
const PER_METER = 12;
const OWNER_373 = [3, 7] as const;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const out = flag('--out');
const seed = Number(flag('--seed') ?? 2026_10_23);
if (out === undefined || !Number.isInteger(seed)) {
  console.error(usage);
  process.exit(2);
}

const pad = (n: number) => String(n).padStart(3, '0');
const decodeHymn = Schema.decodeUnknownEffect(Hymn);

/** A fixed-seed shuffle (mulberry32), so the sample is the same every run. */
const shuffled = <A>(items: readonly A[], from: number): A[] => {
  let state = from >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [list[i], list[j]] = [list[j] as A, list[i] as A];
  }
  return list;
};

interface Loaded {
  readonly hymn: Hymn;
  readonly midi: Midi.Midi;
  readonly score: Score.Score;
}

const load = (n: number) =>
  Effect.gen(function* () {
    const json: unknown = yield* Effect.promise(() =>
      Bun.file(`${DATA}/sdah-1985/${pad(n)}.json`).json(),
    );
    const hymn = yield* decodeHymn(json);
    const bytes = yield* Effect.promise(() => Bun.file(`${DATA}/midi/${pad(n)}.mid`).bytes());
    const midi = yield* Midi.parse(bytes);
    return { hymn, midi, score: Score.fromMidi(midi, hymn.stanzas.length) } satisfies Loaded;
  });

/** One studied line: where it sits in the hymn, its words (for the page alone) and its placement input. */
interface Studied {
  readonly verse: number | 'refrain';
  readonly line: number;
  readonly syllables: readonly Syllable[];
  readonly input: Placement.Line;
}

const meterName = (hymn: Hymn) => `${hymn.meter.numerator}/${hymn.meter.denominator}`;

/**
 * The first stanza's lines and the refrain's, each with its sung times: a
 * refrain's from where the file plays it after the stanza it is stored
 * from (the first, or the last when it is sung after the last alone).
 */
const studiedLines = ({ hymn, score }: Loaded): Studied[] => {
  const timing = hymn.timing;
  if (timing === undefined) return [];
  const tpb = score.ticksPerBeat;
  const ticks = (t: number) => Math.round((t * tpb) / PER_BEAT);
  const slack = tpb / 16;
  const all = sung(hymn);
  const order = hymn.refrain?.order;
  const lastOnly = order === 'first-and-last' || order === 'after-last';
  const refrainAt = all.flatMap((line, i) =>
    line.verse === 'refrain' && line.line === 0 && timing.lines[i]?.played === true ? [i] : [],
  );
  const refrainFrom = lastOnly ? refrainAt.at(-1) : refrainAt[0];
  const lastChord = (i: number): Chord.Chord | undefined => {
    const before = all[i - 1];
    if (before === undefined || before.part._tag !== 'Sung') return undefined;
    const syllables = before.part.lines[before.line] ?? [];
    return syllables.flatMap((s) => s.guitar ?? []).at(-1)?.chord;
  };
  return all.flatMap((line, i): Studied[] => {
    const wanted =
      line.verse === 1 ||
      (line.verse === 'refrain' &&
        refrainFrom !== undefined &&
        i >= refrainFrom &&
        i <
          refrainFrom + (hymn.refrain?.part._tag === 'Sung' ? hymn.refrain.part.lines.length : 0));
    const time = timing.lines[i];
    if (!wanted || line.part._tag !== 'Sung' || time === undefined || time.even) return [];
    const syllables = line.part.lines[line.line] ?? [];
    if (time.syllables.length !== syllables.length) return [];
    const starts = time.syllables.map(ticks);
    const input: Placement.Line = {
      syllables: syllables.map((s, k) => {
        const start = starts[k] ?? 0;
        const note = score.melody.find((m) => Math.abs(m.start - start) <= slack);
        return { start, length: Math.round(s.beats * tpb), key: note?.key };
      }),
      changes: syllables.flatMap((s, k) =>
        (s.guitar ?? []).map((c) => ({ syllable: k, at: Math.round(c.at * tpb), chord: c.chord })),
      ),
      until: ticks(time.until),
      before: lastChord(i),
    };
    return [{ verse: line.verse, line: line.line, syllables, input }];
  });
};

const gridOf = ({ score }: Loaded): Placement.Grid => ({
  ticksPerBeat: score.ticksPerBeat,
  meters: score.meters,
  tonic: Chord.pitchClass(score.key.tonic),
});

const same = (a: Placement.Change, b: Placement.Change) =>
  a.syllable === b.syllable && a.at === b.at && Chord.equals(a.chord, b.chord);

/** How a rule's changes differ from today's: changes at a new place, changes folded away. */
const compare = (today: readonly Placement.Change[], rule: readonly Placement.Change[]) => {
  const moved = rule.filter((c) => !today.some((t) => same(t, c))).length;
  const folded = today.length - rule.length;
  return { moved, folded, changed: moved > 0 || folded !== 0 };
};

// --- 388: where its chords sit against its file ---

interface Mismatch {
  readonly verse: number | 'refrain';
  readonly line: number;
  readonly chord: string;
  readonly syllable: number;
  readonly at: number;
  /** The guitar-level harmony's change in the file, in ticks. */
  readonly onset: number | undefined;
  /** The syllable whose start is nearest the onset, as the words are laid today. */
  readonly nearest: Place | undefined;
  /** The same, with the words laid on the soprano's notes. */
  readonly nearestOnTune: Place | undefined;
  readonly cause: 'agrees' | 'held over' | 'syllable split' | 'timing' | 'placement rule';
}

/** The tune as the soprano's top voice: the first harmony track. */
const sopranoOf = (midi: Midi.Midi) => {
  const soprano = Score.harmonyTracks(midi)[0];
  return soprano === undefined ? [] : Score.topVoice(soprano.notes, midi.ticksPerBeat / 16);
};

/** Which track the compiler reads the tune from: the first sounding track, unless it is a harmony track. */
const melodyTrack = (midi: Midi.Midi) => {
  const harmony = Score.harmonyTracks(midi);
  const first = midi.tracks.find((track) => track.notes.length > 0);
  const own = first !== undefined && !harmony.includes(first) ? first : harmony[0];
  return {
    index: own === undefined ? -1 : midi.tracks.indexOf(own),
    program: own?.program,
    harmony: harmony.map((track) => midi.tracks.indexOf(track)),
  };
};

/** The words of the studied lines laid on the soprano's notes instead: the fit, and each line's syllable starts. */
const relaid = (loaded: Loaded, lines: readonly Studied[]) => {
  const { midi, hymn, score } = loaded;
  const melody = sopranoOf(midi);
  const soprano: Score.Score = {
    ...score,
    melody,
    verses: Score.findVerses(melody, hymn.stanzas.length),
  };
  const text = (l: Studied) =>
    l.syllables
      .map((s, k) => `${k === 0 ? '' : l.syllables[k - 1]?.word === s.word ? '' : ' '}${s.text}`)
      .join('');
  const alignment = Align.align(soprano, 0, lines.map(text));
  const syllables = alignment.lines.reduce((n, l) => n + l.length, 0);
  let last = 0;
  return {
    verses: soprano.verses.spans.length,
    exact: soprano.verses.exact,
    notesPerSyllable: alignment.melody.length / Math.max(1, syllables),
    costPerSyllable: alignment.cost / Math.max(1, syllables),
    melismas: alignment.melismas,
    starts: alignment.lines.map((line) =>
      line.map((s) => {
        last = s.notes === 0 ? last : (alignment.melody[s.note]?.start ?? last);
        return last;
      }),
    ),
  };
};

interface Place {
  /** The studied line, counted from 0 over the first stanza and the refrain. */
  readonly line: number;
  readonly syllable: number;
}

/** The syllable, over all the studied lines, whose start is nearest the tick. */
const placeOf = (starts: ReadonlyArray<readonly number[]>, tick: number): Place | undefined =>
  starts
    .flatMap((line, l) => line.map((start, syllable) => ({ line: l, syllable, start })))
    .reduce<(Place & { start: number }) | undefined>(
      (best, p) =>
        best === undefined || Math.abs(p.start - tick) < Math.abs(best.start - tick) ? p : best,
      undefined,
    );

const causesOf = (rows: readonly Mismatch[]) =>
  rows.reduce<Record<string, number>>((o, r) => ({ ...o, [r.cause]: (o[r.cause] ?? 0) + 1 }), {});

const placeAt = (starts: ReadonlyArray<readonly number[]>, tick: number): Place | undefined => {
  const found = placeOf(starts, tick);
  return found === undefined ? undefined : { line: found.line, syllable: found.syllable };
};

/**
 * Each guitar chord of the studied lines against the file: its onset, the
 * syllable nearest it as laid today and as laid on the soprano, and why
 * they differ. The words of the first stanza and the refrain are laid on
 * the first verse of the file, as the compiler lays stanza 1.
 */
const measureChords = (loaded: Loaded, lines: readonly Studied[]) => {
  const { score, midi, hymn } = loaded;
  const slack = score.ticksPerBeat / 16;
  const soprano = sopranoOf(midi);
  const onSoprano = (tick: number) => soprano.some((n) => Math.abs(n.start - tick) <= slack);
  const span = score.verses.spans[0] ?? { start: 0, end: midi.lastTick };
  const spans = Harmony.chords(score, span.start, span.end, 'guitar');
  const onTune = relaid(loaded, lines);
  const today = lines.map((l) => l.input.syllables.map((s) => s.start));
  const rows: Mismatch[] = lines.flatMap((studied, li) => {
    const { input } = studied;
    return input.changes.map((change): Mismatch => {
      const tick = Placement.tickOf(input, change);
      const same = spans.filter((s) => Chord.equals(s.chord, change.chord));
      const found =
        same.find((s) => s.start - slack <= tick && tick < s.end) ??
        same.reduce<Harmony.Span | undefined>(
          (best, s) =>
            best === undefined || Math.abs(s.start - tick) < Math.abs(best.start - tick) ? s : best,
          undefined,
        );
      const onset = found?.start;
      const nearest = onset === undefined ? undefined : placeAt(today, onset);
      const nearestOnTune = onset === undefined ? undefined : placeAt(onTune.starts, onset);
      const own = input.syllables[change.syllable];
      const here = (p: Place | undefined) =>
        p !== undefined && p.line === li && p.syllable === change.syllable;
      const heldOver =
        change.syllable === 0 &&
        change.at === 0 &&
        onset !== undefined &&
        own !== undefined &&
        onset < own.start - slack;
      // A chord today stands where the file changes, on today's syllables, so
      // it differs from the soprano's laying only where the words lie on other notes.
      const cause: Mismatch['cause'] = heldOver
        ? 'held over'
        : here(nearestOnTune)
          ? 'agrees'
          : onset !== undefined && Math.abs(tick - onset) <= slack
            ? 'syllable split'
            : own?.key === undefined
              ? 'timing'
              : 'placement rule';
      return {
        verse: studied.verse,
        line: studied.line,
        chord: Chord.format(change.chord, hymn.key),
        syllable: change.syllable,
        at: change.at,
        onset,
        nearest,
        nearestOnTune,
        cause,
      };
    });
  });
  const starts = lines.flatMap((l) => l.input.syllables);
  return {
    rows,
    starts: starts.length,
    startsOnSoprano: starts.filter((s) => onSoprano(s.start)).length,
    startsWithNoNote: starts.filter((s) => s.key === undefined).length,
    onTune,
  };
};

// --- The page ---

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const noteName = (key: number | undefined) =>
  key === undefined ? '·' : `${NOTE[key % 12]}${Math.floor(key / 12) - 1}`;

const beatLabel = (beat: Placement.Beat) => `${beat.bar + 1}:${beat.beat + 1}${beat.on ? '' : '+'}`;

const chordsOn = (
  changes: readonly Placement.Change[],
  count: number,
  key: Chord.Key,
  tpb: number,
  held: Chord.Chord | undefined,
) => {
  const cells: string[][] = Array.from({ length: count }, () => []);
  for (const c of changes) {
    const at = c.at === 0 ? '' : `<sub>+${(c.at / tpb).toFixed(2)}</sub>`;
    cells[c.syllable]?.push(`${escape(Chord.format(c.chord, key))}${at}`);
  }
  const first = changes[0];
  if (held !== undefined && (first === undefined || first.syllable !== 0 || first.at !== 0))
    cells[0]?.unshift(`<span class="held">(${escape(Chord.format(held, key))})</span>`);
  return cells.map((cell) => cell.join(' '));
};

interface Row {
  readonly n: number;
  readonly meter: string;
  readonly level: string;
  readonly key: Chord.Key;
  readonly tpb: number;
  readonly lines: ReadonlyArray<{
    readonly studied: Studied;
    readonly grid: Placement.Grid;
    readonly results: ReadonlyArray<{
      readonly id: Placement.RuleId;
      readonly changes: Placement.Change[];
    }>;
  }>;
}

const lineTable = (row: Row, line: Row['lines'][number]) => {
  const { studied, grid, results } = line;
  const { input } = studied;
  const count = input.syllables.length;
  const head = `<th>${studied.verse === 'refrain' ? 'refrain' : `stanza ${studied.verse}`} line ${studied.line}</th>`;
  const cells = (xs: readonly string[], cls?: (k: number) => string) =>
    xs.map((x, k) => `<td class="${cls?.(k) ?? ''}">${x}</td>`).join('');
  const beats = input.syllables.map((s) => Placement.beatAt(grid, s.start));
  const today = chordsOn(input.changes, count, row.key, row.tpb, undefined);
  const ruleRows = results.map(({ id, changes }) => {
    const label = Placement.RULES.find((r) => r.id === id)?.label ?? id;
    const shown = chordsOn(changes, count, row.key, row.tpb, input.before);
    const diff = compare(input.changes, changes).changed;
    return `<tr class="${diff ? 'differs' : 'same'}"><th>${escape(label)}</th>${cells(shown, (k) => (shown[k] !== today[k] ? 'moved' : ''))}</tr>`;
  });
  return `<table>
<tr>${head}${cells(
    input.syllables.map((_, k) => String(k)),
    () => 'index',
  )}</tr>
<tr><th>words</th>${cells(studied.syllables.map((s) => escape(s.text)))}</tr>
<tr><th>bar:beat</th>${cells(beats.map(beatLabel), (k) => (beats[k]?.strong === true ? 'strong' : ''))}</tr>
<tr><th>note</th>${cells(input.syllables.map((s) => noteName(s.key)))}</tr>
<tr><th>beats</th>${cells(input.syllables.map((s) => (s.length / row.tpb).toFixed(2)))}</tr>
<tr class="today"><th>today</th>${cells(today)}</tr>
${ruleRows.join('\n')}
</table>`;
};

const readHymn = (f: string) =>
  Effect.gen(function* () {
    const json: unknown = yield* Effect.promise(() => Bun.file(`${DATA}/sdah-1985/${f}`).json());
    return yield* decodeHymn(json);
  });

/** The hymns on the page: 373, 388, then up to PER_METER of each meter, picked with the seed. */
const pick = Effect.gen(function* () {
  const files = (yield* Effect.promise(() => readdir(`${DATA}/sdah-1985`)))
    .filter((f) => /^\d{3}\.json$/.test(f))
    .sort();
  const hymns = yield* Effect.forEach(files, readHymn);
  const eligible = hymns.filter(
    (h) => h.timing !== undefined && h.stanzas[0]._tag === 'Sung' && h.meter.numerator > 0,
  );
  const byMeter = new Map<string, number[]>();
  for (const h of eligible) {
    if ((STUDY as readonly number[]).includes(h.number)) continue;
    byMeter.set(meterName(h), [...(byMeter.get(meterName(h)) ?? []), h.number]);
  }
  const meters = [...byMeter.keys()].sort(
    (a, b) => (byMeter.get(b)?.length ?? 0) - (byMeter.get(a)?.length ?? 0) || a.localeCompare(b),
  );
  const sample = meters.flatMap((m) =>
    shuffled(byMeter.get(m) ?? [], seed)
      .slice(0, PER_METER)
      .sort((a, b) => a - b),
  );
  return { meters, sample, numbers: [...STUDY, ...sample] };
});

const rowOf = (n: number, loaded: Loaded, lines: readonly Studied[]): Row => {
  const grid = gridOf(loaded);
  return {
    n,
    meter: meterName(loaded.hymn),
    level: loaded.hymn.stanzas[0]._tag === 'Sung' ? loaded.hymn.stanzas[0].level : 'text',
    key: loaded.hymn.key,
    tpb: loaded.score.ticksPerBeat,
    lines: lines.map((studied) => ({
      studied,
      grid,
      results: Placement.RULES.map((r) => ({
        id: r.id,
        changes: Placement.apply(r.id, studied.input, grid),
      })),
    })),
  };
};

interface Tally {
  readonly id: Placement.RuleId;
  readonly label: string;
  readonly says: string;
  readonly moved: number;
  readonly folded: number;
  readonly lines: number;
  readonly reproduces: boolean;
  readonly at373: ReadonlyArray<number | string>;
  readonly perMeter: Record<
    string,
    { moved: number; chords: number; lines: number; changed: number }
  >;
}

/** One rule's tally over every studied line of every hymn on the page. */
const tallyOf = (rule: (typeof Placement.RULES)[number], rows: readonly Row[]): Tally => {
  let moved = 0;
  let folded = 0;
  let lines = 0;
  const perMeter = new Map<
    string,
    { moved: number; chords: number; lines: number; changed: number }
  >();
  for (const row of rows)
    for (const line of row.lines) {
      const result = line.results.find((r) => r.id === rule.id)?.changes ?? [];
      const c = compare(line.studied.input.changes, result);
      moved += c.moved;
      folded += c.folded;
      if (c.changed) lines++;
      const m = perMeter.get(row.meter) ?? { moved: 0, chords: 0, lines: 0, changed: 0 };
      perMeter.set(row.meter, {
        moved: m.moved + c.moved,
        chords: m.chords + line.studied.input.changes.length,
        lines: m.lines + 1,
        changed: m.changed + (c.changed ? 1 : 0),
      });
    }
  const line373 = rows
    .find((r) => r.n === 373)
    ?.lines.find((l) => l.studied.verse === 'refrain' && l.studied.line === 0);
  const reproduces =
    line373 !== undefined &&
    Placement.reproduces(rule.id, line373.studied.input, line373.grid, OWNER_373);
  const at373 =
    line373?.results
      .find((r) => r.id === rule.id)
      ?.changes.map((c) => (c.at === 0 ? c.syllable : `${c.syllable}+${c.at}`)) ?? [];
  return {
    id: rule.id,
    label: rule.label,
    says: rule.says,
    moved,
    folded,
    lines,
    reproduces,
    at373,
    perMeter: Object.fromEntries(perMeter),
  };
};

/** 373 and 388 measured against their files. */
const studyOf = (loadedBy: ReadonlyMap<number, { loaded: Loaded; lines: Studied[] }>) => {
  const h388 = loadedBy.get(388);
  const h373 = loadedBy.get(373);
  const first = h388?.loaded.hymn.stanzas[0];
  return {
    m388: h388 === undefined ? undefined : measureChords(h388.loaded, h388.lines),
    m373: h373 === undefined ? undefined : measureChords(h373.loaded, h373.lines),
    track388: h388 === undefined ? undefined : melodyTrack(h388.loaded.midi),
    track373: h373 === undefined ? undefined : melodyTrack(h373.loaded.midi),
    fit388: first?._tag === 'Sung' ? first.fit : undefined,
  };
};

type Study = ReturnType<typeof studyOf>;

interface Page {
  readonly meters: readonly string[];
  readonly sample: readonly number[];
  readonly numbers: readonly number[];
  readonly rows: readonly Row[];
  readonly tally: readonly Tally[];
  readonly chords: number;
  readonly lineCount: number;
  readonly study: Study;
}

const perSyllable = (fit: {
  notes: number;
  syllables: number;
  cost: number;
  melismas: number;
}) => ({
  notesPerSyllable: fit.notes / fit.syllables,
  costPerSyllable: fit.cost / fit.syllables,
  melismas: fit.melismas,
});

const summaryOf = ({ meters, sample, numbers, rows, tally, chords, lineCount, study }: Page) => {
  const { m388, m373, track388, track373, fit388 } = study;
  const relaid388 = m388?.onTune;
  return {
    seed,
    hymns: numbers,
    meters: Object.fromEntries(
      meters.map((m) => [m, sample.filter((n) => rows.find((r) => r.n === n)?.meter === m)]),
    ),
    lines: lineCount,
    chords,
    rules: tally.map(({ reproduces, says: _, ...t }) => ({ ...t, reproduces373: reproduces })),
    hymn388:
      m388 === undefined
        ? undefined
        : {
            melodyTrack: track388,
            syllableStartsOnSoprano: `${m388.startsOnSoprano}/${m388.starts}`,
            causes: causesOf(m388.rows),
            rows: m388.rows,
            fitToday: fit388 === undefined ? undefined : perSyllable(fit388),
            onSoprano:
              relaid388 === undefined
                ? undefined
                : {
                    verses: relaid388.verses,
                    exact: relaid388.exact,
                    notesPerSyllable: relaid388.notesPerSyllable,
                    costPerSyllable: relaid388.costPerSyllable,
                    melismas: relaid388.melismas,
                  },
          },
    hymn373:
      m373 === undefined
        ? undefined
        : {
            melodyTrack: track373,
            syllableStartsOnSoprano: `${m373.startsOnSoprano}/${m373.starts}`,
            causes: causesOf(m373.rows),
          },
  };
};

const STYLE = `body{font:14px/1.4 -apple-system,system-ui,sans-serif;margin:24px;color:#222}
h1{font-size:22px}h2{font-size:18px;margin-top:32px;border-top:1px solid #ccc;padding-top:12px}
table{border-collapse:collapse;margin:8px 0 16px;font-size:12px}td,th{border:1px solid #ddd;padding:2px 5px;text-align:center;white-space:nowrap}
th{text-align:left;background:#f6f6f6;font-weight:600}td.strong{font-weight:700;background:#fff3c4}td.index{color:#888}
tr.today td{background:#e8f0ff}td.moved{background:#d8f5d0;font-weight:600}tr.same th{color:#888}.held{color:#999}
.no{color:#b00;font-weight:600}.yes{color:#070;font-weight:600}.note{color:#555;max-width:900px}`;

const tallyTable = ({
  tally,
  chords,
  lineCount,
}: Page) => `<table><tr><th>rule</th><th>what it says</th><th>373 refrain line 0</th><th>reproduces 3 and 7</th><th>chords moved</th><th>chords folded</th><th>lines changed</th></tr>
${tally.map((t) => `<tr><th>${escape(t.label)}</th><td style="text-align:left">${escape(t.says)}</td><td>${t.at373.join(', ')}</td><td class="${t.reproduces ? 'yes' : 'no'}">${t.reproduces ? 'yes' : 'NO: does not reproduce 373'}</td><td>${t.moved} of ${chords}</td><td>${t.folded}</td><td>${t.lines} of ${lineCount}</td></tr>`).join('\n')}
</table>`;

const meterCell = (t: Tally, m: string) => {
  const x = t.perMeter[m];
  return `<td>${x === undefined ? '' : `${x.moved}/${x.chords} chords, ${x.changed}/${x.lines} lines`}</td>`;
};

const meterTable = ({
  tally,
  meters,
}: Page) => `<table><tr><th>rule</th>${meters.map((m) => `<th>${m}</th>`).join('')}</tr>
${tally.map((t) => `<tr><th>${escape(t.label)}</th>${meters.map((m) => meterCell(t, m)).join('')}</tr>`).join('\n')}
</table>`;

const place = (p: Place | undefined) =>
  p === undefined ? '—' : `line ${p.line} syllable ${p.syllable}`;

const counts = (rows: readonly Mismatch[] | undefined) =>
  rows === undefined
    ? '—'
    : Object.entries(causesOf(rows))
        .map(([cause, n]) => `${n} ${cause}`)
        .join(', ');

const fitText = (fit: { notesPerSyllable: number; costPerSyllable: number; melismas: number }) =>
  `${fit.notesPerSyllable.toFixed(2)} notes a syllable, cost ${fit.costPerSyllable.toFixed(2)} a syllable, ${fit.melismas} melismas`;

const section388 = ({ m388, m373, track388, fit388 }: Study) => {
  const relaid388 = m388?.onTune;
  const table =
    m388 === undefined
      ? ''
      : `<table><tr><th>line</th><th>chord</th><th>syllable today (line, syllable +ticks)</th><th>file onset (tick)</th><th>nearest syllable to the onset, as laid today</th><th>nearest, words laid on the soprano</th><th>cause</th></tr>
${m388.rows.map((r) => `<tr><td>${r.verse === 'refrain' ? 'refrain' : `stanza ${r.verse}`} ${r.line}</td><td>${escape(r.chord)}</td><td>${r.syllable}${r.at === 0 ? '' : ` +${r.at}`}</td><td>${r.onset ?? '—'}</td><td>${place(r.nearest)}</td><td>${place(r.nearestOnTune)}</td><td>${r.cause}</td></tr>`).join('\n')}
</table>`;
  return `<h2>388: why its chords seem off their syllables</h2>
<p class="note">The compiler reads the tune from track ${track388?.index} (program ${track388?.program ?? 'none'}), the first sounding track, because it is not one of the harmony tracks (${track388?.harmony.join(', ')}). In 388 that track is an accompaniment figure, not the soprano: ${m388?.startsOnSoprano} of ${m388?.starts} studied syllable starts fall on a soprano note (373, for comparison: ${m373?.startsOnSoprano} of ${m373?.starts}). The words are laid on the figure's notes, so the syllables' starts, and the follow's timing read from them, are the figure's. Today's fit: ${fit388 === undefined ? '—' : fitText(perSyllable(fit388))}. The same words laid on the soprano: ${relaid388 === undefined ? '—' : `${fitText(relaid388)}, ${relaid388.verses} verses${relaid388.exact ? ' (exact)' : ''}`}. Of 388's ${m388?.rows.length ?? 0} chords: ${counts(m388?.rows)}. 373, for comparison: ${counts(m373?.rows)}. A chord marked syllable split already stands where the file changes, on today's syllables; laid on the soprano, the words put another syllable under that tick.</p>
${table}`;
};

const hymnSection = (row: Row) =>
  `<h3 id="h${row.n}">${row.n} · ${row.meter} · ${row.key.tonic}${row.key.minor ? ' minor' : ''} · ${row.level}</h3>${row.lines.length === 0 ? '<p class="note">No timed sung line.</p>' : row.lines.map((l) => lineTable(row, l)).join('\n')}`;

const htmlOf = (
  page: Page,
) => `<!doctype html><meta charset="utf-8"><title>chordfeel study</title><style>${STYLE}</style>
<h1>Where the guitar strikes each chord: the chordfeel study</h1>
<p class="note">Hymns 373 and 388, then up to ${PER_METER} hymns of each meter (seed ${seed}): ${page.rows.length} hymns, ${page.lineCount} lines (each hymn's first stanza and its refrain), ${page.chords} guitar chords. Beats come from the MIDI file's meters, bars counted from tick 0; a strong beat is shaded. Chords are in the printed key. In a rule's row a green cell differs from today; a chord in grey parentheses is the one held over from the line before, when a rule moves the line's first chord off its first syllable. Hymn 373 is shown in Ab: with capo 1, Db plays as C and Ab as G.</p>
<h2>The rules</h2>${tallyTable(page)}
<h3>By meter</h3>${meterTable(page)}
${section388(page.study)}
<h2>Hymns</h2>
${page.rows.map(hymnSection).join('\n')}
`;

const program = Effect.gen(function* () {
  const { meters, sample, numbers } = yield* pick;
  const rows: Row[] = [];
  const loadedBy = new Map<number, { loaded: Loaded; lines: Studied[] }>();
  for (const n of numbers) {
    const loaded = yield* load(n);
    const lines = studiedLines(loaded);
    loadedBy.set(n, { loaded, lines });
    rows.push(rowOf(n, loaded, lines));
  }
  const page: Page = {
    meters,
    sample,
    numbers,
    rows,
    tally: Placement.RULES.map((rule) => tallyOf(rule, rows)),
    chords: rows.reduce(
      (n, r) => n + r.lines.reduce((k, l) => k + l.studied.input.changes.length, 0),
      0,
    ),
    lineCount: rows.reduce((n, r) => n + r.lines.length, 0),
    study: studyOf(loadedBy),
  };
  const summary = summaryOf(page);
  yield* Effect.promise(() => mkdir(out, { recursive: true }));
  yield* Effect.promise(() => Bun.write(path.join(out, 'index.html'), htmlOf(page)));
  yield* Effect.promise(() =>
    Bun.write(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`),
  );
  console.log(
    `chordfeel: hymns=${rows.length} lines=${page.lineCount} chords=${page.chords} out=${out}`,
  );
  for (const t of page.tally)
    console.log(
      `  ${t.id}: 373=${t.at373.join(',')} reproduces=${t.reproduces} moved=${t.moved} folded=${t.folded} lines=${t.lines}`,
    );
  const { m388, track388 } = page.study;
  if (m388 !== undefined)
    console.log(
      `  388: melody track ${track388?.index} program ${track388?.program}; starts on soprano ${m388.startsOnSoprano}/${m388.starts}; causes ${JSON.stringify(summary.hymn388?.causes)}`,
    );
});

await Effect.runPromise(program);
