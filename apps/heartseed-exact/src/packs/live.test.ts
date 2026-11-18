/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noNewPromise, effect/noNullish -- a Bun test reading the tracked contract tests beside `app.contract`, as the gate's other source checks do; Exact's app folder cannot import effect (docs/exact.md), so the compiler's parses are awaited as the file loads, and its JSON writes an unlimited refusal's `times` as null. */

/**
 * No contract test reaches egw.cvr.im. A test that did would read the live
 * server, so what it saw would change with a deploy (the Go to test went
 * red when the word pack was first published, and again when the web
 * build could read it). Each test of every `*.test.contract` is judged as
 * Exact's own compiler parses it (`tools/contract-tests.ts`), so spaces and
 * escapes in the text change nothing: each test's leading lines, which Exact
 * arms before the app's first data load (its `agent-test.mjs`, LLP 1103 D3),
 * hold an unlimited `fail fetch` of a prefix of `https://egw.cvr.im`, so on
 * every host each pack's fetch is refused and a plain launch has no pack;
 * and no step passes a fetch there again, or counts its refusal: Exact's
 * `fail fetch "<prefix>" times N` replaces the unlimited one for that
 * prefix, so the fetches after the Nth would reach the server. What a pack
 * does once it lands runs against the loopback fixture in the drives
 * (`tools/commentary-fixture.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { type Parsed, type ParsedStep, parsedFile, parsedText } from '../../tools/contract-tests';
import { PACKS_HOST } from './sources';

const REFUSED = `fail fetch "${PACKS_HOST}"`;

/** The ops Exact takes as a test's leading lines, before its first step that drives the app (`agent-test.mjs`). */
const LEADING = new Set([
  'fail-fetch',
  'before-data',
  'fresh',
  'size',
  'at',
  'prefer',
  'epoch',
  'time-zone',
  'locale',
  'seed',
]);

/** Whether a fetch rule's `prefix` names a prefix the packs' host's fetches share. */
const reaches = (prefix: string): boolean =>
  PACKS_HOST.startsWith(prefix) || prefix.startsWith(PACKS_HOST);

/** The steps a test leads with, which Exact arms at its launch. */
const leadingOf = (steps: ReadonlyArray<ParsedStep>): ReadonlyArray<ParsedStep> =>
  steps.slice(0, [...steps.map((step) => LEADING.has(step.op)), false].indexOf(false));

/** Why a parsed contract test file may reach the packs' host, or nothing when it cannot. */
const reachesLive = (parsed: Parsed): ReadonlyArray<string> => {
  if ('refused' in parsed) return [parsed.refused];
  return parsed.tests.flatMap(({ name, steps }) => {
    const armed = leadingOf(steps).some(
      (step) =>
        step.op === 'fail-fetch' &&
        step.times == null &&
        PACKS_HOST.startsWith(step.prefix ?? '\u0000'),
    );
    const rules = steps.filter((step) => reaches(step.prefix ?? '\u0000'));
    return [
      ...[`${name}: no leading ${REFUSED}`].filter(() => !armed),
      ...rules
        .filter((step) => step.op === 'pass-fetch')
        .map((step) => `${name}: passes a fetch to it: pass fetch "${step.prefix}"`),
      ...rules
        .filter((step) => step.op === 'fail-fetch' && step.times != null)
        .map(
          (step) =>
            `${name}: counts its refusal, so later fetches reach it: fail fetch "${step.prefix}" times ${step.times}`,
        ),
    ];
  });
};

const app = join(import.meta.dir, '../..');
const contractTests = readdirSync(app).filter((name) => name.endsWith('.test.contract'));
const parsedTests = await Promise.all(
  contractTests.map(async (name) => [name, await parsedFile(join(app, name))] as const),
);

const planted = 'epoch "2026-11-14T12:00:00Z"\n\ntest "t"\n  tap "tab-read"\n';

/**
 * A counted refusal `line`, which Exact parses as `parsed`: as a step after the launch's refusal, and as the
 * file's one launch line of a fetch (Exact refuses two launch lines of one prefix), where nothing refuses
 * the host for good.
 */
const counted = (line: string, parsed: string) =>
  [
    [
      `${REFUSED}\n${planted}  ${line}\n`,
      [`t: counts its refusal, so later fetches reach it: ${parsed}`],
    ],
    [
      `${line}\n${planted}`,
      [`t: no leading ${REFUSED}`, `t: counts its refusal, so later fetches reach it: ${parsed}`],
    ],
  ] as const;

/** Texts the check must refuse, each with what it says, every one parsed as the file loads. */
const refusals: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  [planted, [`t: no leading ${REFUSED}`]],
  [`test "t"\n  tap "x"\n  ${REFUSED}\n`, [`t: no leading ${REFUSED}`]],
  [`fail fetch "https://egw.cvr.im.example"\n${planted}`, [`t: no leading ${REFUSED}`]],
  [
    `${REFUSED}\n${planted}\ntest "u"\n  ${REFUSED} times 1\n  tap "x"\n`,
    [
      `u: no leading ${REFUSED}`,
      `u: counts its refusal, so later fetches reach it: ${REFUSED} times 1`,
    ],
  ],
  ...['https://egw.cvr.im', 'https://egw.cvr.im/api/study/words', 'https://'].flatMap((prefix) =>
    [`pass fetch "${prefix}"`, `pass   fetch  "${prefix}"`].map(
      (line) =>
        [
          `${REFUSED}\n${planted}  ${line}\n`,
          [`t: passes a fetch to it: pass fetch "${prefix}"`],
        ] as const,
    ),
  ),
  ...['https://egw.cvr.im', 'https://egw.cvr.im/api/study', 'https://'].flatMap((prefix) =>
    [`fail fetch "${prefix}" times 2`, `fail fetch "${prefix}"  times 2`].flatMap((line) =>
      counted(line, `fail fetch "${prefix}" times 2`),
    ),
  ),
  ...[
    'fail  fetch "https://egw.cvr.im" times 1',
    'fail fetch  "https://egw.cvr.im" times 1',
    'fail fetch "https://egw\\u002ecvr.im" times 1',
    'fail fetch "https://egw.cvr.\\u{69}m" times 1',
  ].flatMap((line) => counted(line, `${REFUSED} times 1`)),
  ...['pass  fetch "https://egw.cvr.im"', 'pass fetch "https://egw\\u002ecvr\\u002eim"'].map(
    (line) =>
      [
        `${REFUSED}\n${planted}  ${line}\n`,
        [`t: passes a fetch to it: pass ${REFUSED.slice(5)}`],
      ] as const,
  ),
];

/** Texts the check must pass. */
const passes: ReadonlyArray<string> = [
  `${REFUSED}\n${planted}`,
  `${REFUSED}\n${planted}  fail fetch "http://127.0.0.1:4801" times 1\n`,
  `${REFUSED}\n${planted}  pass fetch "http://127.0.0.1:4801"\n`,
  `fail  fetch "https://egw\\u002ecvr.im"\n${planted}`,
  `epoch "2026-11-14T12:00:00Z"\n\ntest "t"\n  ${REFUSED}\n  tap "x"\n`,
];

const [refusedSeen, passedSeen, malformed] = await Promise.all([
  Promise.all(refusals.map(async ([text]) => reachesLive(await parsedText(text)))),
  Promise.all(passes.map(async (text) => reachesLive(await parsedText(text)))),
  parsedText('test "t"\n  pass fetch ""\n').then(reachesLive),
]);

describe('the contract tests', () => {
  it('are the files Exact reads', () => {
    expect(contractTests).toContain('goto.test.contract');
    expect(contractTests.length).toBeGreaterThan(10);
  });

  it.each(parsedTests)('%s never reaches egw.cvr.im', (_, parsed) => {
    expect('tests' in parsed && parsed.tests.length > 0).toBe(true);
    expect(reachesLive(parsed)).toEqual([]);
  });
});

describe('the check', () => {
  it('refuses a test with no leading refusal of egw.cvr.im, one that passes a fetch there again, or counts its refusal, however the text spaces or escapes it', () => {
    expect(refusedSeen).toEqual(refusals.map(([, why]) => why));
  });

  it('passes a file whose tests refuse it at launch, whatever else they pass or count', () => {
    expect(passedSeen).toEqual(passes.map(() => []));
  });

  it('refuses a file the compiler refuses', () => {
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toStartWith('contract test /dev/stdin exited ');
  });
});
