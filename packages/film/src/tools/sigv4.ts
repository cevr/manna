import { Mac } from 'effect/crypto';

import { DateTime, Effect, Order, Redacted } from 'effect';
import { Hex } from 'effect/encoding';
import { sha256Hex } from './digest.ts';

export interface S3Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: Redacted.Redacted<string>;
}

export interface S3Request {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly query: ReadonlyArray<readonly [string, string]>;
  readonly headers: Readonly<Record<string, string>>;
  readonly payloadHash: string;
}

export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const text = new TextEncoder();

export const uriEncode = (value: string, slash: boolean): string =>
  Array.from(text.encode(value), (byte) => {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(char)) return char;
    if (slash && char === '/') return char;
    return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }).join('');

export const encodeKey = (key: string): string => uriEncode(key, true);

export const hmacSha256 = Effect.fnUntraced(function* (
  crypto: Mac.Mac['Service'],
  key: Uint8Array,
  message: Uint8Array,
) {
  return yield* crypto.sign(yield* Mac.key(Mac.hmacSha256, key), message);
});

const amzDate = (at: DateTime.Utc): string =>
  DateTime.formatIso(at)
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(/[-:]/g, '');

const canonicalRequest = (request: S3Request, stamp: string): string => {
  const headers = Object.entries({
    ...Object.fromEntries(
      Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    host: request.host,
    'x-amz-content-sha256': request.payloadHash,
    'x-amz-date': stamp,
  }).toSorted(Order.mapInput(Order.String, ([name]: readonly [string, string]) => name));
  const names = headers.map(([name]) => name);
  const query = request.query
    .map(([k, v]) => `${uriEncode(k, false)}=${uriEncode(v, false)}`)
    .toSorted()
    .join('&');
  return [
    request.method,
    request.path,
    query,
    ...headers.map(([name, value]) => `${name}:${value}`),
    '',
    names.join(';'),
    request.payloadHash,
  ].join('\n');
};

export const signS3 = Effect.fnUntraced(function* (
  crypto: Mac.Mac['Service'],
  credentials: S3Credentials,
  region: string,
  request: S3Request,
  at: DateTime.Utc,
) {
  const stamp = amzDate(at);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const canonical = canonicalRequest(request, stamp);
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonical)].join('\n');
  let key: Uint8Array = text.encode(`AWS4${Redacted.value(credentials.secretAccessKey)}`);
  for (const part of [day, region, 's3', 'aws4_request'])
    key = yield* hmacSha256(crypto, key, text.encode(part));
  const signature = Hex.encode(yield* hmacSha256(crypto, key, text.encode(toSign)));
  const signed = canonical.split('\n').at(-2) ?? '';
  return {
    'x-amz-date': stamp,
    'x-amz-content-sha256': request.payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  };
});
