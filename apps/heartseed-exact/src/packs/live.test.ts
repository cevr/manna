/* oxlint-disable effect/noNodeBuiltinImport -- a Bun test reading the tracked contract tests beside `app.contract`, as the gate's other source checks do. */

/**
 * No contract test reaches egw.cvr.im. A test that did would read the live
 * server, so what it saw would change with a deploy (the Go to test went
 * red when the word pack was first published, and again when the web
 * build could read it). Every `*.test.contract` opens with the launch line
 * `fail fetch "https://egw.cvr.im"`, so on every host each pack's fetch is
 * refused and a plain launch has no pack; and no line passes a fetch
 * there again, or counts its refusal: Exact's `fail fetch "<prefix>" times N`
 * replaces the unlimited one for that prefix, so the fetches after the Nth
 * would reach the server. What a pack does once it lands runs against the
 * loopback fixture in the drives (`tools/commentary-fixture.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { appText } from '../../tools/commentary-fixture';
import { PACKS_HOST } from './sources';

const REFUSED = `fail fetch "${PACKS_HOST}"`;

/** Why a contract test's text may reach the packs' host, or nothing when it cannot. */
const reachesLive = (text: string): ReadonlyArray<string> => {
  const launch = (text.split(/^test /mu)[0] ?? '').split('\n');
  const lines = text.split('\n');
  const passed = lines.filter((line) => /^\s*pass fetch "[^"]*"/u.test(line) && reaches(line));
  const counted = lines.filter(
    (line) => /^\s*fail fetch "[^"]*"\s+times\b/u.test(line) && reaches(line),
  );
  return [
    ...[`no launch line ${REFUSED}`].filter(() => !launch.includes(REFUSED)),
    ...passed.map((line) => `passes a fetch to it: ${line.trim()}`),
    ...counted.map((line) => `counts its refusal, so later fetches reach it: ${line.trim()}`),
  ];
};

/** Whether a `pass fetch "<prefix>"` or `fail fetch "<prefix>"` line names a prefix the packs' host's fetches share. */
const reaches = (line: string): boolean => {
  const prefix = /"([^"]*)"/u.exec(line)?.[1] ?? '';
  return PACKS_HOST.startsWith(prefix) || prefix.startsWith(PACKS_HOST);
};

const app = join(import.meta.dir, '../..');
const contractTests = readdirSync(app).filter((name) => name.endsWith('.test.contract'));

describe('the contract tests', () => {
  it('are the files Exact reads', () => {
    expect(contractTests).toContain('goto.test.contract');
    expect(contractTests.length).toBeGreaterThan(10);
  });

  it.each(contractTests)('%s never reaches egw.cvr.im', (name) => {
    expect(reachesLive(appText(name))).toEqual([]);
  });
});

describe('the check', () => {
  const planted = 'epoch "2026-11-14T12:00:00Z"\n\ntest "t"\n  tap "tab-read"\n';

  it('refuses a file with no launch line refusing egw.cvr.im', () => {
    expect(reachesLive(planted)).toEqual([`no launch line ${REFUSED}`]);
    expect(reachesLive(`test "t"\n  ${REFUSED}\n  tap "x"\n`)).toEqual([
      `no launch line ${REFUSED}`,
    ]);
    expect(reachesLive(`fail fetch "https://egw.cvr.im.example"\n${planted}`)).toEqual([
      `no launch line ${REFUSED}`,
    ]);
  });

  it('refuses a line that passes a fetch to egw.cvr.im again', () => {
    for (const prefix of ['https://egw.cvr.im', 'https://egw.cvr.im/api/study/words', 'https://'])
      expect(reachesLive(`${REFUSED}\n${planted}  pass fetch "${prefix}"\n`)).toEqual([
        `passes a fetch to it: pass fetch "${prefix}"`,
      ]);
  });

  it('refuses a counted refusal of egw.cvr.im, as a launch line or a step', () => {
    for (const prefix of ['https://egw.cvr.im', 'https://egw.cvr.im/api/study', 'https://'])
      for (const counted of [`fail fetch "${prefix}" times 2`, `fail fetch "${prefix}"  times 1`]) {
        const why = `counts its refusal, so later fetches reach it: ${counted}`;
        expect(reachesLive(`${REFUSED}\n${planted}  ${counted}\n`)).toEqual([why]);
        expect(reachesLive(`${REFUSED}\n${counted}\n${planted}`)).toEqual([why]);
      }
  });

  it('passes a file that refuses it, whatever else it passes', () => {
    expect(
      reachesLive(`${REFUSED}\n${planted}  fail fetch "http://127.0.0.1:4801" times 1\n`),
    ).toEqual([]);
    expect(reachesLive(`${REFUSED}\n${planted}`)).toEqual([]);
    expect(reachesLive(`${REFUSED}\n${planted}  pass fetch "http://127.0.0.1:4801"\n`)).toEqual([]);
  });
});
