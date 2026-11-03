import { Hash, Option, Schema } from 'effect';
import { addressKey } from './address.ts';
import type { CheckLine } from './schema.ts';

const RESULT_BUDGET = 8_000;

const FAR = 999_999_999;

const CHECK_MAX_FINDINGS = 24;

const FINDING_CHARS = 400;

export const CHECK_MAX_SCENES = 24;
export const SCENE_ID_CHARS = 64;

const ENTRY_CHARS = 800;

export const clip = (text: string, chars: number): string => {
  if (text.length <= chars) return text;
  return `${text.slice(0, chars)}… (${text.length - chars} more characters)`;
};

const isHighSurrogate = (code: number) => code >= 0xd8_00 && code <= 0xdb_ff;

const largestFitting = (high: number, fits: (size: number) => boolean): number => {
  let low = 0;
  let top = high;
  while (low < top) {
    const mid = Math.ceil((low + top) / 2);
    if (fits(mid)) low = mid;
    else top = mid - 1;
  }
  return low;
};

const fitsUnder = <T, E>(schema: Schema.Codec<T, E>) => {
  const encode = Schema.encodeSync(Schema.fromJsonString(schema));
  return (value: T): boolean => encode(value).length <= RESULT_BUDGET;
};

const CheckFinding = Schema.Struct({
  level: Schema.Literals(['error', 'warning']),
  tag: Schema.String,
  where: Schema.String,
  time: Schema.optionalKey(Schema.Finite),
  message: Schema.String,
});
type CheckFinding = typeof CheckFinding.Type;

const CheckCursor = Schema.Struct({
  from: Schema.Int,
  report: Schema.String,
  scenes: Schema.optionalKey(Schema.Array(Schema.String)),
});

export const CheckPage = Schema.Struct({
  errors: Schema.Int,
  warnings: Schema.Int,
  from: Schema.Int,
  findings: Schema.Array(CheckFinding),
  restarted: Schema.optionalKey(Schema.String),
  next: Schema.optionalKey(CheckCursor),
});
type CheckPage = typeof CheckPage.Type;
const checkFits = fitsUnder(CheckPage);
const encodeFinding = Schema.encodeSync(Schema.fromJsonString(CheckFinding));

interface CheckAt {
  readonly from?: number;
  readonly report?: string;
  readonly scenes?: ReadonlyArray<string>;
}

const findingOf = (line: CheckLine): CheckFinding => ({
  level: line.level,
  tag: line.tag,
  where: Option.match(Option.fromUndefinedOr(line.address), {
    onNone: () => 'film',
    onSome: (address) => addressKey(address.part),
  }),
  ...Option.match(Option.fromUndefinedOr(line.address?.time), {
    onNone: () => ({}),
    onSome: (time) => ({ time }),
  }),
  message: line.message,
});

const reportOf = (findings: ReadonlyArray<CheckFinding>): string => {
  const hash = Hash.string(findings.map((finding) => encodeFinding(finding)).join('\n'));
  return `${findings.length}.${(hash >>> 0).toString(16)}`;
};

export const checkPage = (lines: ReadonlyArray<CheckLine>, at: CheckAt): CheckPage => {
  const errors = lines.filter((line) => line.level === 'error');
  const warnings = lines.filter((line) => line.level === 'warning');
  const whole = [...errors, ...warnings].map(findingOf);
  const report = reportOf(whole);
  const findings = whole.map((finding) => ({
    ...finding,
    where: clip(finding.where, FINDING_CHARS),
    message: clip(finding.message, FINDING_CHARS),
  }));
  const changed = Option.liftPredicate(
    at,
    (asked) => (asked.from ?? 0) > 0 && asked.report !== report,
  );
  const restarted = Option.match(changed, {
    onNone: () => ({}),
    onSome: () => ({
      restarted:
        'the findings changed since the page asked for (some fixed, or new), or no report was given: listed again from the first',
    }),
  });
  const start = Option.match(changed, {
    onNone: () => Math.min(at.from ?? 0, findings.length),
    onSome: () => 0,
  });
  const page = (count: number): CheckPage => ({
    errors: errors.length,
    warnings: warnings.length,
    from: start,
    findings: findings.slice(start, start + count),
    ...restarted,
  });
  const scope = Option.match(Option.fromUndefinedOr(at.scenes), {
    onNone: () => ({}),
    onSome: (scenes) => ({ scenes }),
  });
  const count = largestFitting(Math.min(CHECK_MAX_FINDINGS, findings.length - start), (size) =>
    checkFits({ ...page(size), next: { from: FAR, report, ...scope } }),
  );
  if (start + count >= findings.length) return page(count);
  return { ...page(count), next: { from: start + count, report, ...scope } };
};

const CuesCursor = Schema.Struct({
  from: Schema.Int,
  column: Schema.Int,
  scene: Schema.optionalKey(Schema.String),
});

export const CuesPage = Schema.Struct({
  from: Schema.Int,
  column: Schema.Int,
  total: Schema.Int,
  lines: Schema.Array(Schema.String),
  late: Schema.optionalKey(Schema.String),
  rest: Schema.optionalKey(Schema.String),
  next: Schema.optionalKey(CuesCursor),
});
type CuesPage = typeof CuesPage.Type;
const cuesFits = fitsUnder(CuesPage);

interface CuesAt {
  readonly from?: number;
  readonly column?: number;
  readonly scene?: string;
}

export const cuesPage = (
  all: ReadonlyArray<string>,
  late: Option.Option<string>,
  at: CuesAt,
): CuesPage => {
  const from = Math.max(1, Math.min(at.from ?? 1, all.length));
  const column = Math.max(1, Math.min(at.column ?? 1, (all[from - 1] ?? '').length + 1));
  const lines = [
    ...all.slice(from - 1, from).map((first) => first.slice(column - 1)),
    ...all.slice(from),
  ];
  const base = {
    from,
    column,
    total: all.length,
    ...Option.match(late, {
      onNone: () => ({}),
      onSome: (text) => ({ late: clip(text, FINDING_CHARS) }),
    }),
  };
  const scope = Option.match(Option.fromUndefinedOr(at.scene), {
    onNone: () => ({}),
    onSome: (scene) => ({ scene }),
  });
  const restOf = (left: number) =>
    `${left} more lines left out to fit: call cues again with next as it is`;
  const count = largestFitting(lines.length, (size) =>
    cuesFits({
      ...base,
      lines: lines.slice(0, size),
      rest: restOf(FAR),
      next: { from: FAR, column: 1, ...scope },
    }),
  );
  if (count === lines.length) return { ...base, lines };
  if (count > 0)
    return {
      ...base,
      lines: lines.slice(0, count),
      rest: restOf(lines.length - count),
      next: { from: from + count, column: 1, ...scope },
    };
  const first = lines[0] ?? '';
  const rest = `line ${from} goes on past this answer: call cues again with next as it is`;
  let size = largestFitting(first.length, (chars) =>
    cuesFits({
      ...base,
      lines: [first.slice(0, chars)],
      rest,
      next: { from: FAR, column: FAR, ...scope },
    }),
  );
  if (size > 1 && isHighSurrogate(first.charCodeAt(size - 1))) size -= 1;
  size = Math.max(1, size);
  return {
    ...base,
    lines: [first.slice(0, size)],
    rest,
    next: { from, column: column + size, ...scope },
  };
};

export const JournalPage = Schema.Struct({
  file: Schema.String,
  lines: Schema.Array(Schema.String),
  earlier: Schema.optionalKey(Schema.String),
});
type JournalPage = typeof JournalPage.Type;
const journalFits = fitsUnder(JournalPage);

export const journalPage = (
  file: string,
  lines: ReadonlyArray<string>,
  left: number,
): JournalPage => {
  const kept = lines.map((line) => clip(line, ENTRY_CHARS));
  const earlierOf = (count: number) => `${count} earlier entries not shown: ${file} holds them all`;
  const count = largestFitting(kept.length, (size) =>
    journalFits({ file, lines: kept.slice(kept.length - size), earlier: earlierOf(FAR) }),
  );
  const shown = kept.slice(kept.length - count);
  const out = left + kept.length - count;
  if (out === 0) return { file, lines: shown };
  return { file, lines: shown, earlier: earlierOf(out) };
};
