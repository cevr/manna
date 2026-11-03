import { Option, Result, Schema, SchemaTransformation } from 'effect';

import { parseHref } from './location.js';

export const Raw = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type Raw = typeof Raw.Type;

export const UrlParts = Schema.Struct({
  path: Schema.Array(Schema.String),
  query: Raw,
  hash: Raw,
});
export type UrlParts = typeof UrlParts.Type;

export const decodeComponent = (text: string): Result.Result<string, string> =>
  Result.mapError(
    Result.try(() => decodeURIComponent(text)),
    () => text,
  );

const decodedOrAsWritten = (text: string): string => Result.merge(decodeComponent(text));

const encodeKeeping =
  (kept: RegExp) =>
  (text: string): string =>
    encodeURIComponent(text).replace(kept, decodeURIComponent);

const encodeSegment = encodeKeeping(/%3A|%40|%2C/gi);
const encodeHashPart = encodeKeeping(/%2C|%3A|%2F|%40/gi);

const collect = (entries: Iterable<readonly [string, string]>): Raw => {
  const record = new Map<string, string[]>();
  for (const [key, value] of entries) record.set(key, [...(record.get(key) ?? []), value]);
  return Object.fromEntries(record);
};

const splitHash = (hash: string): Array<readonly [string, string]> =>
  hash
    .replace(/^#/, '')
    .split('&')
    .filter((part) => part !== '')
    .map((part) => {
      const at = part.indexOf('=');
      if (at === -1) return [decodedOrAsWritten(part), ''] as const;
      return [
        decodedOrAsWritten(part.slice(0, at)),
        decodedOrAsWritten(part.slice(at + 1)),
      ] as const;
    });

const entriesOf = (record: Raw): Array<readonly [string, string]> =>
  Object.entries(record).flatMap(([key, values]) => values.map((value) => [key, value] as const));

const segmentsOf = (pathname: string): ReadonlyArray<string> => {
  if (pathname === '/') return [];
  return pathname.split('/').slice(1).map(decodedOrAsWritten);
};

const toParts = (href: string): UrlParts => {
  const url = parseHref(href);
  return {
    path: segmentsOf(url.pathname),
    query: collect(url.searchParams),
    hash: collect(splitHash(url.hash)),
  };
};

const toHref = (parts: UrlParts): string => {
  const path = `/${parts.path.map(encodeSegment).join('/')}`;
  const query = new URLSearchParams();
  for (const [key, value] of entriesOf(parts.query)) query.append(key, value);
  const search = query.toString();
  const hash = entriesOf(parts.hash)
    .map(([key, value]) => `${encodeHashPart(key)}=${encodeHashPart(value)}`)
    .join('&');
  return `${path}${prefixed('?', search)}${prefixed('#', hash)}`;
};

const prefixed = (delimiter: string, text: string): string =>
  Option.match(
    Option.liftPredicate(text, (part) => part !== ''),
    {
      onNone: () => '',
      onSome: (part) => `${delimiter}${part}`,
    },
  );

export const UrlPartsFromHref = Schema.String.pipe(
  Schema.decodeTo(UrlParts, SchemaTransformation.transform({ decode: toParts, encode: toHref })),
);

export const printHref: (parts: UrlParts) => string = Schema.encodeSync(UrlPartsFromHref);

export const readHref: (href: string) => UrlParts = Schema.decodeSync(UrlPartsFromHref);
