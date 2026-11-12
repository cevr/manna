/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals -- the generator draws its gardens in plain branches over undefined and tallies its kinds in a plain map, apart from the field's Option code, and compares two fields as JSON text. */

/**
 * The field folds the old pieces an earlier build kept into their verse
 * (hsphrase H7, and hspiece's rule M with the owner's q87 (b)), at the pure seam:
 * `fieldOf` over generated gardens against `test/phrase-model.ts`'s
 * `fieldFoldRule`, written plainly over the records and ts-fsrs's stages.
 *
 * Each garden has the app's own row, up to two held passages with ranges
 * and a taught row with none (`Protection & Fear`), over made-up verses,
 * and verses no row holds (a removed passage's). Each verse has one
 * history: none, phrases only, joined (its own plant beside its phrases'),
 * whole, or a stale `[1-3]`; each plant a few recalls or a Good run to full
 * corn, kept in any zone or before offsets were stored. Strays sit beside
 * them: near misses of the reference form (`[0-3]`, `[3-1]`, no space),
 * which are rows of their own.
 *
 * It catches a phrase shown as a row or a plant, a verse in phrases alone
 * shown at any stage but `not planted`, a removed verse's phrases dropped or ordered by its own
 * plant alone, days that skip a phrase's recalls, a harvest that counts a
 * phrase at full corn, and a near miss read as a phrase.
 */

import { describe, expect, it } from 'bun:test';

import { fieldOf, type FieldPassage } from '../field';
import { plantOf, type ReadGarden } from '../garden';
import type { Recall } from '../sayit';
import { historyOf, sownDate } from '../test/field-model';
import { below, DAY, pickOf, random, referenceStage } from '../test/garden-model';
import { fieldFoldRule, phraseOfRule } from '../test/phrase-model';
import { offsetIn, ZONES } from '../test/zone';

const CASES = 600;
const PROMISE = 'Isaiah 41:10';
const EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / DAY);

type Tally = Map<string, number>;

const bump = (tally: Tally, kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

const HISTORIES = ['none', 'phrases', 'joined', 'whole', 'stale'] as const;

type History = (typeof HISTORIES)[number];

/** A garden's records and the rows it is shown under. */
interface Case {
  readonly records: Recall[];
  readonly passages: FieldPassage[];
}

/** Sows `reference`'s recalls from a day in the first months of 2026, each kept in `zone` or with no offset. */
const sowOf = (next: () => number, records: Recall[]) => (reference: string) => {
  const zone = below(next, 5) === 0 ? undefined : pickOf(next, [...ZONES]);
  for (const recall of historyOf(next, reference, EPOCH_DAY + below(next, 60)))
    records.push(
      zone === undefined ? recall : { ...recall, offset: offsetIn(zone, recall.startedAt) },
    );
};

/** Sows `verse` by `history`: its phrases (one to four, sizes made up), its own plant beside them, itself alone, or a stale phrase. */
const sowVerse = (
  next: () => number,
  sow: (reference: string) => void,
  verse: string,
  history: History,
) => {
  if (history === 'whole' || history === 'joined') sow(verse);
  if (history === 'stale') sow(`${verse} [1-3]`);
  if (history !== 'phrases' && history !== 'joined') return;
  let first = 1;
  for (let n = 1 + below(next, 4); n > 0; n--) {
    const last = first + 3 + below(next, 9);
    if (below(next, 4) > 0) sow(`${verse} [${first}-${last}]`);
    first = last + 1;
  }
};

const caseOf = (next: () => number, tally: Tally): Case => {
  const records: Recall[] = [];
  const sow = sowOf(next, records);
  const verse = (chapter: number, at: number) => `Psalms ${chapter}:${at}`;
  const sown = (reference: string) => {
    const history = pickOf(next, [...HISTORIES]);
    bump(tally, `gen:${history}`);
    sowVerse(next, sow, reference, history);
  };
  if (below(next, 4) > 0) sow(PROMISE);
  const passages: FieldPassage[] = [{ title: PROMISE, verses: [PROMISE] }];
  const held = below(next, 3);
  for (let chapter = 1; chapter <= held; chapter++) {
    const first = 1 + below(next, 5);
    const last = first + below(next, 4);
    const verses = Array.from({ length: last - first + 1 }, (_, k) => verse(chapter, first + k));
    passages.push({
      title: `Psalms ${chapter}:${first}-${last}`,
      verses,
      range: { book: 19, chapter, first, last },
    });
    verses.forEach(sown);
  }
  if (below(next, 2) === 0) {
    const verses = Array.from({ length: 1 + below(next, 4) }, (_, k) => verse(9, k + 1));
    passages.push({ title: 'Protection & Fear', verses });
    verses.forEach(sown);
  }
  for (let k = below(next, 3); k > 0; k--) sown(verse(20 + k, 1 + below(next, 9)));
  if (below(next, 4) === 0)
    sow(pickOf(next, ['Psalms 7:1 [0-3]', 'Psalms 7:1 [3-1]', 'Psalms 7:1[1-3]'] as const));
  return { records, passages };
};

const gardenOf = (records: readonly Recall[]): ReadGarden => {
  const plants = new Map<string, Recall[]>();
  for (const recall of records)
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  return {
    _tag: 'Read',
    plants: new Map(
      [...plants].map(([reference, recalls]) => [
        reference,
        plantOf(recalls.toSorted((a, b) => a.startedAt - b.startedAt) as [Recall, ...Recall[]]),
      ]),
    ),
  };
};

/** The kinds a case's field reaches, by the model. */
const tallyField = (each: Case, want: ReturnType<typeof fieldFoldRule>, tally: Tally) => {
  const byReference = new Map<string, Recall[]>();
  for (const recall of each.records)
    byReference.set(recall.reference, [...(byReference.get(recall.reference) ?? []), recall]);
  const phrasesOf = (verse: string) =>
    [...byReference.keys()].filter((key) => phraseOfRule(key)?.verse === verse);
  const held = new Set(each.passages.flatMap((passage) => passage.verses));
  want.rows.forEach((row) => {
    for (const plant of row.plants) {
      const phrased = phrasesOf(plant.reference).length > 0;
      if (plant.stage === 'not planted' && phrased)
        bump(
          tally,
          held.has(plant.reference) ? 'field:verse-in-phrases' : 'field:other-verse-from-phrases',
        );
      if (byReference.has(plant.reference) && phrased) bump(tally, 'field:joined');
      if (row.title === 'Protection & Fear' && plant.stage === 'not planted' && phrased)
        bump(tally, 'field:taught-in-phrases');
      if (plant.stage === 'full corn' && phrased) bump(tally, 'field:joined-full-corn');
    }
    if (held.has(row.title) || row.plants.length !== 1) return;
    const own = byReference.get(row.title) ?? [];
    const phraseStarts = phrasesOf(row.title).flatMap((key) =>
      (byReference.get(key) ?? []).map((recall) => recall.startedAt),
    );
    if (own.length > 0 && phraseStarts.some((at) => own.every((recall) => at < recall.startedAt)))
      bump(tally, 'field:other-first-by-phrase');
  });
  const verseDays = new Set(
    each.records.filter((recall) => phraseOfRule(recall.reference) === undefined).map(sownDate),
  );
  if (
    each.records.some(
      (recall) => phraseOfRule(recall.reference) !== undefined && !verseDays.has(sownDate(recall)),
    )
  )
    bump(tally, 'field:phrase-day-only');
  for (const [reference, recalls] of byReference) {
    if (phraseOfRule(reference) !== undefined && referenceStage(recalls) === 'full corn')
      bump(tally, 'field:phrase-full-corn');
    if (reference.includes('[') && phraseOfRule(reference) === undefined)
      bump(tally, 'field:near-miss-row');
  }
};

/** The field as the model's rows name it: each row's title and its plants as `[reference, stage]`. */
const seenOf = (field: {
  readonly rows: readonly {
    readonly title: string;
    readonly plants: readonly { readonly reference: string; readonly stage: string }[];
  }[];
  readonly sown: number;
  readonly harvest: number;
}) =>
  JSON.stringify({
    rows: field.rows.map((row) => [
      row.title,
      row.plants.map((plant) => [plant.reference, plant.stage]),
    ]),
    sown: field.sown,
    harvest: field.harvest,
  });

describe('the field folds old pieces into their verse', () => {
  it('shows a verse in old pieces alone as not planted, a removed verse’s phrases as its row, and counts phrase days but no phrase harvest, as H7 makes them, over generated gardens', () => {
    const next = random(7_007);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let n = 0; n < CASES && wrong.length < 3; n++) {
      const each = caseOf(next, tally);
      const got = fieldOf(gardenOf(each.records), each.passages);
      const want = fieldFoldRule(each.records, each.passages);
      if (seenOf(got) !== seenOf(want))
        wrong.push(`case ${n}: ${seenOf(got)} where H7 has ${seenOf(want)}`);
      const ranges = got.rows.slice(0, each.passages.length).map((row) => row.range);
      if (JSON.stringify(ranges) !== JSON.stringify(each.passages.map((passage) => passage.range)))
        wrong.push(`case ${n}: the held rows lost their ranges`);
      tallyField(each, want, tally);
    }
    expect(wrong).toEqual([]);
    const floors: readonly (readonly [string, number])[] = [
      ['field:verse-in-phrases', 400],
      ['field:other-verse-from-phrases', 100],
      ['field:joined', 250],
      ['field:taught-in-phrases', 150],
      ['field:joined-full-corn', 90],
      ['field:other-first-by-phrase', 35],
      ['field:phrase-day-only', 250],
      ['field:phrase-full-corn', 400],
      ['field:near-miss-row', 70],
    ];
    const short = floors.filter(([kind, floor]) => (tally.get(kind) ?? 0) < floor);
    expect(short.map(([kind, floor]) => `${kind} ${tally.get(kind) ?? 0} < ${floor}`)).toEqual([]);
  });

  it('shows a verse whose only plant is an old piece not planted on its row, and a removed verse’s old pieces as its own row, their days still sown', () => {
    const recall = (reference: string, startedAt: number): Recall => ({
      reference,
      startedAt,
      offset: -300,
      grade: 3,
      suggested: 3,
      words: 6,
      missed: 0,
      peeked: 0,
      extra: 0,
    });
    const day = Date.UTC(2026, 10, 2, 15);
    const records = [
      recall(PROMISE, day),
      recall('John 3:16 [1-6]', day + DAY),
      recall('John 15:2 [7-13]', day + 2 * DAY),
    ];
    const field = fieldOf(gardenOf(records), [
      { title: PROMISE, verses: [PROMISE] },
      {
        title: 'John 3:16',
        verses: ['John 3:16'],
        range: { book: 43, chapter: 3, first: 16, last: 16 },
      },
    ]);
    expect(seenOf(field)).toBe(
      JSON.stringify({
        rows: [
          [PROMISE, [[PROMISE, 'seed']]],
          ['John 3:16', [['John 3:16', 'not planted']]],
          ['John 15:2', [['John 15:2', 'not planted']]],
        ],
        sown: 3,
        harvest: 0,
      }),
    );
  });
});
