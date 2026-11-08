/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the generator draws its gardens in plain branches over undefined and tallies its kinds in plain maps, apart from the plan's and the cue's Option code. */

/**
 * Phrases first, then the join, then the verse alone (hsphrase H4-H6, H9's
 * known), at the pure seam: `planOf` and `cueIn` over generated gardens,
 * against `test/phrase-model.ts`'s expansion and join cue with
 * `test/session-model.ts`'s plan, and `needOf` over phrase plants against
 * hspromise's need rule over the references planted.
 *
 * Each case is the app's own long verse (never phrased) and one to four
 * verses of made-up text (three in four long, cut by the model's H1), one
 * sometimes twice under another group, each with one history: none,
 * some phrases, a gap among them, every phrase ripe (each at an ear or
 * full corn, some with a fresh Again on one), joined (its phrases' records kept), whole, or a stale
 * `[1-3]`; with a stray phrase of a verse in no piece, phrases first
 * recalled today or one evening, in fifteen zones, at every minutes
 * choice.
 *
 * It catches a join offered before every phrase is at an ear (or at a
 * blade) or held back until every phrase is at full corn, kept once a
 * phrase falls back, or offered with its phrases;
 * phrases kept after the join, offered out of order or more than one a day;
 * a phrase planted today that does not hold back the day's new piece; a
 * join cued with the full text or nothing, or a planted verse cued as a
 * join; and a verse counted known by its phrases.
 */

import { describe, expect, it } from 'bun:test';

import { cueIn, plantOf, type ReadGarden } from '../garden';
import { needOf } from '../need';
import { COLLECTIONS, TAUGHT } from '../promises';
import type { Recall } from '../sayit';
import { MINUTES, planOf, type Minutes } from '../session';
import { below, pickOf, random, referenceStage } from '../test/garden-model';
import type { ModelTextPiece } from '../test/passages-model';
import {
  expandRule,
  joinCueRule,
  phraseOfRule,
  verseOfRule,
  withPhrasesRule,
} from '../test/phrase-model';
import { needModel, promiseVerses } from '../test/promise-model';
import { DAY, dueModel, HOUR, localDay, MINUTE, planModel } from '../test/session-model';
import { offsetIn, ZONES } from '../test/zone';

const CASES = 900;

type Tally = Map<string, number>;

const bump = (tally: Tally, kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

const GROUPS = ['Psalms 91:1-4', 'John 3:16-18', 'Protection & Fear'] as const;

const HISTORIES = ['none', 'phrases', 'gap', 'ripe', 'joined', 'whole', 'stale'] as const;

type History = (typeof HISTORIES)[number];

/** A made-up verse text of `count` words, a comma, a strong stop or nothing after each. */
const textOf = (next: () => number, count: number) => {
  const words: string[] = [];
  for (let n = 1; n <= count; n++) {
    const roll = below(next, 20);
    const mark = roll < 4 ? ',' : roll < 6 ? '.' : roll === 6 ? ';' : '';
    words.push(`w${n}${mark}`);
  }
  return words.join(' ');
};

const pieceOf = (reference: string, text: string, group: string): ModelTextPiece =>
  withPhrasesRule({ reference, text, words: text.split(' ').length, group });

/** The app's own verse: long, yet never phrased (H3). */
const OWN: ModelTextPiece = {
  reference: 'Isaiah 41:10',
  text: 'o '.repeat(25).trim(),
  words: 25,
  group: 'Isaiah 41:10',
};

interface Case {
  readonly zone: string;
  readonly at: number;
  readonly minutes: Minutes;
  readonly pieces: readonly ModelTextPiece[];
  readonly histories: ReadonlyMap<string, History>;
  readonly plants: Map<string, Recall[]>;
}

/** The ways a case's recalls are sown on `plants`, in `zone`, before `at`. */
const sowerOf = (next: () => number, zone: string, at: number, plants: Map<string, Recall[]>) => {
  const sow = (reference: string, startedAt: number, grade: Recall['grade'], peeked = 0) => {
    const recall: Recall = {
      reference,
      startedAt,
      offset: offsetIn(zone, startedAt),
      grade,
      suggested: 3,
      words: 9,
      missed: 0,
      peeked,
      extra: 0,
    };
    plants.set(reference, [...(plants.get(reference) ?? []), recall]);
  };
  /** One to three recalls, the first `back` days before `at`, a few days apart. */
  const recalls = (reference: string, back: number) => {
    let when = at - back * DAY - below(next, 12) * HOUR;
    for (let n = 1 + below(next, 3); n > 0 && when < at; n--) {
      sow(reference, when, pickOf(next, [1, 3, 3, 3, 4] as const), below(next, 3) === 0 ? 1 : 0);
      when += (1 + below(next, 5)) * DAY;
    }
  };
  /** Three clean recalls days apart: a seed, a blade under first letters, then an ear (one or two days apart) or full corn (four, then five); the first two alone for a `blade`. */
  const ripe = (reference: string, blade = false) => {
    const back = 12 + below(next, 90);
    const [first, second] =
      below(next, 3) === 0 ? [1 + below(next, 2), 1 + below(next, 2)] : [4, 5];
    const days = blade ? [back, back - first] : [back, back - first, back - first - second];
    for (const day of days) sow(reference, at - day * DAY, 3);
  };
  /** One recall today, or one last evening (held to the morning). */
  const recent = (reference: string) => {
    if (below(next, 2) === 0) sow(reference, at - below(next, 3) * HOUR - MINUTE, 3);
    else sow(reference, at - (8 + below(next, 6)) * HOUR, 3);
  };
  return { sow, recalls, ripe, recent };
};

type Sower = ReturnType<typeof sowerOf>;

/** Sows `piece`'s history: some of its phrases (the first left out for a gap, the last today or last evening in a third), all ripe (one fallen back in a third), joined, whole, or a stale phrase. */
const sowHistory = (
  next: () => number,
  sower: Sower,
  at: number,
  piece: ModelTextPiece,
  history: History,
  tally: Tally,
) => {
  const phrases = piece.phrases ?? [];
  if (history === 'whole') sower.recalls(piece.reference, 1 + below(next, 40));
  if (history === 'stale')
    sower.sow(`${piece.reference} [1-3]`, at - (1 + below(next, 20)) * DAY, 3);
  if (history === 'phrases' || history === 'gap') {
    const upTo = 1 + below(next, Math.max(1, phrases.length - 1));
    phrases.slice(0, upTo).forEach((phrase, index) => {
      if (history === 'gap' && index === 0 && upTo > 1) return;
      if (index === upTo - 1 && below(next, 3) === 0) sower.recent(phrase.reference);
      else sower.recalls(phrase.reference, 1 + below(next, 30));
    });
  }
  if (history !== 'ripe' && history !== 'joined') return;
  const blade = history === 'ripe' && below(next, 4) === 0 ? below(next, phrases.length) : -1;
  if (blade >= 0) bump(tally, 'gen:ripe-but-one-blade');
  phrases.forEach((phrase, index) => sower.ripe(phrase.reference, index === blade));
  if (history === 'joined') sower.recalls(piece.reference, 1 + below(next, 10));
  else if (below(next, 3) === 0) {
    const fallen = pickOf(next, phrases as [ModelTextPiece, ...ModelTextPiece[]]);
    sower.sow(fallen.reference, at - (1 + below(next, 20)) * HOUR, 1);
    bump(tally, 'gen:ripe-then-again');
  }
};

/** A verse of made-up text, three in four long. */
const verseOf = (next: () => number, k: number) => {
  const words = below(next, 4) > 0 ? 13 + below(next, 40) : 1 + below(next, 12);
  return pieceOf(
    `Psalms ${k}:${1 + below(next, 9)}`,
    textOf(next, words),
    pickOf(next, [...GROUPS]),
  );
};

const caseOf = (next: () => number, tally: Tally): Case => {
  const zone = pickOf(next, [...ZONES]);
  const at = Date.UTC(2026, below(next, 12), 1 + below(next, 28), below(next, 24), below(next, 60));
  const minutes = pickOf(next, [...MINUTES]);
  const plants = new Map<string, Recall[]>();
  const sower = sowerOf(next, zone, at, plants);
  sower.sow(OWN.reference, at - (1 + below(next, 30)) * DAY, 3);
  const pieces: ModelTextPiece[] = [OWN];
  const histories = new Map<string, History>();
  const count = 1 + below(next, 4);
  for (let k = 1; k <= count; k++) {
    const piece = verseOf(next, k);
    pieces.push(piece);
    const history: History =
      (piece.phrases ?? []).length === 0
        ? pickOf(next, ['none', 'whole', 'stale'] as const)
        : pickOf(next, [...HISTORIES]);
    histories.set(piece.reference, history);
    bump(tally, `gen:${history}`);
    sowHistory(next, sower, at, piece, history, tally);
  }
  if (pieces.length > 2 && below(next, 6) === 0) {
    const again = pieces[1] as ModelTextPiece;
    pieces.push({ ...again, group: 'again' });
    bump(tally, 'gen:a piece twice');
  }
  if (below(next, 3) === 0) sower.sow('Psalms 150:6 [1-4]', at - (2 + below(next, 20)) * DAY, 3);
  return { zone, at, minutes, pieces, histories, plants };
};

const gardenOf = (plants: ReadonlyMap<string, readonly Recall[]>): ReadGarden => ({
  _tag: 'Read',
  plants: new Map(
    [...plants].map(([reference, recalls]) => [
      reference,
      plantOf(recalls.toSorted((a, b) => a.startedAt - b.startedAt) as [Recall, ...Recall[]]),
    ]),
  ),
});

const isRipe = (recalls: readonly Recall[] | undefined) =>
  recalls !== undefined &&
  (referenceStage(recalls) === 'ear' || referenceStage(recalls) === 'full corn');

/** The kinds a verse in phrases reaches in a case's plan: its join new, its join reviewed, its phrases due after the join. */
const tallyJoin = (
  each: Case,
  items: ReturnType<typeof planModel>,
  piece: ModelTextPiece,
  tally: Tally,
) => {
  const phrases = piece.phrases ?? [];
  if (phrases.length === 0) return;
  const fresh = items.items.find((item) => item.fresh);
  if (fresh?.reference === piece.reference) {
    bump(tally, 'plan:join');
    const stages = phrases.map((phrase) => referenceStage(each.plants.get(phrase.reference) ?? []));
    if (stages.includes('ear')) bump(tally, 'plan:join-with-a-phrase-at-ear');
    if (stages.every((stage) => stage === 'full corn')) bump(tally, 'plan:join-at-full-corn');
  }
  if (items.items.some((item) => !item.fresh && item.reference === piece.reference))
    bump(tally, 'plan:joined-review');
  const due = phrases.some((phrase) => {
    const recalls = each.plants.get(phrase.reference);
    return recalls !== undefined && dueModel(recalls) <= each.at;
  });
  if (each.plants.has(piece.reference) && due) bump(tally, 'plan:phrases-left');
};

/** The kinds a case's plan reaches, by the model. */
const tallyPlan = (each: Case, items: ReturnType<typeof planModel>, tally: Tally) => {
  const { plants, at } = each;
  const offset = offsetIn(each.zone, at);
  const today = localDay(at, offset);
  const fresh = items.items.find((item) => item.fresh);
  const phraseNames = new Set(
    each.pieces.flatMap((piece) => (piece.phrases ?? []).map((phrase) => phrase.reference)),
  );
  if (fresh !== undefined && phraseNames.has(fresh.reference)) bump(tally, 'plan:phrase-new');
  if (items.items.some((item) => !item.fresh && phraseNames.has(item.reference)))
    bump(tally, 'plan:phrase-review');
  const ripening = each.pieces.some(
    (piece) =>
      !plants.has(piece.reference) &&
      (piece.phrases ?? []).length > 0 &&
      (piece.phrases ?? []).every((phrase) => plants.has(phrase.reference)) &&
      !(piece.phrases ?? []).every((phrase) => isRipe(plants.get(phrase.reference))),
  );
  if (ripening) bump(tally, 'plan:join-waits');
  for (const piece of each.pieces) tallyJoin(each, items, piece, tally);
  if (fresh !== undefined && phraseNames.has(fresh.reference) && ripening)
    bump(tally, 'plan:next-phrase-while-one-ripens');
  for (const [reference, recalls] of plants) {
    if (phraseOfRule(reference) === undefined) continue;
    const first = recalls.toSorted((a, b) => a.startedAt - b.startedAt)[0] as Recall;
    if (localDay(first.startedAt, first.offset) === today && items.fresh === 'planted today')
      bump(tally, 'plan:phrase-planted-today');
  }
};

/** The kinds a reference's cue reaches, by the model: a join under first letters (with a phrase at an ear, or over a stale phrase only), a joined verse's own cue. */
const tallyCue = (
  each: Case,
  reference: string,
  wanted: ReturnType<typeof joinCueRule>,
  tally: Tally,
) => {
  const phrased = [...each.plants].filter(
    ([key]) => key !== reference && verseOfRule(key) === reference,
  );
  if (!each.plants.has(reference) && wanted === 'initials') {
    bump(tally, 'cue:join-letters');
    if (phrased.some(([, recalls]) => referenceStage(recalls) === 'ear'))
      bump(tally, 'cue:join-letters-at-ear');
    if (phrased.every(([key]) => key.endsWith('[1-3]'))) bump(tally, 'cue:stale-letters');
  }
  if (each.plants.has(reference) && phrased.length > 0) bump(tally, `cue:joined-${wanted}`);
};

const FEAR = COLLECTIONS.find((collection) => collection.id === 'protection');

/** The references planted for a need case: each Fear verse (and every verse of some other collections) none, its own plant, two phrase plants, or both; sometimes a phrase of the first minute's verse. */
const plantedOf = (next: () => number, tally: Tally) => {
  const planted = new Set<string>();
  const sown = (reference: string) => {
    const history = pickOf(next, ['none', 'own', 'phrases', 'both', 'own'] as const);
    if (history === 'own' || history === 'both') planted.add(reference);
    if (history === 'phrases' || history === 'both') {
      planted.add(`${reference} [1-${4 + below(next, 6)}]`);
      planted.add(`${reference} [${10 + below(next, 3)}-20]`);
    }
    return history;
  };
  for (const range of FEAR?.promises ?? []) {
    const histories = promiseVerses(range).map(sown);
    const decisive =
      histories.includes('phrases') &&
      histories.every((history) => history === 'own' || history === 'phrases');
    if (decisive && histories.length > 1 && histories.includes('own'))
      bump(tally, 'need:one-phrased');
    else if (decisive) bump(tally, 'need:phrased');
  }
  for (const collection of COLLECTIONS)
    if (collection.id !== 'protection' && below(next, 8) === 0)
      for (const range of collection.promises) promiseVerses(range).forEach(sown);
  if (below(next, 4) === 0) planted.add('Isaiah 41:10 [1-6]');
  return planted;
};

/** One recall for each reference: `needOf` reads only which references are planted. */
const oneRecallEach = (references: ReadonlySet<string>) =>
  new Map(
    [...references].map((reference): [string, Recall[]] => [
      reference,
      [
        {
          reference,
          startedAt: 1,
          grade: 3,
          suggested: 3,
          words: 1,
          missed: 0,
          peeked: 0,
          extra: 0,
        },
      ],
    ]),
  );

describe('phrases first, then the join, then the verse alone', () => {
  it('plans over the pieces expanded into phrases and joins, and cues a join under first letters, as H4-H6 make them, over generated gardens', () => {
    const next = random(4_242);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let n = 0; n < CASES && wrong.length < 3; n++) {
      const each = caseOf(next, tally);
      const garden = gardenOf(each.plants);
      const offset = offsetIn(each.zone, each.at);
      const got = planOf({
        garden,
        pieces: each.pieces,
        at: each.at,
        offset,
        minutes: each.minutes,
      });
      const want = planModel({
        plants: each.plants,
        pieces: expandRule(each.pieces, each.plants),
        at: each.at,
        offset,
        minutes: each.minutes,
      });
      const items = (
        list: readonly { reference: string; fresh: boolean; recalls: number; seconds: number }[],
      ) =>
        JSON.stringify(
          list.map(({ reference, fresh, recalls, seconds }) => [
            reference,
            fresh,
            recalls,
            seconds,
          ]),
        );
      if (items(got.items) !== items(want.items))
        wrong.push(`case ${n} plan ${items(got.items)} where H4 has ${items(want.items)}`);
      tallyPlan(each, want, tally);
      const named = new Set([
        ...each.pieces.flatMap((piece) => [
          piece.reference,
          ...(piece.phrases ?? []).map((phrase) => phrase.reference),
        ]),
        ...each.plants.keys(),
        'Psalms 150:6',
      ]);
      for (const reference of named) {
        const cue = cueIn(garden, reference);
        const wanted = joinCueRule(each.plants, reference);
        if (cue !== wanted)
          wrong.push(`case ${n} cue of ${reference}: ${cue} where H6 has ${wanted}`);
        tallyCue(each, reference, wanted, tally);
      }
    }
    expect(wrong).toEqual([]);
    const floors: readonly (readonly [string, number])[] = [
      ['plan:phrase-new', 150],
      ['plan:phrase-review', 150],
      ['plan:join', 30],
      ['plan:join-with-a-phrase-at-ear', 25],
      ['plan:join-at-full-corn', 10],
      ['plan:joined-review', 30],
      ['plan:join-waits', 30],
      ['plan:phrases-left', 50],
      ['plan:phrase-planted-today', 10],
      ['plan:next-phrase-while-one-ripens', 10],
      ['gen:ripe-then-again', 20],
      ['gen:ripe-but-one-blade', 20],
      ['gen:a piece twice', 20],
      ['cue:join-letters', 100],
      ['cue:join-letters-at-ear', 90],
      ['cue:stale-letters', 10],
      ['cue:joined-initials', 10],
      ['cue:joined-none', 10],
    ];
    console.log(`coverage ${floors.map(([kind]) => `${kind}=${tally.get(kind) ?? 0}`).join(' ')}`);
    expect(floors.filter(([kind, floor]) => (tally.get(kind) ?? 0) < floor)).toEqual([]);
  });

  it('offers the join once every phrase is at an ear, takes it back when one falls to a seed, and drops the phrases once the verse is planted', () => {
    const at = Date.UTC(2026, 5, 10, 15);
    const verse = pieceOf('Psalms 4:8', textOf(random(7), 20), 'Psalms 4:8');
    const phrases = verse.phrases ?? [];
    const plants = new Map<string, Recall[]>();
    const sow = (reference: string, days: number, grade: Recall['grade']) =>
      plants.set(reference, [
        ...(plants.get(reference) ?? []),
        {
          reference,
          startedAt: at - days * DAY,
          offset: 0,
          grade,
          suggested: 3,
          words: 9,
          missed: 0,
          peeked: 0,
          extra: 0,
        },
      ]);
    const plan = () =>
      planOf({ garden: gardenOf(plants), pieces: [verse], at, offset: 0, minutes: 20 }).items.map(
        (item) => `${item.reference}${item.fresh ? ' new' : ''}`,
      );
    expect(phrases.length).toBeGreaterThan(1);
    for (const phrase of phrases) for (const days of [30, 29, 28]) sow(phrase.reference, days, 3);
    expect(phrases.map((phrase) => referenceStage(plants.get(phrase.reference) ?? []))).toEqual(
      phrases.map(() => 'ear'),
    );
    expect(plan().at(-1)).toBe(`${verse.reference} new`);
    expect(cueIn(gardenOf(plants), verse.reference)).toBe('initials');
    sow((phrases[0] as ModelTextPiece).reference, 2, 1);
    expect(plan().filter((item) => item === `${verse.reference} new`)).toEqual([]);
    sow((phrases[0] as ModelTextPiece).reference, 1, 3);
    sow(verse.reference, 1, 3);
    expect(plan().every((item) => phraseOfRule(item) === undefined)).toBe(true);
    expect(cueIn(gardenOf(plants), verse.reference)).toBe('initials');
  });

  it('counts a promise known only when each verse has its own plant, never by its phrases, as the need rule over the references planted', () => {
    const next = random(9_001);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let n = 0; n < 600 && wrong.length < 3; n++) {
      const planted = plantedOf(next, tally);
      const taught = pickOf(next, [TAUGHT, [], TAUGHT] as const);
      const got = JSON.stringify(needOf(gardenOf(oneRecallEach(planted)), taught));
      const want = JSON.stringify(needModel(planted, taught));
      if (got !== want)
        wrong.push(`case ${n}: ${got.slice(0, 200)} where the rule has ${want.slice(0, 200)}`);
    }
    expect(wrong).toEqual([]);
    expect([
      (tally.get('need:phrased') ?? 0) >= 100,
      (tally.get('need:one-phrased') ?? 0) >= 100,
    ]).toEqual([true, true]);
  });
});
