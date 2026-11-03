import { Context, Effect, FileSystem, Layer, Path, Ref, Schema } from 'effect';

import type { Address } from './address.ts';

export const FROM = { name: 'First the Blade', email: 'films@firsttheblade.com' } as const;

export interface Letter {
  readonly to: Address;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly headers: Readonly<Record<string, string>>;
}

export class MailRefused extends Schema.TaggedError<MailRefused>()('MailRefused', {
  code: Schema.String,
}) {}

export class MailUnavailable extends Schema.TaggedError<MailUnavailable>()('MailUnavailable', {
  code: Schema.String,
}) {}

export interface MailerService {
  readonly send: (letter: Letter) => Effect.Effect<void, MailRefused | MailUnavailable>;
}

export class Mailer extends Context.Service<Mailer, MailerService>()('firsttheblade/Mailer') {}

const REFUSED_CODES: ReadonlySet<string> = new Set([
  'E_RECIPIENT_SUPPRESSED',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_DELIVERY_FAILED',
]);

export const failureOf = (code: string): MailRefused | MailUnavailable => {
  if (REFUSED_CODES.has(code)) return MailRefused.make({ code });
  return MailUnavailable.make({ code });
};

export interface MailboxService {
  readonly letters: Effect.Effect<ReadonlyArray<Letter>>;
  readonly failNext: (
    ...failures: ReadonlyArray<MailRefused | MailUnavailable>
  ) => Effect.Effect<void>;
}

export class Mailbox extends Context.Service<Mailbox, MailboxService>()('firsttheblade/Mailbox') {}

export const layerMemory = Layer.effectContext(
  Effect.gen(function* () {
    const sent = yield* Ref.make<ReadonlyArray<Letter>>([]);
    const failures = yield* Ref.make<ReadonlyArray<MailRefused | MailUnavailable>>([]);
    const send = Effect.fn('Mailer.send')(function* (letter: Letter) {
      const [failure, ...rest] = yield* Ref.get(failures);
      if (failure) {
        yield* Ref.set(failures, rest);
        return yield* failure;
      }
      yield* Ref.update(sent, (letters) => [...letters, letter]);
    });
    return Context.make(Mailer, Mailer.of({ send })).pipe(
      Context.add(
        Mailbox,
        Mailbox.of({
          letters: Ref.get(sent),
          failNext: (...next) => Ref.set(failures, next),
        }),
      ),
    );
  }),
);

export const layerOutbox = (dir: string) =>
  Layer.effect(
    Mailer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const count = yield* Ref.make(0);
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie);
      const send = Effect.fn('Mailer.send')(function* (letter: Letter) {
        const n = yield* Ref.updateAndGet(count, (value) => value + 1);
        const headers = Object.entries(letter.headers).map(([name, value]) => `${name}: ${value}`);
        const body = [
          `To: ${letter.to}`,
          `Subject: ${letter.subject}`,
          ...headers,
          '',
          letter.text,
        ];
        yield* fs
          .writeFileString(path.join(dir, `${n}.txt`), `${body.join('\n')}\n`)
          .pipe(Effect.mapError(() => MailUnavailable.make({ code: 'E_OUTBOX' })));
      });
      return Mailer.of({ send });
    }),
  );
