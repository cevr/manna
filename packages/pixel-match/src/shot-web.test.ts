/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noNullish, effect/noTestLifecycleHooks, effect/noThrowStatement, effect/noNewError -- the shot's files are real files in a scratch directory of the test's own, removed after the file's tests whether they pass or fail; the port, the Chrome store and the drive are the test's own fakes, and a row the screens no longer hold is a broken test, said by a throw. */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ROWS } from '../screens/index.ts';
import { cellsOf } from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { encodePng } from './png.ts';
import { shoot } from './shot.ts';

const scratch = mkdtempSync(join(tmpdir(), 'pixel-shoot-web-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const row = ROWS.hymnal.find((each) => each.id === 'recent.page');
if (row === undefined) throw new Error('no recent.page row');
const cell = cellsOf('hymnal', row).find(
  (each) => each.host === 'web' && each.scheme === 'light' && each.size === '390x844@2',
);
if (cell === undefined) throw new Error('no light 390x844@2 web cell of recent.page');

const PICTURE = encodePng({ width: 4, height: 4, rgba: new Uint8Array(4 * 4 * 4).fill(255) });
const OLD_RESULT = '{"differing":0,"stale":true}\n';

/** A checkout of the test's own, with the cell's reference and an earlier shot's result in it. */
const checkout = (name: string) => {
  const root = join(scratch, name);
  const frame = { root, refs: join(root, 'ref'), one: 'one' };
  const reference = refFile(frame, cell);
  mkdirSync(dirname(reference), { recursive: true });
  writeFileSync(reference, PICTURE);
  writeFileSync(reference.replace(/\.png$/, '.json'), '{}\n');
  const files = shotFiles(root, cell);
  mkdirSync(dirname(files.result), { recursive: true });
  writeFileSync(files.result, OLD_RESULT);
  return { frame, files };
};

/**
 * A fake port, Chrome store and drive, each call recorded in order: the
 * drive takes the screen and answers `replies` to the store's read-backs.
 */
const fakeHost = (screen: string, replies: ReadonlyArray<string>) => {
  const calls: string[] = [];
  const host = {
    claim: async (_appDir: string, label: string) => {
      calls.push(`claim ${label}`);
      return {
        port: 8771,
        give: () => {
          calls.push('give');
        },
      };
    },
    writeStore: async (
      _appDir: string,
      port: number,
      seed: { readonly states: ReadonlyArray<readonly [string, string]> },
    ) => {
      calls.push(`store ${port} ${seed.states.map(([name]) => name).join(',')}`);
      return [];
    },
    drive: (argv: ReadonlyArray<string>) => {
      const at = argv.indexOf('--port');
      calls.push(`drive ${argv[at + 1] ?? 'no port'}`);
      writeFileSync(screen, PICTURE);
      return ['{"ok":true}', '{"clock":0,"settled":true}', ...replies, '{"compare":"same"}'].join(
        '\n',
      );
    },
  };
  return { host, calls };
};

describe("the port's web cell, shot", () => {
  test('a store the drive did not read refuses the cell, leaves no score of an earlier shot, and gives the port back', async () => {
    const { frame, files } = checkout('unread');
    const { host, calls } = fakeHost(files.screen, ['"on"', '[]', '[]']);
    const lines = await shoot(
      frame,
      'hymnal',
      [row],
      { web: true, scheme: 'light', size: '390x844@2' },
      host,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith(
      'FAILED hymnal/web/recent.page/light/390x844@2: recent.page: the web store was not read: settingsFeelKept read "on", seeded "off"',
    );
    expect(existsSync(files.result)).toBe(false);
    expect(existsSync(files.diff)).toBe(false);
    expect(calls).toEqual([
      'claim pixel shot hymnal/web/recent.page/light/390x844@2',
      'store 8771 settingsFeelKept,favouriteList,recentList',
      'drive 8771',
      'give',
    ]);
  });

  test('a store read back as seeded is scored, and its result is this shot’s', async () => {
    const { frame, files } = checkout('read');
    const { host, calls } = fakeHost(files.screen, ['"off"', '[1, 100, 529]', '[12,100,1]']);
    const lines = await shoot(
      frame,
      'hymnal',
      [row],
      { web: true, scheme: 'light', size: '390x844@2' },
      host,
    );
    expect(lines[0]).toStartWith('hymnal/web/recent.page/light/390x844@2: 0 of 16 differ');
    const result = readFileSync(files.result, 'utf8');
    expect(result).not.toBe(OLD_RESULT);
    expect(result).toContain('"differing": 0,');
    expect(result).toContain('\\"compare\\":\\"same\\"');
    expect(calls.at(-1)).toBe('give');
  });

  test("a shot leaves One's route types in place: the exact wrapper sets them aside for the bake and puts them back", async () => {
    const { frame, files } = checkout('routes');
    const routes = join(frame.root, 'apps', 'hymnal', 'app', 'routes.d.ts');
    mkdirSync(dirname(routes), { recursive: true });
    writeFileSync(routes, 'declare module "one" {}\n');
    const { host } = fakeHost(files.screen, ['"off"', '[1, 100, 529]', '[12,100,1]']);
    await shoot(frame, 'hymnal', [row], { web: true, scheme: 'light', size: '390x844@2' }, host);
    expect(readFileSync(routes, 'utf8')).toBe('declare module "one" {}\n');
  });

  test('a cell that fails before its drive leaves no score of an earlier shot either', async () => {
    const { frame, files } = checkout('no-reference');
    rmSync(refFile(frame, cell));
    const { host, calls } = fakeHost(files.screen, []);
    const lines = await shoot(
      frame,
      'hymnal',
      [row],
      { web: true, scheme: 'light', size: '390x844@2' },
      host,
    );
    expect(lines).toEqual([
      'FAILED hymnal/web/recent.page/light/390x844@2: hymnal/web/recent.page/light/390x844@2: no reference',
    ]);
    expect(existsSync(files.result)).toBe(false);
    expect(calls).toEqual([]);
  });
});
