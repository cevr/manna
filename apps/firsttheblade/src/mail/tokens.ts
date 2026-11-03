import { Context, Effect, Layer, Option, Redacted, Result } from 'effect';
import { Base64Url, Hex } from 'effect/encoding';

import { SubscriberId } from '../list/Subscriber.id.ts';
import type { Address } from './address.ts';

export type Token =
  | { readonly _tag: 'Confirm'; readonly subscriber: SubscriberId; readonly issued: number }
  | { readonly _tag: 'Unsubscribe'; readonly subscriber: SubscriberId };

const MIN_KEY_BYTES = 32;

const CONTEXT = 'firsttheblade-mail-v2';

const ID_CONTEXT = 'firsttheblade-subscriber-v1';

const ID_BYTES = 16;

export interface TokensService {
  readonly idOf: (address: Address) => Effect.Effect<SubscriberId>;
  readonly sign: (token: Token) => Effect.Effect<string>;
  readonly read: (text: string) => Effect.Effect<Option.Option<Token>>;
}

export class Tokens extends Context.Service<Tokens, TokensService>()('firsttheblade/Tokens') {}

const payloadOf = (token: Token) => {
  if (token._tag === 'Confirm') return `c.${token.subscriber}.${token.issued}`;
  return `u.${token.subscriber}`;
};

const ID = /^[A-Za-z0-9_-]{22}$/;
const TIME = /^[0-9]{1,16}$/;

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
