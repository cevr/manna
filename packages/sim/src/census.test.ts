/**
 * The slow tests' census (`census.ts`): a JUnit report's cases read with
 * their file, name and time; a case over the limit fails a quiet host's
 * census and leaves a loaded host's unjudged; every case under it passes at
 * any load.
 */
import { describe, expect, it } from 'bun:test';

import { casesOf, judge, LIMIT, QUIET } from './census.ts';

const REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3">
  <testsuite name="src/a.slow.test.ts" file="src/a.slow.test.ts" tests="3">
    <testcase name="a scroll waits for the pan&apos;s fling" classname="sim" time="2.46" file="src/a.slow.test.ts" line="3" assertions="4" />
    <testcase name="quick &amp; plain" classname="sim" time="0.01" file="src/a.slow.test.ts" line="9" assertions="1" />
    <testcase name="a failure" classname="sim" time="0.5" file="src/b.slow.test.ts" line="1" assertions="1">
      <failure message="no" />
    </testcase>
  </testsuite>
</testsuites>`;

const timed = (seconds: number) => ({ file: 'src/x.slow.test.ts', name: 'x', seconds });

describe('the slow census', () => {
  it('reads every case with its file, its unescaped name and its time', () => {
    expect(casesOf(REPORT)).toEqual([
      { file: 'src/a.slow.test.ts', name: "a scroll waits for the pan's fling", seconds: 2.46 },
      { file: 'src/a.slow.test.ts', name: 'quick & plain', seconds: 0.01 },
      { file: 'src/b.slow.test.ts', name: 'a failure', seconds: 0.5 },
    ]);
  });

  it('fails a quiet census on a case over the limit, slowest first, and passes one at the limit', () => {
    const found = judge([timed(LIMIT), timed(1.2), timed(0.2), timed(3)], 1, QUIET);
    expect(found.verdict).toBe('over');
    expect(found.over.map((one) => one.seconds)).toEqual([3, 1.2]);
    expect(judge([timed(LIMIT), timed(0.4)], QUIET, 0.5).verdict).toBe('pass');
  });

  it('leaves a census over the limit unjudged when the load passed quiet at either end', () => {
    expect(judge([timed(1.5)], QUIET + 0.1, 1).verdict).toBe('unjudged');
    expect(judge([timed(1.5)], 1, QUIET + 0.1).verdict).toBe('unjudged');
    expect(judge([timed(0.9)], 40, 40).verdict).toBe('pass');
  });

  it('counts a case with no time read as over the limit', () => {
    expect(judge([{ file: 'f', name: 'n', seconds: Number.NaN }], 1, 1).verdict).toBe('over');
  });
});
