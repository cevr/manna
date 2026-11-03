import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

const ROOT = import.meta.dir;

const TOKENS = 'player/tokens.css';

const FACE = 'player/face.ts';

const OUTSIDE = [
  'canvas/',
  'style/',
  'lab/fixtures/',
  'player/lookbook-sheet.ts',
  'player/contact.ts',
  'core/sheet.ts',
  'core/synth/',
];

const NAMED = 'white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver';

const COLOUR_PROPERTY =
  'color|background(?:-?[cC]olor)?|border(?:-?[a-zA-Z]+)?-?[cC]olor|outline-?[cC]olor|fill|stroke|stop-?[cC]olor|flood-?[cC]olor';

const setting = (name: string) => `${name}(?:['"\`]?\\s*:|['"\`]\\s*\\]\\s*=|\\s*=)`;

const cssSetting = (name: string) => `${name}(?:['"\`]?\\s*:|['"\`]\\s*\\]\\s*=)`;

const NOT_TOKEN = `(?!\\s*['"\`]?\\s*(?:var\\(|inherit))`;

const RULES: ReadonlyArray<{
  readonly why: string;
  readonly pattern: RegExp;
  readonly spares?: ReadonlyArray<string>;
}> = [
  {
    why: 'a hex colour',
    pattern: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/,
  },
  {
    why: 'a colour function of numbers',
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/,
  },
  {
    why: 'a named colour',
    pattern: new RegExp(
      `(?<![\\w-])${setting(`(?:${COLOUR_PROPERTY})`)}\\s*\\{?\\s*['"\`]?(?:${NAMED})\\b`,
    ),
  },
  {
    why: 'a colour attribute of its own',
    pattern: new RegExp(
      `(?<![\\w.-])(?:fill|stroke|stop-color|flood-color|color)=\\{?\\s*['"\`](?!\\s*(?:none|currentColor|transparent|inherit|var\\(|url\\())`,
    ),
  },
  {
    why: 'a colour attribute of its own',
    pattern:
      /setAttribute\(\s*['"`](?:fill|stroke|stop-color|flood-color|color)['"`]\s*,\s*['"`](?!\s*(?:none|currentColor|transparent|inherit|var\(|url\())/,
  },
  {
    why: 'a canvas painting a literal',
    pattern: /\b(?:fillStyle|strokeStyle|shadowColor)\s*=\s*['"`]/,
  },
  {
    why: 'a style property set to a value of its own',
    pattern:
      /setProperty\(\s*['"`](?:color|background(?:-color)?|border(?:-[a-z]+)?-color|outline-color|fill|stroke|font|font-family|font-size)['"`]\s*,\s*['"`](?!\s*(?:var\(|inherit))/,
  },
  {
    why: 'a font family',
    pattern: new RegExp(`${cssSetting('font-family')}${NOT_TOKEN}`),
    spares: [FACE],
  },
  {
    why: 'a font family',
    pattern: new RegExp(`${setting('(?:family|Family|FAMILY)')}\\s*['"\`]${NOT_TOKEN}`),
    spares: [FACE],
  },
  { why: 'a font family', pattern: /new FontFace\(\s*['"`]/ },
  { why: 'a state colour of its own', pattern: /(?<![\w-])--state-[\w-]+\s*:/ },
  { why: 'a font size', pattern: new RegExp(`${cssSetting('font-size')}${NOT_TOKEN}`) },
  { why: 'a font size', pattern: new RegExp(`${setting('fontSize')}\\s*['"\`]${NOT_TOKEN}`) },
  {
    why: 'a font shorthand of its own',
    pattern: new RegExp(
      `(?<![\\w-])${setting('font')}${NOT_TOKEN}\\s*['"\`]?[^;'"\`]*\\d(?:px|r?em|pt|%|\\s*\\/)`,
    ),
  },
];

const SOURCE = /\.(?:css|tsx?)$/;
const TEST = /\.test\.tsx?$/;

const isChrome = (file: string) =>
  SOURCE.test(file) &&
  !TEST.test(file) &&
  file !== TOKENS &&
  !OUTSIDE.some((prefix) => file.startsWith(prefix));

const broken = (file: string, line: string) =>
  RULES.filter(
    (rule) => rule.pattern.test(line) && !(rule.spares ?? []).some((spared) => spared === file),
  );

const offences = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const files = yield* fs.readDirectory(ROOT, { recursive: true });
  const found = yield* Effect.forEach(files.filter(isChrome), (file) =>
    fs
      .readFileString(`${ROOT}/${file}`)
      .pipe(
        Effect.map((text) =>
          text
            .split('\n')
            .flatMap((line, i) =>
              broken(file, line).map((rule) => `${file}:${i + 1} ${rule.why}: ${line.trim()}`),
            ),
        ),
      ),
  );
  return found.flat().toSorted();
});

const firstFamily = (list: string) => (list.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');

describe('the studio reads its look only through its tokens', () => {
  it.effect.layer(BunServices.layer)(
    'no colour, font family or font size outside tokens.css but in canvas code',
    () =>
      Effect.gen(function* () {
        expect(yield* offences).toEqual([]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "each UI face registers the family its token names first: Geist --font's, Geist Mono --font-mono's",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tokens = yield* fs.readFileString(`${ROOT}/${TOKENS}`);
        const face = yield* fs.readFileString(`${ROOT}/${FACE}`);
        const token = (name: string) =>
          firstFamily(new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? '');
        const registered = (name: string) =>
          new RegExp(`${name} = '([^']+)'`).exec(face)?.[1] ?? '';
        expect({
          words: registered('WORDS_FAMILY'),
          mono: registered('MONO_FAMILY'),
        }).toEqual({ words: token('--font'), mono: token('--font-mono') });
        expect([registered('WORDS_FAMILY'), registered('MONO_FAMILY')]).toEqual([
          'Geist',
          'Geist Mono',
        ]);
      }),
  );

  it.effect('each rule refuses what it names, and lets a token through', () =>
    Effect.sync(() => {
      const refused = (line: string) => broken('lab/any.tsx', line).length > 0;
      const refusedLines = [
        'color: #e0ad45;',
        "seg.style.background = '#fff';",
        'border: 1px solid rgb(255 255 255 / 0.2);',
        'background: white;',
        'font-family: Inter, sans-serif;',
        "style={{ fontSize: '12px' }}",
        'font-size: 13px;',
        'font: 14px/1.5 monospace;',
        "style={{ color: 'white' }}",
        "style={{ 'background-color': 'black', left: pct(t) }}",
        "style={{ 'font-family': 'Inter' }}",
        '<path fill="white" d="M0 0" />',
        "<line stroke='black' x1={0} />",
        "el.setAttribute('stroke', 'grey');",
        "ctx.fillStyle = 'black';",
        'ctx.strokeStyle = `gold`;',
        "ctx.shadowColor = 'transparent';",
        "ctx.font = '12px Inter';",
        'ctx.font = `500 15px ${body}`;',
        "tip.style.color = 'white';",
        "tip.style.backgroundColor = 'black';",
        "tip.style.fontFamily = 'Inter';",
        "tip.style.fontSize = '11px';",
        "tip.style.setProperty('color', 'white');",
        "tip.style.setProperty('font-size', '12px');",
        "el.style['fontSize'] = '12px';",
        "el.style['fontFamily'] = 'Inter';",
        'el.style["font-size"] = "12px";',
        "el.style['font'] = '12px Inter';",
        "el.style['color'] = 'white';",
        'el.style[`backgroundColor`] = `black`;',
        "const WORDS_FAMILY = 'Geist';",
        "new FontFace('Inter', url);",
        "{ family: 'Inter' }",
        '  --state-live: var(--text-1);',
      ];
      const allowedLines = [
        'color: var(--accent);',
        'font: inherit;',
        'font-size: var(--fs-2);',
        'font-family: var(--font);',
        'const hue = (i: number) => `hsl(${(i * 47) % 360} var(--scene-sat) var(--scene-light))`;',
        'yield* page.goto(`${PROJECT}#point-take%3Apaper.hum`);',
        'href="#t=2"',
        "style={{ left: pct(props.placed, at), width: '40%' }}",
        "style={{ color: 'var(--ink)' }}",
        "style={{ 'font-size': 'var(--fs-2)' }}",
        "style={{ 'font-family': 'var(--font)' }}",
        "style={{ 'font-family': 'inherit', fontSize: 'var(--fs-1)' }}",
        "style={{ fontFamily: 'var(--font)' }}",
        'font-family: "var(--font)";',
        "el.style['fontSize'] = 'var(--fs-1)';",
        "el.style['fontFamily'] = 'var(--font)';",
        "el.style['color'] = 'var(--ink)';",
        '<path fill="none" stroke="currentColor" d="M0 0" />',
        '<path fill="var(--accent)" />',
        'seg.style.backgroundColor = hue(p.index);',
        "tip.style.setProperty('--x', '12px');",
        'ctx.fillStyle = ink;',
        "el.animate(frames, { fill: 'forwards' });",
        'new FontFace(WORDS_FAMILY, url);',
        '.lab-cue[data-live] { background: var(--state-live); }',
      ];
      expect({
        letThrough: refusedLines.filter((line) => !refused(line)),
        refused: allowedLines.filter(refused),
      }).toEqual({ letThrough: [], refused: [] });
      expect(broken(FACE, "const WORDS_FAMILY = 'Geist';")).toEqual([]);
      expect(broken(FACE, "const MONO_FAMILY = 'Geist Mono';")).toEqual([]);
    }),
  );
});
