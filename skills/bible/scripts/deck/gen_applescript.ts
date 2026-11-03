/**
 * Write <deckDir>/build-deck.applescript from the manifest: a fresh build of
 * the whole deck (keynote.ts). `sync_deck.ts` runs it for a deck with no
 * `.key` yet and edits an existing deck in place; use this alone to read the
 * script.
 *
 *   bun skills/bible/scripts/deck/gen_applescript.ts <deckDir>
 */
import { resolve } from 'node:path';
import { buildScript } from './keynote.ts';
import { readManifest } from './manifest.ts';

const [deckArg] = Bun.argv.slice(2);
if (deckArg === undefined) throw new Error('usage: gen_applescript.ts <deckDir>');
const deckDir = resolve(deckArg);
const manifest = await readManifest(deckDir);

await Bun.write(
  resolve(deckDir, 'build-deck.applescript'),
  buildScript(manifest, deckDir, resolve(deckDir, `${manifest.deckName}.key`)),
);
console.log(`Wrote build-deck.applescript for ${1 + manifest.slides.length * 2} slides`);
