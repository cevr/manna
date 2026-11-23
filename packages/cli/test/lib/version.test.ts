import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { CliOutput } from 'effect/cli';

import cliPackage from '../../package.json' with { type: 'json' };
import { cliVersion } from '../../src/lib/version.js';

const shown = (version: string): string =>
  CliOutput.defaultFormatter({ colors: false }).formatVersion('manna', version);

describe('manna --version', () => {
  it('prints the version once with the commit the binary was built from', () => {
    expect(shown(cliVersion(Option.some('9903d13')))).toBe(
      `manna v${cliPackage.version} (9903d13)`,
    );
  });

  it('names a run from source as dev', () => {
    expect(shown(cliVersion())).toBe(`manna v${cliPackage.version} (dev)`);
  });
});
