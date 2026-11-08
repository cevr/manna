/**
 * The contact address's mail. Email Routing's rule hands a message to
 * `CONTACT` to the Site Worker (`../worker/domain.ts`), which forwards it to
 * the owner's inbox: the store secret `MAIL_FORWARD_TO`, read at the first
 * message and kept once read (`../worker/mail.ts`). A failed read or a
 * refused forward is the handler's failure, which Cloudflare answers with a
 * temporary SMTP failure, so the sender keeps the message and tries again.
 */
import { Context, Effect, Redacted } from 'effect';

import { logMail } from './log.ts';

/** The owner's inbox the contact address forwards to, read when a message asks it. */
export class ContactInbox extends Context.Service<
  ContactInbox,
  Effect.Effect<Redacted.Redacted<string>>
>()('firsttheblade/ContactInbox') {}

/** What the handler needs of an incoming message: Alchemy's `ForwardableEmailMessage` is one. */
export interface Forwardable<E> {
  readonly forward: (rcptTo: string) => Effect.Effect<void, E>;
}

/**
 * The handler of a message to the contact address: it forwards the message
 * to `inbox` and catches nothing, so every failure reaches the sender as a
 * retry. Building it reads nothing; the log line names no address.
 */
export const forwardContact =
  (inbox: Effect.Effect<Redacted.Redacted<string>>) =>
  <E>(message: Forwardable<E>): Effect.Effect<void, E> =>
    Effect.gen(function* () {
      const to = yield* inbox;
      yield* message.forward(Redacted.value(to));
      yield* logMail('contact.forwarded');
    });
