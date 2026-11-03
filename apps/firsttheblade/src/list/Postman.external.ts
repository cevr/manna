import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { Millis, Origin, SubscriberId } from './Subscriber.id.ts';

export class LetterNotSent extends Schema.TaggedError<LetterNotSent>()('LetterNotSent', {
  reason: Schema.String,
}) {}

export class Postman extends Domain.ExternalSystem('Postman', {
  confirmLetter: {
    args: { subscriber: SubscriberId, issued: Millis, origin: Origin },
    success: {},
    error: LetterNotSent,
  },
}) {}
