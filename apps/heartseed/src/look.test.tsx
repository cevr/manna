/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- a React hook test: it mounts a probe in happy-dom's document through React's promise-based `act`, flips happy-dom's system appearance between renders one after another, and names the absent schemes React Native can report. */

/**
 * The scheme and the themed styles (`src/look.tsx`): every value React
 * Native's `useColorScheme` can return reads as dark for `dark` and light
 * for anything else; a probe drawn by `useScheme` and `useThemed` follows a
 * flip of the system each way in its next render, with no tap; and
 * `themed` builds each scheme's value once, at its call, so a render picks
 * a value built before it.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';

import { schemeOf, themed, useScheme, useThemed } from './look';
import { setSystem } from './test/look';
import { face, theme, type Roles, type Scheme } from './theme';

describe('the scheme', () => {
  it('reads dark for `dark` and light for `light`, none, undefined or any other name', () => {
    const names = ['light', 'dark', null, undefined, 'unspecified', 'Dark', 'no-preference', ''];
    expect(names.map((name) => `${String(name)}=${schemeOf(name)}`)).toEqual([
      'light=light',
      'dark=dark',
      'null=light',
      'undefined=light',
      'unspecified=light',
      'Dark=light',
      'no-preference=light',
      '=light',
    ]);
  });
});

describe('themed styles', () => {
  it('builds each scheme once, over its roles and the face, at the call', () => {
    const built: string[] = [];
    const sheets = themed((roles: Roles, each: string) => {
      built.push(`${roles.ground} ${each}`);
      return { ground: roles.ground };
    });
    expect({ built, sheets }).toEqual({
      built: [`${theme.light.ground} ${face}`, `${theme.dark.ground} ${face}`],
      sheets: { light: { ground: theme.light.ground }, dark: { ground: theme.dark.ground } },
    });
  });

  it('draws in the system’s scheme and follows each flip of it at once, with no style built per render', async () => {
    let builds = 0;
    const sheets = themed((roles: Roles) => {
      builds += 1;
      return { color: roles.ink };
    });
    const seen: { scheme: Scheme; sheet: { color: string } }[] = [];
    function Probe() {
      const scheme = useScheme();
      const sheet = useThemed(sheets);
      seen.push({ scheme, sheet });
      return <Text style={sheet}>{scheme}</Text>;
    }
    setSystem('dark');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));
    const shown: string[] = [host.textContent ?? ''];
    for (const scheme of ['light', 'dark', 'light'] as const) {
      await act(async () => setSystem(scheme));
      shown.push(host.textContent ?? '');
    }
    await act(async () => root.unmount());
    host.remove();
    setSystem('light');
    expect({
      shown,
      builds,
      sheets: seen.every((each) => each.sheet === sheets[each.scheme]),
      last: seen.at(-1)?.sheet.color,
    }).toEqual({
      shown: ['dark', 'light', 'dark', 'light'],
      builds: 2,
      sheets: true,
      last: theme.light.ink,
    });
  });
});
