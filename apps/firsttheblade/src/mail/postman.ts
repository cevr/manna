import { Effect, Option } from 'effect';

import { LetterNotSent, Postman } from '../list/Postman.external.ts';
import { Addresses } from './addresses.ts';
import { confirmLetter } from './letters.ts';
import { logMail, warnMail } from './log.ts';
import { Mailer } from './mailer.ts';
import { Tokens } from './tokens.ts';

export const layerPostman = Postman.toLayer(
  Effect.gen(function* () {
    const addresses = yield* Addresses;
    const tokens = yield* Tokens;
    const mailer = yield* Mailer;
    return {
      confirmLetter: Effect.fn('Postman.confirmLetter')(function* ({ subscriber, issued, origin }) {
        const notSent = (reason: string) =>
          warnMail('subscribe.unsent', { subscriber, reason }).pipe(
            Effect.andThen(Effect.fail(LetterNotSent.make({ reason }))),
          );
        const found = yield* addresses
          .find(subscriber)
          .pipe(Effect.catchTag('SqlError', (failure) => notSent(failure.statement)));
        if (Option.isNone(found)) return yield* notSent('no address');
        const token = yield* Effect.suspend(() =>
          tokens.sign({ _tag: 'Confirm', subscriber, issued }),
        ).pipe(Effect.catchDefect(() => notSent('defect')));
        yield* mailer
          .send(confirmLetter(found.value, origin, token))
          .pipe(Effect.catch((failure) => notSent(failure.code)));
        yield* logMail('subscribe.mailed', { subscriber });
        return {};
      }),
    };
  }),
);
