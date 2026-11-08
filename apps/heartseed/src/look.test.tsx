/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noGlobals, effect/noNodeBuiltinImport -- a React hook test: it mounts a probe in happy-dom's document through React's promise-based `act`, flips happy-dom's system appearance between renders one after another, and names the absent schemes React Native can report; its guard reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The scheme and the themed styles (`src/look.tsx`): every value React
 * Native's `useColorScheme` can return reads as dark for `dark` and light
 * for anything else; a probe drawn by `useScheme` and `useThemed` follows a
 * flip of the system each way in its next render, with no tap; and
 * `themed` builds each scheme's value once, at its call, so a render picks
 * a value built before it. The guard holds every colour and face to
 * `src/theme.ts`: no other product file names a colour literal or a font
 * family.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
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

/** The product sources a screen may paint from: `src` and `app`, TypeScript. */
const SOURCES = new Bun.Glob('{src,app}/**/*.{ts,tsx}');
const ROOT = `${import.meta.dir}/..`;
/** What the guard leaves out: tests and their rigs, dev probes (their own colours, never the reader's), the prototypes, the route types One writes, and the theme itself. */
const OUTSIDE =
  /\.test\.tsx?$|\.d\.ts$|^src\/test\/|^app\/probe\/|^(src|app)\/prototype\/|^src\/theme\.ts$/u;
/** A colour literal (hex, rgb, hsl, white or black) or a font family. */
const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|['"](white|black)['"]|fontFamily\s*:\s*['"]|\bGeorgia\b/u;
const DOC = /^\s*(\*|\/\/|\/\*)/u;

/** The lines of `text` that name a colour or a face, outside doc comments, as `<line> <the line's first characters>`. */
const literalsIn = (text: string) =>
  text
    .split('\n')
    .map((line, at) => ({ line, at: at + 1 }))
    .filter(({ line }) => LITERAL.test(line) && !DOC.test(line))
    .map(({ line, at }) => `${at} ${line.trim().slice(0, 48)}`);

describe('no colour or face outside the theme', () => {
  it('finds a hex, rgb, hsl, white or black colour, a font family or Georgia in a line, and passes a role, a doc line and the face by name', () => {
    const lines = [
      "backgroundColor: '#fff',",
      "color: 'rgba(0, 0, 0, 0.5)',",
      "borderColor: 'hsl(120, 50%, 50%)',",
      "shadowColor: 'black',",
      "fontFamily: 'Georgia',",
      'const serif = Georgia;',
      'color: roles.ink,',
      ' * the ground, #f1f0e6 in light',
      'fontFamily: each,',
    ];
    expect(lines.map((line) => literalsIn(line).length)).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('holds every product file in src and app, less tests, rigs, probes, prototypes and src/theme.ts, to no colour literal or font family', () => {
    const files = [...SOURCES.scanSync(ROOT)].filter((file) => !OUTSIDE.test(file));
    expect(files).toEqual(
      expect.arrayContaining(['app/index.tsx', 'src/sayit/draw.tsx', 'src/look.tsx']),
    );
    const found = files.flatMap((file) =>
      literalsIn(readFileSync(`${ROOT}/${file}`, 'utf8')).map((hit) => `${file}:${hit}`),
    );
    expect(found).toEqual([]);
  });
});
