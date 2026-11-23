/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise -- the test writes the build's timing files into a scratch folder and reads them back as the apps do, the iOS file's bytes and the web's module by import (a Promise), a timeline that does not decode compared as null; a Bun test in an Exact app's folder imports no effect (docs/exact.md). */

/**
 * The files the build writes for each hymn's words' times
 * (`tools/timing.ts` through `writeTimingFiles`), read back as each app
 * reads them: the iOS app's `timing/<n>` as bytes, the web's
 * `modules/web/timing/<n>.js` by import, as the page module does (every
 * 23rd hymn imported, each held to the module text that import read, a
 * string as JSON writes it, so the test stays within its second). For every
 * hymn of the current app's timing (`vite/timing.ts`, read at run time),
 * each decodes by the current app's own `timelineOf` to exactly the
 * timeline its string decodes to, words and syllables kept, and a hymn the
 * current app has no syllables for decodes as its does; the hymns with
 * syllables are as many as the current app's; and a second write of an
 * unchanged book writes nothing.
 */

import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timelineOf } from '@manna/hymnal-app/follow/timeline';
import { readTiming } from '@manna/hymnal-app/vite/timing';

import { linesOnly } from './files.ts';
import { writeTimingFiles } from './write.ts';

const rows = readTiming();
const root = mkdtempSync(join(tmpdir(), 'hymnal-timing-'));
const wrote = writeTimingFiles(root, rows);

/** A timeline as data, for an exact comparison: none as `null`. */
const decoded = (text: string) => {
  const timeline = timelineOf(text);
  return timeline._tag === 'Some' ? timeline.value : null;
};

/** The current app's timeline of each hymn, decoded once. */
const theirs = new Map(rows.map(([number, encoded]) => [number, decoded(encoded)]));

/** The timeline the iOS app decodes from each hymn's shipped file. */
const shippedOf = () =>
  new Map(
    rows.map(([number]) => [number, decoded(readFileSync(join(root, `timing/${number}`), 'utf8'))]),
  );

const syllabled = (timeline: ReturnType<typeof decoded> | undefined) =>
  timeline?.lines.some((line) => line.syllables.length > 0) === true;

describe('the words’ times the build ships, one file a hymn', () => {
  it('writes the iOS file of every hymn, decoding to the current app’s timeline', () => {
    expect(rows.length).toBeGreaterThan(600);
    expect(wrote).toBe(rows.length * 2);
    expect(JSON.stringify([...shippedOf()])).toBe(JSON.stringify([...theirs]));
  });

  it('writes the web module of every hymn, a string by JSON’s own writing, whose import decodes to the current app’s timeline', async () => {
    for (const [number, encoded] of rows)
      expect(readFileSync(join(root, `modules/web/timing/${number}.js`), 'utf8')).toBe(
        `export default ${JSON.stringify(encoded)};\n`,
      );
    const files = await Promise.all(
      rows
        .filter((_, k) => k % 23 === 0)
        .map(async ([number]) => {
          const module = (await import(join(root, `modules/web/timing/${number}.js`))) as {
            readonly default: string;
          };
          return [number, decoded(module.default), theirs.get(number)] as const;
        }),
    );
    expect(files.length).toBeGreaterThan(25);
    expect(JSON.stringify(files.map(([number, shipped]) => [number, shipped]))).toBe(
      JSON.stringify(files.map(([number, , timeline]) => [number, timeline])),
    );
  });

  it('ships syllables for as many hymns as the current app, and lines alone for the rest', () => {
    const shipped = shippedOf();
    const timed = (map: ReadonlyMap<number, ReturnType<typeof decoded>>) =>
      [...map].filter(([, timeline]) => syllabled(timeline)).map(([number]) => number);
    expect(timed(shipped)).toEqual(timed(theirs));
    expect(timed(theirs).length).toBeLessThan(rows.length);
    for (const [number, encoded] of rows.filter(([number]) => !syllabled(theirs.get(number))))
      expect(readFileSync(join(root, `timing/${number}`), 'utf8')).toBe(linesOnly(encoded));
  });

  it('writes nothing again for an unchanged book (and the scratch folder goes)', () => {
    const again = writeTimingFiles(root, rows);
    rmSync(root, { recursive: true, force: true });
    expect(again).toBe(0);
  });
});
