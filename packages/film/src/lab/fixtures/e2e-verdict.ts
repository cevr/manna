import { Array as Arr, Match, Option, Schema } from 'effect';

export interface Failure {
  readonly file: Option.Option<string>;
  readonly name: string;
  readonly whole: boolean;
}

const CI_PREFIX = /^[^\t\n]*\t[^\t\n]*\t\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const CI_GROUP = /^##\[(?:group|endgroup)\]/;
// oxlint-disable-next-line no-control-regex -- the colours bun prints are escape sequences
const ANSI = /\u001b\[[0-9;]*m/g;

const HEADER = /^(\S+\.test\.tsx?):$/;
const FAILED = /^(?:\(fail\)|✗) (.+?)(?: \[[\d.]+m?s\])?$/;
const CRASHED = /^(\S+\.test\.tsx?) \(worker crashed: \w+\)$/;
const SUMMARY = /^\d+ tests? failed:$/;
const BETWEEN = /^# Unhandled error between tests$/;
const ERRORS = /^\s*(\d+) errors?$/;
const RAN = /^Ran (\d+) tests? across \d+ files?\./m;

export const BETWEEN_TESTS = 'an error between tests';
const UNPLACED = 'an error bun counted that the log does not place';

const when = <A>(holds: boolean, ...values: ReadonlyArray<A>): ReadonlyArray<A> =>
  values.filter(() => holds);

const clean = (line: string) => line.replace(CI_PREFIX, '').replace(CI_GROUP, '').replace(ANSI, '');
const cleaned = (text: string) => text.split('\n').map(clean);

const captured = (pattern: RegExp, line: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(pattern.exec(line)), (m) => Option.fromNullishOr(m[1]));

const same = (a: Failure, b: Failure): boolean =>
  a.name === b.name &&
  a.whole === b.whole &&
  Option.getOrElse(
    Option.zipWith(a.file, b.file, (x, y) => x === y),
    () => true,
  );

export const failuresIn = (log: string): ReadonlyArray<Failure> => {
  const found: Array<Failure> = [];
  const add = (failure: Failure) => {
    if (!found.some((f) => same(f, failure))) found.push(failure);
  };
  let file = Option.none<string>();
  let summary = false;
  let counted = 0;
  let placed = 0;
  for (const line of cleaned(log)) {
    file = Option.orElse(captured(HEADER, line), () => file);
    if (SUMMARY.test(line)) summary = true;
    if (BETWEEN.test(line)) {
      placed += 1;
      add({ file, name: BETWEEN_TESTS, whole: true });
    }
    counted = Option.getOrElse(Option.map(captured(ERRORS, line), Number), () => counted);
    for (const name of Option.toArray(captured(FAILED, line))) {
      const crashed = captured(CRASHED, name);
      if (Option.isSome(crashed)) add({ file: crashed, name, whole: true });
      else if (!summary) add({ file, name, whole: false });
      else if (!found.some((f) => f.name === name))
        add({ file: Option.none(), name, whole: false });
    }
  }
  const unplaced = counted - placed;
  for (let k = 1; k <= unplaced; k += 1)
    add({ file: Option.none(), name: `${UNPLACED} (${k} of ${unplaced})`, whole: true });
  return found;
};

export const finishedIn = (log: string): boolean => RAN.test(cleaned(log).join('\n'));

const WORKERS = '--parallel';

const casePattern = (name: string): string =>
  `^${name.replaceAll(' > ', ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;

export const aloneArgs = (suite: string, failure: Failure): ReadonlyArray<string> => {
  const tokens = suite.split(/\s+/).filter((arg) => arg !== '' && arg !== 'e2e');
  const kept = tokens.filter((arg, i) => {
    const workers = arg === WORKERS || arg.startsWith(`${WORKERS}=`);
    const valueOfWorkers = tokens[i - 1] === WORKERS && /^\d+$/.test(arg);
    return !workers && !valueOfWorkers;
  });
  return [
    ...kept,
    Option.getOrElse(failure.file, () => 'e2e'),
    ...when(!failure.whole, '-t', casePattern(failure.name)),
  ];
};

export const Run = Schema.Literals(['pass', 'fail', 'none']);
export type Run = typeof Run.Type;

const FAILS = /^\s*(\d+) fail$/;

const countIn = (lines: ReadonlyArray<string>, pattern: RegExp): Option.Option<number> =>
  Arr.findFirst(lines, (line) => Option.map(captured(pattern, line), Number));

export const runOf = (exit: number, output: string): Run => {
  const lines = cleaned(output);
  const ran = Option.filter(Option.map(captured(RAN, lines.join('\n')), Number), (n) => n > 0);
  if (Option.isNone(ran)) return 'none';
  const fails = countIn(lines, FAILS);
  const errors = Option.getOrElse(countIn(lines, ERRORS), () => 0);
  if (errors > 0 || Option.exists(fails, (n) => n > 0)) return 'fail';
  if (Option.isSome(fails)) return 'pass';
  return Match.value(exit).pipe(
    Match.when(0, () => 'pass' as const),
    Match.orElse(() => 'fail' as const),
  );
};

const Verdict = Schema.Literals(['unit-caused', 'unresolved', 'green-alone', 'base']);
type Verdict = typeof Verdict.Type;

const VERDICTS: ReadonlyArray<Verdict> = ['unit-caused', 'unresolved', 'green-alone', 'base'];

const BLOCKING: ReadonlyArray<Verdict> = ['unit-caused', 'unresolved'];

export interface Judged {
  readonly failure: Failure;
  readonly alone: ReadonlyArray<Run>;
  readonly verdict: Verdict;
}

export interface Base {
  readonly failed: ReadonlyArray<Failure>;
  readonly finished: boolean;
  readonly alone: ReadonlyArray<Judged>;
}

const red = (runs: ReadonlyArray<Run>) => runs.includes('fail');
const green = (runs: ReadonlyArray<Run>) =>
  Arr.isReadonlyArrayNonEmpty(runs) && runs.every((run) => run === 'pass');

export const verdictOf = (
  failure: Failure,
  alone: ReadonlyArray<Run>,
  base: Option.Option<Base>,
): Verdict => {
  if (!Arr.isReadonlyArrayNonEmpty(alone) || alone.includes('none')) return 'unresolved';
  if (green(alone)) return 'green-alone';
  const atBase = Option.map(base, (b) => ({
    rerun: Option.map(
      Arr.findFirst(b.alone, (j) => same(j.failure, failure)),
      (j) => j.alone,
    ),
    passed: b.finished && !b.failed.some((f) => same(f, failure)),
  }));
  if (Option.exists(atBase, (b) => Option.exists(b.rerun, red))) return 'base';
  if (Option.exists(atBase, (b) => b.passed || Option.exists(b.rerun, green))) return 'unit-caused';
  return 'unresolved';
};

export const Recorded = Schema.Struct({
  finished: Schema.Boolean,
  judged: Schema.Array(
    Schema.Struct({
      file: Schema.NullOr(Schema.String),
      name: Schema.String,
      whole: Schema.Boolean,
      alone: Schema.Array(Run),
      verdict: Verdict,
    }),
  ),
});
export type Recorded = typeof Recorded.Type;

export const recordOf = (finished: boolean, judged: ReadonlyArray<Judged>): Recorded => ({
  finished,
  judged: judged.map((j) => ({
    file: Option.getOrNull(j.failure.file),
    name: j.failure.name,
    whole: j.failure.whole,
    alone: j.alone,
    verdict: j.verdict,
  })),
});

export const baseOfRecord = (record: Recorded): Base => {
  const judged = record.judged.map((j) => ({
    failure: { file: Option.fromNullishOr(j.file), name: j.name, whole: j.whole },
    alone: j.alone,
    verdict: j.verdict,
  }));
  return { failed: judged.map((j) => j.failure), finished: record.finished, alone: judged };
};

export const baseOfLog = (log: string): Base => ({
  failed: failuresIn(log),
  finished: finishedIn(log),
  alone: [],
});

export const ancestorsIn = (ps: string, pid: number): ReadonlyArray<string> => {
  const table = new Map(
    ps
      .split('\n')
      .flatMap((line) =>
        Option.toArray(
          Option.map(
            Option.fromNullishOr(/^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)),
            (m) => [Number(m[1]), { ppid: Number(m[2]), command: m[3] ?? '' }] as const,
          ),
        ),
      ),
  );
  const commands: Array<string> = [];
  let at = Option.flatMap(Option.fromUndefinedOr(table.get(pid)), (p) =>
    Option.fromUndefinedOr(table.get(p.ppid)),
  );
  while (Option.isSome(at) && commands.length < table.size) {
    commands.push(at.value.command);
    at = Option.fromUndefinedOr(table.get(at.value.ppid));
  }
  return commands;
};

const VALUED = new Set(['-t']);

const operandOf = (args: ReadonlyArray<string>): Option.Option<string> =>
  Option.flatMap(Arr.head(args), (head) => {
    if (!head.startsWith('-')) return Option.some(head);
    if (VALUED.has(head)) return operandOf(args.slice(2));
    return operandOf(args.slice(1));
  });

export const lockedBy = (command: string): Option.Option<string> => {
  const [program = '', ...args] = command.trim().split(/\s+/);
  if (!/^(?:\S*\/)?lockf$/.test(program)) return Option.none();
  return operandOf(args);
};

export const heldByAncestor = (
  commands: ReadonlyArray<string>,
  lock: string,
  realPath: (path: string) => string,
): boolean => {
  const held = realPath(lock);
  return commands.some((command) =>
    Option.exists(lockedBy(command), (file) => realPath(file) === held),
  );
};

export const loadWords = (host: {
  readonly load: number;
  readonly cores: number;
  readonly waited: number;
}): string =>
  [
    `${host.load.toFixed(1)} on ${host.cores} cores at the start`,
    ...when(host.waited > 0, `after waiting ${host.waited} s`),
    ...when(host.load > host.cores, 'still above the core count: ran anyway'),
  ].join(', ');

const suiteProblems = (input: {
  readonly exit: number;
  readonly finished: boolean;
  readonly judged: ReadonlyArray<Judged>;
}): ReadonlyArray<string> => [
  ...when(
    !input.finished,
    'the suite never finished: bun printed no `Ran N tests` line, so the cases it never reached are not judged',
  ),
  ...when(
    input.finished && input.exit !== 0 && input.judged.length === 0,
    `the suite exited ${input.exit} and named no failure: see the log`,
  ),
];

export const blocks = (input: {
  readonly exit: number;
  readonly finished: boolean;
  readonly judged: ReadonlyArray<Judged>;
}): boolean =>
  Arr.isReadonlyArrayNonEmpty(suiteProblems(input)) ||
  input.judged.some((j) => BLOCKING.includes(j.verdict));

const aloneCell = (alone: ReadonlyArray<Run>) =>
  Option.match(Option.liftPredicate(alone, Arr.isReadonlyArrayNonEmpty), {
    onNone: () => '—',
    onSome: (runs) => runs.join(' '),
  });

export const verdictMarkdown = (input: {
  readonly log: string;
  readonly base: Option.Option<{ readonly path: string; readonly reruns: boolean }>;
  readonly exit: number;
  readonly seconds: number;
  readonly load: string;
  readonly finished: boolean;
  readonly judged: ReadonlyArray<Judged>;
}): string => {
  const count = (v: Verdict) => input.judged.filter((j) => j.verdict === v).length;
  const rows = VERDICTS.flatMap((v) =>
    input.judged
      .filter((j) => j.verdict === v)
      .map(
        (j) =>
          `| ${v} | ${Option.getOrElse(j.failure.file, () => '?')} | ${j.failure.name.replaceAll('|', '\\|')} | ${aloneCell(j.alone)} |`,
      ),
  );
  const problems = suiteProblems(input);
  const blocking = [
    ...BLOCKING.filter((v) => count(v) > 0).map((v) => `${count(v)} ${v}`),
    ...problems.map((p) => p.split(':')[0] ?? p),
  ];
  return [
    `# e2e verdict: ${Option.match(Option.liftPredicate(blocking, Arr.isReadonlyArrayNonEmpty), {
      onNone: () => 'clear (no unit-caused or unresolved failure)',
      onSome: (b) => `blocked: ${b.join(', ')}`,
    })}`,
    '',
    `- log: \`${input.log}\` (exit ${input.exit}, ${input.seconds} s)`,
    `- base: ${Option.match(input.base, {
      onNone: () => 'none (a failure red alone is unresolved)',
      onSome: (b) =>
        `\`${b.path}\` (${Match.value(b.reruns).pipe(
          Match.when(true, () => "its check's reruns alone"),
          Match.orElse(() => 'its log only: no rerun known'),
        )})`,
    })}`,
    `- load: ${input.load}`,
    `- failures: ${input.judged.length}: ${VERDICTS.map((v) => `${v} ${count(v)}`).join(', ')}`,
    ...problems.map((p) => `- blocks: ${p}`),
    '',
    ...Option.match(Option.liftPredicate(rows, Arr.isReadonlyArrayNonEmpty), {
      onNone: () => ['No case failed.'],
      onSome: (r) => [
        '| verdict | file | failure | alone ×3 |',
        '| --- | --- | --- | --- |',
        ...r,
        '',
        'green-alone: green in all three reruns alone. The suite failed it under load or by order (a case another left running); the reruns do not tell which.',
      ],
    }),
    '',
  ].join('\n');
};
