import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import {
  type ProductionFile,
  ProductionFile as ProductionFileSchema,
  type Said,
  decisionsOf,
  moveForward,
  newProduction,
  versionAt,
} from './production.ts';
import { VersionMoved } from './refusals.ts';

const HOUR = 3_600_000;

/** The look: v1 opened at 0, v2 at 10 h, v3 at 20 h. */
const look = (): ProductionFile => {
  const first = { ...newProduction('look', 'The look', 0), title: 'The look' };
  const v2 = Result.getOrThrow(
    moveForward(first, { after: 1, title: 'K1', because: Option.some('i like k1') }, 10 * HOUR),
  );
  return Result.getOrThrow(
    moveForward(v2, { after: 2, title: '9005', because: Option.some('i like 9005') }, 20 * HOUR),
  );
};

describe('a production moves forward', () => {
  test('a new version opens after the one the mover saw, numbered by its place', () => {
    const file = look();
    expect(file.versions.map((v) => v.title)).toEqual(['v1', 'K1', '9005']);
    expect(file.versions[2]?.because).toEqual(Option.some('i like 9005'));
  });

  test('a mover who saw an older version is refused with the version now', () => {
    const moved = moveForward(
      look(),
      { after: 2, title: 'late', because: Option.none() },
      30 * HOUR,
    );
    expect(Result.isFailure(moved)).toBe(true);
    const refusal = Result.match(moved, {
      onFailure: Option.some,
      onSuccess: () => Option.none<VersionMoved>(),
    });
    expect(Option.getOrThrow(refusal)).toBeInstanceOf(VersionMoved);
    expect(Option.map(refusal, (r) => r.current)).toEqual(Option.some(3));
  });

  test('a version is never opened before the one before it', () => {
    const file = Result.getOrThrow(
      moveForward(look(), { after: 3, title: 'clock behind', because: Option.none() }, 5 * HOUR),
    );
    expect(file.versions[3]?.at).toBe(20 * HOUR);
  });

  test('the ledger refuses versions out of order', () => {
    const bad = {
      production: 'look',
      title: 'The look',
      versions: [
        { at: 10, title: 'v1' },
        { at: 5, title: 'v2' },
      ],
    };
    expect(() => Schema.decodeUnknownSync(ProductionFileSchema)(bad)).toThrow(/no earlier/);
  });

  test('the version open at a time is the last opened at or before it', () => {
    const file = look();
    expect(versionAt(file, -1)).toBe(1);
    expect(versionAt(file, 9 * HOUR)).toBe(1);
    expect(versionAt(file, 10 * HOUR)).toBe(2);
    expect(versionAt(file, 99 * HOUR)).toBe(3);
  });
});

describe('a production’s history', () => {
  test('the owner’s decisions are his `Decided` words in the ledger’s order, never a question or a note', () => {
    const word = (
      tag: Said['_tag'],
      at: number,
      quote: Option.Option<string>,
      ask: Option.Option<string> = Option.none(),
      picks: Option.Option<Readonly<Record<string, string>>> = Option.none(),
    ): Said => ({
      _tag: tag,
      at,
      text: `${tag} at ${at}`,
      quote,
      set: Option.none(),
      point: Option.none(),
      variant: Option.none(),
      ask,
      picks,
      by: Option.none(),
    });
    const said = [
      word('Asked', HOUR, Option.some('Keep and lock them?'), Option.some('a92f276635e')),
      word('Decided', 2 * HOUR, Option.some('lets lock in that style')),
      // An ask answered by a pick alone files no words, and its picks.
      word(
        'Decided',
        3 * HOUR,
        Option.none(),
        Option.some('a92f276635e'),
        Option.some({ keep: 'lock' }),
      ),
      word('Noted', 4 * HOUR, Option.some('lock in a rig and a style')),
      // A question, and an ask withdrawn, decide nothing.
      word(
        'Asked',
        5 * HOUR,
        Option.none(),
        Option.some('a0590057595'),
        Option.some({ arm: 'arm' }),
      ),
      word(
        'Noted',
        6 * HOUR,
        Option.none(),
        Option.some('a0590057595'),
        Option.some({ arm: 'arm' }),
      ),
      word('Decided', 7 * HOUR, Option.none(), Option.none(), Option.some({ arm: 'no-arm' })),
    ];
    expect(decisionsOf({ ...look(), said }).map((d) => d.at)).toEqual([
      2 * HOUR,
      3 * HOUR,
      7 * HOUR,
    ]);
  });
});
