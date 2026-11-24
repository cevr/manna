import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { cleanExitSince, closeOutcome } from './close.ts';

/** `cleanExitSince(profile, since)` on a profile folder whose Preferences say `exitType`, written at `at` (epoch ms), the folder removed after. */
const cleanExitIn = (exitType: string, at: number, since: number) => {
  const profile = mkdtempSync(join(tmpdir(), 'exact-kit-close-'));
  mkdirSync(join(profile, 'Default'));
  const file = join(profile, 'Default', 'Preferences');
  writeFileSync(file, JSON.stringify({ profile: { exit_type: exitType, name: 'Person 1' } }));
  utimesSync(file, at / 1000, at / 1000);
  const answer = cleanExitSince(profile, since);
  rmSync(profile, { recursive: true, force: true });
  return answer;
};

describe('closeOutcome', () => {
  test('a close that is refused is never closed', async () => {
    const outcome = await closeOutcome(
      () => Promise.reject(Error('planted close failure')),
      () => true,
    );
    expect(outcome).toBe('refused');
  });

  test('a close that succeeds with no shutdown seen is killed, not closed', async () => {
    expect(
      await closeOutcome(
        () => Promise.resolve(),
        () => false,
      ),
    ).toBe('killed');
  });

  test('a close that has not settled in time is late', async () => {
    expect(
      await closeOutcome(
        () => new Promise(() => {}),
        () => true,
        5,
      ),
    ).toBe('late');
  });

  test('only a close that succeeds and whose shutdown is seen is closed', async () => {
    expect(
      await closeOutcome(
        () => Promise.resolve(),
        () => true,
      ),
    ).toBe('closed');
  });
});

describe('cleanExitSince', () => {
  const asked = Date.now();

  test("Chrome's clean exit written after the ask is a shutdown", () => {
    expect(cleanExitIn('Normal', asked + 20, asked)).toBe(true);
  });

  test("a clean exit written before the ask (the last run's) is not this close's", () => {
    expect(cleanExitIn('Normal', asked - 60_000, asked)).toBe(false);
  });

  test('a save made while running (exit type Crashed) is no shutdown', () => {
    expect(cleanExitIn('Crashed', asked + 20, asked)).toBe(false);
  });

  test('a profile with no Preferences records no shutdown', () => {
    expect(cleanExitSince('/nonexistent/loop-probe-x', asked)).toBe(false);
  });
});
