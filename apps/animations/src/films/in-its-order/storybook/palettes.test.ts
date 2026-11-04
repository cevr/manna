import * as BunServices from '@effect/platform-bun/BunServices';
import { decodePng } from '@manna/film/tools';
import { Effect, FileSystem, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { deltaE, measuredInk, rgbOfHex } from '../../../library/storybook/sheet.ts';
import { PALETTES } from './palettes.ts';
import { SHEETS } from './sheets.ts';

/** The film's own roles' folders, then the library's: where a member's `cast-sheet/` lies (`castFolder`'s order). */
const ROOTS = [`${import.meta.dir}/../cast`, `${import.meta.dir}/../../../library/cast`] as const;

/** The base each dressed look names, whose hexes its palette may take too: `filler-dressed` is `filler-bases` in house parts. */
const BASES: ReadonlyMap<string, string> = new Map([['filler-dressed', 'filler-bases']]);

/** A member's folder: the first root that holds its `cast-sheet/look.md`. */
const folderOf = Effect.fn('Act1Palettes.folderOf')(function* (member: string) {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* Effect.findFirst(ROOTS, (root) =>
    fs.exists(`${root}/${member}/cast-sheet/look.md`),
  );
  return `${Option.getOrElse(found, () => ROOTS[0])}/${member}`;
});

/** The words a member's palette may take its hexes from: its look, and its base's when it names one. */
const looksOf = Effect.fn('Act1Palettes.looksOf')(function* (member: string) {
  const fs = yield* FileSystem.FileSystem;
  const members = [member, ...Option.toArray(Option.fromUndefinedOr(BASES.get(member)))];
  const looks = yield* Effect.forEach(members, (m) =>
    Effect.flatMap(folderOf(m), (dir) => fs.readFileString(`${dir}/cast-sheet/look.md`)),
  );
  return looks.join('\n').toLowerCase();
});

describe('act 1 palettes', () => {
  for (const [member, palette] of PALETTES)
    it.effect(
      `${member}: every paint is a hex its look (or the base its look names) gives, and the ink is measured on the first ref of its first sheet`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const look = yield* looksOf(member);
          const hexes = palette.parts.flatMap((p) => [
            p.base,
            ...Option.toArray(Option.fromUndefinedOr(p.shade)),
          ]);
          expect(hexes.filter((h) => !look.includes(h.toLowerCase()))).toEqual([]);
          const first = SHEETS.find((s) => s.member === member)?.refs[0] ?? 'no ref';
          const kept = yield* Effect.fromResult(
            decodePng(
              yield* fs.readFile(`${yield* folderOf(member)}/cast-sheet/views/${first}.png`),
            ),
          );
          expect(deltaE(measuredInk(kept), rgbOfHex(palette.ink))).toBeLessThanOrEqual(2);
        }).pipe(Effect.provide(BunServices.layer)),
    );
});
