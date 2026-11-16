/* oxlint-disable effect/noNullish -- a Bun test's reader of the app's own test files, line by line. */

/**
 * Every authored test that plays a hymn turns Sounds and haptics off first,
 * as the owner's rule asks: it opens at `at "/settings"` and its steps begin
 * with the shared opener (`QUIET_OPENER`, `tools/quiet.ts`), before any tap
 * that can start a recording (`play`, `bar-page-play`, `bar-toggle`, a lock
 * screen's `play`). The finder is first tried on a planted test, so a finder
 * that finds nothing cannot pass.
 */

import { describe, expect, it } from 'bun:test';

import { QUIET_OPENER } from '../../tools/quiet.ts';
import { appFile, testFiles } from './design.testing.ts';

const PLAYS = /^tap "(play|bar-page-play|bar-toggle)"$|^tap "audio" mediasession "play"$/u;

interface Authored {
  readonly at: string;
  readonly name: string;
  readonly lines: ReadonlyArray<string>;
}

/** Each test of a test file: its name, where it starts, its trimmed lines. */
const testsOf = (file: string, text: string): ReadonlyArray<Authored> => {
  const tests: Array<{ at: string; name: string; lines: Array<string> }> = [];
  text.split('\n').forEach((line, index) => {
    const opens = /^test "(.*)"/u.exec(line);
    if (opens !== null) tests.push({ at: `${file}:${index + 1}`, name: opens[1] ?? '', lines: [] });
    else if (line.startsWith('  ') && !line.trim().startsWith('//'))
      tests.at(-1)?.lines.push(line.trim());
  });
  return tests;
};

/** Why a test plays without turning Sounds and haptics off first, or '' when it does not. */
const fault = (test: Authored) => {
  const plays = test.lines.findIndex((line) => PLAYS.test(line));
  if (plays < 0) return '';
  if (!test.lines.includes('at "/settings"')) return 'plays, but does not open at "/settings"';
  const first = test.lines.findIndex(
    (line) => !/^(at|size|epoch|time-zone|locale|seed|prefer|before|fail) /u.test(line),
  );
  const opener = test.lines.slice(first, first + QUIET_OPENER.length);
  if (opener.join('\n') !== QUIET_OPENER.join('\n') || first + QUIET_OPENER.length > plays)
    return `plays, but its steps do not begin with the quiet opener: ${opener.join(' | ')}`;
  return '';
};

const authored = testFiles().flatMap((file) => testsOf(file, appFile(file)));

describe('every test that plays turns Sounds and haptics off first', () => {
  it('finds a planted test that plays straight away, and passes the opener', () => {
    const planted = testsOf(
      'planted.test.contract',
      [
        'test "plays loud"',
        '  at "/hymns/1"',
        '  clock data',
        '  tap "play"',
        'test "plays quiet"',
        '  at "/settings"',
        ...QUIET_OPENER.map((line) => `  ${line}`),
        '  tap "hymn-1"',
        '  tap "play"',
        'test "never plays"',
        '  at "/hymns/1"',
        '  tap "favourite"',
      ].join('\n'),
    );
    expect(planted.map(fault).map((said) => said !== '')).toEqual([true, false, false]);
  });

  it('reads the tests that play', () => {
    expect(
      authored.filter((test) => test.lines.some((line) => PLAYS.test(line))).length,
    ).toBeGreaterThanOrEqual(13);
  });

  it.each(authored.map((test) => [test.at, test] as const))('%s', (_, test) => {
    expect({ test: test.name, fault: fault(test) }).toEqual({ test: test.name, fault: '' });
  });
});
