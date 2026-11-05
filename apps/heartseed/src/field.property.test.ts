/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property builds generated gardens step by step over plain arrays and maps, and switches the host's time zone through `process.env.TZ`, which Bun reads at run time, restoring it in the same synchronous block. */

/**
 * The field's rule (`fieldOf`) over generated read gardens, against the rule
 * written plainly (`test/field-model.ts`) over ts-fsrs's stages. Its seam is
 * the pure derivation the screen draws: the rows and their order, each
 * plant's stage, the days sown and the harvest.
 *
 * The gardens span the rule's domain: the passage with no history or any
 * (every grade, peeks, a Good run to full corn and Again after it), 0-8
 * other verses from the passage's look-alikes and any non-empty string
 * (repeated colons, every kind of space, other scripts; `test/field-model.ts`),
 * one garden of forty and twenty of 41-140, sometimes a second passage
 * of several verses; recalls on days shared across verses and at 00:00:00.000,
 * 23:59:59.999, 02:00, 06:00, 22:00 and 23:00 UTC. Each garden is derived
 * under a western, an eastern and a far-eastern zone, so a count by local
 * days fails on any host. It misses the screen (`field/screen.test.tsx`)
 * and the garden's read of the device (`field/sown.test.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr } from 'effect';

import {
  fieldOf,
  harvestText,
  sownText,
  utcDayOf,
  verseNumberOf,
  type FieldPassage,
} from './field';
import { plantOf, type Plant, type ReadGarden } from './garden';
import type { Recall } from './sayit';
import {
  fieldRule,
  historyOf,
  HOUR,
  localDate,
  otherReference,
  recallOf,
  utcDate,
  verseNumberRule,
} from './test/field-model';
import { below, DAY, pickOf, random } from './test/garden-model';

const PASSAGE = 'Isaiah 41:10';
const ZONES = ['America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati'] as const;

/** A read garden of `records`, each verse's plant folded by the garden from its recalls in a shuffled order. */
const gardenOf = (next: () => number, records: readonly Recall[]): ReadGarden => {
  const byReference = new Map<string, Recall[]>();
  for (const recall of records.toSorted(() => next() - 0.5))
    byReference.set(recall.reference, [...(byReference.get(recall.reference) ?? []), recall]);
  const plants = new Map<string, Plant>();
  for (const [reference, recalls] of byReference)
    if (Arr.isReadonlyArrayNonEmpty(recalls)) plants.set(reference, plantOf(recalls));
  return { _tag: 'Read', plants };
};

/** `derive` run with the host's zone set to `zone`, the zone restored before it returns. */
const inZone = <A>(zone: string, derive: () => A): A => {
  const before = process.env.TZ;
  process.env.TZ = zone;
  // oxlint-disable-next-line effect/noTryCatch -- the zone is the host's, shared by every part's tests in this process, so it is restored even when `derive` throws.
  try {
    return derive();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
};

/** The parts of the domain a garden reaches: each stage shown, a harvest, many rows, a local-day count other than the UTC one, a UTC day several verses share, a second passage. */
const reached = (
  records: readonly Recall[],
  want: ReturnType<typeof fieldRule>,
  passages: readonly FieldPassage[],
) => {
  const keys = want.rows.flatMap((row) => row.plants.map((plant) => `stage:${plant.stage}`));
  const local = inZone(ZONES[0], () => new Set(records.map((r) => localDate(r.startedAt))));
  const verses = new Map<string, Set<string>>();
  for (const recall of records)
    verses.set(
      utcDate(recall.startedAt),
      (verses.get(utcDate(recall.startedAt)) ?? new Set()).add(recall.reference),
    );
  if (local.size !== want.sown) keys.push('local days differ');
  if (want.harvest > 0) keys.push('harvest');
  if (want.rows.length >= 4) keys.push('four rows');
  if (want.rows.length >= 41) keys.push('forty others');
  if (want.rows.length > 41 + passages.length) keys.push('past forty');
  if ([...verses.values()].some((each) => each.size > 1)) keys.push('shared days');
  if (passages.length > 1) keys.push('two passages');
  for (const row of want.rows)
    for (const { reference } of row.plants) keys.push(...referenceKeys(reference));
  return keys;
};

/** The kinds of reference one reaches: repeated colons, characters beyond ASCII, whitespace, no colon. */
const referenceKeys = (reference: string) =>
  [
    reference.split(':').length > 2 && 'reference:colons',
    /[^\u0020-\u007e]/u.test(reference) && 'reference:beyond ascii',
    /\s/u.test(reference) && 'reference:space',
    !reference.includes(':') && 'reference:no colon',
  ].filter((key) => key !== false);

/** A generated garden: its records and the passages taught. */
const generated = (seed: number) => {
  const next = random(seed * 7919 + 17);
  const base = 20_500 + below(next, 400);
  const days = [base, base, base + 1, base + 3, base + below(next, 60)] as const;
  const passages: FieldPassage[] = [{ title: PASSAGE, verses: [PASSAGE] }];
  if (next() < 0.2)
    passages.push({ title: 'Psalm 23', verses: ['Psalm 23:1', 'Psalm 23:2', 'Psalm 23:3'] });
  const references = new Set<string>();
  if (next() < 0.8) references.add(PASSAGE);
  const others = seed === 1 ? 40 : seed % 15 === 0 ? 41 + below(next, 100) : below(next, 9);
  while (references.size < others + (references.has(PASSAGE) ? 1 : 0))
    references.add(next() < 0.1 ? 'Psalm 23:2' : otherReference(next, PASSAGE));
  const records = [...references].flatMap((reference) =>
    historyOf(next, reference, pickOf(next, [...days] as [number, ...number[]])),
  );
  return { next, records, passages };
};

describe('the field of a read garden', () => {
  it('shows the passages first, then each other verse in the order first sown, each at its stage and verse number, with the UTC days sown and the harvest, over 300 generated gardens of up to 140 other verses of any reference, in three time zones', () => {
    const cover = new Map<string, number>();
    const bump = (key: string, by = 1) => cover.set(key, (cover.get(key) ?? 0) + by);
    for (let seed = 1; seed <= 300; seed += 1) {
      const { next, records, passages } = generated(seed);
      const garden = gardenOf(next, records);
      const want = fieldRule(records, passages);
      for (const zone of ZONES) {
        const field = inZone(zone, () => fieldOf(garden, passages));
        expect({ seed, zone, field }).toEqual({ seed, zone, field: want });
      }
      const references = want.rows.flatMap((row) => row.plants.map((plant) => plant.reference));
      expect({ seed, numbers: references.map(verseNumberOf) }).toEqual({
        seed,
        numbers: references.map(verseNumberRule),
      });
      for (const key of reached(records, want, passages)) bump(key);
    }
    expect(Object.keys(Object.fromEntries(cover)).toSorted()).toEqual([
      'forty others',
      'four rows',
      'harvest',
      'local days differ',
      'past forty',
      'reference:beyond ascii',
      'reference:colons',
      'reference:no colon',
      'reference:space',
      'shared days',
      'stage:blade',
      'stage:ear',
      'stage:full corn',
      'stage:not planted',
      'stage:seed',
      'two passages',
    ]);
    const floors = {
      'local days differ': 30,
      harvest: 30,
      'four rows': 30,
      'shared days': 30,
      'forty others': 15,
      'past forty': 15,
      'reference:colons': 100,
      'reference:beyond ascii': 100,
      'reference:space': 100,
      'reference:no colon': 100,
    };
    for (const [key, floor] of Object.entries(floors))
      expect([key, (cover.get(key) ?? 0) >= floor]).toEqual([key, true]);
  });

  it('runs each zone it names: the zone changes the host’s local day and never a UTC day', () => {
    const late = Date.UTC(2026, 0, 1, 23, 30);
    const days = ZONES.map((zone) => inZone(zone, () => [localDate(late), utcDate(late)]));
    expect(days).toEqual([
      ['Thu Jan 01 2026', '2026-01-01'],
      ['Fri Jan 02 2026', '2026-01-01'],
      ['Fri Jan 02 2026', '2026-01-01'],
    ]);
    expect(inZone(ZONES[0], () => localDate(Date.UTC(2026, 0, 2, 2)))).toBe('Thu Jan 01 2026');
  });

  it('counts a day at its UTC edges: 23:59:59.999 and 00:00:00.000 are two days, an evening and a morning in Los Angeles one UTC day each', () => {
    const edge = Date.UTC(2026, 0, 2);
    const records = [
      recallOf(PASSAGE, edge - 1, 3, 0),
      recallOf(PASSAGE, edge, 3, 0),
      recallOf('Made 1:1', edge + DAY - 1, 3, 0),
      recallOf('Made 1:2', edge + 2 * HOUR, 3, 0),
    ];
    const field = inZone(ZONES[0], () =>
      fieldOf(gardenOf(random(1), records), [{ title: PASSAGE, verses: [PASSAGE] }]),
    );
    expect([field.sown, utcDayOf(edge - 1) + 1, utcDayOf(edge + DAY - 1)]).toEqual([
      2,
      utcDayOf(edge),
      utcDayOf(edge),
    ]);
    expect(field.rows.map((row) => row.title)).toEqual([PASSAGE, 'Made 1:2', 'Made 1:1']);
  });

  it('writes its counts and verse numbers as the field shows them', () => {
    expect([0, 1, 2, 41].map(sownText)).toEqual([
      '0 days sown',
      '1 day sown',
      '2 days sown',
      '41 days sown',
    ]);
    expect([0, 1, 2].map(harvestText)).toEqual([
      '0 verses at full corn',
      '1 verse at full corn',
      '2 verses at full corn',
    ]);
    expect(['Isaiah 41:10', 'Obadiah', 'a/b:c', '1 John 1:9 ', 'x:'].map(verseNumberOf)).toEqual([
      '10',
      '',
      'c',
      '9 ',
      '',
    ]);
  });
});
