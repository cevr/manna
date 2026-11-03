import { Array as Arr, Effect, Schema } from 'effect';
import type { Mutable } from 'effect/Types';

import * as Align from './align.js';
import * as Chord from './chord.js';
import * as Harmony from './harmony.js';
import {
  type Fit,
  type Hymn,
  type Order,
  PER_BEAT,
  type Part,
  type Plain,
  type Reason,
  type Syllable,
} from './hymn.js';
import * as Midi from './midi.js';
import * as Placement from './placement.js';
import type * as Score from './score.js';
import * as Sung from './sung.js';
import * as Timing from './timing.js';

interface Source {
  readonly book: 'sdah-1985';
  readonly number: number;
  readonly title: string;
  readonly verses: ReadonlyArray<{ readonly id: number; readonly text: string }>;
  readonly midi: Uint8Array;
  readonly held?: string | undefined;
  readonly order?: Order | undefined;
}

const TRUST = {
  text: { fewNotes: 0.8, manyNotes: 1.75, cost: 0.5, sharedAcross: 1 },
  line: { melismas: 1.3, cost: 0.25 },
} as const;

const REASONS: readonly Reason[] = ['held', 'notes', 'shared', 'cost', 'melismas', 'inexact'];

const ordered = (reasons: readonly Reason[]): Reason[] =>
  REASONS.filter((reason) => reasons.includes(reason));

const round = (n: number) => Math.round(n * 1000) / 1000;

const linesOf = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

type Placed = NonNullable<Syllable['full']>[number];

const place = (
  score: Score.Score,
  span: Score.Span,
  alignment: Align.Alignment,
  anchors: ReturnType<typeof Align.anchorsOf>,
  level: Harmony.Level,
): Array<Array<Placed[]>> => {
  const tpb = score.ticksPerBeat;
  const slack = tpb / 16;
  const spans = Harmony.chords(score, span.start, span.end, level);
  const sung = alignment.lines.flatMap((line, l) =>
    line.map((syllable, k) => ({
      syllable,
      line: l,
      k,
      start: anchors[l]?.[k]?.start ?? span.start,
      end: anchors[l]?.[k]?.end ?? span.end,
    })),
  );
  const out = alignment.lines.map((line) => line.map((): Placed[] => []));
  let shown: Chord.Chord | undefined;
  let line = -1;
  sung.forEach(({ syllable, line: l, k, start, end: noteEnd }, i) => {
    if (syllable.notes === 0) return;
    const next = sung.slice(i + 1).find((s) => s.syllable.notes > 0);
    const end =
      next === undefined ? span.end : next.line !== l ? Math.min(noteEnd, next.start) : next.start;
    const placed: Placed[] = [];
    const show = (chord: Chord.Chord, at: number) => {
      placed.push({ chord, at: round(Math.max(0, at) / tpb) });
      shown = chord;
    };
    const atStart = spans.find((s) => Math.abs(s.start - start) <= slack);
    const sounding =
      atStart ?? spans.find((s) => s.start <= start + slack && s.end > start + slack);
    if (l !== line) {
      line = l;
      if (sounding !== undefined) show(sounding.chord, 0);
    } else if (
      sounding !== undefined &&
      (shown === undefined || !Chord.equals(shown, sounding.chord))
    ) {
      show(sounding.chord, 0);
    }
    for (const change of spans) {
      if (change.start <= start + slack || change.start >= end - slack) continue;
      if (change.end - change.start < tpb) continue;
      if (shown !== undefined && Chord.equals(shown, change.chord)) continue;
      show(change.chord, change.start - start);
    }
    const target = out[l]?.[k];
    if (target !== undefined) target.push(...placed);
  });
  return out;
};

const strike = (
  score: Score.Score,
  alignment: Align.Alignment,
  placed: ReadonlyArray<ReadonlyArray<Placed[]>>,
  rule: Placement.RuleId = 'strong',
): Array<Array<Placed[]>> => {
  const tpb = score.ticksPerBeat;
  const grid: Placement.Grid = {
    ticksPerBeat: tpb,
    meters: score.meters,
    tonic: Chord.pitchClass(score.key.tonic),
  };
  const firstStart = (line: ReadonlyArray<Align.Syllable>) => {
    const s = line.find((s) => s.notes > 0);
    return s === undefined ? undefined : alignment.melody[s.note]?.start;
  };
  let before: Chord.Chord | undefined;
  return alignment.lines.map((line, l) => {
    const chords = placed[l] ?? [];
    const sungAt = line.flatMap((s, k) => (s.notes > 0 ? [k] : []));
    const last = line.at(sungAt.at(-1) ?? -1);
    const ends = [
      last === undefined ? undefined : alignment.melody[last.note + last.notes - 1]?.end,
      alignment.lines[l + 1] === undefined ? undefined : firstStart(alignment.lines[l + 1] ?? []),
    ].filter((n) => n !== undefined);
    const input: Placement.Line = {
      syllables: sungAt.map((k) => {
        const s = line[k];
        const note = s === undefined ? undefined : alignment.melody[s.note];
        const end = s === undefined ? undefined : alignment.melody[s.note + s.notes - 1]?.end;
        const start = note?.start ?? 0;
        return { start, length: (end ?? start) - start, key: note?.key };
      }),
      changes: sungAt.flatMap((k, j) =>
        (chords[k] ?? []).map((c) => ({ syllable: j, at: Math.round(c.at * tpb), chord: c.chord })),
      ),
      until: Math.min(...ends),
      before,
    };
    const originals = sungAt.flatMap((k) => chords[k] ?? []);
    const out = line.map((): Placed[] => []);
    Placement.apply(rule, input, grid).forEach((change) => {
      const k = sungAt[change.syllable];
      if (k === undefined) return;
      out[k]?.push({ chord: change.chord, at: round(change.at / tpb) });
    });
    before = originals.at(-1)?.chord ?? before;
    return out;
  });
};

interface Laid {
  readonly level: 'syllable' | 'line' | 'text';
  readonly why: Reason[];
  readonly fit: Fit | undefined;
  readonly lines: Syllable[][];
  readonly struck: Syllable[][];
  readonly simpler: Syllable[][];
  readonly folded: Syllable[][];
  readonly starts: number[][] | undefined;
}

const judge = (fit: Fit | undefined, inexact: boolean): Pick<Laid, 'level' | 'why'> => {
  const notes: Reason[] = inexact ? ['inexact'] : [];
  if (fit === undefined) return { level: 'text', why: ordered(['notes', ...notes]) };
  const r = fit.notes / Math.max(1, fit.syllables);
  const c = fit.cost / Math.max(1, fit.syllables);
  const text: Reason[] = [
    ...(r < TRUST.text.fewNotes || r > TRUST.text.manyNotes ? (['notes'] as const) : []),
    ...(fit.shared.acrossWords > TRUST.text.sharedAcross ? (['shared'] as const) : []),
    ...(c > TRUST.text.cost ? (['cost'] as const) : []),
  ];
  if (text.length > 0) return { level: 'text', why: ordered([...text, ...notes]) };
  const line: Reason[] = [
    ...(r > TRUST.line.melismas ? (['melismas'] as const) : []),
    ...(c > TRUST.line.cost ? (['cost'] as const) : []),
    ...(fit.shared.acrossWords === TRUST.text.sharedAcross ? (['shared'] as const) : []),
  ];
  if (line.length > 0) return { level: 'line', why: ordered([...line, ...notes]) };
  return { level: 'syllable', why: ordered(notes) };
};

const lay = (score: Score.Score, n: number, lines: readonly string[]): Laid => {
  const span = score.verses.spans[n] ?? { start: 0, end: 0 };
  const alignment = Align.align(score, n, lines);
  const syllables = alignment.lines.reduce((sum, line) => sum + line.length, 0);
  const fit: Fit | undefined = Number.isFinite(alignment.cost)
    ? {
        notes: alignment.melody.length,
        syllables,
        melismas: alignment.melismas,
        shared: alignment.shared,
        cost: round(alignment.cost),
      }
    : undefined;
  const { level, why } = judge(fit, !score.verses.exact);
  if (level === 'text')
    return { level, why, fit, lines: [], struck: [], simpler: [], folded: [], starts: undefined };
  const anchors = Align.anchorsOf(alignment, span.start);
  const full = place(score, span, alignment, anchors, 'full');
  const guitar = place(score, span, alignment, anchors, 'guitar');
  const tpb = score.ticksPerBeat;
  const linesWith = (guitar: ReadonlyArray<ReadonlyArray<Placed[]>>) =>
    alignment.lines.map((line, l) =>
      line.map((s, k): Syllable => {
        const anchor = anchors[l]?.[k];
        const beats =
          s.notes === 0 || anchor === undefined ? 0 : round((anchor.end - anchor.start) / tpb);
        const f = full[l]?.[k] ?? [];
        const g = guitar[l]?.[k] ?? [];
        const syllable: Mutable<Syllable> = { text: s.text, word: s.word, notes: s.notes, beats };
        if (Arr.isArrayNonEmpty(f)) syllable.full = f;
        if (Arr.isArrayNonEmpty(g)) syllable.guitar = g;
        return syllable;
      }),
    );
  return {
    level,
    why,
    fit,
    lines: linesWith(guitar),
    struck: linesWith(strike(score, alignment, guitar)),
    simpler: linesWith(strike(score, alignment, guitar, 'strong+length')),
    folded: linesWith(strike(score, alignment, guitar, 'length')),
    starts: anchors.map((line) => line.map((anchor) => anchor.start)),
  };
};

const partOf = (laid: Laid, text: readonly string[], from: number, to: number): Part => {
  const plain: [string, ...string[]] = [text[0] ?? '', ...text.slice(1)];
  const why: [Reason, ...Reason[]] = [laid.why[0] ?? 'notes', ...laid.why.slice(1)];
  const lines = laid.lines.slice(from, to).filter(Arr.isArrayNonEmpty);
  if (laid.level === 'text' || laid.fit === undefined || !Arr.isArrayNonEmpty(lines)) {
    const part: Mutable<Plain> = { _tag: 'Plain', lines: plain, why };
    if (laid.fit !== undefined) part.fit = laid.fit;
    return part;
  }
  return { _tag: 'Sung', level: laid.level, lines, fit: laid.fit, why: laid.why };
};

const held = (lines: readonly string[]): Part => ({
  _tag: 'Plain',
  lines: [lines[0] ?? '', ...lines.slice(1)],
  why: ['held'],
});

const VerseLayoutReason = Schema.Literals([
  'no stanza',
  'stanza ids are not 0, 1, … n - 1',
  'more than one refrain',
  'a verse has no words',
  'a refrain order with no refrain',
  'a refrain with no order',
]);
type VerseLayoutReason = typeof VerseLayoutReason.Type;

class VerseLayoutError extends Schema.TaggedError<VerseLayoutError>()('VerseLayoutError', {
  ids: Schema.Array(Schema.Int),
  reason: VerseLayoutReason,
}) {}

const versesOf = (source: Source) => {
  const ids = source.verses.map((verse) => verse.id);
  const stanzas = source.verses.filter((verse) => verse.id >= 0).toSorted((a, b) => a.id - b.id);
  const choruses = source.verses.filter((verse) => verse.id < 0);
  const refuse = (reason: VerseLayoutReason) => Effect.fail(VerseLayoutError.make({ ids, reason }));
  if (!Arr.isArrayNonEmpty(stanzas)) return refuse('no stanza');
  if (stanzas.some((verse, n) => verse.id !== n)) return refuse('stanza ids are not 0, 1, … n - 1');
  if (choruses.length > 1) return refuse('more than one refrain');
  if (source.verses.some((verse) => !/\p{L}/u.test(verse.text)))
    return refuse('a verse has no words');
  const chorus = choruses[0];
  const order = source.order;
  if (chorus === undefined && order !== undefined) return refuse('a refrain order with no refrain');
  if (chorus !== undefined && order === undefined) return refuse('a refrain with no order');
  return Effect.succeed({
    stanzas: Arr.map(stanzas, (verse) => linesOf(verse.text)),
    refrain:
      chorus === undefined || order === undefined
        ? undefined
        : { order, lines: linesOf(chorus.text) },
  });
};

export const compilePlacements = (
  source: Source,
): Effect.Effect<Record<Placement.Placement, Hymn>, Midi.MidiParseError | VerseLayoutError> =>
  Effect.gen(function* () {
    const { stanzas, refrain } = yield* versesOf(source);
    const sung = Sung.of(yield* Midi.parse(source.midi), stanzas.length);
    const { midi, score } = sung;
    const lastOnly = refrain?.order === 'first-and-last' || refrain?.order === 'after-last';
    const from = lastOnly ? stanzas.length - 1 : 0;
    const tail = (n: number) =>
      refrain === undefined || (lastOnly && n !== from) ? [] : refrain.lines;
    const spans = score.verses.spans;
    const timed = (hymn: Mutable<Hymn>, starts: (n: number) => number[][] | undefined): Hymn => {
      const layings = stanzas.map((lines, n): Timing.Laying => ({
        span: spans[n] ?? { start: 0, end: midi.lastTick },
        stanza: lines.length,
        tail: tail(n).length,
        starts: starts(n),
      }));
      hymn.timing = Timing.timingOf(hymn, midi, layings);
      return hymn;
    };
    const head = {
      version: 1,
      book: source.book,
      number: source.number,
      title: source.title,
      key: score.key,
      meter: score.meter,
      verses: {
        text: stanzas.length,
        midi: sung.played,
        exact: score.verses.exact,
      },
    } as const;
    if (source.held !== undefined) {
      const plain: Mutable<Hymn> = { ...head, stanzas: Arr.map(stanzas, held) };
      if (refrain !== undefined)
        plain.refrain = { order: refrain.order, part: held(refrain.lines) };
      const hymn = timed(plain, () => undefined);
      return { beat: hymn, simpler: hymn, file: hymn };
    }
    const laid = Arr.map(stanzas, (lines, n) => lay(score, n, [...lines, ...tail(n)]));
    const built = (pick: (one: Laid) => Syllable[][]): Hymn => {
      const chosen = Arr.map(laid, (one): Laid => ({ ...one, lines: pick(one) }));
      const parts = Arr.map(chosen, (one, n) => {
        const lines = stanzas[n] ?? [];
        return partOf(one, lines, 0, lines.length);
      });
      const hymn: Mutable<Hymn> = { ...head, stanzas: parts };
      const stored = chosen[from];
      const start = stanzas[from]?.length ?? 0;
      if (refrain !== undefined && stored !== undefined) {
        const part = partOf(stored, refrain.lines, start, start + refrain.lines.length);
        hymn.refrain = { order: refrain.order, part };
      }
      return timed(hymn, (n) => laid[n]?.starts);
    };
    const asPlayed = built((one) => one.lines);
    const grid: Placement.Grid = {
      ticksPerBeat: PER_BEAT,
      meters: score.meters.map((meter) => ({
        ...meter,
        tick: (meter.tick * PER_BEAT) / score.ticksPerBeat,
      })),
      tonic: Chord.pitchClass(score.key.tonic),
    };
    const confirmed = Placement.confirms(grid, Placement.judgedLines(asPlayed));
    return {
      beat: confirmed ? built((one) => one.struck) : asPlayed,
      simpler: built((one) => (confirmed ? one.simpler : one.folded)),
      file: asPlayed,
    };
  });

export const compile = (
  source: Source,
): Effect.Effect<Hymn, Midi.MidiParseError | VerseLayoutError> =>
  compilePlacements(source).pipe(Effect.map((modes) => modes.beat));
