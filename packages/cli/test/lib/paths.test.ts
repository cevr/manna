import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { dataCandidates, getDataPath, resolveDataPath } from '../../src/lib/paths.js';

describe('CLI install-owned data paths', () => {
  it('derives the topics artifact from the CLI root, not the caller cwd', () => {
    expect(getDataPath('/opt/bible-cli', 'topics.db')).toBe('/opt/bible-cli/data/topics.db');
  });

  it('joins nested segments under the data directory', () => {
    expect(getDataPath('/opt/bible-cli', 'nested', 'tokens.json')).toBe(
      '/opt/bible-cli/data/nested/tokens.json',
    );
  });

  it('returns the data directory itself when no segments are given', () => {
    expect(getDataPath('/opt/bible-cli')).toBe('/opt/bible-cli/data');
  });
});

describe('moved-binary data resolution', () => {
  const BUILD_ROOT = '/Users/builder/checkout/packages/cli';

  it('prefers the data directory beside the executable', () => {
    const resolved = resolveDataPath(
      {
        executableDir: '/usr/local/lib/bible/bin',
        buildRoot: Option.some(BUILD_ROOT),
        exists: () => true,
      },
      'topics.db',
    );
    expect(resolved).toBe('/usr/local/lib/bible/bin/data/topics.db');
  });

  it('never reaches the build root once the binary carries its own data', () => {
    expect(
      dataCandidates(
        { executableDir: '/usr/local/lib/bible/bin', buildRoot: Option.some(BUILD_ROOT) },
        'topics.db',
      ),
    ).toEqual(['/usr/local/lib/bible/bin/data/topics.db', `${BUILD_ROOT}/data/topics.db`]);
  });

  it('falls back to the build root in dev, where no data sits beside bun', () => {
    const resolved = resolveDataPath(
      {
        executableDir: '/Users/dev/.bun/bin',
        buildRoot: Option.some(BUILD_ROOT),
        exists: (candidate) => candidate === `${BUILD_ROOT}/data/topics.db`,
      },
      'topics.db',
    );
    expect(resolved).toBe(`${BUILD_ROOT}/data/topics.db`);
  });

  it('reports the exe-adjacent path when the artifact is nowhere', () => {
    const resolved = resolveDataPath(
      {
        executableDir: '/usr/local/lib/bible/bin',
        buildRoot: Option.some(BUILD_ROOT),
        exists: () => false,
      },
      'topics.db',
    );
    expect(resolved).toBe('/usr/local/lib/bible/bin/data/topics.db');
  });

  it('offers only the exe-adjacent path when there is no build root', () => {
    expect(
      dataCandidates(
        { executableDir: '/usr/local/lib/bible/bin', buildRoot: Option.none() },
        'topics.db',
      ),
    ).toEqual(['/usr/local/lib/bible/bin/data/topics.db']);
  });
});
