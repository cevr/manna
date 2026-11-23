/* oxlint-disable effect/noNodeBuiltinImport, effect/noThrowStatement, effect/noNewError, effect/noTryCatch, effect/noTernary -- a drive is a child process whose output lands in a scratch log of the host's temporary directory; a drive that fails is a throw, read back by the test. */
import { describe, expect, test } from 'bun:test';

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { atContentSize, rectIn, runLogged } from './ios.ts';

describe("a cell's text size", () => {
  const simulator = (start: string) => {
    let now = start;
    const sets: Array<string> = [];
    return {
      sets,
      sim: {
        read: () => now,
        set: (size: string) => {
          now = size;
          sets.push(size);
        },
      },
    };
  };

  test('is set before the drive, read back by it, and put back after it', () => {
    const { sim, sets } = simulator('large');
    const seen = atContentSize(sim, 'accessibility-extra-extra-extra-large', 'large', (readBack) =>
      readBack(),
    );
    expect(seen).toBe('accessibility-extra-extra-extra-large');
    expect(sets).toEqual(['accessibility-extra-extra-extra-large', 'large']);
  });

  test('is put back when the drive throws, so the next cell does not inherit it', () => {
    const { sim } = simulator('large');
    expect(() =>
      atContentSize(sim, 'extra-small', 'large', () => {
        throw new Error('the drive exited 1');
      }),
    ).toThrow('the drive exited 1');
    expect(sim.read()).toBe('large');
  });

  test('is set even when a former run left another on the simulator', () => {
    const { sim, sets } = simulator('accessibility-extra-extra-extra-large');
    expect(atContentSize(sim, 'large', 'large', (readBack) => readBack())).toBe('large');
    expect(sets).toEqual(['large']);
  });
});

describe('a failed drive', () => {
  test("keeps its whole output in the cell's log and throws with the tail of its stdout and stderr", () => {
    const log = join(mkdtempSync(join(tmpdir(), 'pm-log-')), 'cell.log');
    const long = Array.from({ length: 40 }, (_, i) => `op-${i}`).join(' ');
    const script = `for i in $(seq 1 30); do echo "reply $i"; done; echo '{"error":"no node find-number"}'; echo warn-1 >&2; exit 1`;
    let message = '';
    try {
      runLogged(['sh', '-c', script, long], log);
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('exited 1');
    expect(message).toContain('{"error":"no node find-number"}');
    expect(message).toContain('warn-1');
    expect(message).toContain(log);
    expect(message).not.toContain('reply 1\n');
    const kept = readFileSync(log, 'utf8');
    expect(kept).toContain('reply 1\n');
    expect(kept).toContain('reply 30');
    expect(kept).toContain('warn-1');
  });

  test('returns its stdout and still logs it', () => {
    const log = join(mkdtempSync(join(tmpdir(), 'pm-log-')), 'cell.log');
    expect(runLogged(['sh', '-c', 'echo ok'], log)).toBe('ok\n');
    expect(readFileSync(log, 'utf8')).toContain('exit 0');
  });
});

describe("a driver's rect", () => {
  test('is the first whole rect, depth first', () => {
    const answer =
      '{"ok":true,"node":{"label":"Today","frame":{"x":20,"y":64.5,"width":120,"height":41}}}';
    expect(rectIn(answer)).toEqual({ x: 20, y: 64.5, width: 120, height: 41 });
  });

  test('is none for a part of a rect, or text that is no JSON', () => {
    expect(rectIn('{"frame":{"y":1,"height":2}}')).toBeUndefined();
    expect(rectIn('not json')).toBeUndefined();
  });
});
