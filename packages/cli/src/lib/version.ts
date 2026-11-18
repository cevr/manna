import { Option } from 'effect';

import cliPackage from '../../package.json' with { type: 'json' };

/** Set by `scripts/build.ts` through a `globalThis.__MANNA_CLI_COMMIT__` define; absent from source. */
type CliBuildGlobals = { readonly __MANNA_CLI_COMMIT__?: string };

const buildCommit = (): Option.Option<string> =>
  Option.fromNullishOr((globalThis as CliBuildGlobals).__MANNA_CLI_COMMIT__);

/** The text `--version` shows after the CLI's name: `<version> (<commit>)`,
 *  with `dev` for a run from source. Effect's formatter adds the `v`, so the
 *  version carries none. */
export const cliVersion = (commit: Option.Option<string> = buildCommit()): string =>
  `${cliPackage.version} (${Option.getOrElse(commit, () => 'dev')})`;
