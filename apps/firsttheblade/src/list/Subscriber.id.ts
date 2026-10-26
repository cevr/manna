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
