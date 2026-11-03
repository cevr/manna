import { Option } from 'effect';

interface Versions {
  readonly base: string;
  readonly first: string;
  readonly second: string;
  readonly merged: string;
}

interface Lost {
  readonly dropped: ReadonlyArray<string>;
  readonly restored: ReadonlyArray<string>;
}

const MIN_LENGTH = 8;

const SENTENCE_END = /(?<=[.;])\s+/;

const linesOf = (text: string): ReadonlyArray<string> =>
  text
    .split('\n')
    .flatMap((line) => line.split(SENTENCE_END))
    .map((line) => line.trim())
    .filter((line) => line.length >= MIN_LENGTH);

const counts = (lines: ReadonlyArray<string>): Map<string, number> => {
  const out = new Map<string, number>();
  for (const line of lines) out.set(line, (out.get(line) ?? 0) + 1);
  return out;
};

const beyond = (to: string, from: string): ReadonlyArray<string> => {
  const had = counts(linesOf(from));
  const out: Array<string> = [];
  for (const line of linesOf(to)) {
    const left = had.get(line) ?? 0;
    if (left > 0) had.set(line, left - 1);
    else out.push(line);
  }
  return out;
};

const lostOf = (base: string, side: string, other: string, merged: string): Lost => {
  const kept = new Set(linesOf(merged));
  const otherAdded = new Set(beyond(other, base));
  return {
    dropped: beyond(side, base).filter((line) => !kept.has(line)),
    restored: beyond(base, side).filter((line) => kept.has(line) && !otherAdded.has(line)),
  };
};

interface LostEdits {
  readonly first: Lost;
  readonly second: Lost;
}

export const lostEdits = (v: Versions): LostEdits => ({
  first: lostOf(v.base, v.first, v.second, v.merged),
  second: lostOf(v.base, v.second, v.first, v.merged),
});

const quoted = (line: string) => {
  if (line.length <= 120) return `"${line}"`;
  return `"${line.slice(0, 117)}…"`;
};

export const fileLines = (file: string, lost: LostEdits): ReadonlyArray<string> => {
  const each = (parent: '^1' | '^2', l: Lost) => [
    ...l.dropped.map((line) => `merge-audit ${file} dropped ${parent}: ${quoted(line)}`),
    ...l.restored.map((line) => `merge-audit ${file} restored ${parent}: ${quoted(line)}`),
  ];
  const out = [...each('^1', lost.first), ...each('^2', lost.second)];
  if (out.length === 0) return [`merge-audit ${file} keeps both parents' edits`];
  return out;
};

export const headLine = (
  merge: string,
  conflicted: ReadonlyArray<string>,
  changed: ReadonlyArray<string>,
  inside: Option.Option<string> = Option.none(),
): string =>
  [
    `merge-audit ${merge.slice(0, 8)}`,
    ...Option.toArray(Option.map(inside, (outer) => `inside ${outer.slice(0, 8)}`)),
    `conflicted=${conflicted.length} resolved-by-hand=${changed.length}`,
  ].join(' ');

export const conflictedPaths = (mergeTreeOut: string): ReadonlyArray<string> => {
  const paths = new Set<string>();
  for (const line of mergeTreeOut.split('\n').slice(1)) {
    const at = line.indexOf('\t');
    if (/^\d{6} [0-9a-f]+ [123]$/.test(line.slice(0, at))) paths.add(line.slice(at + 1));
  }
  return [...paths];
};
