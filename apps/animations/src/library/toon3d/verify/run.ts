import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Clock, Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import sharp from 'sharp';
import { leadFeastLabels } from '../lead-feast-labels.ts';
import { leadFeast } from '../lead-feast.ts';
import type { MeshLabels } from '../mesh/labels.ts';
import type { ViewName } from '../render.ts';
import { buildSource, FigureSource, sha256 } from '../source.ts';
import type { MemberSpec } from '../spec.ts';
import { BARS, STAGES } from './bars.ts';
import type { Raster } from './measures.ts';
import {
  decode,
  firstLaunch,
  FULL_PLAN,
  measureRun,
  pageLaunch,
  QUICK_PLAN,
  secondLaunch,
  VerifyFailed,
  type Plan,
  type RenderJob,
} from './pipeline.ts';
import { ColourProbesJson } from './probes.ts';
import { verdictOf, verdictText, type Verdict } from './verdict.ts';

/** The members the verify command knows, by the name their cast folder has. */
const MEMBERS = { 'lead-feast': leadFeast } satisfies Readonly<Record<string, MemberSpec>>;

type MemberName = keyof typeof MEMBERS;

/** Each member's mesh label rules, by member. */
const MESH_LABELS: Readonly<Record<MemberName, MeshLabels>> = { 'lead-feast': leadFeastLabels };

const MEMBER_NAMES: ReadonlyArray<MemberName> = ['lead-feast'];

/** verdict.json: the verdict as the run judged it, two-space indented. */
const VerdictJson = Schema.fromJsonString(
  Schema.Struct({
    passed: Schema.Finite,
    total: Schema.Finite,
    checks: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        stage: Schema.Literals(STAGES),
        pass: Schema.Boolean,
        value: Schema.String,
        at: Schema.String,
        bar: Schema.String,
        source: Schema.Literals(['owner', 'orchestrator-proposed']),
      }),
    ),
  }),
  { space: 2 },
);

const Hashes = Schema.Record(Schema.String, Schema.String);

/** manifest.json: the sha256 of every input, code file and render, and the git head. */
const ManifestJson = Schema.fromJsonString(
  Schema.Struct({
    member: Schema.String,
    source: Schema.String,
    head: Schema.String,
    inputs: Hashes,
    code: Hashes,
    renders: Hashes,
  }),
  { space: 2 },
);

/** A member spec as JSON text, for its hash: the spec is plain numbers, strings and arrays. */
const SpecJson = Schema.fromJsonString(Schema.Unknown);

/** The figure did not meet every bar: `passed` of `total` checks pass. */
export class VerdictFailed extends Schema.TaggedError<VerdictFailed>()('VerdictFailed', {
  passed: Schema.Finite,
  total: Schema.Finite,
}) {
  override get message() {
    return `FAIL ${this.passed}/${this.total}`;
  }
}

const here = import.meta.dir;

/** Where a member's kept views live. */
const keptDir = (member: string): string => `${here}/../../cast/${member}/cast-sheet/views`;

/** Where a member's authored colour probes live. */
export const probesFile = (member: string): string =>
  `${here}/../../cast/${member}/cast-sheet/colour-probes.json`;

/** Where a run writes: `apps/animations/out/toon3d/<member>/`. */
const outDir = (member: string): string => `${here}/../../../../out/toon3d/${member}`;

/** A member's generated mesh, named by its `mesh.json`, labelled by the member's rules and painted with its spec. */
const meshOf = (member: MemberName) =>
  FigureSource.Mesh({
    spec: MEMBERS[member],
    labels: MESH_LABELS[member],
    manifest: `${here}/../../cast/${member}/mesh/mesh.json`,
  });

const sharpFailed = (cause: unknown) => VerifyFailed.make({ reason: String(cause) });

/** The member's six kept views, by view. */
const readKept = Effect.fn('Toon3dVerify.readKept')(function* (member: string, plan: Plan) {
  const fs = yield* FileSystem.FileSystem;
  const kept = new Map<ViewName, Raster>();
  const bytes = new Map<string, Uint8Array>();
  for (const view of plan.views) {
    const file = `${keptDir(member)}/${view}.png`;
    const png = yield* fs
      .readFile(file)
      .pipe(Effect.mapError(() => VerifyFailed.make({ reason: `no kept view at ${file}` })));
    bytes.set(`kept/${view}.png`, png);
    kept.set(view, yield* decode(png));
  }
  return { kept, bytes };
});

/** The member's authored colour probes, `cast/<member>/cast-sheet/colour-probes.json`, and the file's text for the manifest. */
const readColourProbes = Effect.fn('Toon3dVerify.readColourProbes')(function* (member: string) {
  const fs = yield* FileSystem.FileSystem;
  const file = probesFile(member);
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.mapError(() => VerifyFailed.make({ reason: `no colour probes at ${file}` })));
  const probes = yield* Schema.decodeEffect(ColourProbesJson)(text).pipe(
    Effect.mapError((e) => VerifyFailed.make({ reason: `${file}: ${e.message}` })),
  );
  return { probes, text };
});

/** The toon3d source files a run's renders and measures come from, by name under `toon3d/`. */
const codeFiles = Effect.fn('Toon3dVerify.codeFiles')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = `${here}/..`;
  const sources = (dir: string) =>
    fs
      .readDirectory(`${root}/${dir}`)
      .pipe(
        Effect.map((names) =>
          names
            .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
            .map((n) => `${dir}/${n}`),
        ),
      );
  const names = [
    ...(yield* fs.readDirectory(root)).filter((n) => n.endsWith('.ts')),
    ...(yield* sources('verify')),
    ...(yield* sources('mesh')),
  ].toSorted();
  const hashes: Array<readonly [string, string]> = [];
  for (const name of names) hashes.push([name, sha256(yield* fs.readFile(`${root}/${name}`))]);
  return Object.fromEntries(hashes);
});

/** The git head the run's code is at. */
const gitHead = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const head = yield* spawner.string(
    ChildProcess.make('git', ['-C', here, 'rev-parse', 'HEAD'], { forceKillAfter: '5 seconds' }),
  );
  return head.trim();
});

/** The renders a run made, by name, and which differ between its two launches. */
const rendersOf = (
  jobs: ReadonlyArray<RenderJob>,
  first: ReadonlyArray<Uint8Array>,
  second: ReadonlyArray<Uint8Array>,
) => {
  const renders = new Map<string, Uint8Array>();
  const hashes: Array<readonly [string, string]> = [];
  const differing: Array<string> = [];
  jobs.forEach((job, k) => {
    const a = first[k] ?? new Uint8Array();
    const b = second[k] ?? new Uint8Array();
    const ha = sha256(a);
    renders.set(job.name, a);
    hashes.push([job.name, ha]);
    if (ha !== sha256(b)) differing.push(job.name);
  });
  return { renders, hashes: Object.fromEntries(hashes), differing };
};

/** Paper behind the contact sheet. */
const PAPER = { r: 253, g: 241, b: 217, alpha: 1 };

/** contact.png: each kept view beside its render, then the bend's first frame, its quarter and its half (0, 24 and 48 of 96). */
const contactSheet = Effect.fn('Toon3dVerify.contactSheet')(function* (
  plan: Plan,
  keptBytes: ReadonlyMap<string, Uint8Array>,
  renders: ReadonlyMap<string, Uint8Array>,
) {
  const tiles: Array<{ readonly png: Uint8Array; readonly row: number }> = [];
  for (const view of plan.views)
    for (const png of [keptBytes.get(`kept/${view}.png`), renders.get(`views/${view}.png`)])
      Option.map(Option.fromUndefinedOr(png), (p) => tiles.push({ png: p, row: 0 }));
  for (const k of [0, Math.floor(plan.bendFrames / 4), Math.floor(plan.bendFrames / 2)])
    Option.map(
      Option.fromUndefinedOr(renders.get(`bend/f${String(k).padStart(4, '0')}.png`)),
      (p) => tiles.push({ png: p, row: 1 }),
    );
  const sized = yield* Effect.forEach(tiles, (t) =>
    Effect.tryPromise({ try: () => sharp(t.png).metadata(), catch: sharpFailed }).pipe(
      Effect.map((m) => ({ ...t, width: m.width, height: m.height })),
    ),
  );
  const rowHeight = (row: number) =>
    Math.max(0, ...sized.filter((t) => t.row === row).map((t) => t.height));
  const rowWidth = (row: number) =>
    sized.filter((t) => t.row === row).reduce((sum, t) => sum + t.width, 0);
  const width = Math.max(1, rowWidth(0), rowWidth(1));
  const height = Math.max(1, rowHeight(0) + rowHeight(1));
  const placed: Array<{ input: Buffer; left: number; top: number }> = [];
  const cursor = [0, 0];
  for (const t of sized) {
    placed.push({
      input: Buffer.from(t.png),
      left: cursor[t.row] ?? 0,
      top: t.row * rowHeight(0),
    });
    cursor[t.row] = (cursor[t.row] ?? 0) + t.width;
  }
  return yield* Effect.tryPromise({
    try: () =>
      sharp({ create: { width, height, channels: 4, background: PAPER } })
        .composite(placed)
        .png()
        .toBuffer(),
    catch: sharpFailed,
  });
});

/** A clip of a run's frames in `dir`: 24 fps, H.264 at crf 23, yuv420p. */
const encodeClip = Effect.fn('Toon3dVerify.encodeClip')(function* (frames: string, to: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const code = yield* spawner.exitCode(
    ChildProcess.make(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        '24',
        '-i',
        `${frames}/f%04d.png`,
        '-c:v',
        'libx264',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        to,
      ],
      { forceKillAfter: '5 seconds' },
    ),
  );
  if (code !== 0) return yield* VerifyFailed.make({ reason: `ffmpeg exited ${code} on ${to}` });
});

/**
 * One verify run of `member` from `source` at `plan`: render every job in
 * one page launch, again in a second, measure, judge every bar, and write
 * the verdict, the manifest, the renders, the contact sheet and the clips
 * under `out`.
 */
export const verifyMember = Effect.fn('Toon3dVerify.verifyMember')(function* (
  member: string,
  source: FigureSource,
  plan: Plan,
  out: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const figure = yield* buildSource(source);
  const spec = figure.spec;
  const { kept, bytes: keptBytes } = yield* readKept(member, plan);
  const probes = yield* readColourProbes(member);
  const first = yield* firstLaunch(pageLaunch(figure.page), plan, kept);
  const second = yield* secondLaunch(pageLaunch(figure.page), first.jobs);
  const { renders, hashes, differing } = rendersOf(first.jobs, first.pngs, second);
  const measured = yield* measureRun(
    figure,
    plan,
    kept,
    probes.probes,
    first.jobs,
    renders,
    differing,
  );
  const verdict: Verdict = verdictOf(BARS, measured);

  const rendersDir = path.join(out, 'renders');
  yield* fs.remove(rendersDir, { recursive: true, force: true });
  for (const [name, png] of renders) {
    const file = path.join(rendersDir, name);
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFile(file, png);
  }
  const inputs = Object.fromEntries([
    ...[...keptBytes].map(([name, png]) => [name, sha256(png)] as const),
    ['colour-probes.json', sha256(probes.text)] as const,
    ['spec.json', sha256(yield* Schema.encodeEffect(SpecJson)(spec))] as const,
    ...Object.entries(figure.inputs),
  ]);
  const manifest = yield* Schema.encodeEffect(ManifestJson)({
    member,
    source: source._tag,
    head: yield* gitHead,
    inputs,
    code: yield* codeFiles(),
    renders: hashes,
  });
  yield* fs.writeFileString(path.join(out, 'verdict.md'), verdictText(verdict));
  yield* fs.writeFileString(
    path.join(out, 'verdict.json'),
    `${yield* Schema.encodeEffect(VerdictJson)(verdict)}\n`,
  );
  yield* fs.writeFileString(path.join(out, 'manifest.json'), `${manifest}\n`);
  yield* fs.writeFile(path.join(out, 'contact.png'), yield* contactSheet(plan, keptBytes, renders));
  for (const clip of ['bend', 'turn'])
    yield* encodeClip(path.join(rendersDir, clip), path.join(out, `${clip}.mp4`));
  return verdict;
});

/** The plan a run renders and where it writes: the full run at `out/toon3d/<member>/`, a quick one under its `quick/`. */
const runOf = (member: string, quick: boolean) => {
  if (quick) return { plan: QUICK_PLAN, out: `${outDir(member)}/quick` };
  return { plan: FULL_PLAN, out: outDir(member) };
};

const verify = Command.make(
  'toon3d-verify',
  {
    member: Argument.Literals('member', MEMBER_NAMES).pipe(
      Argument.withDescription('the cast member, a folder under src/library/cast'),
    ),
    source: Flag.Literals('source', ['parametric', 'mesh']).pipe(
      Flag.withDefault('parametric'),
      Flag.withDescription(
        'where the figure comes from: the code-built spec, or the generated mesh',
      ),
    ),
    quick: Flag.Boolean('quick').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'iterate, not judge: the front, an 8-frame bend and a 2-frame turn, written to out/toon3d/<member>/quick/; the full run stays the verdict',
      ),
    ),
  },
  ({ member, source, quick }) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      const figure = {
        parametric: () => FigureSource.Parametric({ spec: MEMBERS[member] }),
        mesh: () => meshOf(member),
      }[source]();
      const { plan, out } = runOf(member, quick);
      const verdict = yield* verifyMember(member, figure, plan, out);
      yield* Console.log(verdictText(verdict));
      const took = ((yield* Clock.currentTimeMillis) - started) / 1000;
      yield* Console.log(`wrote ${out} in ${took.toFixed(1)} s`);
      if (verdict.passed !== verdict.total)
        return yield* VerdictFailed.make({ passed: verdict.passed, total: verdict.total });
    }),
).pipe(
  Command.withDescription(
    'Render a toon3d member at its six kept views, a bend and a turn, twice; measure every bar in toon3d/verify/bars.ts and write out/toon3d/<member>/ (verdict.md, verdict.json, manifest.json, contact.png, bend.mp4, turn.mp4, renders/). Exits 0 only on PASS n/n',
  ),
);

if (import.meta.main)
  Command.run(verify, { version: '0.1.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
