import { BunRuntime, BunServices } from '@effect/platform-bun';
import { dotAlchemyDirectory } from 'alchemy/AlchemyContext';
import { Stage } from 'alchemy/Stage';
import { Console, Data, Effect, FileSystem, Option, Path, Schema } from 'effect';

const PROD_STATE = 'state/firsttheblade/prod';

interface Live {
  readonly label: string;
  readonly file: string;
  readonly resourceType: string;
  readonly field: string;
  readonly name: string;
}

const LIVE: ReadonlyArray<Live> = [
  {
    label: 'the Site Worker',
    file: 'Site.json',
    resourceType: 'Cloudflare.Worker',
    field: 'workerName',
    name: 'firsttheblade',
  },
  {
    label: 'the Mail D1',
    file: 'Mail.json',
    resourceType: 'Cloudflare.D1Database',
    field: 'databaseName',
    name: 'firsttheblade-Mail-prod-kbdnjw67amvppcia',
  },
  {
    label: 'the FilmQueue queue',
    file: 'FilmQueue.json',
    resourceType: 'Cloudflare.Queues.Queue',
    field: 'queueName',
    name: 'firsttheblade-filmqueue-prod-ybriolxcgdeqcqtq',
  },
];

const Recorded = Schema.Struct({
  resourceType: Schema.String,
  attr: Schema.Record(Schema.String, Schema.Unknown),
});

const decodeRecorded = Schema.decodeOption(Schema.fromJsonString(Recorded));

class ProdStateMissing extends Data.TaggedError('ProdStateMissing')<{
  readonly reason: string;
}> {
  override get message() {
    return `prod-state: ${this.reason}. Copy the main checkout's apps/firsttheblade/.alchemy/${PROD_STATE} there, or deploy from the main checkout's apps/firsttheblade.`;
  }
}

const differs = (live: Live, found: string, expected: string) =>
  `${live.label} (${live.file} records ${found}, not ${expected}; if it was replaced on purpose, change LIVE in apps/firsttheblade/scripts/prod-state.ts)`;

const lacking = Effect.fn('ProdState.lacking')(function* (dir: string, live: Live) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* Effect.option(fs.readFileString(path.join(dir, live.file)));
  const recorded = Option.flatMap(text, decodeRecorded);
  if (Option.isNone(recorded)) {
    return Option.some(`${live.label} (${live.file} is missing or unreadable)`);
  }
  const { resourceType, attr } = recorded.value;
  if (resourceType !== live.resourceType) {
    return Option.some(differs(live, `a ${resourceType}`, `a ${live.resourceType}`));
  }
  const name = Schema.decodeUnknownOption(Schema.String)(attr[live.field]);
  if (Option.contains(name, live.name)) return Option.none();
  const found = Option.getOrElse(name, () => `no string ${live.field}`);
  return Option.some(differs(live, found, live.name));
});

export const checkProdState = Effect.fn('ProdState.check')(function* (dotAlchemy: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.resolve(dotAlchemy, PROD_STATE);
  const files = yield* Effect.orElseSucceed(fs.readDirectory(dir), () => []);
  if (files.length === 0) {
    return yield* new ProdStateMissing({ reason: `no prod Alchemy state at ${dir}` });
  }
  const missing = (yield* Effect.forEach(LIVE, (live) => lacking(dir, live))).flatMap((gap) =>
    Option.toArray(gap),
  );
  if (missing.length > 0) {
    return yield* new ProdStateMissing({
      reason: `the prod state at ${dir} does not record ${missing.join('; ')}`,
    });
  }
});

export const prodStateGate = Effect.fn('ProdState.gate')(function* () {
  if ((yield* Stage) !== 'prod') return;
  yield* checkProdState(yield* dotAlchemyDirectory);
});

if (import.meta.main)
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* checkProdState(path.join(path.dirname(import.meta.dir), '.alchemy'));
  }).pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(BunServices.layer),
    (program) => BunRuntime.runMain(program, { disableErrorReporting: true }),
  );
