/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's own test files, by path under Bun. */

/**
 * A bare run of the app's tests, or of `verify`, which presses only what
 * the tests press (Exact's `scripts/verify.mjs`), never asks the
 * recordings' bucket (vb-67): the player asks a recording's address only
 * after a press of Play (or a retry), and in every test that presses one,
 * the player's origin is first held to be a loopback fixture's
 * (`player.fixture`, whatever the checkout's port), so a run whose build
 * names the bucket fails at that line before any request.
 * The reader is tried against a planted test first, so one that finds no
 * press cannot pass.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

const app = new URL('../', import.meta.url);

/** The controls whose press asks for a recording (features/player.contract). */
const SOUNDING = /^\s*tap "(play|bar-page-play|bar-toggle|player-toggle|retry)"/u;
const HELD = 'expect state player.fixture == true';

/** Each test of `text` that presses a sounding control before holding the origin, by its name. */
const unheld = (text: string): Array<string> => {
  const tests = text.split(/^(?=test ")/mu).filter((part) => part.startsWith('test "'));
  return tests.flatMap((part) => {
    const lines = part.split('\n');
    const press = lines.findIndex((line) => SOUNDING.test(line));
    if (press === -1) return [];
    const held = lines.findIndex((line) => line.trim() === HELD);
    if (held !== -1 && held < press) return [];
    return [lines[0] ?? ''];
  });
};

const files = readdirSync(app).filter((name) => name.endsWith('.test.contract'));

describe('no test asks the bucket', () => {
  it('finds a planted press, held or not', () => {
    const planted = 'test "a"\n  tap "play"\n\ntest "b"\n  ' + HELD + '\n  tap "bar-toggle"\n';
    expect(unheld(planted)).toEqual(['test "a"']);
    expect(files.length).toBeGreaterThan(5);
  });

  it('at least one test presses Play', () => {
    const presses = files.filter((name) =>
      readFileSync(new URL(name, app), 'utf8')
        .split('\n')
        .some((line) => SOUNDING.test(line)),
    );
    expect(presses.length).toBeGreaterThan(0);
  });

  for (const name of files)
    it(`${name}: each press of Play follows the fixture's origin`, () => {
      expect(unheld(readFileSync(new URL(name, app), 'utf8'))).toEqual([]);
    });
});
