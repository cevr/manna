import { Effect, Schema } from 'effect';
import { mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Hymn } from '../src/hymn.js';
import { secondsAt } from '../src/timing.js';

const usage = [
  'usage: bun run sync-check --same-as <rev>',
  '       bun run sync-check --set <set> (--all | <hymn>...) [--out <file>] [--jobs <n>] [--within <ms>]',
].join('\n');

const ROOT = path.resolve(import.meta.dir, '../../..');
const DATA = 'packages/hymnal/data/sdah-1985';
const FIRST = 1;
const LAST = 695;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  args.splice(at, 2);
  return value;
};
const has = (name: string) => {
  const at = args.indexOf(name);
  if (at >= 0) args.splice(at, 1);
  return at >= 0;
};

const pad = (n: number) => String(n).padStart(3, '0');
const isHymnFile = (name: string) => /^\d{3}\.json$/.test(name);

const decodeHymn = Schema.decodeEffect(Schema.fromJsonString(Hymn));

const blobsAt = async (rev: string, files: ReadonlyArray<string>) => {
  const git = Bun.spawn(['git', '-C', ROOT, 'cat-file', '--batch'], {
    stdin: 'pipe',
    stdout: 'pipe',
  });
  void git.stdin.write(files.map((file) => `${rev}:${DATA}/${file}\n`).join(''));
  void git.stdin.end();
  const out = Buffer.from(await new Response(git.stdout).arrayBuffer());
  await git.exited;
  const blobs = new Map<string, string>();
  let at = 0;
  for (const file of files) {
    const eol = out.indexOf(0x0a, at);
    const header = out.subarray(at, eol).toString('utf8');
    at = eol + 1;
    if (header.endsWith(' missing')) continue;
    const size = Number(header.split(' ')[2]);
    blobs.set(file, out.subarray(at, at + size).toString('utf8'));
    at += size + 1;
  }
  return blobs;
};

const sameAs = (rev: string) =>
  Effect.gen(function* () {
    const dir = path.join(ROOT, DATA);
    const files = (yield* Effect.promise(() => readdir(dir))).filter(isHymnFile).sort();
    const listed = yield* Effect.promise(async () => {
      const ls = Bun.spawn(['git', '-C', ROOT, 'ls-tree', '--name-only', rev, `${DATA}/`], {
        stdout: 'pipe',
      });
      const text = await new Response(ls.stdout).text();
      await ls.exited;
      return text
        .split('\n')
        .map((line) => path.basename(line))
        .filter(isHymnFile);
    });
    const both = new Set(files);
    const missing = [
      ...files.filter((file) => !listed.includes(file)).map((file) => `${file} absent at ${rev}`),
      ...listed.filter((file) => !both.has(file)).map((file) => `${file} absent now`),
    ];
    const blobs = yield* Effect.promise(() => blobsAt(rev, files));
    let differ = 0;
    for (const file of files) {
      const before = blobs.get(file);
      if (before === undefined) continue;
      const now = JSON.parse(yield* Effect.promise(() => Bun.file(path.join(dir, file)).text()));
      delete now.timing;
      if (JSON.stringify(now) !== JSON.stringify(JSON.parse(before))) {
        differ += 1;
        console.log(`differ ${file}: more than its timing changed since ${rev}`);
      }
    }
    for (const line of missing) console.log(`missing ${line}`);
    console.log(`same-as ${rev}: files=${files.length} differ=${differ} missing=${missing.length}`);
    if (differ > 0 || missing.length > 0) process.exitCode = 1;
  });

const RATE = 22050;
const WIN = 1024;
const HOP = 128;
const HOP_S = HOP / RATE;
const MAX_LAG_S = 0.2;

const v = (array: ArrayLike<number>, i: number) => array[i] ?? 0;

const fft = (re: Float64Array, im: Float64Array) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [v(re, j), v(re, i)];
      [im[i], im[j]] = [v(im, j), v(im, i)];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = v(re, b) * cr - v(im, b) * ci;
        const ti = v(re, b) * ci + v(im, b) * cr;
        re[b] = v(re, a) - tr;
        im[b] = v(im, a) - ti;
        re[a] = v(re, a) + tr;
        im[a] = v(im, a) + ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
};

const onsetEnvelope = (pcm: Float32Array): Float64Array => {
  const frames = Math.max(0, Math.floor((pcm.length - WIN) / HOP) + 1);
  const hann = new Float64Array(WIN).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WIN));
  const low = Math.round((80 * WIN) / RATE);
  let previous = new Float64Array(WIN / 2);
  const flux = new Float64Array(frames);
  const re = new Float64Array(WIN);
  const im = new Float64Array(WIN);
  for (let f = 0; f < frames; f++) {
    im.fill(0);
    for (let i = 0; i < WIN; i++) re[i] = v(pcm, f * HOP + i) * v(hann, i);
    fft(re, im);
    const magnitude = new Float64Array(WIN / 2);
    let sum = 0;
    for (let k = low; k < WIN / 2; k++) {
      magnitude[k] = Math.log1p(1000 * Math.hypot(v(re, k), v(im, k)));
      const rise = v(magnitude, k) - v(previous, k);
      if (rise > 0) sum += rise;
    }
    flux[f] = sum;
    previous = magnitude;
  }
  const half = Math.round(0.05 / HOP_S);
  const out = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    let count = 0;
    for (let g = Math.max(0, f - half); g <= Math.min(frames - 1, f + half); g++) {
      sum += v(flux, g);
      count++;
    }
    out[f] = Math.max(0, v(flux, f) - sum / count);
  }
  return out;
};

const lagOf = (envelope: Float64Array, onsets: ReadonlyArray<number>) => {
  const reach = Math.round(MAX_LAG_S / HOP_S);
  const scoreAt = (shift: number) => {
    let sum = 0;
    for (const t of onsets) {
      const f = Math.round((t - WIN / 2 / RATE) / HOP_S) + shift;
      let peak = 0;
      for (let g = f - 1; g <= f + 1; g++)
        if (g >= 0 && g < envelope.length) peak = Math.max(peak, v(envelope, g));
      sum += peak;
    }
    return sum;
  };
  let best = 0;
  let bestScore = -1;
  for (let shift = -reach; shift <= reach; shift++) {
    const score = scoreAt(shift);
    if (score > bestScore) {
      bestScore = score;
      best = shift;
    }
  }
  return Math.round(best * HOP_S * 1000);
};

const cacheDir = process.env['SYNC_CHECK_CACHE'] ?? path.join(os.tmpdir(), 'manna-sync-check');

const recording = (set: string, n: number) =>
  Effect.tryPromise({
    try: async () => {
      const dir = path.join(cacheDir, set);
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${n}.mp3`);
      if (await Bun.file(file).exists()) return file;
      const res = await fetch(`https://hymns.cvr.im/audio/${set}/sdah/${n}.mp3`);
      if (!res.ok || res.headers.get('content-type') !== 'audio/mpeg')
        throw new Error(`HTTP ${res.status} ${res.headers.get('content-type') ?? ''}`.trim());
      await Bun.write(file, await res.arrayBuffer());
      return file;
    },
    catch: (cause) => `fetch ${set}/${n}: ${cause instanceof Error ? cause.message : cause}`,
  });

const samples = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      const ffmpeg = Bun.spawn(
        ['ffmpeg', '-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const bytes = await new Response(ffmpeg.stdout).arrayBuffer();
      if ((await ffmpeg.exited) !== 0) throw new Error(await new Response(ffmpeg.stderr).text());
      return new Float32Array(bytes, 0, Math.floor(bytes.byteLength / 4));
    },
    catch: (cause) => `ffmpeg ${file}: ${cause instanceof Error ? cause.message : cause}`,
  });

interface Measured {
  readonly hymn: number;
  readonly error?: string;
  readonly skipped: number;
  readonly lines: ReadonlyArray<{
    readonly line: number;
    readonly startS: number;
    readonly lagMs: number;
  }>;
}

const absStats = (lags: ReadonlyArray<number>) => {
  const sorted = lags.map(Math.abs).sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  return { median: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
};

const measure = (set: string, n: number, shiftS: number) =>
  Effect.gen(function* () {
    const text = yield* Effect.promise(() =>
      Bun.file(path.join(ROOT, DATA, `${pad(n)}.json`)).text(),
    );
    const hymn = yield* decodeHymn(text).pipe(Effect.mapError((e) => `decode ${n}: ${e.message}`));
    const timing = hymn.timing;
    if (timing === undefined) return yield* Effect.fail(`hymn ${n} has no timing`);
    const envelope = onsetEnvelope(yield* samples(yield* recording(set, n)));
    const seconds = secondsAt(timing);
    let skipped = 0;
    const lines: Array<Measured['lines'][number]> = [];
    timing.lines.forEach((line, i) => {
      if (!line.played || line.even || line.syllables.length === 0) {
        skipped += 1;
        return;
      }
      const onsets = [...new Set(line.syllables)].map((time) => seconds(time) + shiftS);
      lines.push({ line: i, startS: +v(onsets, 0).toFixed(3), lagMs: lagOf(envelope, onsets) });
    });
    const measured: Measured = { hymn: n, skipped, lines };
    return measured;
  }).pipe(
    Effect.catch((error: string) =>
      Effect.succeed<Measured>({ hymn: n, error, skipped: 0, lines: [] }),
    ),
  );

const checkSet = (
  set: string,
  hymns: ReadonlyArray<number>,
  options: { out: string | undefined; jobs: number; within: number },
) =>
  Effect.gen(function* () {
    const shiftMs = Number(process.env['SHIFT_MS'] ?? 0);
    const results = yield* Effect.forEach(
      hymns,
      (n) =>
        measure(set, n, shiftMs / 1000).pipe(
          Effect.tap((r) =>
            Effect.sync(() => {
              if (r.error !== undefined) return console.log(`sync ${set} ${n}: failed ${r.error}`);
              const s = absStats(r.lines.map((l) => l.lagMs));
              const over = r.lines.filter((l) => Math.abs(l.lagMs) > options.within).length;
              console.log(
                `sync ${set} ${n}: lines=${r.lines.length} skipped=${r.skipped} median=${s.median} p95=${s.p95} max=${s.max} over=${over}`,
              );
            }),
          ),
        ),
      { concurrency: options.jobs },
    );
    const lags = results.flatMap((r) => r.lines.map((l) => l.lagMs));
    const s = absStats(lags);
    const over = lags.filter((lag) => Math.abs(lag) > options.within).length;
    const failed = results.filter((r) => r.error !== undefined).length;
    const skipped = results.reduce((sum, r) => sum + r.skipped, 0);
    const summary = {
      set,
      shiftMs,
      within: options.within,
      hymns: results.length,
      lines: lags.length,
      skipped,
      median: s.median,
      p95: s.p95,
      max: s.max,
      over,
      failed,
    };
    if (options.out !== undefined) {
      const out = options.out;
      yield* Effect.promise(() =>
        Bun.write(out, JSON.stringify({ summary, hymns: results }, null, 1)),
      );
    }
    console.log(
      `sync ${set}: hymns=${results.length} lines=${lags.length} skipped=${skipped} median=${s.median} p95=${s.p95} max=${s.max} over=${over} within=${options.within} failed=${failed}`,
    );
    if (over > 0 || failed > 0 || lags.length === 0) process.exitCode = 1;
  });

const rev = flag('--same-as');
const set = flag('--set');
const out = flag('--out');
const jobs = Number(flag('--jobs') ?? 4);
const within = Number(flag('--within') ?? 75);
const all = has('--all');
const hymns = all
  ? Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i)
  : args.map(Number);

if (rev !== undefined && set === undefined && args.length === 0) {
  await Effect.runPromise(sameAs(rev));
} else if (
  set !== undefined &&
  rev === undefined &&
  hymns.length > 0 &&
  (!all || args.length === 0) &&
  hymns.every((n) => Number.isInteger(n) && n >= FIRST && n <= LAST) &&
  Number.isInteger(jobs) &&
  jobs > 0 &&
  within > 0
) {
  await Effect.runPromise(
    checkSet(set, hymns, { out: out === undefined ? undefined : path.resolve(out), jobs, within }),
  );
} else {
  console.error(usage);
  process.exit(2);
}
