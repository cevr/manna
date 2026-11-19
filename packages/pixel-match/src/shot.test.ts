import { describe, expect, test } from 'bun:test';

import type { Cell, Row } from './model.ts';
import { iosCommand, webCommand } from './command.ts';

const row: Row = {
  id: 'about.page',
  unit: 'pm-tokens',
  kind: 'match',
  one: { steps: [] },
  exact: { ops: ['tap gear', 'tap about-row'] },
};

const cell = (size: string, scheme: Cell['scheme'] = 'dark'): Cell => ({
  app: 'hymnal',
  host: 'web',
  id: 'about.page',
  scheme,
  size,
});

describe("the port's web cell", () => {
  const RESET = ['--storage', 'pm-about.page', '--reset-storage'];
  const files = { screen: 'screen.png', reference: 'ref.png' };

  test("is the agent's web drive at the reference's viewport, at Chrome's own device scale, in the cell's scheme, on the store its flags name", () => {
    const phone = webCommand(row, cell('390x844@2'), files, RESET);
    expect(phone.env).toEqual({ EXACT_SCALE: '2' });
    expect(phone.argv.slice(0, 13)).toEqual([
      'bun',
      'run',
      'exact',
      'agent',
      'web',
      '--json',
      '--size',
      '390x844',
      '--storage',
      'pm-about.page',
      '--reset-storage',
      'prefer prefers-color-scheme dark',
      'clock settle',
    ]);
    expect(phone.argv.slice(13)).toEqual([
      'tap gear',
      'tap about-row',
      'clock settle',
      'screenshot screen.png compare ref.png',
    ]);
    const desk = webCommand(row, cell('1280x800@1', 'light'), files, RESET);
    expect([desk.env, desk.argv[7], desk.argv[11]]).toEqual([
      { EXACT_SCALE: '1' },
      '1280x800',
      'prefer prefers-color-scheme light',
    ]);
  });

  test('a seeded store is kept, and its states are read back before the row’s ops can change them', () => {
    const argv = webCommand(
      row,
      cell('390x844@2'),
      files,
      ['--port', '8777', '--storage', 'pm-about.page', '--keep-storage'],
      ['settingsFeelKept', 'recentList'],
    ).argv;
    expect(argv).not.toContain('--reset-storage');
    expect(argv.slice(8, 16)).toEqual([
      '--port',
      '8777',
      '--storage',
      'pm-about.page',
      '--keep-storage',
      'prefer prefers-color-scheme dark',
      'clock settle',
      'state settingsFeelKept',
    ]);
    expect(argv.slice(16, 18)).toEqual(['state recentList', 'tap gear']);
  });

  test("takes the row's web ops where they differ from the iOS ones", () => {
    const web = { ...row, exact: { ops: ['tap gear'], web: { ops: ['tap about-link'] } } };
    expect(webCommand(web, cell('390x844@2'), files, RESET).argv.slice(13, -2)).toEqual([
      'tap about-link',
    ]);
  });
});

describe("the port's iOS cell", () => {
  const ios: Cell = {
    app: 'hymnal',
    host: 'ios',
    id: 'player.full',
    scheme: 'light',
    size: 'large',
  };
  const files = { screen: 's.png', reference: 'r.png' };
  const clock = { epoch: 1_700_000_000_000, timeZone: 'America/Toronto' };
  const RESET = ['--storage', 'pm-about.page', '--reset-storage'];

  test('delivers taps and drags as real touches only where the row asks', () => {
    const touched = {
      ...row,
      exact: { ops: ['tap player-title drag 0 -420'], touch: 'platform' as const },
    };
    const argv = iosCommand(touched, ios, files, clock, RESET);
    expect(argv.slice(argv.indexOf('--touch'), argv.indexOf('--touch') + 2)).toEqual([
      '--touch',
      'platform',
    ]);
    expect(argv.indexOf('--touch')).toBeLessThan(argv.indexOf('prefer prefers-color-scheme light'));
    expect(iosCommand(row, ios, files, clock, RESET)).not.toContain('--touch');
  });

  test('opens the store its storage flags name, before the scheme, and ends on the edges and the window compared', () => {
    const banded = {
      ...row,
      keyboard: true as const,
      exact: { ops: ['tap gear'], band: { top: 'about-name', bottom: 'about-scroll' } },
    };
    const seeded = iosCommand(banded, ios, files, clock, [
      '--storage',
      'pm-about.page',
      '--keep-storage',
    ]);
    expect(seeded).toContain('--keep-storage');
    expect(seeded.slice(-6)).toEqual([
      'tap gear',
      'clock settle',
      'layout about-name',
      'layout',
      'state keyboard',
      'screenshot s.png window compare r.png',
    ]);
    expect(iosCommand(row, ios, files, clock, RESET)).toContain('--reset-storage');
  });
});
