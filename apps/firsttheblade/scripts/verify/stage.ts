import { Effect, FileSystem, Option, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { APP_DIR } from './instance.ts';
import { CommandFailed, NotBuilt, Refused } from './model.ts';

const AGENT_STAGE = /^agent-[a-z0-9][a-z0-9-]{0,30}$/;

export const agentStage = (stage: string) => {
  if (AGENT_STAGE.test(stage)) return Effect.succeed(stage);
  return Effect.fail(
    Refused.make({
      message: `stage "${stage}" is not agent-<name>: only a throwaway stage is deployed or destroyed`,
    }),
  );
};

export const workersDevUrl = (log: string) =>
  Option.fromNullOr(/https:\/\/[a-z0-9.-]+\.workers\.dev/.exec(log)).pipe(Option.map((m) => m[0]));

export const stage = Effect.fn('Verify.stage')(function* (input: {
  readonly action: 'up' | 'down';
  readonly stage: string;
  readonly root: string;
}) {
  const name = yield* agentStage(input.stage);
  const fs = yield* FileSystem.FileSystem;
  if (input.action === 'up' && !(yield* fs.exists(`${APP_DIR}/dist/index.html`)))
    return yield* NotBuilt.make({ message: 'no build: run bun run build first' });
  yield* fs.makeDirectory(input.root, { recursive: true });
  const log = `${yield* fs.realPath(input.root)}/stage-${name}.log`;
  const verb = { up: 'deploy', down: 'destroy' }[input.action];
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const code = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make('bunx', ['alchemy', verb, 'alchemy.run.ts', '--stage', name, '--yes'], {
          cwd: APP_DIR,
          stdin: 'ignore',
          forceKillAfter: '10 seconds',
        }),
      );
      const [, exit] = yield* Effect.all([Stream.run(handle.all, fs.sink(log)), handle.exitCode], {
        concurrency: 2,
      });
      return Number(exit);
    }),
  );
  const text = yield* fs.readFileString(log);
  if (code !== 0)
    return yield* CommandFailed.make({
      command: `alchemy ${verb} --stage ${name}`,
      message: `exit ${code}; see ${log}`,
    });
  return Option.match(workersDevUrl(text), {
    onNone: () => ({ stage: name, action: input.action, log }),
    onSome: (url) => ({ stage: name, action: input.action, url, log }),
  });
});
