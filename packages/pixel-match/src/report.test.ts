/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- the report is a JSON file the harness writes into a scratch checkout of the host's temporary directory, read back as JSON as the harness reads its own files. */
import { describe, expect, test } from 'bun:test';

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { shotFiles } from './paths.ts';
import { writeReport } from './report.ts';

const AX5 = 'accessibility-extra-extra-extra-large';

describe("a report's departures", () => {
  test("lists each of the unit's departing cells with its reason, and prints its score beside it", () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-report-'));
    const frame = { root, refs: join(root, 'ref'), one: 'aaaaaaaaaaaa', head: 'head' };
    const shot = shotFiles(root, {
      app: 'heartseed',
      host: 'ios',
      id: 'today.new',
      scheme: 'light',
      size: AX5,
    }).result;
    mkdirSync(dirname(shot), { recursive: true });
    writeFileSync(
      shot,
      JSON.stringify({
        channel: 16,
        total: 100,
        masked: 0,
        scored: 100,
        differing: 40,
        largest: 30,
      }),
    );

    const written = writeReport(frame, 'pm-hs-today');
    const report = JSON.parse(readFileSync(written.file, 'utf8')) as {
      departures: Record<string, string>;
      results: ReadonlyArray<{ cell: string }>;
    };

    expect(Object.keys(report.departures).toSorted()).toEqual(
      ['today.letters', 'today.new', 'today.result'].map(
        (id) => `heartseed/ios/${id}/light/${AX5}`,
      ),
    );
    expect(report.results.map((result) => result.cell)).toEqual([
      `heartseed/ios/today.new/light/${AX5}`,
    ]);
    expect(written.departures.toSorted()).toEqual([
      expect.stringMatching(
        /^departs heartseed\/ios\/today\.letters\/light\/\S+: not shot yet · q160: /u,
      ),
      expect.stringMatching(
        /^departs heartseed\/ios\/today\.new\/light\/\S+: 40 of 100 differ at channel 16, largest region 30 · q160: /u,
      ),
      expect.stringMatching(
        /^departs heartseed\/ios\/today\.result\/light\/\S+: not shot yet · q160: /u,
      ),
    ]);
  });
});
