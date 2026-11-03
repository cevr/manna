import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { FilmRef, SubscriberId } from './Subscriber.id.ts';

export class FilmLetterClaimed extends Domain.Event('FilmLetterClaimed', { film: FilmRef }) {}

export class ClaimFilmLetter extends Domain.Command('ClaimFilmLetter', {
  target: SubscriberId,
  input: { film: FilmRef },
  events: [FilmLetterClaimed],
  rejects: [],
  reply: { claimed: Schema.Boolean },
}) {}

export class FilmLetterReleased extends Domain.Event('FilmLetterReleased', { film: FilmRef }) {}

export class ReleaseFilmLetter extends Domain.Command('ReleaseFilmLetter', {
  target: SubscriberId,
  input: { film: FilmRef },
  events: [FilmLetterReleased],
  rejects: [],
}) {}

export class FilmLetterSent extends Domain.Event('FilmLetterSent', { film: FilmRef }) {}

export class FilmLetterRefused extends Domain.Event('FilmLetterRefused', { film: FilmRef }) {}

export class SettleFilmLetter extends Domain.Command('SettleFilmLetter', {
  target: SubscriberId,
  input: { film: FilmRef, outcome: Schema.Literals(['sent', 'refused']) },
  events: [FilmLetterSent, FilmLetterRefused],
  rejects: [],
}) {}
