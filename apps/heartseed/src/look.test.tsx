/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noGlobals, effect/noNodeBuiltinImport -- a React hook test: it mounts a probe in happy-dom's document through React's promise-based `act`, flips happy-dom's system appearance between renders one after another, and names the absent schemes React Native can report; its guard reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The scheme and the themed styles (`src/look.tsx`): every value React
 * Native's `useColorScheme` can return reads as dark for `dark` and light
 * for anything else; a probe drawn by `useScheme` and `useThemed` follows a
 * flip of the system each way in its next render, with no tap; and
 * `themed` builds each scheme's value once, at its call, so a render picks
 * a value built before it. The guard holds every colour and face to
 * `src/theme.ts`: no other product file holds a string React Native reads
 * as a colour (`src/test/colours.ts`), or a font family. Its reader is
 * checked over generated sources whose generator knows which of its
 * fragments are colour values.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';

import { schemeOf, themed, useScheme, useThemed } from './look';
import { coloursIn, guarded } from './test/colours';
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

/** The app's TypeScript the guard may read: its product folders and its root, listed from the disk around this file. */
const SOURCES = [
  new Bun.Glob('{src,app,vite,scripts,infra}/**/*.{ts,tsx}'),
  new Bun.Glob('*.{ts,tsx}'),
];
const ROOT = `${import.meta.dir}/..`;
/** A font family by a literal name, or the serif the brand left. */
const FACE = /fontFamily\s*:\s*['"`]|\bGeorgia\b/u;
const DOC = /^\s*(\*|\/\/|\/\*)/u;

/** The lines of `text` that name a face, outside comment lines, as `<line> <the line's first characters>`. */
const facesIn = (text: string) =>
  text
    .split('\n')
    .map((line, at) => ({ line, at: at + 1 }))
    .filter(({ line }) => FACE.test(line) && !DOC.test(line))
    .map(({ line, at }) => `${at} ${line.trim().slice(0, 48)}`);

/** Every colour CSS names, each of which React Native reads too. */
const NAMED =
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
    ' ',
  );

/** Strings no renderer reads as a colour, and `transparent`, which the guard lets by. */
const NOT_COLOURS = [
  'transparent',
  'reddish',
  'Red',
  'GOLD',
  'tan colour',
  '#ggg',
  '#12',
  '#12345',
  'rgb(1, 2)',
  'Isaiah 41:10',
  '',
  'seed',
  'colour',
];

/** A seeded generator (mulberry32): the same seed, the same sources. */
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const HEX = [...'0123456789abcdefABCDEF'];

/** `yes` when `flag` holds, else `no`. */
const choose = <A,>(flag: boolean, yes: A, no: A): A => [no, yes][Number(flag)] as A;

/** One generated colour: a name, a hex of 3, 4, 6 or 8 digits, or rgb, rgba, hsl and hsla with commas, or rgb's space syntax. */
const colourOf = (r: () => number): string => {
  const int = (n: number) => Math.floor(r() * n);
  const pick = <A,>(xs: ReadonlyArray<A>) => xs[int(xs.length)] as A;
  const alpha = () => String(Math.round(r() * 100) / 100);
  const forms = [
    () => pick(NAMED),
    () => pick(NAMED),
    () => `#${Array.from({ length: pick([3, 4, 6, 8]) }, () => pick(HEX)).join('')}`,
    () => `rgb(${int(256)}, ${int(256)}, ${int(256)})`,
    () => `rgba(${int(256)}, ${int(256)}, ${int(256)}, ${alpha()})`,
    () => `hsl(${int(360)}, ${int(101)}%, ${int(101)}%)`,
    () => `hsla(${int(360)}, ${int(101)}%, ${int(101)}%, ${alpha()})`,
    () => `rgb(${int(256)} ${int(256)} ${int(256)} / ${alpha()})`,
  ];
  return pick(forms)();
};

/** A generated fragment: its lines, and the colour it holds as a value, when it holds one. */
interface Fragment {
  readonly lines: ReadonlyArray<string>;
  readonly colour: string | undefined;
}

const fragmentOf = (r: () => number, i: number, tsx: boolean): Fragment => {
  const int = (n: number) => Math.floor(r() * n);
  const pick = <A,>(xs: ReadonlyArray<A>) => xs[int(xs.length)] as A;
  const v = colourOf(r);
  const q = pick(["'", '"']);
  const valued = (...lines: ReadonlyArray<string>): Fragment => ({ lines, colour: v });
  const plain = (...lines: ReadonlyArray<string>): Fragment => ({ lines, colour: undefined });
  const values: ReadonlyArray<() => Fragment> = [
    () => valued(`export const s${i} = { color: ${q}${v}${q} };`),
    () =>
      valued(
        `export const s${i} = StyleSheet.create({`,
        `  a: { backgroundColor: ${q}${v}${q} },`,
        `});`,
      ),
    () => valued(`export const t${i} = \`${v}\`;`),
    () => valued(`export const a${i} = [${q}${v}${q}];`),
    () => valued(`paint(${q}${v}${q});`),
    () => valued(`export const n${i} = { [key]: ${q}${v}${q} };`),
    () => valued(`export const k${i} = flag ? ${q}${v}${q} : other;`),
  ];
  const jsx: ReadonlyArray<() => Fragment> = [
    () => valued(`export const E${i} = () => <View style={{ borderColor: '${v}' }} />;`),
    () => valued(`export const F${i} = () => <Path fill="${v}" />;`),
    () => valued(`export const G${i} = () => <Path stroke={'${v}'} />;`),
    () => plain(`export const H${i} = () => <Text>${v.replace(/[{}<>]/gu, '')}</Text>;`),
  ];
  const none: ReadonlyArray<() => Fragment> = [
    () => plain(`export const w${i} = ${q}${pick(NOT_COLOURS)}${q};`),
    () => plain(`// ${v} in a line comment`),
    () => plain(`/** ${v} in a doc comment */`, `export const d${i} = 1;`),
    () => plain(`/* ${v} */ export const b${i} = 2;`),
    () => plain(`export const x${i} = \`#\${hex}\`;`),
    () => plain(`export const o${i} = { '${pick(NAMED)}': 1 };`),
    () => plain(`export type T${i} = '${pick(NAMED)}' | 'seed';`),
    () => plain(`import r${i} from '${pick(NAMED)}';`),
  ];
  return pick(choose(r() < 0.5, [...values, ...choose(tsx, jsx, [])], none))();
};

/** A generated source of one to eight fragments, and the `"<line> <colour>"` the reader must find in it. */
const sourceOf = (seed: number) => {
  const r = rng(seed);
  const tsx = seed % 2 === 0;
  const lines: string[] = [];
  const expected: string[] = [];
  const count = 1 + Math.floor(r() * 8);
  for (let i = 0; i < count; i++) {
    const fragment = fragmentOf(r, i, tsx);
    const { colour } = fragment;
    if (colour !== undefined && colour !== 'transparent')
      expected.push(
        `${lines.length + fragment.lines.findIndex((line) => line.includes(colour)) + 1} ${colour}`,
      );
    lines.push(...fragment.lines);
  }
  return { file: `src/gen${seed}.${choose(tsx, 'tsx', 'ts')}`, text: lines.join('\n'), expected };
};

describe('no colour or face outside the theme', () => {
  it('finds every string React Native reads as a colour, and only those, in 400 generated sources', () => {
    const misses = Array.from({ length: 400 }, (_, n) => sourceOf(n + 1))
      .map(({ file, text, expected }) => ({
        file,
        found: JSON.stringify(coloursIn(file, text)),
        expected: JSON.stringify(expected),
      }))
      .filter(({ found, expected }) => found !== expected)
      .map(({ file, found, expected }) => `${file}: found ${found}, expected ${expected}`);
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it('reads every named colour in either quote, and passes transparent', () => {
    const text = NAMED.map(
      (name, i) => `export const c${i} = ${choose(i % 2 === 1, `'${name}'`, `"${name}"`)};`,
    ).join('\n');
    expect(coloursIn('src/named.ts', text)).toEqual(NAMED.map((name, i) => `${i + 1} ${name}`));
    expect(coloursIn('src/clear.ts', "export const c = { borderColor: 'transparent' };")).toEqual(
      [],
    );
  });

  it('reads src, app, vite, scripts, infra and the root, and leaves out tests, declarations, rigs, probes, prototypes, other folders and src/theme.ts', () => {
    const read = [
      'src/look.tsx',
      'app/index.tsx',
      'vite/app.ts',
      'scripts/icon.ts',
      'infra/models/copy.ts',
      'vite.config.ts',
      'src/sayit/draw.tsx',
    ];
    const left = [
      'src/look.test.tsx',
      'scripts/icon.test.ts',
      'src/virtual.d.ts',
      'src/test/look.ts',
      'app/probe/theme.tsx',
      'src/prototype/home/screen.tsx',
      'scripts/prototype-home.ts',
      'src/theme.ts',
      'native/plugin.ts',
      'tmp/scratch.ts',
      'src/look.js',
    ];
    expect({ read: read.filter(guarded), left: left.filter(guarded) }).toEqual({ read, left: [] });
  });

  it('finds a font family or Georgia in a line, and passes a doc line and the face by name', () => {
    const lines = [
      "fontFamily: 'Georgia',",
      'const serif = Georgia;',
      ' * Georgia, the old serif',
      'fontFamily: each,',
    ];
    expect(lines.map((line) => facesIn(line).length)).toEqual([1, 1, 0, 0]);
  });

  it('holds every product file in src, app, vite, scripts, infra and the root, less tests, declarations, rigs, probes, prototypes and src/theme.ts, to no colour value or font family', () => {
    const files = SOURCES.flatMap((glob) => [...glob.scanSync(ROOT)]).filter(guarded);
    expect(files).toEqual(
      expect.arrayContaining([
        'app/index.tsx',
        'src/sayit/draw.tsx',
        'vite/app.ts',
        'scripts/icon.ts',
      ]),
    );
    const found = files.flatMap((file) => {
      const text = readFileSync(`${ROOT}/${file}`, 'utf8');
      return [...coloursIn(file, text), ...facesIn(text)].map((hit) => `${file}:${hit}`);
    });
    expect(found).toEqual([]);
  });
});
