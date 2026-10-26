/**
 * The letters the model asks to be sent. The server implements it: it looks
 * the address up in the address book, signs the link, and hands the letter
 * to the mailer (`../mail/mailer.ts`). The model never sees an address or a
 * token.
 */
import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { Millis, Origin, SubscriberId } from './Subscriber.id.ts';

/** The letter did not go: the mailer could not take it, or the address is not in the book. */
export class LetterNotSent extends Schema.TaggedError<LetterNotSent>()('LetterNotSent', {
  reason: Schema.String,
}) {}

export class Postman extends Domain.ExternalSystem('Postman', {
  /** Sends the confirm letter whose link was issued at `issued`, its links to `origin`. */
  confirmLetter: {
    args: { subscriber: SubscriberId, issued: Millis, origin: Origin },
    success: {},
    error: LetterNotSent,
  },
}) {}
