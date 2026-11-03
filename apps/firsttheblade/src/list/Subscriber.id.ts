import { Schema } from 'effect';

export const SubscriberId = Schema.String.pipe(Schema.brand('SubscriberId'));
export type SubscriberId = typeof SubscriberId.Type;

export const FilmRef = Schema.String;

export const Millis = Schema.Int;

export const Origin = Schema.String;

export const Letter = Schema.Literals(['sending', 'sent', 'refused']);
export type Letter = typeof Letter.Type;

export const Letters = Schema.Record(FilmRef, Letter);
export type Letters = typeof Letters.Type;
