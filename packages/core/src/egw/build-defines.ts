/**
 * Compile-time substitution targets for EGW credentials/config.
 *
 * The CLI's compiled build replaces the `globalThis.__EGW_X__` member
 * expressions below with string literals at build time (the `define` map in
 * packages/cli/scripts/build.ts, keyed by env-define-target.ts) so the binary
 * carries credentials without needing a runtime .env file. In unbundled runs
 * (CLI from source, sync workers, tests) the globals are never defined, so the property reads
 * yield `undefined` and we fall through to `process.env` — Bun auto-loads the
 * sibling `.env`, so node-side code keeps working unchanged.
 *
 * IMPORTANT: keep every read as a literal `globalThis.__EGW_X__` member
 * expression. Bundlers must see that exact source text to substitute.
 * Indirection (helpers, destructuring, renames) breaks the substitution.
 */

import { Option } from 'effect';

declare global {
  /** Populated by bundler `define`s; absent (undefined) in Node-hosted runs. */
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
