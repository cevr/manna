import { Schema } from 'effect';
import * as Midi from '../../src/midi.js';
import { voices } from '../../src/voices.js';
import type { Measured } from './checks.js';
import { planOf } from './plan.js';
import type { Style } from './style.js';

const Check = Schema.Struct({ ok: Schema.Boolean, value: Schema.Finite, limit: Schema.Finite });

const StemRow = Schema.Struct({
  notes: Schema.Int,
  lufs: Schema.Union([Schema.Finite, Schema.Literal('silent')]),
  frames: Schema.Int,
});

export const HymnRecord = Schema.Struct({
  hymn: Schema.Int,
  key: Schema.String,
  passed: Schema.Boolean,
  file: Schema.String,
  bytes: Schema.Int,
  sha256: Schema.String,
  md5: Schema.String,
  seconds: Schema.Finite,
  lufs: Schema.Finite,
  ebur128Lufs: Schema.Finite,
  truePeak: Schema.Finite,
  lagMs: Schema.Finite,
  checks: Schema.Struct({
    length: Check,
    truePeak: Check,
    loudness: Check,
    clipping: Check,
    silence: Check,
    onsetLag: Check,
    stems: Check,
    memory: Check,
  }),
  stems: Schema.Record(Schema.String, StemRow),
  rss: Schema.Struct({ piano: Schema.Finite, sampler: Schema.Finite, render: Schema.Finite }),
});
export type HymnRecord = typeof HymnRecord.Type;

export const HymnRecordJson = Schema.fromJsonString(HymnRecord);

export const RecordObjectJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json));

export interface Expected {
  readonly seconds: number;
  readonly stems: Readonly<Record<string, number>>;
}

export const expectedOf = (
  midi: Midi.Midi,
  style: Pick<Style, 'name' | 'stems' | 'humanise' | 'rate' | 'tail'>,
  hymn: number,
): Expected => {
  const at = Midi.secondsAt(midi);
  const stems: Record<string, number> = {};
  for (const { stem, notes } of planOf(voices(midi), style, hymn)) {
    if (notes.length === 0) continue;
    const lastOff = Math.max(...notes.map((n) => Math.max(n.end, n.start + 1)));
    stems[stem.name] = Math.round(at(lastOff) * style.rate);
  }
  return { seconds: Midi.secondsOf(midi) + style.tail, stems };
};

export const measuredOf = (
  record: HymnRecord,
  expected: Expected,
  targetLufs: number,
): Measured => ({
  seconds: record.seconds,
  expectedSeconds: expected.seconds,
  truePeak: record.checks.truePeak.value,
  lufs: record.checks.loudness.value,
  ebur128Lufs: record.ebur128Lufs,
  targetLufs,
  peak: record.checks.clipping.value,
  longestQuiet: record.checks.silence.value,
  lagMs: record.lagMs,
  stems: Object.entries(record.stems)
    .filter(([, s]) => s.notes > 0)
    .map(([name, s]) => ({
      lufs: s.lufs === 'silent' ? Number.NEGATIVE_INFINITY : s.lufs,
      frames: s.frames,
      needed: expected.stems[name] ?? Number.POSITIVE_INFINITY,
    })),
  rss: record.rss,
});

const verdicts = (checks: Readonly<Record<string, { readonly ok: boolean }>>) =>
  Object.entries(checks)
    .map(([name, check]) => `${name} ${check.ok}`)
    .sort()
    .join(',');

export const sameVerdicts = (
  a: Readonly<Record<string, { readonly ok: boolean }>>,
  b: Readonly<Record<string, { readonly ok: boolean }>>,
) => verdicts(a) === verdicts(b);
