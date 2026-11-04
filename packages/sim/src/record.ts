/**
 * The drive's record: `<state>/session.json`, the one place every later
 * command reads the booted drive from. It is written whole and only where
 * none is (a file of this write's own, linked into place), it stays in place
 * while the process it names may run, and it leaves the state only by being
 * filed away into an output folder under a name no file there has, once its
 * server is gone. Nothing here signals or decides who may; the state's
 * holder (`holder.ts`) does.
 */
import { Effect, FileSystem, Option, Random, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

import { HostFailed } from './errors.ts';
import { admit } from './host.ts';
import type { Identity } from './os.ts';
import { Session } from './result.ts';

const SessionJson = Schema.fromJsonString(Session);
const decode = Schema.decodeOption(SessionJson);

/** The state's record file. */
export const recordFile = (state: string) => `${state}/session.json`;

/** What the state's record file holds: its session when it decodes, none when it does not. */
interface Found {
  readonly file: string;
  readonly session: Option.Option<Session>;
}

const isNotFound = (error: PlatformError) => error.reason._tag === 'NotFound';
const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

/** The state's record; none when there is no record file. */
export const readRecord = Effect.fn('Sim.readRecord')(function* (state: string) {
  const fs = yield* FileSystem.FileSystem;
  const file = recordFile(state);
  const text = yield* fs.readFileString(file).pipe(
    Effect.asSome,
    Effect.catchIf(isNotFound, () => Effect.succeedNone),
  );
  return Option.map(text, (found): Found => ({ file, session: decode(found) }));
});

/** The server a session records by identity; none in a legacy session, which grants no signal. */
export const ownedBy = (session: Session) =>
  Option.map(Option.fromUndefinedOr(session.serverStarted), (started): Identity => ({
    pid: session.serverPid,
    started,
  }));

/**
 * Write the state's record whole, only where none is: the encoded session
 * goes to a file of this write's own name (never a `*.json`), created only
 * where none is, which is then linked to `session.json`; a record already
 * there fails the link. The file of its own is removed after, whatever
 * happened; a failure of that removal is passed over.
 */
export const writeRecord = Effect.fn('Sim.writeRecord')(function* (
  state: string,
  session: Session,
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* Schema.encodeEffect(SessionJson)(session).pipe(
    Effect.mapError((error) => HostFailed.make({ reason: error.message })),
  );
  const own = (yield* Random.nextIntBetween(0, 2 ** 31)).toString(36);
  const temp = `${state}/session.${own}.writing`;
  yield* Effect.andThen(
    fs.writeFileString(temp, text, { flag: 'wx' }),
    fs.link(temp, recordFile(state)),
  ).pipe(Effect.ensuring(Effect.ignore(fs.remove(temp))));
});

/** How many names `fileAway` tries in one output folder: `session.json`, then `session-2.json` and on. */
const FILED_NAMES = 64;

/**
 * File the state's record away into `out`: link it to the first name there
 * no file has, then remove it from the state. The last step of a session,
 * once its server is gone; it never replaces a file. Where it was filed.
 */
export const fileAway = Effect.fn('Sim.fileAway')(function* (state: string, out: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* admit(out);
  yield* fs.makeDirectory(out, { recursive: true });
  const from = recordFile(state);
  const linkAt = (n: number): Effect.Effect<string, PlatformError> => {
    let to = `${out}/session.json`;
    if (n > 1) to = `${out}/session-${n}.json`;
    return fs.link(from, to).pipe(
      Effect.as(to),
      Effect.catchIf(
        (error) => isAlreadyExists(error) && n < FILED_NAMES,
        () => linkAt(n + 1),
      ),
    );
  };
  const kept = yield* linkAt(1);
  yield* fs.remove(from);
  return kept;
});
