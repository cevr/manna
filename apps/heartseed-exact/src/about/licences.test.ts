/* oxlint-disable effect/noAsyncFunction -- Exact's app folder cannot import effect (docs/exact.md): the test imports the written module with a dynamic import. */

/**
 * The licences About ships are the current Heartseed's (spec A5): the
 * module `tools/licences.ts` writes, which `app.ts` imports, holds what
 * `apps/heartseed/vite/licence.ts` derives, byte for byte, first, then the
 * seven bundled reading fonts' (held by `src/type/fonts.test.ts`), then the
 * study packs' two credits, ten in all; and the version About shows is the
 * current Heartseed's `package.json`'s. The page draws each text whole with
 * no heading over it, as the current app draws its one licence, so each
 * text names itself in its own first lines.
 */

import { expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { readLicence } from '@manna/heartseed/licence';

import { heartseedVersion, LICENCES_FILE, writeLicences } from '../../tools/licences';
import { aboutSources, versionLine } from './sources';

it("ships the current Heartseed's licence text, byte for byte, and its version", async () => {
  const written = writeLicences();
  expect([written.length, written[0]]).toEqual([10, readLicence()]);
  const shipped: { readonly default: unknown; readonly version: unknown } = await import(
    LICENCES_FILE
  );
  expect([shipped.default, shipped.version]).toEqual([written, heartseedVersion()]);
  expect(heartseedVersion()).toMatch(/^\d+\.\d+\.\d+/);
});

it('names each licence in its own first lines, as the page shows it with no heading', () => {
  const heads = writeLicences().map((text) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .slice(0, 2)
      .join(' / '),
  );
  expect([heads[0], ...heads.slice(8)]).toEqual([
    'Apache License / Version 2.0, January 2004',
    'Cross-references / from OpenBible.info, Creative Commons Attribution License',
    "Hebrew and Greek words and Strong's dictionary / from Open Scriptures, Creative Commons Attribution-ShareAlike",
  ]);
  expect(
    heads.slice(1, 8).every((head) => head.endsWith(' / SIL Open Font License, Version 1.1')),
  ).toBe(true);
});

it("writes About's version line as the current Heartseed does", () => {
  expect(versionLine('0.1.0')).toBe('Version 0.1.0');
});

it('answers the version line and every licence, numbered, inside the data host', () => {
  const apache = 'Apache License\nVersion 2.0, January 2004\n…';
  const mit = 'MIT License\n…';
  expect(withDataHost(() => aboutSources([apache, mit], '0.1.0').aboutOf())).toEqual({
    version: 'Version 0.1.0',
    licences: [
      { index: 0, text: apache },
      { index: 1, text: mit },
    ],
  });
});
