import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { CliOutput } from 'effect/cli';

import { cliVersion, formatCliVersion } from '../../src/lib/version.js';

const shown = (version: string): string =>
  CliOutput.defaultFormatter({ colors: false }).formatVersion('manna', version);

describe('manna --version', () => {
  it('prints the version once with the commit the binary was built from', () => {
    expect(shown(formatCliVersion('1.0.0', Option.some('9903d13')))).toBe('manna v1.0.0 (9903d13)');
  });

  it('names a run from source as dev', () => {
    expect(shown(cliVersion())).toMatch(/^manna v\d+\.\d+\.\d+ \(dev\)$/u);
  });
});
