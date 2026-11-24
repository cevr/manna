/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's two module sources as text. */

/**
 * The reader sends a read to the bundle only on the app's module's own
 * refusal of an op it answers none of (`UNANSWERED`, `load.ts`): both the
 * iOS module and the web's page module word that refusal so, and the web's
 * answers each shipped folder's read, so no web read meets that refusal.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UNANSWERED } from './load.ts';

const modules = join(import.meta.dir, '../../modules');
const apple = readFileSync(join(modules, 'apple/Hymnal.swift'), 'utf8');
const web = readFileSync(join(modules, 'web/index.js'), 'utf8');

describe("the app modules' refusal of an op they answer none of", () => {
  it('is the words the reader takes for it, on iOS and the web', () => {
    expect(apple).toContain('reply.fail("Hymnal answers no op \\(op)")');
    expect(web).toContain('throw new Error(`Hymnal answers no op ${op}`)');
    expect(UNANSWERED.test('Hymnal answers no op chords.read')).toBe(true);
    expect(UNANSWERED.test('the module artifact chords/9.js did not load')).toBe(false);
  });

  it("never meets a web read: the page module answers every shipped folder's read", () => {
    expect(web).toContain("['chords', 'indexes'].map((folder) => [");
    expect(web).toContain('`${folder}.read`');
    expect(apple).not.toContain('.read');
  });
});
