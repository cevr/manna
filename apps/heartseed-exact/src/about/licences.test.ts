/* oxlint-disable effect/noAsyncFunction -- Exact's app folder cannot import effect (docs/exact.md): the test imports the written module with a dynamic import. */

/**
 * The licences About ships are the current Heartseed's (spec A5): the
 * module `tools/licences.ts` writes, which `app.ts` imports, holds what
 * `apps/heartseed/vite/licence.ts` derives, byte for byte, and nothing
 * else; and each is named by its own first lines.
 */

import { expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { readLicence } from '@manna/heartseed/licence';

import { LICENCES_FILE, writeLicences } from '../../tools/licences';
import { aboutSources, licenceName } from './sources';

it("ships the current Heartseed's licence text, byte for byte", async () => {
  const written = writeLicences();
  expect(written).toEqual([readLicence()]);
  const shipped: { readonly default: unknown } = await import(LICENCES_FILE);
  expect(shipped.default).toEqual(written);
});

it('names each licence by its first lines', () => {
  expect(licenceName(readLicence())).toBe('Apache License, Version 2.0');
  expect([
    licenceName(''),
    licenceName('\n  MIT License \n'),
    licenceName('A\n\n B, c\nd'),
    licenceName('A\n, b'),
  ]).toEqual(['', 'MIT License', 'A, B', 'A']);
});

it('answers every licence, numbered, inside the data host', () => {
  const apache = 'Apache License\nVersion 2.0, January 2004\n…';
  const mit = 'MIT License\n…';
  expect(withDataHost(() => aboutSources([apache, mit]).aboutLicencesOf())).toEqual({
    licences: [
      { index: 0, name: 'Apache License, Version 2.0', text: apache },
      { index: 1, name: 'MIT License, …', text: mit },
    ],
  });
});
