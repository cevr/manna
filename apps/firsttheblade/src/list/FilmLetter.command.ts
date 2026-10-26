/**
 * A film's letter to one subscriber: claimed before it is sent, its outcome
 * kept after. A subscriber is sent each film once, even after leaving and
 * coming back. A claim never given back nor settled stays claimed: its letter
 * may have gone, so it is never sent again.
 */
import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { FilmRef, SubscriberId } from './Subscriber.id.ts';

export class FilmLetterClaimed extends Domain.Event('FilmLetterClaimed', { film: FilmRef }) {}

/** Claim the film's letter, while the subscriber is confirmed and was never sent it. */
export class ClaimFilmLetter extends Domain.Command('ClaimFilmLetter', {
  target: SubscriberId,
  input: { film: FilmRef },
  events: [FilmLetterClaimed],
  rejects: [],
  /** Whether this command took the claim. */
  reply: { claimed: Schema.Boolean },
}) {}

export class FilmLetterReleased extends Domain.Event('FilmLetterReleased', { film: FilmRef }) {}

/** Give a claim back when its letter could not go now, so a later try sends it. */
export class ReleaseFilmLetter extends Domain.Command('ReleaseFilmLetter', {
  target: SubscriberId,
  input: { film: FilmRef },
  events: [FilmLetterReleased],
  rejects: [],
}) {}

export class FilmLetterSent extends Domain.Event('FilmLetterSent', { film: FilmRef }) {}

/** The sender refused the letter for good. */
export class FilmLetterRefused extends Domain.Event('FilmLetterRefused', { film: FilmRef }) {}

/** Keep a claimed letter's outcome. */
export class SettleFilmLetter extends Domain.Command('SettleFilmLetter', {
  target: SubscriberId,
  input: { film: FilmRef, outcome: Schema.Literals(['sent', 'refused']) },
  events: [FilmLetterSent, FilmLetterRefused],
  rejects: [],
}) {}
