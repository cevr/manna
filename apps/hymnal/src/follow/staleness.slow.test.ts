/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise -- child-process host regression owns and releases an APFS scratch clone and joins process exit with pipe drainage; no live app or audio. */
import { dirname, resolve } from 'node:path';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, test } from 'bun:test';
import { Context, Effect, Layer, ManagedRuntime, Option } from 'effect';

const root = resolve(import.meta.dir, '../../../..');
const anchor = `${root}/packages/hymnal/scripts/playback.ts`;
// Freeze the generation fingerprint's inputs (scripts/playback.ts inputsHash).
// Removing a production input must not shrink the build-availability guard.
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
const witness = async (checkout: string, path = '', suffix = '\n') => {
  const target = Option.map(
    Option.liftPredicate(path, (p) => p.length > 0),
    (path) => {
      let relative = path;
      if (path.startsWith(root)) relative = path.slice(root.length + 1);
      const file = resolve(checkout, relative);
      const before = readFileSync(file);
      let after = Buffer.concat([before, Buffer.from(suffix)]);
      if (path.endsWith('/manifest.json'))
        after = Buffer.from(
          JSON.stringify({ ...JSON.parse(before.toString()), inputsHash: 'stale' }),
        );
      expect(after.equals(before)).toBe(false);
      writeFileSync(file, after);
      return { file, before, expected: new Bun.CryptoHasher('sha256').update(after).digest('hex') };
    },
  );
  const child = Bun.spawn(
    [
      'bun',
      'test',
      '--preload',
      `${checkout}/apps/hymnal/src/follow/staleness-fixture.ts`,
      '--preload',
      './src/test/setup.ts',
      'src/follow/timeline.test.ts',
      'src/hymns/chords.property.test.ts',
    ],
    {
      cwd: `${checkout}/apps/hymnal`,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        HYMNAL_STALE_INPUT: Option.match(target, { onNone: () => '', onSome: (t) => t.file }),
        HYMNAL_STALE_HASH: Option.match(target, { onNone: () => '', onSome: (t) => t.expected }),
      },
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  for (const { file, before } of Option.toArray(target)) writeFileSync(file, before);
  return {
    code,
    reads: out.includes('P3 real reads=4'),
    hashes: out.match(/P3 witness hashes=([a-f0-9,]+)/)?.[1],
    counts: [...err.matchAll(/^\s*(\d+) (pass|fail)\s*$/gm)]
      .map((m) => `${m[1]}-${m[2]}`)
      .join(','),
  };
};

test('playback build cache includes its numeric data and join', () => {
  const config = JSON.parse(readFileSync(`${root}/apps/hymnal/turbo.json`, 'utf8'));
  expect(config.tasks.build.inputs).toContain('$TURBO_ROOT$/packages/hymnal/data/playback/**');
  expect(config.tasks.build.inputs).toContain('$TURBO_ROOT$/packages/hymnal/scripts/playback.ts');
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
  { id: 'unlisted-config', path: 'apps/hymnal/tsconfig.json', suffix: '\n' },
];
class Scratch extends Context.Service<
  Scratch,
  {
    readonly checkout: string;
    readonly baseline: Awaited<ReturnType<typeof witness>>;
  }
>()('hymnal/staleness/Scratch') {}

/** Clone only this build's inputs. Native build output and unrelated corpora
 * are outside its fixture. Mutated installed modules are private copies too. */
const cloneInputs = (checkout: string) => {
  const copy = (relative: string) => {
    const to = resolve(checkout, relative);
    mkdirSync(dirname(to), { recursive: true });
    expect(Bun.spawnSync(['/bin/cp', '-cR', resolve(root, relative), to]).exitCode).toBe(0);
  };
  for (const relative of [
    'package.json',
    'bun.lock',
    'tsconfig.json',
    'apps/hymnal/src',
    'apps/hymnal/vite',
    'apps/hymnal/package.json',
    'apps/hymnal/tsconfig.json',
    'packages/hymnal/src',
    'packages/hymnal/scripts',
    'packages/hymnal/package.json',
    'packages/hymnal/data/sdah-1985',
    'packages/hymnal/data/playback',
    'packages/hymnal/data/midi',
    'packages/hymnal/data/source-text.json',
    'packages/hymnal/data/fixes/refrains.json',
  ])
    copy(relative);
  for (const name of ['syllable', 'cmu-pronouncing-dictionary'])
    copy(dirname(new URL(import.meta.resolve(name, anchor)).pathname).slice(root.length + 1));
  const link = (name: string, target: string) => {
    const to = resolve(checkout, 'node_modules', name);
    mkdirSync(dirname(to), { recursive: true });
    symlinkSync(target, to);
  };
  for (const name of readdirSync(`${root}/node_modules`)) {
    if (name.startsWith('.') || ['syllable', 'cmu-pronouncing-dictionary', '@manna'].includes(name))
      continue;
    link(name, `${root}/node_modules/${name}`);
  }
  for (const name of ['syllable', 'cmu-pronouncing-dictionary']) {
    const entry = new URL(import.meta.resolve(name, anchor)).pathname;
    const relative = dirname(entry).slice(root.length + 1);
    link(name, resolve(checkout, relative));
  }
  link('@manna/hymnal', `${checkout}/packages/hymnal`);
  for (const name of readdirSync(`${root}/node_modules/@manna`))
    if (name !== 'hymnal') link(`@manna/${name}`, `${root}/node_modules/@manna/${name}`);
};

const scratchLayer = Layer.effect(Scratch)(
  Effect.gen(function* () {
    const scratch = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(resolve(tmpdir(), 'hymnal-staleness-'))),
      (path) =>
        Effect.sync(() => {
          const code = Bun.spawnSync(['trash', path]).exitCode;
          if (code !== 0) process.exitCode = 1;
          console.log(`P3 scratch released=${Number(code === 0)}`);
        }),
    );
    const checkout = `${scratch}/checkout`;
    cloneInputs(checkout);
    const baseline = yield* Effect.promise(() => witness(checkout));
    expect(baseline.code).toBe(0);
    expect(baseline.hashes).toBeDefined();
    expect(baseline.counts).toBe('21-pass,0-fail');
    return { checkout, baseline };
  }),
);

// This test file runs in its own host process. Its runtime owns one scoped
// clone across the serial cases, including filtered runs and failed cases.
const runtime = ManagedRuntime.make(scratchLayer);
// Bun's test host exits directly; the exit fallback also closes filtered runs.
// The layer's release is synchronous and reports cleanup failure separately.
process.once('exit', () => Effect.runSync(runtime.disposeEffect));
for (const row of cases)
  test(`playback builds survive real stale generation inputs: ${row.id}`, () =>
    runtime.runPromise(
      Effect.gen(function* () {
        const { checkout, baseline } = yield* Scratch;
        const actual = yield* Effect.promise(() => witness(checkout, row.path, row.suffix));
        expect(actual.reads, row.id).toBe(true);
        expect(actual.code, row.id).toBe(0);
        expect(actual.hashes, row.id).toBe(baseline.hashes);
        expect(actual.counts, row.id).toBe('21-pass,0-fail');
      }),
    ));
test('stale-input scratch scope releases after its cases', () => runtime.dispose());
