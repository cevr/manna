import { encodePng, loudness, sheetOf } from '@manna/film/measure';
import { Effect, FileSystem, Path, Schema } from 'effect';
import * as Midi from '../../src/midi.js';
import { recordingKey } from '../../src/recordings.js';
import { ManifestJson, type RecordingManifest } from '../../src/recording-manifest.js';
import * as Sung from '../../src/sung.js';
import { voices } from '../../src/voices.js';
import { type AudioSetup, mixAndMaster, readMidi, sampleStems, stemJobs } from './audio.js';
import { checksOf, firstSound, LIMITS, longestQuiet, passed, samplePeak } from './checks.js';
import { RenderFailed, runOk } from './proc.js';
import {
  expectedOf,
  type HymnRecord,
  HymnRecordJson,
  measuredOf,
  RecordObjectJson,
  sameVerdicts,
} from './record.js';
import { hashOf, keyOf, keysOf, resumeOf } from './resume.js';
import { sha256Hex } from './sfizz.js';
import { keyedStyle, moveText } from './keys.js';
import type { Style } from './style.js';

export interface Setup extends AudioSetup {
  readonly transpose: number;
  readonly load: number;
  readonly set: string;
  readonly out: string;
  readonly work: string;
  readonly sfizzSha256: string;
  readonly nodeAv: string;
  readonly configHash: string;
}

export const AUDIO_SOURCES = [
  'packages/film/src/core/dsp.ts',
  'packages/film/src/core/synth/loudness.ts',
  'packages/hymnal/scripts/render/audio.ts',
  'packages/hymnal/scripts/render/master.ts',
  'packages/hymnal/scripts/render/mix.ts',
  'packages/hymnal/scripts/render/plan.ts',
  'packages/hymnal/scripts/render/proc.ts',
  'packages/hymnal/scripts/render/random.ts',
  'packages/hymnal/scripts/render/room-C.wav',
  'packages/hymnal/scripts/render/sfizz.ts',
  'packages/hymnal/scripts/render/stems.ts',
  'packages/hymnal/scripts/render/style.ts',
  'packages/hymnal/scripts/render/wav.ts',
  'packages/hymnal/src/melody.ts',
  'packages/hymnal/src/midi.ts',
  'packages/hymnal/src/voices.ts',
] as const;

const KEYS_SOURCE = 'packages/hymnal/scripts/render/keys.ts';

export const configOf = (
  style: Style,
  tools: {
    readonly lock: string;
    readonly sfizzSha256: string;
    readonly nodeAv: string;
    readonly comment: string;
  },
  transpose = 0,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(import.meta.dir, '../../../..');
    const sources: Array<readonly [string, string]> = [];
    for (const file of [...AUDIO_SOURCES, ...(transpose === 0 ? [] : [KEYS_SOURCE])])
      sources.push([file, sha256Hex(yield* fs.readFile(path.join(root, file)))]);
    return hashOf([
      ['style', JSON.stringify(style)],
      ...(transpose === 0 ? [] : [['transpose', String(transpose)] as const]),
      ['lock', tools.lock],
      ['sfizz', tools.sfizzSha256],
      ['node-av', tools.nodeAv],
      ['comment', tools.comment],
      ...sources,
    ]);
  });

const machine = Effect.gen(function* () {
  const swap = (yield* runOk('sysctl', 'sysctl', ['-n', 'vm.swapusage'])).stdout;
  const load = (yield* runOk('sysctl', 'sysctl', ['-n', 'vm.loadavg'])).stdout;
  const used = /used = ([\d.]+)M/.exec(swap);
  const one = /\{\s*([\d.]+)/.exec(load);
  return {
    swap: Number(used?.[1] ?? 0) * 2 ** 20,
    load: Number(one?.[1] ?? 0),
  };
});

const freeBytes = (dir: string) =>
  Effect.map(runOk('df', 'df', ['-k', dir]), (out) => {
    const row = out.stdout.trim().split('\n').at(-1) ?? '';
    return Number(row.split(/\s+/)[3] ?? 0) * 1024;
  });

export const GUARDS = {
  swap: 8 * 2 ** 30,
  load: 12,
  disk: 3 * 2 ** 30,
  poll: '20 seconds',
} as const;

export const guard = (out: string, load: number) =>
  Effect.gen(function* () {
    if ((yield* freeBytes(out)) < GUARDS.disk)
      return yield* RenderFailed.make({
        step: 'disk',
        reason: `under ${GUARDS.disk / 2 ** 30} GB free where ${out} is`,
      });
    const started = performance.now();
    let said = false;
    for (;;) {
      const now = yield* machine;
      if (now.swap <= GUARDS.swap && now.load <= load) break;
      if (!said)
        yield* Effect.sync(() =>
          console.log(
            `  waiting: swap ${(now.swap / 2 ** 30).toFixed(2)} GB (ceiling ${GUARDS.swap / 2 ** 30}), load ${now.load.toFixed(1)} (ceiling ${load})`,
          ),
        );
      said = true;
      yield* Effect.sleep(GUARDS.poll);
    }
    return (performance.now() - started) / 1000;
  });

const sampledRss = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const peak = { rss: process.memoryUsage().rss };
      const timer = setInterval(() => {
        peak.rss = Math.max(peak.rss, process.memoryUsage().rss);
      }, 250);
      return { peak, timer };
    }),
    ({ peak }) =>
      Effect.map(self, (value) => ({
        value,
        rss: Math.max(peak.rss, process.memoryUsage().rss),
      })),
    ({ timer }) => Effect.sync(() => clearInterval(timer)),
  );

const padded = (hymn: number) => String(hymn).padStart(3, '0');

const md5Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('md5');
  hasher.update(bytes);
  return hasher.digest('hex');
};

const utf8 = (text: string) => new TextEncoder().encode(text);

const writeAtomic = (file: string, bytes: Uint8Array) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFile(`${file}.part`, bytes);
    yield* fs.rename(`${file}.part`, file);
  });

const recordText = <A>(value: A) => utf8(`${JSON.stringify(value, null, 2)}\n`);

export const readRecord = (out: string, hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(out, `${hymn}.json`);
    if (!(yield* fs.exists(file))) return undefined;
    const text = yield* fs.readFileString(file);
    return yield* Effect.all({
      typed: Schema.decodeEffect(HymnRecordJson)(text),
      whole: Schema.decodeEffect(RecordObjectJson)(text),
    }).pipe(Effect.orElseSucceed(() => undefined));
  });

const StanzasJson = Schema.fromJsonString(
  Schema.Struct({ verses: Schema.Struct({ text: Schema.Int }) }),
);

const loopedSha256 = (bytes: Uint8Array, loop: Sung.Loop, sung: Uint8Array) =>
  new Bun.CryptoHasher('sha256')
    .update(bytes)
    .update(`\0sung start=${loop.start} length=${loop.length} passes=${loop.passes}\0`)
    .update(sung)
    .digest('hex');

export const sourceOf = (style: Style, hymn: number, transpose = 0) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const data = path.resolve(import.meta.dir, '../../data');
    const bytes = yield* fs.readFile(path.join(data, 'midi', `${padded(hymn)}.mid`));
    const { verses } = yield* Schema.decodeEffect(StanzasJson)(
      yield* fs.readFileString(path.join(data, 'sdah-1985', `${padded(hymn)}.json`)),
    ).pipe(Effect.mapError((e) => RenderFailed.make({ step: `hymn ${hymn}`, reason: e.message })));
    const sung = Sung.of(yield* readMidi(bytes, hymn), verses.text);
    const midi = sung.midi;
    const keyed = keyedStyle(style, voices(midi), transpose);
    return {
      midi,
      sha256:
        sung.loop === undefined
          ? sha256Hex(bytes)
          : loopedSha256(
              bytes,
              sung.loop,
              yield* fs.readFile(path.resolve(import.meta.dir, '../../src/sung.ts')),
            ),
      style: keyed.style,
      moves: keyed.moves,
      expected: expectedOf(midi, keyed.style, hymn),
    };
  });

type Source = Effect.Success<ReturnType<typeof sourceOf>>;

export const standingOf = (setup: Setup, hymn: number, source: Source, uploaded = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const mp3File = path.join(setup.out, `${hymn}.mp3`);
    const record = yield* readRecord(setup.out, hymn);
    const mp3Sha = (yield* fs.exists(mp3File))
      ? sha256Hex(yield* fs.readFile(mp3File))
      : uploaded
        ? record?.typed.sha256
        : undefined;
    if (
      record === undefined ||
      resumeOf(record.typed, keysOf(setup.configHash, source.sha256), mp3Sha) === 'render'
    )
      return { kind: 'render' } as const;
    const checks = checksOf(
      measuredOf(record.typed, source.expected, setup.style.master.targetLufs),
    );
    return { kind: passed(checks) ? 'stands' : 'fails', ...record, checks } as const;
  });

export interface Outcome {
  readonly hymn: number;
  readonly status: 'kept' | 'passed' | 'failed';
  readonly line: string;
}

const dropSheet = (out: string, hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sheet = path.join(out, `${hymn}.png`);
    if (yield* fs.exists(sheet)) yield* fs.remove(sheet);
  });

export const renderHymn = (setup: Setup, hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = yield* sourceOf(setup.style, hymn, setup.transpose);
    const { style } = source;
    const standing = yield* standingOf(setup, hymn, source);
    if (standing.kind === 'stands') {
      if (standing.typed.passed && sameVerdicts(standing.typed.checks, standing.checks))
        return { hymn, status: 'kept', line: `${hymn} kept` } satisfies Outcome;
      yield* writeAtomic(
        path.join(setup.out, `${hymn}.json`),
        recordText({ ...standing.whole, passed: true, checks: standing.checks }),
      );
      yield* dropSheet(setup.out, hymn);
      return {
        hymn,
        status: 'kept',
        line: `${hymn} kept: checked again, passed`,
      } satisfies Outcome;
    }

    const waited = yield* guard(setup.out, setup.load);
    const started = performance.now();
    const { midi, expected } = source;
    const parts = voices(midi);
    const at = Midi.secondsAt(midi);
    const midiSeconds = Midi.secondsOf(midi);
    const mp3File = path.join(setup.out, `${hymn}.mp3`);
    const work = path.join(setup.work, String(hymn));

    const keyed = { ...setup, style };
    const jobs = yield* stemJobs(keyed, hymn, midi, work);
    const sampledStart = performance.now();
    const { piano: pianoRuns, strings: stringRuns } = yield* sampleStems(keyed, jobs);
    const samplerSeconds = (performance.now() - sampledStart) / 1000;
    const mixed = yield* sampledRss(mixAndMaster(keyed, jobs, midi, work, `${mp3File}.part`));
    const { mastered, mixSeconds, masterSeconds } = mixed.value;
    const stemRows = mixed.value.stemRows.map((s) => ({
      ...s,
      needed: expected.stems[s.name] ?? 0,
    }));
    const decoded = mastered.pcm;

    const allNotes = [...parts.S, ...parts.A, ...parts.T, ...parts.B];
    const firstNote = Math.min(...allNotes.map((n) => at(n.start)));
    const sound = firstSound(decoded, LIMITS.onsetDb);
    const lagMs = sound === undefined ? 99_999 : Math.round((sound - firstNote) * 1e4) / 10;
    const sounding = allNotes.map((n) => ({ from: at(n.start), to: at(n.end) }));
    const filmLufs = loudness(decoded).integrated;
    const rss = {
      piano: Math.max(0, ...pianoRuns.map((r) => r.rss)),
      sampler: Math.max(0, ...stringRuns.map((r) => r.rss)),
      render: mixed.rss,
    };
    const checks = checksOf({
      seconds: decoded.frames / style.rate,
      expectedSeconds: expected.seconds,
      truePeak: mastered.truePeak,
      lufs: filmLufs,
      ebur128Lufs: mastered.lufs,
      targetLufs: style.master.targetLufs,
      peak: samplePeak(decoded),
      longestQuiet: longestQuiet(decoded, sounding, LIMITS.quiet),
      lagMs,
      stems: stemRows.filter((s) => s.notes > 0),
      rss,
    });
    const ok = passed(checks);
    yield* fs.rename(`${mp3File}.part`, mp3File);
    const mp3 = yield* fs.readFile(mp3File);
    if (ok) yield* dropSheet(setup.out, hymn);
    else yield* writeAtomic(path.join(setup.out, `${hymn}.png`), encodePng(sheetOf(decoded, [])));
    const runs = [...pianoRuns, ...stringRuns];
    const record = {
      hymn,
      key: keyOf(setup.configHash, source.sha256),
      passed: ok,
      file: `${hymn}.mp3`,
      bytes: mp3.byteLength,
      sha256: sha256Hex(mp3),
      md5: md5Hex(mp3),
      seconds: Math.round((decoded.frames / style.rate) * 1e6) / 1e6,
      midiSeconds: Math.round(midiSeconds * 1e6) / 1e6,
      lufs: Math.round(filmLufs * 100) / 100,
      ebur128Lufs: mastered.lufs,
      truePeak: Math.round(mastered.truePeak * 100) / 100,
      lagMs,
      passes: mastered.passes,
      checks,
      stems: Object.fromEntries(
        stemRows.map((s) => {
          const r = runs.find((x) => x.name === s.name);
          return [
            s.name,
            {
              notes: s.notes,
              lufs: Number.isFinite(s.lufs) ? Math.round(s.lufs * 100) / 100 : 'silent',
              frames: s.frames,
              needed: s.needed,
              rss: r?.rss ?? 0,
              seconds: Math.round((r?.seconds ?? 0) * 100) / 100,
            },
          ];
        }),
      ),
      rss,
      times: {
        sampler: Math.round(samplerSeconds * 100) / 100,
        mix: Math.round(mixSeconds * 100) / 100,
        master: Math.round(masterSeconds * 100) / 100,
        total: Math.round(((performance.now() - started) / 1000) * 100) / 100,
      },
      waitedSeconds: Math.round(waited),
      transpose: setup.transpose === 0 ? undefined : setup.transpose,
      moves: setup.transpose === 0 ? undefined : source.moves,
    };
    yield* writeAtomic(path.join(setup.out, `${hymn}.json`), recordText(record));
    const failedNames = Object.entries(checks)
      .filter(([, c]) => !c.ok)
      .map(([name]) => name);
    const line =
      `${hymn} ${ok ? 'ok' : `FAIL ${failedNames.join(',')}`}: ${record.seconds.toFixed(2)}s ` +
      `(midi ${record.midiSeconds.toFixed(2)} + ${style.tail}), ${record.lufs.toFixed(2)} LUFS, ` +
      `${record.truePeak.toFixed(2)} dBTP, lag ${lagMs} ms, ${(record.bytes / 1e6).toFixed(2)} MB, ` +
      `${record.times.total.toFixed(1)}s` +
      (source.moves.length === 0 ? '' : `; moved ${source.moves.map(moveText).join(', ')}`);
    return { hymn, status: ok ? 'passed' : 'failed', line } satisfies Outcome;
  });

const manifestRow = (record: HymnRecord, passedNow: boolean) => ({
  hymn: record.hymn,
  key: recordingKey(record.hymn),
  file: record.file,
  bytes: record.bytes,
  sha256: record.sha256,
  md5: record.md5,
  seconds: record.seconds,
  lufs: record.lufs,
  truePeak: record.truePeak,
  lagMs: record.lagMs,
  passed: passedNow,
});

export const writeManifest = (setup: Setup, uploaded = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hymns = [];
    const left: number[] = [];
    for (const name of (yield* fs.readDirectory(setup.out)).sort()) {
      const match = /^(\d+)\.json$/.exec(name);
      if (match === null) continue;
      const hymn = Number(match[1]);
      const standing = yield* standingOf(
        setup,
        hymn,
        yield* sourceOf(setup.style, hymn, setup.transpose),
        uploaded,
      );
      if (standing.kind === 'render') left.push(hymn);
      else hymns.push(manifestRow(standing.typed, standing.kind === 'stands'));
    }
    const manifest: RecordingManifest = {
      set: setup.set,
      style: `${setup.style.name} ${setup.style.title}`,
      transpose: setup.transpose === 0 ? undefined : setup.transpose,
      platform: `${process.platform}-${process.arch}`,
      configHash: setup.configHash,
      tools: {
        sfizz: { version: '1.2.3', sha256: setup.sfizzSha256 },
        nodeAv: { version: setup.nodeAv },
      },
      hymns: hymns.sort((a, b) => a.hymn - b.hymn),
    };
    const text = yield* Schema.encodeEffect(ManifestJson)(manifest).pipe(Effect.orDie);
    yield* writeAtomic(
      path.join(setup.out, 'manifest.json'),
      utf8(`${JSON.stringify(JSON.parse(text), null, 2)}\n`),
    );
    return { manifest, left: left.sort((a, b) => a - b) };
  });

export const roomOf = (style: Style) => `${import.meta.dir}/${style.reverb.ir}`;
