import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { dataCandidates, getCliRoot, getDataPath, resolveDataPath } from '../../src/lib/paths.js';

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

describe('CLI root', () => {
  it('is the checkout package a compiled binary sits in, wherever it was built', () => {
    expect(
      getCliRoot({ executablePath: '/Users/me/manna/packages/cli/bin/manna', compiled: true }),
    ).toBe('/Users/me/manna/packages/cli');
  });

  it('is the source package when run by bun from source', () => {
    expect(getCliRoot({ executablePath: '/Users/me/.bun/bin/bun', compiled: false })).toBe(
      new URL('../..', import.meta.url).pathname.replace(/\/$/u, ''),
    );
  });
});

/** A binary that is copied, installed into a prefix or shipped to another
 *  machine reads the data that travels with it. These assert the resolution
 *  order: exe-adjacent first, the install root's `data/` after. */
describe('moved-binary data resolution', () => {
  const INSTALL_ROOT = '/usr/local/lib/bible';

  it('prefers the data directory beside the executable', () => {
    const resolved = resolveDataPath(
      {
        executableDir: '/usr/local/lib/bible/bin',
        installRoot: Option.some(INSTALL_ROOT),
        exists: () => true,
      },
      'topics.db',
    );
    expect(resolved).toBe('/usr/local/lib/bible/bin/data/topics.db');
  });

  it('lists the install root after the executable directory', () => {
    expect(
      dataCandidates(
        { executableDir: '/usr/local/lib/bible/bin', installRoot: Option.some(INSTALL_ROOT) },
        'topics.db',
      ),
    ).toEqual(['/usr/local/lib/bible/bin/data/topics.db', `${INSTALL_ROOT}/data/topics.db`]);
  });

  it("falls back to the install root's data when none sits beside the binary", () => {
    const resolved = resolveDataPath(
      {
        executableDir: '/usr/local/lib/bible/bin',
        installRoot: Option.some(INSTALL_ROOT),
        exists: (candidate) => candidate === `${INSTALL_ROOT}/data/topics.db`,
      },
      'topics.db',
    );
    expect(resolved).toBe(`${INSTALL_ROOT}/data/topics.db`);
  });

  it('reports the exe-adjacent path when the artifact is nowhere', () => {
    const resolved = resolveDataPath(
      {
        executableDir: '/usr/local/lib/bible/bin',
        installRoot: Option.some(INSTALL_ROOT),
        exists: () => false,
      },
      'topics.db',
    );
    expect(resolved).toBe('/usr/local/lib/bible/bin/data/topics.db');
  });

  it('offers only the exe-adjacent path when running from source', () => {
    expect(
      dataCandidates(
        { executableDir: '/usr/local/lib/bible/bin', installRoot: Option.none() },
        'topics.db',
      ),
    ).toEqual(['/usr/local/lib/bible/bin/data/topics.db']);
  });
});
