/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noNullish, effect/noTestLifecycleHooks -- the reference files are real files in a scratch directory of the test's own, removed after the file's tests whether they pass or fail; a take that never holds still answers no picture. */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { keepTaken } from './take.ts';

const scratch = mkdtempSync(join(tmpdir(), 'pixel-take-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const OLD = new Uint8Array([1, 2, 3]);
const NEW = new Uint8Array([9, 9, 9, 9]);

/** A reference already there, and a take that writes `NEW` where it is told to. */
const setUp = (name: string) => {
  mkdirSync(join(scratch, name));
  const file = join(scratch, name, 'light-large.png');
  const write = async (taking: string) => {
    writeFileSync(taking, NEW);
    return NEW;
  };
  return { file, write };
};

describe('a retaken reference', () => {
  test('a refused take leaves the old reference’s bytes and no .taking file', async () => {
    const { file, write } = setUp('refused');
    writeFileSync(file, OLD);
    const taken = await keepTaken(
      file,
      write,
      () => 'refused: a development overlay is in the tree',
    );
    expect(taken).toEqual({
      _tag: 'Refused',
      reason: 'refused: a development overlay is in the tree',
    });
    expect(new Uint8Array(readFileSync(file))).toEqual(OLD);
    expect(existsSync(file.replace(/\.png$/, '.taking.png'))).toBe(false);
  });

  test('a take that never holds still is refused as moving and keeps the old one', async () => {
    const { file } = setUp('moving');
    writeFileSync(file, OLD);
    const taken = await keepTaken(
      file,
      async (taking) => {
        writeFileSync(taking, NEW);
        return undefined;
      },
      () => undefined,
    );
    expect(taken._tag).toBe('Refused');
    expect(new Uint8Array(readFileSync(file))).toEqual(OLD);
    expect(existsSync(file.replace(/\.png$/, '.taking.png'))).toBe(false);
  });

  test('a take that passes replaces the reference, written beside it first', async () => {
    const { file, write } = setUp('kept');
    let besideAt = '';
    const taken = await keepTaken(
      file,
      async (taking) => {
        besideAt = taking;
        return write(taking);
      },
      () => undefined,
    );
    expect(besideAt).toBe(file.replace(/\.png$/, '.taking.png'));
    expect(taken).toEqual({ _tag: 'Kept', shot: NEW });
    expect(new Uint8Array(readFileSync(file))).toEqual(NEW);
    expect(existsSync(besideAt)).toBe(false);
  });
});
