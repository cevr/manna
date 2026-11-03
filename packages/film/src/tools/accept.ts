import { Array as Arr, Option, Result, Schema } from 'effect';
import { UnknownScene } from '../core/errors.ts';
import { TakeMismatch } from '../core/refusals.ts';
import { AcceptMismatchUnnamed } from './errors.ts';

const ACCEPT_MISMATCH = '--accept-mismatch';

export const acceptedBeats = (
  flag: Option.Option<string>,
  only: Option.Option<ReadonlySet<string>>,
  known: ReadonlyArray<string>,
): Result.Result<ReadonlySet<string>, AcceptMismatchUnnamed | UnknownScene> => {
  if (Option.isNone(flag)) return Result.succeed(new Set());
  const named = flag.value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (named.length === 0) return Result.fromOption(only, () => AcceptMismatchUnnamed.make({}));
  const unknown = Arr.findFirst(named, (id) => !known.includes(id));
  if (Option.isSome(unknown))
    return Result.fail(UnknownScene.make({ scene: unknown.value, known }));
  return Result.succeed(new Set(named));
};

export const bareAcceptMismatch = (args: ReadonlyArray<string>): ReadonlyArray<string> =>
  args.map((arg, i) => {
    const next = Arr.get(args, i + 1);
    const bare =
      arg === ACCEPT_MISMATCH &&
      Option.match(next, {
        onNone: () => true,
        onSome: (n) => n.startsWith('-'),
      });
    if (bare) return `${ACCEPT_MISMATCH}=`;
    return arg;
  });

class TakeMismatchToRerun extends Schema.TaggedError<TakeMismatchToRerun>()(
  'TakeMismatch',
  TakeMismatch.fields,
) {
  override get message() {
    const said = TakeMismatch.make({
      id: this.id,
      script: this.script,
      heard: this.heard,
      wer: this.wer,
    });
    return `${said.message}\nre-record it with --only ${this.id}, or keep it with ${ACCEPT_MISMATCH}`;
  }
}

export const atTheCommandLine = <E>(error: E): E | TakeMismatchToRerun => {
  if (Schema.is(TakeMismatch)(error))
    return TakeMismatchToRerun.make({
      id: error.id,
      script: error.script,
      heard: error.heard,
      wer: error.wer,
    });
  return error;
};
