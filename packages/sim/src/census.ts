/**
 * The most one slow case may take, in seconds. The slow tests' timing
 * census reads each case's time from the JUnit report `bun test
 * --reporter=junit` writes and judges it against this: a case over it fails
 * the census only when the host was quiet (its one-minute load at most
 * `QUIET` before and after the run); on a loaded host a case over it leaves
 * the census unjudged, never passed.
 */
export const LIMIT = 1;

/** The most one-minute load a census is judged at. */
export const QUIET = 5;

/** One case of the report: its file, its name and its time in seconds. */
interface Timed {
  readonly file: string;
  readonly name: string;
  readonly seconds: number;
}

const ENTITIES = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['lt', '<'],
  ['quot', '"'],
]);

const unescaped = (text: string) =>
  text.replace(/&(amp|apos|gt|lt|quot);/g, (whole, name: string) => ENTITIES.get(name) ?? whole);

/** Every case of a JUnit report, in its order. */
export const casesOf = (report: string): ReadonlyArray<Timed> =>
  [...report.matchAll(/<testcase\s([^>]*?)\/?>/g)].map((match) => {
    const fields = new Map(
      [...(match[1] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map(
        ([, key = '', value = '']) => [key, unescaped(value)] as const,
      ),
    );
    return {
      file: fields.get('file') ?? '',
      name: fields.get('name') ?? '',
      seconds: Number(fields.get('time') ?? 'NaN'),
    };
  });

/** What a census found: `pass`, cases `over` the limit on a quiet host, or `unjudged` on a loaded one. */
interface Verdict {
  readonly verdict: 'pass' | 'over' | 'unjudged';
  /** The cases over the limit (or with no time), slowest first. */
  readonly over: ReadonlyArray<Timed>;
}

/** Judge `cases` timed while the one-minute load was `before` at the start and `after` at the end. */
export const judge = (cases: ReadonlyArray<Timed>, before: number, after: number): Verdict => {
  const over = cases
    .filter((one) => !(one.seconds <= LIMIT))
    .toSorted((a, b) => (b.seconds || Infinity) - (a.seconds || Infinity));
  if (over.length === 0) return { verdict: 'pass', over };
  if (Math.max(before, after) > QUIET) return { verdict: 'unjudged', over };
  return { verdict: 'over', over };
};
