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
