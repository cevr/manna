import { Effect, Option } from 'effect';
import wordsLatinExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2';
import wordsLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2';
import monoLatinExt from '@fontsource-variable/geist-mono/files/geist-mono-latin-ext-wght-normal.woff2';
import monoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2';
import monoSymbols from '@fontsource-variable/geist-mono/files/geist-mono-symbols2-wght-normal.woff2';

export const SUBSETS = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  latinExt:
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  hebrew: 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F',
  symbols2: 'U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F',
} as const;

export interface Face {
  readonly family: string;
  readonly url: string;
  readonly range: string;
  readonly weight: string;
  readonly style: 'normal' | 'italic';
}

const WORDS_FAMILY = 'Geist';

const MONO_FAMILY = 'Geist Mono';

const uiFace = (family: string, url: string, range: string): Face => ({
  family,
  url,
  range,
  weight: '100 900',
  style: 'normal',
});

const WORDS_LATIN = uiFace(WORDS_FAMILY, wordsLatin, SUBSETS.latin);

const MONO_LATIN = uiFace(MONO_FAMILY, monoLatin, SUBSETS.latin);

const UI_FACES: ReadonlyArray<Face> = [
  uiFace(WORDS_FAMILY, wordsLatinExt, SUBSETS.latinExt),
  WORDS_LATIN,
  uiFace(MONO_FAMILY, monoSymbols, SUBSETS.symbols2),
  uiFace(MONO_FAMILY, monoLatinExt, SUBSETS.latinExt),
  MONO_LATIN,
];

const FIRST_PAINT: ReadonlyArray<Face> = [WORDS_LATIN, MONO_LATIN];

const UI_DISPLAY: FontDisplay = 'block';

const unquoted = (family: string) => family.replace(/^["']|["']$/g, '');

const added = (
  fonts: FontFaceSet,
  faces: ReadonlyArray<Face>,
  display: FontDisplay,
): ReadonlyArray<FontFace> =>
  faces.map((face) => {
    const font = new FontFace(face.family, `url(${face.url}) format('woff2')`, {
      weight: face.weight,
      style: face.style,
      display,
      unicodeRange: face.range,
    });
    fonts.add(font);
    return font;
  });

export const registerFace = (fonts: FontFaceSet): void => {
  const inHead = Array.from(fonts).some((font) => unquoted(font.family) === WORDS_FAMILY);
  if (!inHead) added(fonts, UI_FACES, UI_DISPLAY);
};

const fromRoot = (url: string) =>
  url.startsWith('data:') ? url : `/${url.slice(url.lastIndexOf('/') + 1)}`;

const faceRule = (face: Face) =>
  `@font-face{font-family:'${face.family}';src:url(${fromRoot(face.url)}) format('woff2');` +
  `font-weight:${face.weight};font-style:${face.style};font-display:${UI_DISPLAY};unicode-range:${face.range}}`;

export const FACE_HEAD =
  FIRST_PAINT.map(
    (face) =>
      `<link rel="preload" href="${fromRoot(face.url)}" as="font" type="font/woff2" crossorigin>`,
  ).join('') + `<style>${UI_FACES.map(faceRule).join('')}</style>`;

const SHOWN = 'data-faces';

const CAP_MS = 1000;

export const faceHold = (root: string) => {
  const loads = FIRST_PAINT.map((face) => `f.load("1em '${face.family}'")`).join(',');
  const script =
    `<script>(()=>{const d=document.documentElement,f=document.fonts;` +
    `const show=(how,why)=>{if(d.hasAttribute('${SHOWN}'))return;d.setAttribute('${SHOWN}',how);` +
    `if(how==='late')console.info('[lab] fonts.late reason='+why+' cap_ms=${CAP_MS}')};` +
    `setTimeout(()=>show('late','cap'),${CAP_MS});` +
    `Promise.all([${loads}]).then(()=>show('in'),()=>show('late','failed'))})()</script>`;
  return {
    head: `<style>html:not([${SHOWN}]) ${root}{visibility:hidden}</style>${script}`,
    script,
    shown: SHOWN,
    capMs: CAP_MS,
  };
};

const PICTURE_DISPLAY: FontDisplay = 'block';

const UI_FAMILIES: ReadonlySet<string> = new Set([WORDS_FAMILY, MONO_FAMILY]);

export const pictureFaces = (faces: ReadonlyArray<Face>): Effect.Effect<void> =>
  Effect.runSync(
    Effect.cached(
      Effect.sync(() => {
        for (const font of added(document.fonts, faces, PICTURE_DISPLAY))
          font.load().catch(() => undefined);
      }),
    ),
  );

export const pictureFacesWait = (fonts: FontFaceSet): Option.Option<Effect.Effect<void>> => {
  const loading = Array.from(fonts).filter(
    (font) =>
      font.display === PICTURE_DISPLAY &&
      !UI_FAMILIES.has(unquoted(font.family)) &&
      font.status !== 'loaded',
  );
  return Option.as(
    Option.liftPredicate(loading, (l) => l.length > 0),
    Effect.asVoid(Effect.promise(() => Promise.all(loading.map((font) => font.loaded)))),
  );
};
