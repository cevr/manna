import { Option } from 'effect';

declare global {
  var __EGW_AUTH_BASE_URL__: string;
  var __EGW_API_BASE_URL__: string;
  var __EGW_CLIENT_ID__: string;
  var __EGW_CLIENT_SECRET__: string;
  var __EGW_SCOPE__: string;
  var __EGW_USER_AGENT__: string;
}

const nonEmpty = (value: string): Option.Option<string> => {
  if (value === '') return Option.none();
  return Option.some(value);
};

const baked = (value: string): Option.Option<string> =>
  Option.fromNullishOr(value).pipe(Option.flatMap(nonEmpty));

export const envVar = (key: string): Option.Option<string> =>
  Option.fromNullishOr(globalThis.process).pipe(
    Option.flatMap((proc) => Option.fromNullishOr(proc.env[key])),
    Option.flatMap(nonEmpty),
  );

export const bakedAuthBaseUrl = (): Option.Option<string> =>
  baked(globalThis.__EGW_AUTH_BASE_URL__);

export const bakedApiBaseUrl = (): Option.Option<string> => baked(globalThis.__EGW_API_BASE_URL__);

export const bakedClientId = (): Option.Option<string> => baked(globalThis.__EGW_CLIENT_ID__);

export const bakedClientSecret = (): Option.Option<string> =>
  baked(globalThis.__EGW_CLIENT_SECRET__);

export const bakedScope = (): Option.Option<string> => baked(globalThis.__EGW_SCOPE__);

export const bakedUserAgent = (): Option.Option<string> => baked(globalThis.__EGW_USER_AGENT__);
