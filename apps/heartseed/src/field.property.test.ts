/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property builds generated gardens step by step over plain arrays and maps, and switches the host's time zone through `process.env.TZ`, which Bun reads at run time, restoring it in the same synchronous block. */

/**
 * The field's rule (`fieldOf`) over generated read gardens, against the rule
 * written plainly (`test/field-model.ts`) over ts-fsrs's stages. Its seam is
 * the pure derivation the screen draws: the rows and their order, each
 * plant's stage, the days sown and the harvest.
 *
 * The gardens span the rule's domain: the passage with no history or any
 * (every grade, peeks, a Good run to full corn and Again after it), any
 * count of other verses (no ceiling: each doubling as likely as not; one
 * garden of exactly forty), each any non-empty string (any code unit or
 * code point, combining marks, every space, colons, the passage's
 * look-alikes; `test/field-model.ts`), some beside a canonically equivalent
 * twin, sometimes a second passage of several verses; recalls on days
 * shared across verses and at 00:00:00.000, 23:59:59.999, 02:00, 06:00,
 * 22:00 and 23:00 UTC; old records (no offset) beside new ones stamped in
 * zones of every offset (`test/zone.ts`: west and east, half and three
 * quarter hours, ±12-14 h, the bounds ±1080 and 0), and recalls at a local
 * 04:00 (±1 ms, ±30 min), at each daylight-saving change north and south
 * (±1 ms, ±hours), twice at one wall time on a fall-back night, old ones at
 * the UTC midnight, and one set back before a verse's first
 * (`test/day-model.ts`). Each garden is derived under a western, an eastern
 * and a far-eastern zone, so a count in the device's zone fails on any
 * host; a garden that disagrees is shrunk to the fewest references that
 * still do.
 * It misses the screen (`field/screen.test.tsx`) and the garden's read of
 * the device (`field/sown.test.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr } from 'effect';

import { fieldOf, harvestText, sownText, verseNumberOf, type FieldPassage } from './field';
import { plantOf, type Plant, type ReadGarden } from './garden';
import type { Recall } from './sayit';
import {
  countOf,
  fieldRule,
  historyOf,
  HOUR,
  localDate,
  othersOf,
  recallOf,
  referenceKinds,
  shrunk,
  sownDate,
  utcDate,
  verseNumberRule,
} from './test/field-model';
import { edgeMoments, stamped, storedAt } from './test/day-model';
import { below, DAY, keyOf, pickOf, random } from './test/garden-model';
import { inZone } from './test/zone';

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

/** The parts of the domain a garden reaches: each stage shown, a harvest, many rows, a count the UTC dates or the device's own zone would give otherwise, old records beside new, part-hour offsets, a day several verses share, a second passage, and the edges the garden was built at. */
const reached = (
  records: readonly Recall[],
  want: ReturnType<typeof fieldRule>,
  passages: readonly FieldPassage[],
  edges: readonly string[],
) => {
  const keys = want.rows.flatMap((row) => row.plants.map((plant) => `stage:${plant.stage}`));
  keys.push(...edges);
  const local = inZone(ZONES[0], () => new Set(records.map((r) => localDate(r.startedAt))));
  const utc = new Set(records.map((recall) => utcDate(recall.startedAt)));
  const verses = new Map<string, Set<string>>();
  for (const recall of records)
    verses.set(sownDate(recall), (verses.get(sownDate(recall)) ?? new Set()).add(recall.reference));
  if (local.size !== want.sown) keys.push('current-zone count differs');
  if (utc.size !== want.sown) keys.push('utc count differs');
  const old = records.some((recall) => recall.offset === undefined);
  if (old && records.some((recall) => recall.offset !== undefined)) keys.push('old and new');
  if (records.some((recall) => (recall.offset ?? 0) % 60 !== 0)) keys.push('part-hour offset');
  if (want.harvest > 0) keys.push('harvest');
  if (want.rows.length >= 4) keys.push('four rows');
  if (want.rows.length >= 41) keys.push('forty others');
  if (want.rows.length > 41 + passages.length) keys.push('past forty');
  if (want.rows.length > 140 + passages.length) keys.push('past 140');
  if ([...verses.values()].some((each) => each.size > 1)) keys.push('shared days');
  if (passages.length > 1) keys.push('two passages');
  const references = want.rows.flatMap((row) => row.plants.map((plant) => plant.reference));
  const spellings = new Set(references.map((reference) => reference.normalize('NFD')));
  if (spellings.size < new Set(references).size) keys.push('canonical twins');
  for (const reference of references) keys.push(...referenceKinds(reference));
  return keys;
};

/** A generated garden: its records and the passages taught. Its other verses are any count (`countOf`, no ceiling; seed 1 exactly forty) of any references, some beside their canonical twins (`othersOf`). */
const generated = (seed: number) => {
  const next = random(seed * 7919 + 17);
  const base = 20_500 + below(next, 400);
  const days = [base, base, base + 1, base + 3, base + below(next, 60)] as const;
  const passages: FieldPassage[] = [{ title: PASSAGE, verses: [PASSAGE] }];
  if (next() < 0.2)
    passages.push({ title: 'Psalm 23', verses: ['Psalm 23:1', 'Psalm 23:2', 'Psalm 23:3'] });
  const references = new Set<string>();
  if (next() < 0.8) references.add(PASSAGE);
  if (next() < 0.1) references.add('Psalm 23:2');
  for (const reference of othersOf(next, PASSAGE, seed === 1 ? 40 : countOf(next, 8)))
    references.add(reference);
  const records = [...references].flatMap((reference) =>
    historyOf(next, reference, pickOf(next, [...days] as [number, ...number[]])).map((recall) =>
      stamped(next, recall),
    ),
  );
  const edges: string[] = [];
  const keys = new Set(records.map(keyOf));
  const add = (recall: Recall, kind: string) => {
    if (keys.has(keyOf(recall))) return;
    keys.add(keyOf(recall));
    records.push(recall);
    edges.push(kind);
  };
  const held = [...references];
  for (let k = held.length === 0 ? 0 : below(next, 5); k > 0; k -= 1) {
    const reference = pickOf(next, held as [string, ...string[]]);
    const grade = pickOf(next, [1, 2, 3, 3, 4] as const);
    for (const moment of edgeMoments(next))
      add(storedAt(recallOf(reference, 0, grade, 0), moment), moment.kind);
  }
  if (held.length > 0 && next() < 0.15) {
    const reference = pickOf(next, held as [string, ...string[]]);
    const first = Math.min(
      ...records.filter((r) => r.reference === reference).map((r) => r.startedAt),
    );
    const back = first - (1 + below(next, 40)) * HOUR;
    add(stamped(next, recallOf(reference, back, pickOf(next, [1, 3] as const), 0)), 'set back');
  }
  return { records, passages, edges };
};

/** Whether `fieldOf` gives the rule's field over `records` in every zone. */
const agrees = (seed: number, records: readonly Recall[], passages: readonly FieldPassage[]) => {
  const want = fieldRule(records, passages);
  const garden = gardenOf(random(seed), records);
  return ZONES.every((zone) =>
    Bun.deepEquals(
      inZone(zone, () => fieldOf(garden, passages)),
      want,
    ),
  );
};

/** The garden of `records` cut to the fewest references that still disagree with the rule, each zone's field beside the rule's. */
const counterexample = (
  seed: number,
  records: readonly Recall[],
  passages: readonly FieldPassage[],
) => {
  const keep = (references: readonly string[]) => {
    const kept = new Set(references);
    return records.filter((recall) => kept.has(recall.reference));
  };
  const references = shrunk(
    [...new Set(records.map((recall) => recall.reference))],
    (some) => !agrees(seed, keep(some), passages),
  );
  const garden = gardenOf(random(seed), keep(references));
  return ZONES.map((zone) => ({
    seed,
    zone,
    references,
    field: inZone(zone, () => fieldOf(garden, passages)),
  }));
};

describe('the field of a read garden', () => {
  it('shows the passages first, then each other verse in the order first sown, each at its stage and verse number, with the days sown by each record’s own local day from 04:00 (an old record’s UTC date) and the harvest, over 300 generated gardens of any count of other verses of any reference, canonical twins beside each other, old and new records of every offset at 04:00, daylight-saving and UTC-midnight edges, derived in three time zones', () => {
    const cover = new Map<string, number>();
    const bump = (key: string, by = 1) => cover.set(key, (cover.get(key) ?? 0) + by);
    let largest = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const { records, passages, edges } = generated(seed);
      const want = fieldRule(records, passages);
      if (!agrees(seed, records, passages)) {
        const found = counterexample(seed, records, passages);
        const kept = new Set(found[0]?.references);
        const rule = fieldRule(
          records.filter((recall) => kept.has(recall.reference)),
          passages,
        );
        expect(found).toEqual(found.map((each) => ({ ...each, field: rule })));
      }
      const references = want.rows.flatMap((row) => row.plants.map((plant) => plant.reference));
      expect({ seed, numbers: references.map(verseNumberOf) }).toEqual({
        seed,
        numbers: references.map(verseNumberRule),
      });
      largest = Math.max(largest, want.rows.length - passages.length);
      for (const key of reached(records, want, passages, edges)) bump(key);
    }
    expect(Object.keys(Object.fromEntries(cover)).toSorted()).toEqual([
      '04:00 edge',
      'bound offset',
      'canonical twins',
      'current-zone count differs',
      'dst edge',
      'fall-back twice',
      'forty others',
      'four rows',
      'harvest',
      'old and new',
      'old at utc midnight',
      'part-hour offset',
      'past 140',
      'past forty',
      'reference:astral',
      'reference:beyond ascii',
      'reference:colons',
      'reference:combining mark',
      'reference:lone surrogate',
      'reference:long',
      'reference:no colon',
      'reference:not NFC',
      'reference:space',
      'set back',
      'shared days',
      'stage:blade',
      'stage:ear',
      'stage:full corn',
      'stage:not planted',
      'stage:seed',
      'two passages',
      'utc count differs',
    ]);
    const floors = {
      'current-zone count differs': 120,
      'utc count differs': 135,
      'old and new': 170,
      'part-hour offset': 170,
      '04:00 edge': 70,
      'dst edge': 80,
      'fall-back twice': 170,
      'old at utc midnight': 70,
      'bound offset': 70,
      'set back': 18,
      harvest: 30,
      'four rows': 30,
      'shared days': 30,
      'forty others': 15,
      'past forty': 15,
      'past 140': 3,
      'canonical twins': 90,
      'reference:colons': 400,
      'reference:beyond ascii': 1800,
      'reference:space': 2000,
      'reference:no colon': 700,
      'reference:not NFC': 800,
      'reference:combining mark': 800,
      'reference:lone surrogate': 100,
      'reference:astral': 500,
      'reference:long': 800,
    };
    for (const [key, floor] of Object.entries(floors))
      expect([key, cover.get(key) ?? 0, (cover.get(key) ?? 0) >= floor]).toEqual([
        key,
        cover.get(key) ?? 0,
        true,
      ]);
    expect(largest).toBeGreaterThan(256);
  });

  it('keeps canonically equivalent references apart: each spelling its own row, title, stage and verse number, exactly as stored', () => {
    const at = Date.UTC(2026, 2, 1, 9);
    const records = [
      recallOf('e\u0301:1', at, 3, 0),
      recallOf('\u00e9:1', at + HOUR, 3, 0),
      recallOf('\u00e9:1', at + DAY + HOUR, 3, 0),
      recallOf('A\u030a:2', at + 2 * HOUR, 3, 0),
      recallOf('A\u030a:2', at + DAY + 2 * HOUR, 3, 1),
      recallOf('\u00c5:2', at + 3 * HOUR, 3, 0),
      recallOf('s\u0307\u0323:5', at + 4 * HOUR, 3, 0),
    ];
    const twins = [
      ['e\u0301:1', '\u00e9:1'],
      ['A\u030a:2', '\u00c5:2'],
    ];
    expect(twins.map(([a = '', b = '']) => [a === b, a.normalize() === b.normalize()])).toEqual([
      [false, true],
      [false, true],
    ]);
    for (const zone of ZONES.slice(0, 2)) {
      const field = inZone(zone, () =>
        fieldOf(gardenOf(random(18), records), [{ title: PASSAGE, verses: [PASSAGE] }]),
      );
      expect({ zone, field }).toEqual({
        zone,
        field: {
          rows: (
            [
              [PASSAGE, 'not planted'],
              ['e\u0301:1', 'seed'],
              ['\u00e9:1', 'blade'],
              ['A\u030a:2', 'blade'],
              ['\u00c5:2', 'seed'],
              ['s\u0307\u0323:5', 'seed'],
            ] as const
          ).map(([title, stage]) => ({ title, plants: [{ reference: title, stage }] })),
          sown: 2,
          harvest: 0,
        },
      });
      expect(field.rows.map((row) => verseNumberOf(row.title))).toEqual([
        '10',
        '1',
        '1',
        '2',
        '2',
        '5',
      ]);
    }
  });

  it('shows every other verse of a garden of 1,024, none dropped past any count', () => {
    const next = random(19);
    const day = Date.UTC(2026, 4, 1);
    const records = othersOf(next, PASSAGE, 1024).map((reference, at) =>
      recallOf(reference, day + at * 60_000, 3, 0),
    );
    const passages = [{ title: PASSAGE, verses: [PASSAGE] }];
    for (const zone of ZONES.slice(0, 2)) {
      const field = inZone(zone, () => fieldOf(gardenOf(next, records), passages));
      expect({ zone, rows: field.rows.length, field }).toEqual({
        zone,
        rows: 1025,
        field: fieldRule(records, passages),
      });
    }
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

  it('counts a record kept before offsets were stored by its UTC date: 23:59:59.999 and 00:00:00.000 are two days, an evening and a morning in Los Angeles one UTC day each, in every zone the device is in', () => {
    const edge = Date.UTC(2026, 0, 2);
    const records = [
      recallOf(PASSAGE, edge - 1, 3, 0),
      recallOf(PASSAGE, edge, 3, 0),
      recallOf('Made 1:1', edge + DAY - 1, 3, 0),
      recallOf('Made 1:2', edge + 2 * HOUR, 3, 0),
    ];
    for (const zone of ZONES) {
      const field = inZone(zone, () =>
        fieldOf(gardenOf(random(1), records), [{ title: PASSAGE, verses: [PASSAGE] }]),
      );
      expect([zone, field.sown, utcDate(edge - 1), utcDate(edge), utcDate(edge + DAY - 1)]).toEqual(
        [zone, 2, '2026-01-01', '2026-01-02', '2026-01-02'],
      );
      expect(field.rows.map((row) => row.title)).toEqual([PASSAGE, 'Made 1:2', 'Made 1:1']);
    }
  });

  it('counts a record with an offset by its own local day from 04:00: 03:59:59.999 the day before, 04:00 the day itself, a fall-back night’s twice-read 01:30 one day, Kathmandu’s 04:00 by its 45 minutes, and the upgrade’s old evening and new morning one day, in every zone the device is in', () => {
    const at = (offset: number, startedAt: number, reference = PASSAGE): Recall => ({
      ...recallOf(reference, startedAt, 3, 0),
      offset,
    });
    const four = Date.UTC(2026, 0, 6, 9);
    const cases: readonly (readonly [string, readonly Recall[], number])[] = [
      ['03:59:59.999 and 04:00 New York', [at(-300, four - 1), at(-300, four)], 2],
      ['04:00 and 03:59:59.999 next', [at(-300, four), at(-300, four + DAY - 1)], 1],
      ['04:00:00.001 and 03:59:59.999 next', [at(-300, four + 1), at(-300, four + DAY - 1)], 1],
      [
        'a fall-back night’s 01:30 twice',
        [at(-240, Date.UTC(2026, 10, 1, 5, 30)), at(-300, Date.UTC(2026, 10, 1, 6, 30))],
        1,
      ],
      [
        'Kathmandu either side of 04:00',
        [at(345, Date.UTC(2026, 0, 5, 22, 15) - 1), at(345, Date.UTC(2026, 0, 5, 22, 15))],
        2,
      ],
      [
        'the upgrade’s old 21:00 and a new 08:00',
        [recallOf(PASSAGE, Date.UTC(2026, 0, 6, 2), 3, 0), at(-300, Date.UTC(2026, 0, 6, 13))],
        1,
      ],
      ['the bounds', [at(1080, Date.UTC(2026, 0, 6, 0)), at(-1080, Date.UTC(2026, 0, 6, 23))], 1],
    ];
    for (const zone of ZONES)
      for (const [name, records, sown] of cases) {
        const field = inZone(zone, () =>
          fieldOf(gardenOf(random(2), records), [{ title: PASSAGE, verses: [PASSAGE] }]),
        );
        expect({ zone, name, sown: field.sown }).toEqual({ zone, name, sown });
      }
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
