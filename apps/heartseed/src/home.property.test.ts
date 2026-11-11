/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its cases in plain branches, tallies its kinds in plain maps and names a wrong case by its references as JSON text. */

/**
 * The home's rules (hshomebase H1, H2, H5) at their pure seam, against
 * `test/home-model.ts`:
 *
 * - `furrowsOf` over generated read gardens (the lists' verses, phrase
 *   plants, references of any text and their near-miss twins, records
 *   stamped in every zone) and generated lists (own rows, 0 to 5 held
 *   ranges or unread, taught ids none, one, several or unknown, lists
 *   overlapping on a verse), derived in each zone of `test/zone.ts`,
 *   against `furrowsModel` over the phrase model's fold of the field;
 * - `kindOf` and `iconOf` over the four sources and a passage of each of
 *   the 66 books;
 * - `readyOf` over plans `planModel` makes (phrases, joins, the new piece,
 *   each item done or not) and over arbitrary items (a done new piece, a
 *   phrase beside its verse, a reference the garden lacks), against
 *   `readyModel`;
 * - `greetingAt` at every minute of a generated day in each of the 15
 *   zones and across each daylight-saving change of New York, Berlin,
 *   Sydney and Lord Howe, against the wall clock `Intl` reads in that zone;
 *   `minuteOf` at instants before 1970 and offsets to ±1080; `greetingOf`
 *   at its edges.
 *
 * It catches a furrow moved, a kind or icon of the wrong source or book, a
 * caption of the wrong form or a plural for one verse, a ready mark on a done item or missing on
 * a phrase's verse, and a greeting a minute early or by UTC.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import type { PlantStage } from './field';
import { plantOf, type Plant, type ReadGarden } from './garden';
import {
  captionOf,
  furrowsOf,
  greetingAt,
  greetingOf,
  iconOf,
  kindOf,
  minuteOf,
  readyOf,
  type Furrow,
} from './home';
import { listsOf, type ListSource } from './lists';
import type { PassagesView } from './passages';
import { collectionsOf } from './promises/taught';
import type { Recall } from './sayit';
import type { Item } from './session';
import { CHANGES, stamped } from './test/day-model';
import { recallOf, type ModelPassage } from './test/field-model';
import { below, pickOf, random } from './test/garden-model';
import {
  furrowsModel,
  greetingModel,
  heldOf,
  iconRule,
  kindRule,
  listsModel,
  minuteModel,
  plannedOf,
  readyModel,
  recordsOf,
  taughtOf,
  type ModelFurrow,
  type ModelSource,
} from './test/home-model';
import type { Held } from './test/passages-model';
import { choosableOf } from './test/passages-rig';
import { verseOfRule } from './test/phrase-model';
import { HOUR, MINUTE } from './test/session-model';
import { inZone, ZONES } from './test/zone';

const OWN_VERSE = 'Isaiah 41:10';

const OWN: readonly ModelPassage[] = [{ title: OWN_VERSE, verses: [OWN_VERSE] }];

type Tally = Map<string, number>;

const bump = (tally: Tally, kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

/** A read garden of `records`, each reference's plant folded by the garden. */
const gardenOf = (records: readonly Recall[]): ReadGarden => {
  const byReference = new Map<string, Recall[]>();
  for (const recall of records)
    byReference.set(recall.reference, [...(byReference.get(recall.reference) ?? []), recall]);
  const plants = new Map<string, Plant>();
  for (const [reference, recalls] of byReference)
    if (Arr.isReadonlyArrayNonEmpty(recalls)) plants.set(reference, plantOf(recalls));
  return { _tag: 'Read', plants };
};

/** A list's source in the model's shape. */
const plainSource = (source: ListSource): ModelSource => {
  if (source._tag === 'Passage') {
    const { book, chapter, first, last } = source.range;
    return { tag: 'Passage', span: { book, chapter, first, last } };
  }
  if (source._tag === 'Collection') return { tag: 'Collection', id: source.id };
  if (source._tag === 'Handbook') return { tag: 'Handbook', id: source.id };
  return { tag: source._tag };
};

/** A furrow as plain JSON in the model's shape. */
const plainFurrow = (furrow: Furrow): ModelFurrow => ({
  id: furrow.id,
  title: furrow.title,
  range:
    furrow.range === undefined
      ? undefined
      : {
          book: furrow.range.book,
          chapter: furrow.range.chapter,
          first: furrow.range.first,
          last: furrow.range.last,
        },
  source: plainSource(furrow.source),
  kind: furrow.kind,
  icon: furrow.icon,
  caption: furrow.caption,
  plants: furrow.plants.map((plant) => ({
    reference: plant.reference,
    stage: plant.stage,
    ready: plant.ready,
    label: plant.label,
  })),
});

/** The own rows: the promise's, none, or the promise's and the first verse of Psalm 23. */
const ownOf = (next: () => number): readonly ModelPassage[] => {
  const roll = below(next, 6);
  if (roll === 0) return [];
  if (roll === 1) return [...OWN, { title: 'Psalms 23:1', verses: ['Psalms 23:1'] }];
  return OWN;
};

const viewOf = (held: Held): PassagesView =>
  held.tag === 'Read' ? { _tag: 'Read', passages: held.passages, lists: [] } : { _tag: 'Unread' };

/** The kinds a case's furrows reach, by the model. */
const tallyFurrows = (want: readonly ModelFurrow[], records: readonly Recall[], tally: Tally) => {
  const plants = want.flatMap((furrow) => furrow.plants);
  const references = plants.map((plant) => plant.reference);
  if (new Set(references).size < references.length) bump(tally, 'a verse in two lists');
  if (records.some((r) => verseOfRule(r.reference) !== r.reference)) bump(tally, 'phrase plants');
  for (const kind of new Set(want.map((furrow) => furrow.kind))) bump(tally, `kind:${kind}`);
  for (const furrow of want) {
    if (furrow.caption.endsWith(' ready today')) bump(tally, 'caption:ready');
    else if (furrow.caption.endsWith(' planted')) bump(tally, 'caption:planted');
    else bump(tally, 'caption:to learn');
    if (furrow.caption.startsWith('1 verse ')) bump(tally, 'caption:one verse');
  }
  if (plants.some((plant) => plant.stage === 'ear')) bump(tally, 'an ear');
  if (plants.some((plant) => plant.ready)) bump(tally, 'ready');
};

describe('the furrows', () => {
  it('are the rows of the field, each its list’s id, title, range, kind and icon, its caption and each plant’s stage, ready mark and label, as H1 makes them over generated gardens and lists in every zone', () => {
    const next = random(7_301);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let run = 0; run < 240 && wrong.length < 3; run++) {
      const own = ownOf(next);
      const held = heldOf(next, (more, passages) => choosableOf(more, passages)[1]);
      const [, taught] = taughtOf(next);
      const modelLists = listsModel(own, held, taught);
      const lists = listsOf(own, viewOf(held), collectionsOf(taught));
      const records = recordsOf(next, modelLists, OWN_VERSE).map((recall) => stamped(next, recall));
      const verses = [
        ...new Set([
          ...modelLists.flatMap((list) => list.verses),
          ...records.map((r) => verseOfRule(r.reference)),
        ]),
      ];
      const ready = new Set(verses.filter(() => below(next, 3) === 0));
      if (below(next, 4) === 0) ready.add('Nowhere 1:1');
      const zone = ZONES[run % ZONES.length] ?? 'UTC';
      const got = inZone(zone, () => furrowsOf(gardenOf(records), lists, ready)).map(plainFurrow);
      const want = furrowsModel(records, modelLists, ready);
      if (JSON.stringify(got) !== JSON.stringify(want))
        wrong.push(`run ${run} in ${zone}: ${JSON.stringify(got).slice(0, 300)}`);
      tallyFurrows(want, records, tally);
    }
    expect(wrong).toEqual([]);
    for (const [kind, floor] of [
      ['a verse in two lists', 30],
      ['phrase plants', 30],
      ['kind:other', 30],
      ['kind:own', 30],
      ['kind:held', 30],
      ['kind:taught', 30],
      ['caption:ready', 30],
      ['caption:planted', 30],
      ['caption:to learn', 30],
      ['caption:one verse', 30],
      ['an ear', 30],
      ['ready', 30],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });

  it('caption each furrow in words: ready today first, else planted, else to learn, one verse singular', () => {
    const plant = (stage: PlantStage, ready = false) => ({ stage, ready });
    expect(
      [
        [plant('seed', true)],
        [plant('seed', true), plant('ear', true), plant('not planted')],
        [plant('blade')],
        [plant('full corn'), plant('ear'), plant('not planted')],
        [plant('not planted')],
        [plant('not planted'), plant('not planted')],
        [plant('not planted', true)],
      ].map(captionOf),
    ).toEqual([
      '1 verse · 1 ready today',
      '3 verses · 2 ready today',
      '1 verse · 1 planted',
      '3 verses · 2 planted',
      '1 verse to learn',
      '2 verses to learn',
      '1 verse · 1 ready today',
    ]);
  });

  it('take their kind and icon from the source: a bow for the own row and a collection, a harp for a psalm, a lamp for a proverb, a scroll for any other book and a loose verse', () => {
    const sources: ListSource[] = [
      { _tag: 'Own' },
      { _tag: 'Collection', id: 'protection' },
      { _tag: 'Loose' },
    ];
    for (let book = 1; book <= 66; book++)
      sources.push({ _tag: 'Passage', range: { book, chapter: 1, first: 1, last: 2 } });
    const got = sources.map((source): string[] => [kindOf(source), iconOf(source)]);
    const want = sources.map((source) => [
      kindRule(plainSource(source)),
      iconRule(plainSource(source)),
    ]);
    expect(got).toEqual(want);
    expect(got.slice(0, 3)).toEqual([
      ['own', 'bow'],
      ['taught', 'bow'],
      ['other', 'scroll'],
    ]);
    expect([got[3 + 18], got[3 + 19], got[3 + 22]]).toEqual([
      ['held', 'harp'],
      ['held', 'lamp'],
      ['held', 'scroll'],
    ]);
  });
});

/** A plan case: the plan `planModel` makes over pieces with histories (`plannedOf`), then some of its items recited. */
const planCaseOf = (next: () => number, tally: Tally) => {
  const { at, records, items } = plannedOf(next);
  const after = [...records];
  items.forEach((item, index) => {
    if (below(next, 2) === 0) return;
    after.push(recallOf(item.reference, at + (index + 1) * MINUTE, 3, 0));
    if (item.fresh) bump(tally, 'done new piece');
  });
  for (const item of items)
    if (
      verseOfRule(item.reference) !== item.reference &&
      after.filter((r) => r.reference === item.reference).length <= item.recalls
    )
      bump(tally, 'open phrase item');
  return { items, records: after };
};

/** Arbitrary items over a case's records: planted references, phrases of them, references the garden lacks, any baseline, new or not. */
const anyItemsOf = (next: () => number, records: readonly Recall[], tally: Tally): Item[] => {
  const planted = [...new Set(records.map((recall) => recall.reference))];
  const items: Item[] = [];
  for (let n = below(next, 6); n > 0; n--) {
    const roll = below(next, 4);
    const base = planted[below(next, planted.length)] ?? 'Psalms 1:1';
    const reference =
      roll === 0
        ? `${verseOfRule(base)} [1-${4 + below(next, 6)}]`
        : roll === 1
          ? `Nowhere ${1 + below(next, 9)}:1`
          : base;
    const now = records.filter((recall) => recall.reference === reference).length;
    const fresh = below(next, 3) === 0;
    const recalls = Math.max(0, now - 1 + below(next, 3));
    items.push({ reference, fresh, recalls, seconds: 12 });
    if (roll === 0 && below(next, 2) === 0)
      items.push({ reference: verseOfRule(reference), fresh: false, recalls: 0, seconds: 12 });
    if (roll === 0 && items.some((item) => item.reference === verseOfRule(reference)))
      bump(tally, 'phrase beside its verse');
    if (roll === 1) bump(tally, 'not in the garden');
    if (fresh && now > recalls) bump(tally, 'done new piece');
  }
  return items;
};

describe('ready', () => {
  it('marks each verse of an open plan item, a phrase’s verse for a phrase, and nothing for a done item, as H2 makes it over planned and arbitrary items', () => {
    const next = random(7_302);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let run = 0; run < 400 && wrong.length < 3; run++) {
      const { items: planned, records } = planCaseOf(next, tally);
      const items = run % 2 === 0 ? planned : anyItemsOf(next, records, tally);
      const garden = gardenOf(records);
      const got = [...readyOf(Option.some({ items }), garden)].toSorted();
      const want = [...readyModel(items, records)].toSorted();
      if (JSON.stringify(got) !== JSON.stringify(want))
        wrong.push(`run ${run}: ${JSON.stringify(got)} where H2 has ${JSON.stringify(want)}`);
      if (readyOf(Option.none(), garden).size > 0) wrong.push(`run ${run}: ready with no plan`);
    }
    expect(wrong).toEqual([]);
    for (const [kind, floor] of [
      ['open phrase item', 20],
      ['done new piece', 20],
      ['phrase beside its verse', 20],
      ['not in the garden', 20],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });
});

/** A greeting as `<words> <icon>`. */
const said = (greeting: { readonly words: string; readonly icon: string }) =>
  `${greeting.words} ${greeting.icon}`;

describe('the greeting', () => {
  it('says morning from 04:00, afternoon from 12:00 and evening from 18:00 by the wall clock, at every minute of a day in each of the 15 zones', () => {
    const next = random(7_303);
    const wrong: string[] = [];
    for (const zone of ZONES) {
      const day = Date.UTC(1950 + below(next, 90), below(next, 12), 1 + below(next, 28));
      inZone(zone, () => {
        for (let minute = 0; minute < 1440; minute++) {
          const at = day + minute * MINUTE + below(next, MINUTE);
          if (said(greetingAt(at)) !== greetingModel(zone, at))
            wrong.push(`${zone} ${new Date(at).toISOString()}`);
        }
      });
    }
    expect(wrong.slice(0, 3)).toEqual([]);
  });

  it('follows the wall clock across each daylight-saving change of New York, Berlin, Sydney and Lord Howe', () => {
    const changes = CHANGES.filter((change) =>
      ['America/New_York', 'Europe/Berlin', 'Australia/Sydney', 'Australia/Lord_Howe'].includes(
        change.zone,
      ),
    );
    const wrong: string[] = [];
    for (const change of changes)
      inZone(change.zone, () => {
        const moments = [change.at - 1, change.at];
        for (let at = change.at - 12 * HOUR; at <= change.at + 12 * HOUR; at += MINUTE)
          moments.push(at);
        for (const at of moments)
          if (said(greetingAt(at)) !== greetingModel(change.zone, at))
            wrong.push(`${change.zone} ${new Date(at).toISOString()}`);
      });
    expect(changes.length).toBe(8);
    expect(wrong.slice(0, 3)).toEqual([]);
  });

  it('turns at 04:00, 12:00 and 18:00 exactly', () => {
    expect([239, 240, 719, 720, 1079, 1080, 0, 1439].map((m) => said(greetingOf(m)))).toEqual([
      'Good evening moon',
      'Good morning sun',
      'Good morning sun',
      'Good afternoon sun',
      'Good afternoon sun',
      'Good evening moon',
      'Good evening moon',
      'Good evening moon',
    ]);
  });

  it('reads the local minute at instants before 1970 and after, at offsets out to ±1080', () => {
    const next = random(7_304);
    const wrong: string[] = [];
    for (let run = 0; run < 3000; run++) {
      const at = Math.floor((next() - 0.5) * 8e12);
      const offset = pickOf(next, [-1080, 1080, 0, below(next, 2161) - 1080] as const);
      const got = minuteOf(at, offset);
      if (got !== minuteModel(at, offset)) wrong.push(`${at} ${offset}: ${got}`);
    }
    expect(wrong.slice(0, 3)).toEqual([]);
  });
});
