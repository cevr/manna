/**
 * The list's keyed hashes, under a key only the Worker holds
 * (`MAIL_TOKEN_KEY`, a Worker secret), each an HMAC-SHA-256 (WebCrypto, in
 * Bun and on Workers alike):
 *
 * - A subscriber's id is the hash of its address (`idOf`): one address is
 *   always one subscriber, and the model's event log, which keeps it for
 *   good, names no one (`../list/Subscriber.id.ts`).
 * - The links in the list's emails carry a signed token, so the list stores
 *   none: the hash of the token's purpose and its subscriber's id.
 *
 * - A confirm token also names when it was issued: it works for seven days
 *   (`CONFIRM_FOR`, `../list/timing.ts`), and only while it is the newest one
 *   its subscriber was sent (the model checks that, `../list/`).
 * - An unsubscribe token never runs out: a link in an old email still works.
 *
 * The text is `c.<id>.<issued>.<signature>` or `u.<id>.<signature>`, the
 * signature in base64url, so it travels in a URL as it is.
 */
import { Context, Effect, Layer, Option, Redacted, Result } from 'effect';
import { Base64Url, Hex } from 'effect/encoding';

import { SubscriberId } from '../list/Subscriber.id.ts';
import type { Address } from './address.ts';

export type Token =
  | { readonly _tag: 'Confirm'; readonly subscriber: SubscriberId; readonly issued: number }
  | { readonly _tag: 'Unsubscribe'; readonly subscriber: SubscriberId };

/** The shortest key the Worker takes: 32 bytes, as 64 hex digits. */
const MIN_KEY_BYTES = 32;

/** Signed with every token, so a signature made for anything else never reads as one. */
const CONTEXT = 'firsttheblade-mail-v2';

/** Hashed with every address, so an id is never a token's signature, nor one a token's. */
const ID_CONTEXT = 'firsttheblade-subscriber-v1';

/** An id's length in bytes: 128 bits of the hash, 22 characters of base64url. */
const ID_BYTES = 16;

export interface TokensService {
  /** The subscriber an address is. */
  readonly idOf: (address: Address) => Effect.Effect<SubscriberId>;
  readonly sign: (token: Token) => Effect.Effect<string>;
  /** The token a text carries, when its signature is good; none for anything else. */
  readonly read: (text: string) => Effect.Effect<Option.Option<Token>>;
}

export class Tokens extends Context.Service<Tokens, TokensService>()('firsttheblade/Tokens') {}

const payloadOf = (token: Token) => {
  if (token._tag === 'Confirm') return `c.${token.subscriber}.${token.issued}`;
  return `u.${token.subscriber}`;
};

const ID = /^[A-Za-z0-9_-]{22}$/;
const TIME = /^[0-9]{1,16}$/;

/** The token a payload names, when it names one. */
const tokenOf = (payload: string): Option.Option<Token> => {
  const [purpose, id = '', issued = '', ...rest] = payload.split('.');
  if (rest.length > 0 || !ID.test(id)) return Option.none();
  if (purpose === 'u' && issued === '') {
    return Option.some({ _tag: 'Unsubscribe', subscriber: SubscriberId.make(id) });
  }
  if (purpose === 'c' && TIME.test(issued)) {
    return Option.some({
      _tag: 'Confirm',
      subscriber: SubscriberId.make(id),
      issued: Number(issued),
    });
  }
  return Option.none();
};

const bytes = (text: string, context = CONTEXT) => new TextEncoder().encode(`${context}:${text}`);

/** The key, from its hex text; a Worker given a short or malformed one cannot start. */
const importKey = (key: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const raw = Hex.decode(Redacted.value(key).trim());
    if (Result.isFailure(raw) || raw.success.length < MIN_KEY_BYTES) {
      return yield* Effect.die(
        new Error(`MAIL_TOKEN_KEY must be at least ${MIN_KEY_BYTES} bytes as hex`),
      );
    }
    const material = new Uint8Array(raw.success);
    return yield* Effect.promise(() =>
      crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
      ]),
    );
  });

export const layer = (key: Redacted.Redacted<string>) =>
  Layer.effect(
    Tokens,
    Effect.gen(function* () {
      const cryptoKey = yield* importKey(key);
      const idOf = Effect.fn('Tokens.idOf')(function* (address: Address) {
        const hash = yield* Effect.promise(() =>
          crypto.subtle.sign('HMAC', cryptoKey, bytes(address, ID_CONTEXT)),
        );
        return SubscriberId.make(Base64Url.encode(new Uint8Array(hash).slice(0, ID_BYTES)));
      });
      const sign = Effect.fn('Tokens.sign')(function* (token: Token) {
        const payload = payloadOf(token);
        const signature = yield* Effect.promise(() =>
          crypto.subtle.sign('HMAC', cryptoKey, bytes(payload)),
        );
        return `${payload}.${Base64Url.encode(new Uint8Array(signature))}`;
      });
      const read = Effect.fn('Tokens.read')(function* (text: string) {
        const cut = text.lastIndexOf('.');
        const payload = text.slice(0, cut);
        const token = tokenOf(payload);
        const written = text.slice(cut + 1);
        const signature = Base64Url.decode(written);
        if (cut < 0 || Option.isNone(token) || Result.isFailure(signature)) return Option.none();
        const signed = new Uint8Array(signature.success);
        // One text a token: the last character's unused bits must be zero,
        // as `sign` writes them.
        if (Base64Url.encode(signed) !== written) return Option.none();
        const good = yield* Effect.promise(() =>
          crypto.subtle.verify('HMAC', cryptoKey, signed, bytes(payload)),
        );
        if (!good) return Option.none();
        return token;
      });
      return Tokens.of({ idOf, sign, read });
    }),
  );
