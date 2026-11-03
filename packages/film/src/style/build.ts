import { Config, Effect, FileSystem, Schema, Stream } from 'effect';
import { Digest } from 'effect/crypto';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ProductionFile, decisionsOf } from '../core/production.ts';
import { repoJson } from '../core/schema.ts';
import { type Lock, heldTo } from './lock.ts';
import { type Laid, unbacked } from './override.ts';
import { RULES } from './rules.ts';

const Problems = Schema.Array(Schema.Unknown);

const Built = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.Struct({ riv: Schema.String, bytes: Schema.Finite }),
    warnings: Schema.Array(Schema.String),
    problems: Schema.optional(Problems),
  }),
);

class RiveFailed extends Schema.TaggedError<RiveFailed>()('RiveFailed', {
  step: Schema.String,
  output: Schema.String,
}) {
  override get message() {
    return `${this.step} failed:\n${this.output}`;
  }
}

const rive = (step: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const bin = yield* Config.String('RIVE').pipe(Config.withDefault('rive'));
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(bin, args, { forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: 3 },
    );
    if (code !== 0) return yield* RiveFailed.make({ step, output: `${stdout}${stderr}` });
    return stdout;
  }).pipe(Effect.scoped);

const projectOf = (rml: string, main: string) =>
  [
    ['rive.yaml', `name: figures\nmain: ${main}\n`],
    ['figures.rml', rml],
  ] as const;

const sha256 = Effect.fn('sha256')(function* (bytes: Uint8Array) {
  const crypto = yield* Digest.Digest;
  const digest = yield* crypto.digest(Digest.sha256, bytes);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
});

const projectDigest = (rml: string, main: string) =>
  sha256(
    new TextEncoder().encode(
      projectOf(rml, main)
        .map(([name, text]) => `${name}\0${text}\0`)
        .join(''),
    ),
  );

const StampJson = repoJson(
  Schema.Struct({ project: Schema.String, riv: Schema.String, cli: Schema.String }),
);

export const compile = Effect.fn('compile')(function* (dir: string, rml: string, main: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* Effect.forEach(projectOf(rml, main), ([name, text]) =>
    fs.writeFileString(`${dir}/${name}`, text),
  );
  const printed = yield* rive('rive --once', [dir, '--once', '--quiet', '--format=json']);
  const report = yield* Schema.decodeEffect(Built)(printed.trim());
  const stamp = yield* Schema.encodeEffect(StampJson)({
    project: yield* projectDigest(rml, main),
    riv: yield* sha256(yield* fs.readFile(report.data.riv)),
    cli: (yield* rive('rive --version', ['--version'])).trim(),
  });
  return { ...report.data, warnings: report.warnings, problems: report.problems ?? [], stamp };
});

export const unbuilt = Effect.fn('unbuilt')(function* (committed: {
  readonly riv: string;
  readonly stamp: string;
  readonly rml: string;
  readonly main: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(committed.stamp))) return [`${committed.stamp} is missing`];
  const stamp = yield* Schema.decodeEffect(StampJson)(yield* fs.readFileString(committed.stamp));
  const project = yield* projectDigest(committed.rml, committed.main);
  const riv = yield* sha256(yield* fs.readFile(committed.riv));
  return [
    {
      held: project === stamp.project,
      why: `the rigs print a project ${committed.riv} was not built from`,
    },
    { held: riv === stamp.riv, why: `${committed.riv} is not the file its build wrote` },
  ]
    .filter((check) => !check.held)
    .map((check) => check.why);
});

const LedgerJson = repoJson(ProductionFile);

const decisionsAt = Effect.fn('decisionsAt')(function* (ledger: string) {
  const fs = yield* FileSystem.FileSystem;
  return decisionsOf(yield* Schema.decodeEffect(LedgerJson)(yield* fs.readFileString(ledger)));
});

export const unlocked = Effect.fn('unlocked')(function* (
  ledger: string,
  locked: ReadonlyArray<{ readonly item: string; readonly lock: Lock; readonly print: string }>,
) {
  const decisions = locked.length === 0 ? [] : yield* decisionsAt(ledger);
  const answers = yield* Effect.forEach(locked, ({ item, lock, print }) =>
    Effect.map(sha256(new TextEncoder().encode(print)), (hash) => ({
      item,
      hash,
      held: heldTo(item, lock, hash, decisions),
    })),
  );
  return {
    broken: answers.flatMap(({ item, hash, held }) =>
      held._tag === 'Broken'
        ? [
            {
              item,
              hash,
              why: `${item}'s lock is broken (FigureLock, ${RULES.FigureLock.says}): ${held.why}`,
            },
          ]
        : [],
    ),
    overridden: answers.flatMap(({ item, held }) =>
      held._tag === 'Freed' ? [{ item, override: held.override }] : [],
    ),
  };
});

export const unsaid = Effect.fn('unsaid')(function* (ledger: string, laid: ReadonlyArray<Laid>) {
  if (laid.length === 0) return [];
  return unbacked(laid, yield* decisionsAt(ledger));
});
