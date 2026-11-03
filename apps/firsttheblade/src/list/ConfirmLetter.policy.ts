/**
 * Whenever a confirm link is issued, its letter is sent. A letter that does
 * not go gives its link back, so the next sign-up issues one at once instead
 * of waiting out `RESEND_AFTER`.
 */
import * as Domain from '@alchemy.run/domain';
import { Effect } from 'effect';

import { ConfirmLinkIssued } from './SignUp.command.ts';
import { ReleaseConfirmLink } from './ConfirmLink.command.ts';
import { Postman } from './Postman.external.ts';
import { Subscriber } from './Subscriber.aggregate.ts';

export class ConfirmLetter extends Domain.Policy('ConfirmLetter', {
  from: Subscriber,
  on: [ConfirmLinkIssued],
}) {}

export const ConfirmLetterLive = ConfirmLetter.toLayer(
  Effect.gen(function* () {
    const postman = yield* Postman;
    const subscribers = yield* Subscriber;
    return Effect.fn('ConfirmLetter.send')(function* ({ source, event }) {
      const { issued, origin } = event;
      yield* postman.confirmLetter({ subscriber: source.id, issued, origin }).pipe(
        Effect.catchTag('LetterNotSent', () =>
          subscribers
            .send(source.id, ReleaseConfirmLink.make({ issued }), {
              commandId: `release-link/${source.id}/${issued}`,
            })
            .pipe(Effect.asVoid),
        ),
      );
    });
  }),
);
