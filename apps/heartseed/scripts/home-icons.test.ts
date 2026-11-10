/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its cases in plain branches, finds the first bad fragment by a plain find and names a wrong case by its text as JSON. */

/**
 * The home's icons, held to their masters, their colour rule and their
 * bytes: `assets/home` holds exactly each name's master, its two PNGs and
 * their declarations; each master is a 48 × 48 drawing whose every colour
 * `src/theme.ts`'s `masters` maps or `kept` keeps; `recolour` follows its
 * rule over seeded generated texts, against an oracle written here that
 * knows each token by its draw (a token is `#` and one or more hex digits,
 * of any length and in any case; a 7-character one is mapped or kept by its
 * lower case, and every other fails); the
 * table names each name's PNG for each scheme; and every committed PNG is
 * a 144 × 144 RGBA image that is, byte for byte, what `bun run home-icons`
 * draws from its master now.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
import sharp from 'sharp';

import { ICON_IMAGES } from '../src/home/icons.ts';
import { kept, masters, type Scheme, theme } from '../src/theme.ts';
import { DECLARATION, drawIcon, recolour, SCHEMES } from './home-icons.ts';

const test = it.effect.layer(BunServices.layer);

/** scripts/ → the app's root. */
const ROOT = `${import.meta.dir}/..`;
const DIR = `${ROOT}/assets/home`;
const NAMES = Object.keys(ICON_IMAGES).toSorted();
const ROOT_ELEMENT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">';
const HEX = '0123456789abcdef';

const isMapped = (token: string) =>
  token.length === 7 && Object.hasOwn(masters, token.toLowerCase());
const isKept = (token: string) => token.length === 7 && kept.includes(token.toLowerCase());
/** A colour token in the rule's sense: `#` and one or more hex digits, in any case. */
const tokensOf = (text: string) => Array.from(text.matchAll(/#[0-9a-fA-F]+/gu), (m) => m[0]);

/** A seeded linear congruential stream in [0, 1). */
const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** One generated fragment: the text it adds, the colour token it holds (empty for none), and the kind it was drawn as. */
interface Fragment {
  readonly text: string;
  readonly token: string;
  readonly kind: string;
}

const FILLER = [
  ' ',
  '<path d="M5 35 H43" ',
  'stroke-width="2.5" ',
  '<circle cx="37" ',
  '>',
  '\n  ',
];
const ATTRIBUTES = [' fill="', ' stroke="', ' stop-color="', ' color="'];
/** Each ends a token: none starts with a hex digit. */
const SEPARATORS = ['"', ' ', '/>', '"/>\n', ';', ')', 'g', 'Z', '#'];

/** The kinds a token is drawn as: a master's hex or a kept one in any case, which the rule maps or keeps, and every other. */
const MAPPED_KINDS = ['master', 'MASTER', 'MaStEr', 'kept', 'KEPT', 'KePt'];
const UNMAPPED_KINDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'unbounded',
  'master+digits',
  'kept+digits',
  'master-digit',
  'kept-digit',
];
const KINDS = [...MAPPED_KINDS, ...UNMAPPED_KINDS];
/** The kinds of 1 to 9 random digits, by their count. */
const COUNTS = new Map(UNMAPPED_KINDS.slice(0, 9).map((kind, index) => [kind, index + 1]));

/**
 * A text of 1 to 8 fragments, each filler, an attribute, then a token of a
 * drawn kind or a bare `#`, then a separator no hex digit starts. A token is
 * `#` and one or more hex digits, each digit in a drawn case: a master's hex
 * or a kept one (as written, in capitals or mixed), 1 to 9 random digits,
 * 10 or more (each further digit with probability 3/4, so no length is out
 * of reach), or a master's or a kept hex with 1 to 3 digits added or its
 * last digit dropped.
 */
const generate = (next: () => number) => {
  const pick = <A>(list: ReadonlyArray<A>): A => list[Math.floor(next() * list.length)] as A;
  const cased = (text: string) =>
    [...text].map((c) => [c, c.toUpperCase()][Math.floor(next() * 2)] ?? c).join('');
  const digits = (n: number) => cased(Array.from({ length: n }, () => pick([...HEX])).join(''));
  const keys = Object.keys(masters);
  const unbounded = () => {
    let n = 10;
    while (next() < 0.75) n += 1;
    return n;
  };
  const tokenOf = (kind: string): string => {
    const counted = COUNTS.get(kind);
    if (counted !== undefined) return `#${digits(counted)}`;
    if (kind === 'master') return pick(keys);
    if (kind === 'MASTER') return pick(keys).toUpperCase();
    if (kind === 'MaStEr') return cased(pick(keys));
    if (kind === 'kept') return pick(kept);
    if (kind === 'KEPT') return pick(kept).toUpperCase();
    if (kind === 'KePt') return cased(pick(kept));
    if (kind === 'unbounded') return `#${digits(unbounded())}`;
    if (kind === 'master+digits')
      return `${cased(pick(keys))}${digits(1 + Math.floor(next() * 3))}`;
    if (kind === 'kept+digits') return `${cased(pick(kept))}${digits(1 + Math.floor(next() * 3))}`;
    if (kind === 'master-digit') return cased(pick(keys)).slice(0, 6);
    return cased(pick(kept)).slice(0, 6);
  };
  const count = 1 + Math.floor(next() * 8);
  return Array.from({ length: count }, (): Fragment => {
    const kind = next() < 0.85 ? pick(KINDS) : 'none';
    const token = kind === 'none' ? '' : tokenOf(kind);
    const bare = token === '' && next() < 0.5 ? '#' : '';
    return {
      text: `${pick(FILLER)}${pick(ATTRIBUTES)}${bare}${token}${pick(SEPARATORS)}`,
      token,
      kind,
    };
  });
};

const decode = (file: string) =>
  Effect.promise(() => sharp(`${DIR}/${file}`).metadata()).pipe(
    Effect.map(({ width, height, channels }) => ({ file, side: [width, height, channels] })),
  );

describe('the home’s icons', () => {
  test('assets/home holds each name’s master, its two PNGs and their declarations, and nothing else', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const files = (yield* fs.readDirectory(DIR)).toSorted();
      expect(files).toEqual(
        NAMES.flatMap((name) => [
          `${name}.svg`,
          ...SCHEMES.flatMap((scheme) => [`${name}-${scheme}.png`, `${name}-${scheme}.d.png.ts`]),
        ]).toSorted(),
      );
      expect(files.filter((file) => file.endsWith('.svg')).length).toBe(12);
      expect(files.length).toBe(60);
    }));

  test('each master is 48 × 48 on no fill, every colour mapped by masters or kept', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const rows = yield* Effect.forEach(NAMES, (name) =>
        fs.readFileString(`${DIR}/${name}.svg`).pipe(
          Effect.map((svg) => ({
            name,
            root: svg.split('\n')[0],
            paints: Array.from(
              svg.matchAll(/\b(?:fill|stroke)="([^"]*)"/gu),
              (m) => m[1] ?? '',
            ).filter((value) => value !== 'none' && !isMapped(value) && !isKept(value)),
            tokens: tokensOf(svg).filter((token) => !isMapped(token) && !isKept(token)),
            syntax: /\bstyle=|\bclass=|rgba?\(|hsla?\(|currentColor/u.test(svg),
          })),
        ),
      );
      expect(rows).toEqual(
        NAMES.map((name) => ({ name, root: ROOT_ELEMENT, paints: [], tokens: [], syntax: false })),
      );
    }));

  test('recolour maps each master’s hex to its role, keeps a kept one, and fails on the first other token', () =>
    Effect.sync(() => {
      const next = random(0x5eed_1c0);
      const tally = { clean: 0, unmapped: 0, light: 0, dark: 0 };
      const firstBad: Record<string, number> = {};
      const lengths = new Set<number>();
      const wrong: string[] = [];
      for (let run = 0; run < 600; run++) {
        const fragments = generate(next);
        const scheme: Scheme = next() < 0.5 ? 'light' : 'dark';
        tally[scheme]++;
        const svg = fragments.map((f) => f.text).join('');
        fragments.forEach((f) => f.token !== '' && lengths.add(f.token.length - 1));
        const bad = fragments.find((f) => f.token !== '' && !isMapped(f.token) && !isKept(f.token));
        if (bad !== undefined) firstBad[bad.kind] = (firstBad[bad.kind] ?? 0) + 1;
        const result = Effect.runSync(Effect.result(recolour(svg, scheme, 'generated.svg')));
        if (bad === undefined) {
          tally.clean++;
          const expected = fragments
            .map((f) => {
              const role = masters[f.token.toLowerCase()];
              return isMapped(f.token) && role !== undefined
                ? f.text.replace(f.token, theme[scheme][role])
                : f.text;
            })
            .join('');
          if (!Result.isSuccess(result) || result.success !== expected)
            wrong.push(`${scheme} ${JSON.stringify(svg)}`);
        } else {
          tally.unmapped++;
          const failed =
            Result.isFailure(result) &&
            result.failure._tag === 'UnmappedColour' &&
            result.failure.file === 'generated.svg' &&
            result.failure.hex === bad.token;
          if (!failed) wrong.push(`${scheme} ${JSON.stringify(svg)}`);
        }
      }
      expect(wrong).toEqual([]);
      expect(tally.clean).toBeGreaterThanOrEqual(20);
      expect(tally.unmapped).toBeGreaterThanOrEqual(20);
      expect(tally.light).toBeGreaterThanOrEqual(20);
      expect(tally.dark).toBeGreaterThanOrEqual(20);
      expect(UNMAPPED_KINDS.filter((kind) => (firstBad[kind] ?? 0) < 5)).toEqual([]);
      const drawn = [...lengths].toSorted((a, b) => a - b);
      expect(drawn.slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(drawn.at(-1) ?? 0).toBeGreaterThanOrEqual(16);
    }));

  test('the table names each name’s PNG for each scheme', () =>
    Effect.sync(() => {
      expect(
        NAMES.flatMap((name) =>
          SCHEMES.filter(
            (scheme) =>
              !String(ICON_IMAGES[name as keyof typeof ICON_IMAGES][scheme]).endsWith(
                `/assets/home/${name}-${scheme}.png`,
              ),
          ).map((scheme) => `${name} ${scheme}`),
        ),
      ).toEqual([]);
    }));

  test('each declaration is the script’s DECLARATION', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const off = yield* Effect.forEach(
        NAMES.flatMap((name) => SCHEMES.map((scheme) => `${name}-${scheme}.d.png.ts`)),
        (file) => fs.readFileString(`${DIR}/${file}`).pipe(Effect.map((text) => [file, text])),
      );
      expect(off.filter(([, text]) => text !== DECLARATION).map(([file]) => file)).toEqual([]);
    }));

  test('each PNG is 144 × 144 with four channels', () =>
    Effect.forEach(
      NAMES.flatMap((name) => SCHEMES.map((scheme) => `${name}-${scheme}.png`)),
      decode,
      { concurrency: 6 },
    ).pipe(
      Effect.map((rows) =>
        expect(rows.filter((row) => row.side.join() !== '144,144,4')).toEqual([]),
      ),
    ));

  test('commits, byte for byte, what bun run home-icons draws from each master now', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const drifted = yield* Effect.forEach(
        NAMES.flatMap((name) => SCHEMES.map((scheme) => ({ name, scheme }))),
        ({ name, scheme }) =>
          Effect.gen(function* () {
            const file = `${name}-${scheme}.png`;
            const svg = yield* recolour(
              yield* fs.readFileString(`${DIR}/${name}.svg`),
              scheme,
              `assets/home/${name}.svg`,
            );
            const [committed, fresh] = yield* Effect.all(
              [fs.readFile(`${DIR}/${file}`), drawIcon(svg, file)],
              { concurrency: 2 },
            );
            return [file, Buffer.from(committed).equals(fresh)] as const;
          }),
        { concurrency: 6 },
      );
      expect(drifted.filter(([, same]) => !same).map(([file]) => file)).toEqual([]);
    }));
});
