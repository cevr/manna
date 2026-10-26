/**
 * A subscriber's id: opaque, never the address. The server derives it from
 * the address (a keyed hash), so one address is always one subscriber and
 * one writer, and the model's event log names no one. The address lives
 * outside the model, in the address book (`./AddressBook.ts`), where it can
 * be deleted.
 */
import { Schema } from 'effect';

export const SubscriberId = Schema.String.pipe(Schema.brand('SubscriberId'));
export type SubscriberId = typeof SubscriberId.Type;

/** `<series id>/<no>`, the key a film's letters are kept under (`../mail/films.ts`). */
export const FilmRef = Schema.String;

/** Epoch milliseconds. */
export const Millis = Schema.Int;

/** The site a sign-up was made at, so its letter's links lead back there. */
export const Origin = Schema.String;

/** A film's letter to one subscriber: being sent (or unsure, if never settled), sent, or refused for good. */
export const Letter = Schema.Literals(['sending', 'sent', 'refused']);
export type Letter = typeof Letter.Type;

/** A subscriber's letters, by film. */
export const Letters = Schema.Record(FilmRef, Letter);
export type Letters = typeof Letters.Type;
