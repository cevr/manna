/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise -- child-process host regression uses Bun streams and joins process exit with pipe drainage; no live app or audio. */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

const root = resolve(import.meta.dir, '../../../..');
const anchor = `${root}/packages/hymnal/scripts/playback.ts`;
// Freeze the r2 domain: removing a production fingerprint input must not shrink this guard.
const inputs = [
  'packages/hymnal/data/source-text.json',
  'packages/hymnal/data/fixes/refrains.json',
  ...[
    'align',
    'chord',
    'compile',
    'harmony',
    'hymn',
    'midi',
    'placement',
    'playback',
    'score',
    'syllables',
    'timing',
  ].map((name) => `packages/hymnal/src/${name}.ts`),
  ...['sources', 'source-text', 'playback'].map((name) => `packages/hymnal/scripts/${name}.ts`),
  'packages/hymnal/package.json',
  'bun.lock',
  ...['syllable', 'cmu-pronouncing-dictionary'].map(
    (name) => new URL(import.meta.resolve(name, anchor)).pathname,
  ),
  new URL('./problematic.js', import.meta.resolve('syllable', anchor)).pathname,
];
const witness = async (path: string, suffix = '\n') => {
  const child = Bun.spawn(
    [
      'bun',
      'test',
      '--preload',
      `${import.meta.dir}/staleness-fixture.ts`,
      '--preload',
      './src/test/setup.ts',
      'src/follow/timeline.test.ts',
      'src/hymns/chords.property.test.ts',
    ],
    {
      cwd: `${root}/apps/hymnal`,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HYMNAL_STALE_INPUT: path, HYMNAL_STALE_SUFFIX: suffix },
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {
    code,
    hashes: out.match(/P3 witness hashes=([a-f0-9,]+)/)?.[1],
    counts: [...err.matchAll(/^\s*(\d+) (pass|fail)\s*$/gm)]
      .map((m) => `${m[1]}-${m[2]}`)
      .join(','),
  };
};

const baseline = await witness('');
test('playback build cache includes its numeric data and join', () => {
  const config = JSON.parse(readFileSync(`${root}/apps/hymnal/turbo.json`, 'utf8'));
  expect(config.tasks.build.inputs).toContain('$TURBO_ROOT$/packages/hymnal/data/playback/**');
  expect(config.tasks.build.inputs).toContain('$TURBO_ROOT$/packages/hymnal/scripts/playback.ts');
});

test('playback builds survive stale generation inputs: control', () => {
  expect(baseline.code).toBe(0);
  expect(baseline.hashes).toBeDefined();
  expect(baseline.counts).toBe('21-pass,0-fail');
});

const cases = [
  { id: 'fixed-lock-newline', path: 'bun.lock', suffix: '\n' },
  {
    id: 'fixed-chord-comment',
    path: 'packages/hymnal/src/chord.ts',
    suffix: '\n// numeric provenance probe\n',
  },
  ...inputs.map((path, i) => ({ id: `generated-${i + 1}`, path, suffix: '\n' })),
  ...[214, 388].map((number) => ({
    id: `midi-${number}`,
    path: `packages/hymnal/data/midi/${number}.mid`,
    suffix: '\n',
  })),
  { id: 'stale-manifest', path: 'packages/hymnal/data/playback/manifest.json', suffix: '\n' },
];
for (const row of cases)
  test(`playback builds survive stale generation inputs: ${row.id}`, async () => {
    const actual = await witness(row.path, row.suffix);
    expect(actual.code).toBe(0);
    expect(actual.hashes).toBe(baseline.hashes);
    expect(actual.counts).toBe('21-pass,0-fail');
  });
