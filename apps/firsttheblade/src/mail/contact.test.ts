import { describe, expect, it } from 'effect-bun-test';
import { Cause, Effect, Exit, Logger, Option, Redacted, Ref } from 'effect';

/**
 * The Worker's inbox reader in small: a success kept, a failure read again.
 * The real one, `memoSuccess` (`../worker/store-secret.ts`), is held to its
 * own model by `store-secret.test.ts`; importing it here would load the
 * Cloudflare provider and cost the test task 0.2 s.
 */
const keptOnSuccess = <A>(read: Effect.Effect<A>) =>
  Effect.map(Ref.make(Option.none<A>()), (kept) =>
    Effect.flatMap(
      Ref.get(kept),
      Option.match({
        onSome: (value) => Effect.succeed(value),
        onNone: () => Effect.tap(read, (value) => Ref.set(kept, Option.some(value))),
      }),
    ),
  );
import { forwardContact } from './contact.ts';

type Message = { readonly readOk: boolean; readonly forwardOk: boolean };

const random = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 1 to 10 messages, each with the store's answer and the forward's. */
const program = (seed: number): ReadonlyArray<Message> => {
  const next = random(seed);
  const length = 1 + Math.floor(next() * 10);
  return Array.from({ length }, () => ({ readOk: next() < 0.6, forwardOk: next() < 0.7 }));
};

class Refused {
  readonly _tag = 'Refused';
  constructor(readonly n: number) {}
}

const inboxOf = (seed: number, read: number) => `inbox-${seed}-${read}@owner.example`;

/** Every log line written, kept for the check that none names an inbox. */
const lines: Array<string> = [];

const heard = Logger.layer([
  Logger.make(({ message }) => {
    lines.push([message].flat().map(String).join(' '));
  }),
]);

/** A message whose forward records its target and answers as the program says. */
const messageOf = (n: number, message: Message, targets: Array<string>) => ({
  forward: (rcptTo: string) =>
    Effect.suspend(() => {
      targets.push(rcptTo);
      if (message.forwardOk) return Effect.void;
      return Effect.fail(new Refused(n));
    }),
});

const errorOf = Exit.match<void, Refused, Option.Option<Refused>, Option.Option<Refused>>({
  onSuccess: () => Option.none(),
  onFailure: Cause.findErrorOption,
});

/**
 * One program against the model `{ kept, reads }`: the inbox reader keeps a
 * success over a store read that dies when the store fails, as the Worker's,
 * and each message is checked for its outcome, its forward target, the
 * reads after it, and, at the end, a log that names no inbox.
 */
const run = (seed: number, messages: ReadonlyArray<Message>) =>
  Effect.gen(function* () {
    lines.length = 0;
    const reads = yield* Ref.make(0);
    const current = yield* Ref.make<Message>({ readOk: true, forwardOk: true });
    const read = Effect.gen(function* () {
      const n = yield* Ref.updateAndGet(reads, (k) => k + 1);
      const { readOk } = yield* Ref.get(current);
      if (!readOk) return yield* Effect.die(new Error('the store read failed'));
      return Redacted.make(inboxOf(seed, n));
    });
    const handle = forwardContact(yield* keptOnSuccess(read));
    expect(yield* Ref.get(reads)).toBe(0);

    const model = { kept: Option.none<string>(), reads: 0, forwarded: 0 };
    for (const [n, message] of messages.entries()) {
      yield* Ref.set(current, message);
      const targets: Array<string> = [];
      const exit = yield* Effect.exit(handle(messageOf(n, message, targets)));

      if (Option.isNone(model.kept)) {
        model.reads += 1;
        if (message.readOk) model.kept = Option.some(inboxOf(seed, model.reads));
      }
      const where = `seed ${seed} message ${n}`;
      expect(yield* Ref.get(reads), `${where}: reads`).toBe(model.reads);
      if (Option.isNone(model.kept)) {
        expect(Exit.isFailure(exit), `${where}: a failed read fails the handler`).toBe(true);
        expect(targets, `${where}: a failed read forwards nothing`).toEqual([]);
        continue;
      }
      expect(targets, `${where}: forwarded once, to the store's inbox`).toEqual([model.kept.value]);
      if (message.forwardOk) {
        expect(Exit.isSuccess(exit), `${where}: an accepted forward succeeds`).toBe(true);
        model.forwarded += 1;
        continue;
      }
      const error = errorOf(exit);
      expect(
        Option.isSome(error) && error.value instanceof Refused && error.value.n === n,
        `${where}: a refused forward fails the handler with the forward's own error`,
      ).toBe(true);
    }
    const log = lines.join('\n');
    expect(log.split('contact.forwarded').length - 1, `seed ${seed}: one line a forward`).toBe(
      model.forwarded,
    );
    expect(log).not.toContain('@owner.example');
  });

describe('forwardContact', () => {
  it.effect(
    'forwards to the store inbox and fails, never swallows, a failed read or forward, over 50 programs',
    () =>
      Effect.gen(function* () {
        for (let seed = 1; seed <= 50; seed += 1) yield* run(seed, program(seed));
      }).pipe(Effect.provide(heard)),
  );
});
