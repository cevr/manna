import { Config, Context, Duration, Effect, FileSystem, Layer, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CounselFailed } from '../core/judge.ts';
import { runInto } from './process.ts';
import { type SandboxPlan, sandboxArgs } from './sandbox.ts';

interface CounselAnswer {
  readonly file: string;
  readonly text: string;
}

interface CounselService {
  readonly ask: (prompt: string, dir: string) => Effect.Effect<CounselAnswer, CounselFailed>;
}

interface RunFolders {
  readonly packet: string;
  readonly scratch: string;
}

export interface SandboxedRun {
  readonly plan: SandboxPlan;
  readonly env: Readonly<Record<string, string>>;
  readonly command: ReadonlyArray<string>;
}

const ANSWER = 'claude.md';

const ERRORS = 'claude.err';

interface CounselBounds {
  readonly limit: Duration.Duration;
  readonly killAfter: Duration.Duration;
}

const COUNSEL_LIMIT = Duration.minutes(30);

const COUNSEL_BOUNDS: CounselBounds = { limit: COUNSEL_LIMIT, killAfter: Duration.seconds(10) };

const WEB_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

const routeOf = (env: Readonly<Record<string, string>>): string =>
  Option.match(Option.fromNullishOr(env['ANTHROPIC_BASE_URL']), {
    onNone: () => 'direct',
    onSome: (url) =>
      Option.match(
        Option.filter(Option.fromNullishOr(URL.parse(url)), (parsed) =>
          WEB_SCHEMES.has(parsed.protocol),
        ),
        { onNone: () => 'proxy', onSome: (parsed) => `${parsed.protocol}//${parsed.host}` },
      ),
  });

const tailOf = (text: string) => text.trim().split('\n').slice(-3).join(' | ');

const installOf = (claude: string): Effect.Effect<string, CounselFailed> =>
  Effect.fromOption(
    Option.fromNullishOr(/^(\/.+\/claude)\/versions\/[^/]+$/.exec(claude)?.[1]),
  ).pipe(
    Effect.mapError(() =>
      CounselFailed.make({
        reason: `Claude's program is ${claude}, not a version under …/claude/versions/ (the native installer's): the sandbox opens its install's folder to reading, and this one's could hold anything`,
      }),
    ),
  );

const claudeRun = (
  claude: string,
  install: string,
  home: string,
  proxy: Option.Option<string>,
  folders: RunFolders,
): SandboxedRun => ({
  plan: {
    reads: [folders.packet, install, `${home}/Library/Keychains`],
    writes: [folders.scratch],
  },
  env: {
    HOME: home,
    PATH: '/usr/bin:/bin',
    TMPDIR: folders.scratch,
    CLAUDE_CODE_TMPDIR: folders.scratch,
    CLAUDE_CONFIG_DIR: `${folders.scratch}/claude`,
    CLAUDE_SECURESTORAGE_CONFIG_DIR: '',
    DISABLE_AUTOUPDATER: '1',
    LANG: 'en_US.UTF-8',
    USER: home.split('/').at(-1) ?? '',
    ...Option.match(proxy, { onNone: () => ({}), onSome: (url) => ({ ANTHROPIC_BASE_URL: url }) }),
  },
  command: [
    claude,
    '-p',
    '--model',
    'opus',
    '--effort',
    'max',
    '--safe-mode',
    '--restricted',
    '--tools',
    'Read',
    '--allowedTools',
    'Read',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format',
    'text',
  ],
});

const claudeProgram = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* Effect.fromOption(Option.fromNullishOr(Bun.which('claude'))).pipe(
    Effect.mapError(() =>
      CounselFailed.make({
        reason: "the counsel runs Claude Code's `claude`, and it is not on PATH",
      }),
    ),
  );
  return yield* fs
    .realPath(found)
    .pipe(Effect.mapError((error) => CounselFailed.make({ reason: error.message })));
});

export class Counsel extends Context.Service<Counsel, CounselService>()(
  '@manna/film/tools/Counsel',
) {
  static readonly sandboxed = <R>(
    run: (folders: RunFolders) => Effect.Effect<SandboxedRun, CounselFailed, R>,
    bounds: CounselBounds = COUNSEL_BOUNDS,
  ) =>
    Layer.effect(
      Counsel,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const context = yield* Effect.context<R>();

        const ask = Effect.fn('Counsel.ask')(function* (prompt: string, dir: string) {
          const outputs = { stdout: path.join(dir, ANSWER), stderr: path.join(dir, ERRORS) };
          const failed = (reason: string) =>
            Effect.flatMap(
              fs.exists(outputs.stderr).pipe(Effect.orElseSucceed(() => false)),
              (kept) => Effect.fail(CounselFailed.make({ reason, ...(kept && { dir }) })),
            );
          if (process.platform !== 'darwin')
            return yield* failed(
              `the counsel's sandbox is macOS's sandbox-exec, and this is ${process.platform}`,
            );
          const asked = yield* Effect.all({
            packet: fs.realPath(path.dirname(prompt)),
            words: fs.readFileString(prompt),
            made: fs.makeDirectory(dir, { recursive: true }),
          }).pipe(Effect.catch((error) => failed(error.message)));
          const exitCode = yield* Effect.scoped(
            Effect.gen(function* () {
              const scratch = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
              const how = yield* run({ packet: asked.packet, scratch }).pipe(
                Effect.provideContext(context),
              );
              const [program = 'claude', ...args] = sandboxArgs(how.plan, how.command);
              yield* Effect.log(
                `counsel.start prompt=${prompt} dir=${dir} sandbox=sandbox-exec route=${routeOf(how.env)}`,
              );
              return yield* runInto(
                spawner,
                'claude',
                ChildProcess.make(program, args, {
                  cwd: asked.packet,
                  env: { ...how.env },
                  stdin: Stream.make(new TextEncoder().encode(asked.words)),
                  forceKillAfter: bounds.killAfter,
                }),
                bounds.limit,
                outputs,
              ).pipe(Effect.provideService(FileSystem.FileSystem, fs));
            }),
          ).pipe(
            Effect.catchTags({
              PlatformError: (error) => failed(error.message),
              ProcessTimedOut: (error) => failed(error.message),
            }),
          );
          const printed = yield* Effect.all([
            fs.readFileString(outputs.stdout),
            fs.readFileString(outputs.stderr),
          ]).pipe(Effect.catch((error) => failed(error.message)));
          const [stdout, stderr] = printed;
          if (exitCode !== 0)
            return yield* failed(
              `the counsel exited ${exitCode}: ${tailOf(stderr) || tailOf(stdout)}`,
            );
          const text = stdout.replaceAll(asked.packet, path.dirname(prompt));
          if (text.trim() === '') return yield* failed(`it answered nothing in ${outputs.stdout}`);
          yield* Effect.log(`counsel.answered file=${outputs.stdout} chars=${text.length}`);
          return { file: outputs.stdout, text } satisfies CounselAnswer;
        });

        return Counsel.of({ ask });
      }),
    );

  static readonly claudeAt = <R>(program: Effect.Effect<string, CounselFailed, R>) =>
    Counsel.sandboxed((folders) =>
      Effect.gen(function* () {
        const claude = yield* program;
        const install = yield* installOf(claude);
        const home = yield* Config.String('HOME').pipe(
          Effect.mapError((error) => CounselFailed.make({ reason: error.message })),
        );
        const proxy = yield* Config.option(Config.String('ANTHROPIC_BASE_URL')).pipe(
          Effect.mapError((error) => CounselFailed.make({ reason: error.message })),
        );
        return claudeRun(claude, install, home, proxy, folders);
      }),
    );

  static readonly layer = Counsel.claudeAt(claudeProgram);

  static readonly layerTest = (answer: (prompt: string) => string, asked: Array<string> = []) =>
    Layer.effect(
      Counsel,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        return Counsel.of({
          ask: (prompt, dir) =>
            Effect.gen(function* () {
              const words = yield* fs.readFileString(prompt);
              asked.push(words);
              const file = path.join(dir, ANSWER);
              yield* fs.makeDirectory(dir, { recursive: true });
              const text = answer(words);
              yield* fs.writeFileString(file, text);
              return { file, text } satisfies CounselAnswer;
            }).pipe(Effect.mapError((error) => CounselFailed.make({ dir, reason: error.message }))),
        });
      }),
    );
}
