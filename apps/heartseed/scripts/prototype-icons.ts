/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- PROTOTYPE, run by hand on macOS: rasterizes assets/prototype's SVGs to 144 px PNGs (48 pt @3x) with qlmanage, which draws an SVG at half its size, so each is sized 288 for the render */
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = join(import.meta.dir, '..', 'assets', 'prototype');
const work = mkdtempSync(join(tmpdir(), 'hs-icons-'));
const names = readdirSync(dir).filter((name) => name.endsWith('.svg'));
for (const name of names) {
  const svg = readFileSync(join(dir, name), 'utf8').replace(
    'width="48" height="48"',
    'width="288" height="288"',
  );
  writeFileSync(join(work, name), svg);
}
const run = Bun.spawnSync([
  'qlmanage',
  '-t',
  '-s',
  '144',
  '-o',
  work,
  ...names.map((name) => join(work, name)),
]);
console.log(run.stdout.toString().trim().split('\n').at(-1));
for (const name of names) {
  copyFileSync(join(work, `${name}.png`), join(dir, name.replace('.svg', '.png')));
}
console.log(`rasterized ${names.length} icons into ${dir}`);
