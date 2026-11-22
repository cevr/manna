/* oxlint-disable effect/noNodeBuiltinImport, effect/noTernary, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise -- the test writes the build's timing files into a scratch folder and reads them back as the apps do, the iOS file's bytes and the web's module by import (a Promise), a timeline that does not decode compared as null; a Bun test in an Exact app's folder imports no effect (docs/exact.md). */

/**
 * The files the build writes for each hymn's words' times
 * (`tools/timing.ts` through `writeTimingFiles`), read back as each app
 * reads them: the iOS app's `timing/<n>` as bytes, the web's
 * `modules/web/timing/<n>.js` by import, as the page module does. For every
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

const syllabled = (text: string) =>
  decoded(text)?.lines.some((line) => line.syllables.length > 0) === true;

describe('the words’ times the build ships, one file a hymn', () => {
  it('writes the iOS file of every hymn, decoding to the current app’s timeline', () => {
    expect(rows.length).toBeGreaterThan(600);
    expect(wrote).toBe(rows.length * 2);
    for (const [number, encoded] of rows) {
      const shipped = readFileSync(join(root, `timing/${number}`), 'utf8');
      expect({ number, timeline: decoded(shipped) }).toEqual({
        number,
        timeline: decoded(encoded),
      });
    }
  });

  it('writes the web module of every hymn, whose import decodes to the current app’s timeline', async () => {
    const files = await Promise.all(
      rows.map(async ([number, encoded]) => {
        const module = (await import(join(root, `modules/web/timing/${number}.js`))) as {
          readonly default: string;
        };
        return [number, module.default, encoded] as const;
      }),
    );
    for (const [number, shipped, encoded] of files)
      expect({ number, timeline: decoded(shipped) }).toEqual({
        number,
        timeline: decoded(encoded),
      });
  });

  it('ships syllables for as many hymns as the current app, and lines alone for the rest', () => {
    const theirs = rows.filter(([, encoded]) => syllabled(encoded));
    const ours = rows.filter(([number]) =>
      syllabled(readFileSync(join(root, `timing/${number}`), 'utf8')),
    );
    expect(ours.map(([number]) => number)).toEqual(theirs.map(([number]) => number));
    expect(theirs.length).toBeLessThan(rows.length);
    for (const [number, encoded] of rows.filter(([, text]) => !syllabled(text)))
      expect(readFileSync(join(root, `timing/${number}`), 'utf8')).toBe(linesOnly(encoded));
  });

  it('writes nothing again for an unchanged book (and the scratch folder goes)', () => {
    const again = writeTimingFiles(root, rows);
    rmSync(root, { recursive: true, force: true });
    expect(again).toBe(0);
  });
});
