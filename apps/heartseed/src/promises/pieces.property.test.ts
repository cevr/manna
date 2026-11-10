/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, eslint/no-await-in-loop -- the property draws its cases in plain branches, tallies its kinds in plain maps and names a wrong case by its references; each launch runs the app's layer to its end, one at a time, over the one device stand-in. */

/**
 * The pieces the session plans over with collections taught (T1-T3). Two
 * seams: `piecesOf` over `collectionPieces(collectionsOf(ids))`, judged
 * against `piecesModel` (`src/test/promise-model.ts`, over the model's own
 * corpus) for generated own pieces, held passages (over Fear's verses, over
 * the promise, any choosable range, twice) or unread ones, and taught ids
 * left out, empty, one, several in any order or one no collection has; then
 * the app's layer itself, launched over a device whose plants are a prefix
 * of the pieces, so the new piece is a passage verse, a Fear verse or none,
 * its session's `pieces` after `begin` held to the model and its plan to
 * `planModel` (`src/test/session-model.ts`) over them.
 *
 * It catches the collection before the passages, a verse kept twice, a
 * collection's verse grouped as its promise, the ids' order ignored, taught
 * verses with the passages unread, a taught verse without its phrases or
 * with them left under a passage's reference (hsphrase H9), Fear's cut off
 * the table, and a layer that ignores its `promises`
 * part or teaches without it.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Layer, Logger, ManagedRuntime, Option } from 'effect';
import passage from 'virtual:heartseed-passage';

import { appLayer } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { sourceWords } from '../matcher/words';
import { collectionPieces, piecesOf, type PassagesView } from '../passages';
import { COLLECTIONS, TAUGHT } from '../promises';
import { Haptics, type Recall } from '../sayit';
import { Session, type SessionView } from '../session/service';
import { store } from '../store';
import { voiceSource } from '../voice/source';
import { clockOf } from '../test/clock';
import { heldOn, recallOf } from '../test/field-model';
import { below, keyOf, pickOf, random } from '../test/garden-model';
import { device } from '../test/one';
import { verseRef, type Held, type ModelTextPiece, type Span } from '../test/passages-model';
import { CORPUS, choosableOf } from '../test/passages-rig';
import { expandRule, phraseOfRule, withPhrasesRule } from '../test/phrase-model';
import { piecesModel } from '../test/promise-model';
import { DAY, estimate, HOUR, MINUTE, planModel } from '../test/session-model';
import { hostOffset } from '../test/zone';
import { collectionsOf } from './taught';

const words = (text: string) => sourceWords(text).length;

const PROMISE: ModelTextPiece = {
  reference: passage.reference,
  text: passage.text,
  words: words(passage.text),
  group: passage.reference,
};

/** Passages over Fear's verses and over the promise. */
const OVER: readonly [Span, ...Span[]] = [
  { book: 19, chapter: 91, first: 1, last: 16 },
  { book: 19, chapter: 121, first: 1, last: 8 },
  { book: 19, chapter: 56, first: 1, last: 4 },
  { book: 23, chapter: 41, first: 10, last: 13 },
];

const IDS = COLLECTIONS.map((collection) => collection.id);

const FEAR = COLLECTIONS.find((collection) => collection.id === 'protection');

const TITLES = new Set(COLLECTIONS.map((collection) => collection.title));

/** `list` in an order `next` draws. */
const shuffled = <A>(next: () => number, list: readonly A[]) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(next, i + 1);
    [out[i], out[j]] = [out[j] as A, out[i] as A];
  }
  return out;
};

/** Taught ids and their kind: left out, none, Fear, several in any order, or one no collection has. */
const taughtOf = (next: () => number): readonly [string, readonly string[] | undefined] => {
  const roll = below(next, 10);
  if (roll < 2) return ['left-out', undefined];
  if (roll < 3) return ['empty', []];
  if (roll < 6) return ['one', TAUGHT];
  if (roll < 9) return ['many', shuffled(next, IDS).slice(0, 2 + below(next, 3))];
  return ['unknown', ['nothing', ...TAUGHT]];
};

/** Held passages: 0-3 drawn from `OVER` and any choosable range, sometimes one twice. */
const heldOf = (next: () => number): Span[] => {
  const list: Span[] = [];
  for (let n = below(next, 4); n > 0; n--) {
    if (below(next, 2) === 0) list.push({ ...pickOf(next, OVER) });
    else list.push(choosableOf(next, list)[1]);
  }
  return list;
};

const viewOf = (held: Held): PassagesView => {
  if (held.tag === 'Unread') return { _tag: 'Unread' };
  return { _tag: 'Read', passages: held.passages, lists: [] };
};

/** Each verse of `span`, by reference. */
const versesOfSpan = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, k) =>
    verseRef(span.book, span.chapter, span.first + k),
  );

const fearVerses = new Set(FEAR?.promises.flatMap(versesOfSpan) ?? []);

const silent = {
  haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
  chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
};

/** The recalls of `reference` planted `back` days before `now`, 1-3 of them. */
const recallsOf = (next: () => number, reference: string, now: number, back: number) =>
  Array.from({ length: 1 + below(next, 3) }, (_, k) =>
    recallOf(
      reference,
      now - back * DAY - (k + 1 + below(next, 60)) * MINUTE,
      pickOf(next, [1, 3, 3, 4] as const),
      0,
    ),
  );

/** One launch: its taught ids, its passages, the pieces the rule gives, the instant, how many pieces are planted (a prefix), and the disk. */
const launchOf = (next: () => number) => {
  const [kind, ids] = taughtOf(next);
  const unread = below(next, 12) === 0;
  const passages = heldOf(next);
  let held: Held = { tag: 'Read', passages };
  if (unread) held = { tag: 'Unread' };
  const want = piecesModel(CORPUS, [PROMISE], held, ids ?? [], words, withPhrasesRule);
  const now = Date.UTC(2026, 2, 1) + below(next, 200) * DAY + (6 + below(next, 15)) * HOUR;
  const planted = pickOf(next, [1, 1, below(next, want.length + 1), want.length] as const);
  const firstDay = below(next, 4) === 0;
  const disk = new Map<string, string | null>();
  if (unread) disk.set('heartseed/passages', '[{"book":1}');
  else if (passages.length > 0) disk.set('heartseed/passages', JSON.stringify(passages));
  const sown = (reference: string, back: number) => {
    for (const recall of recallsOf(next, reference, now, back))
      disk.set(keyOf(recall), JSON.stringify(recall));
  };
  want.slice(0, planted).forEach((piece, index) => {
    let back = 1 + below(next, 30);
    if (firstDay && index === 0) back = 0;
    sown(piece.reference, back);
  });
  const ripening = want[planted]?.phrases ?? [];
  const roll = below(next, 3);
  if (planted > 0 && roll === 1)
    for (const phrase of ripening.slice(0, below(next, ripening.length + 1)))
      sown(phrase.reference, 1 + below(next, 30));
  if (planted > 0 && roll === 2)
    for (const phrase of ripening)
      for (const back of [12, 7, 2]) {
        const recall = recallOf(phrase.reference, now - back * DAY, 3, 0);
        disk.set(keyOf(recall), JSON.stringify(recall));
      }
  return { kind, ids, held, want, now, planted, firstDay, disk };
};

type Launch = ReturnType<typeof launchOf>;

/** The app's layer at the instant `now`, teaching `ids` (the part left out when none are given). */
const layerOf = (ids: readonly string[] | undefined, now: number) => {
  const parts = {
    source: scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 3 })),
    store,
    voice: voiceSource,
    ...silent,
  };
  const layer = Option.match(Option.fromUndefinedOr(ids), {
    onNone: () => appLayer(parts),
    onSome: (promises) => appLayer({ ...parts, promises }),
  });
  return layer.pipe(Layer.provideMerge(Layer.merge(clockOf({ now }), Logger.layer([]))));
};

/** The plan's items as `reference:fresh:recalls`. */
const itemsOf = (items: readonly { reference: string; fresh: boolean; recalls: number }[]) =>
  items.map((item) => `${item.reference}:${item.fresh}:${item.recalls}`);

/** The kinds a plan reaches: whose new piece it offers, and whether its reviews mix a collection with a passage or the promise. */
const planKinds = (plan: ReturnType<typeof planModel>): string[] => {
  const kinds: string[] = [];
  const fresh = plan.items.find((item) => item.fresh);
  if (fresh === undefined) kinds.push(`fresh:${plan.fresh}`);
  else if (fresh.group === FEAR?.title) kinds.push('fresh:collection');
  else if (fresh.reference !== PROMISE.reference) kinds.push('fresh:passage');
  if (fresh !== undefined && fresh.reference !== PROMISE.reference) {
    const isPhrase = phraseOfRule(fresh.reference) !== undefined;
    if (isPhrase) kinds.push('fresh:phrase');
    else if (fresh.seconds > estimate(12)) kinds.push('fresh:join');
  }
  const titled = plan.items
    .filter((item) => !item.fresh)
    .map((item) => COLLECTIONS.some((collection) => collection.title === item.group));
  if (titled.includes(true) && titled.includes(false)) kinds.push('mixed');
  return kinds;
};

/** What is wrong with the session's `view` after `begin` in `launch`, and the kinds it reached. */
const judge = (launch: Launch, view: SessionView) => {
  const label = `${launch.kind} ${JSON.stringify(launch.ids)} ${JSON.stringify(launch.held)} planted ${launch.planted}`;
  if (JSON.stringify(view.pieces) !== JSON.stringify(launch.want))
    return { wrong: [`pieces: ${label}`], kinds: [] };
  if (launch.held.tag === 'Unread') {
    if (Option.isSome(view.plan)) return { wrong: [`a plan: ${label}`], kinds: [] };
    return { wrong: [], kinds: ['unread'] };
  }
  const plants = new Map<string, Recall[]>();
  for (const recall of heldOn(device.disk))
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  const plan = planModel({
    plants,
    pieces: expandRule(launch.want, plants),
    at: launch.now,
    offset: hostOffset(launch.now),
    minutes: 5,
  });
  const got = Option.match(view.plan, {
    onNone: () => ['none'],
    onSome: (made) => itemsOf(made.items),
  });
  const kinds = [...planKinds(plan), `taught:${launch.kind}`];
  if (launch.firstDay && launch.planted === 1) kinds.push('first-minute-day');
  if (JSON.stringify(got) !== JSON.stringify(itemsOf(plan.items)))
    return { wrong: [`plan: ${label}`], kinds };
  return { wrong: [], kinds };
};

/** Tallies each piece with phrases as a taught verse's (grouped by a collection's title) or a passage verse's. */
const tallyPhrased = (pieces: readonly ModelTextPiece[], bump: (kind: string) => void) => {
  for (const piece of pieces) {
    if ((piece.phrases ?? []).length === 0) continue;
    bump(TITLES.has(piece.group) ? 'taught-phrased' : 'passage-phrased');
  }
};

describe('the pieces with collections taught', () => {
  it('are the app’s own, then the passages’ verses, then each taught collection’s, each reference once at its first place, as the rule makes them', () => {
    const next = random(12_3);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let run = 0; run < 1200; run++) {
      const own = below(next, 5) === 0 ? [] : [PROMISE];
      const [kind, ids] = taughtOf(next);
      bump(`taught:${kind}`);
      let held: Held = { tag: 'Read', passages: heldOf(next) };
      if (below(next, 10) === 0) held = { tag: 'Unread' };
      bump(`passages:${held.tag}`);
      const view = viewOf(held);
      const got =
        ids === undefined
          ? piecesOf(own, view)
          : piecesOf(own, view, collectionPieces(collectionsOf(ids)));
      const want = piecesModel(CORPUS, own, held, ids ?? [], words, withPhrasesRule);
      if (
        held.tag === 'Read' &&
        (ids ?? []).includes('protection') &&
        held.passages.flatMap(versesOfSpan).some((reference) => fearVerses.has(reference))
      )
        bump('fear-verse-in-passage');
      tallyPhrased(want, bump);
      if (JSON.stringify(got) !== JSON.stringify(want))
        wrong.push(`${kind} ${JSON.stringify(ids)} ${JSON.stringify(held)}`);
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const kind of [
      'taught:left-out',
      'taught:empty',
      'taught:one',
      'taught:many',
      'taught:unknown',
      'passages:Unread',
      'fear-verse-in-passage',
      'taught-phrased',
      'passage-phrased',
    ])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(20);
  });

  it('cut Fear’s verses into the table’s phrases under its title, Psalms 56:3 whole, and a Fear verse inside a held passage under the passage’s reference', () => {
    const rangesOf = (piece: { phrases?: readonly { reference: string }[] }) =>
      (piece.phrases ?? []).map((phrase) => phrase.reference.slice(phrase.reference.indexOf('[')));
    const taught = piecesOf(
      [PROMISE],
      { _tag: 'Read', passages: [], lists: [] },
      collectionPieces(collectionsOf(TAUGHT)),
    );
    expect(
      Object.fromEntries(
        taught.slice(1).map((piece) => [piece.reference, rangesOf(piece).join(' ')]),
      ),
    ).toEqual({
      'Psalms 91:1': '[1-9] [10-19]',
      'Psalms 91:2': '[1-6] [7-13] [14-20]',
      'Psalms 91:4': '[1-7] [8-14] [15-22]',
      'Psalms 91:11': '[1-9] [10-16]',
      'Isaiah 43:2': '[1-11] [12-20] [21-31] [32-38]',
      '2 Timothy 1:7': '[1-10] [11-21]',
      'Psalms 34:7': '[1-7] [8-15]',
      'Isaiah 54:17': '[1-11] [12-22] [23-32] [33-41]',
      'Psalms 121:7': '[1-8] [9-13]',
      'Psalms 121:8': '[1-9] [10-19]',
      'Deuteronomy 31:6': '[1-9] [10-19] [20-27] [28-35]',
      'Proverbs 18:10': '[1-9] [10-17]',
      'Psalms 56:3': '',
      'Isaiah 41:13': '[1-11] [12-20]',
    });
    expect(taught[0]).toEqual(PROMISE);
    expect(
      new Set(
        taught
          .slice(1)
          .flatMap((piece) => [
            piece.group,
            ...(piece.phrases ?? []).map((phrase) => phrase.group),
          ]),
      ),
    ).toEqual(new Set(['Protection & Fear']));
    const held = piecesOf(
      [PROMISE],
      { _tag: 'Read', passages: [{ book: 19, chapter: 91, first: 1, last: 4 }], lists: [] },
      collectionPieces(collectionsOf(TAUGHT)),
    );
    const first = held.find((piece) => piece.reference === 'Psalms 91:1');
    expect([first?.group, ...(first?.phrases ?? []).map((phrase) => phrase.group)]).toEqual([
      'Psalms 91:1-4',
      'Psalms 91:1-4',
      'Psalms 91:1-4',
    ]);
  });

  it('give Psalms 91:1-16 its own group, then Fear’s other verses grouped by its title, Psalms 91:1 once', () => {
    const pieces = piecesOf(
      [PROMISE],
      { _tag: 'Read', passages: [{ book: 19, chapter: 91, first: 1, last: 16 }], lists: [] },
      collectionPieces(collectionsOf(TAUGHT)),
    );
    const groups = new Map(pieces.map((piece) => [piece.reference, piece.group]));
    expect([
      pieces.length,
      pieces.filter((piece) => piece.reference === 'Psalms 91:1').length,
      groups.get('Psalms 91:1'),
      groups.get('Isaiah 41:10'),
      pieces.at(17)?.group,
    ]).toEqual([1 + 16 + 14 - 4, 1, 'Psalms 91:1-16', 'Isaiah 41:10', 'Protection & Fear']);
  });

  it('through the app’s layer: the session plans over them after begin, the new piece a passage phrase or verse first, then a Fear phrase or verse, a join once its phrases ripen, then none, by the daily rule', async () => {
    const next = random(31_7);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let run = 0; run < 36; run++) {
      const launch = launchOf(next);
      device.launch(launch.disk);
      const runtime = ManagedRuntime.make(layerOf(launch.ids, launch.now));
      const view = await runtime.runPromise(
        Effect.flatMap(Session, (session) => Effect.andThen(session.begin, session.view)),
      );
      await runtime.dispose();
      const judged = judge(launch, view);
      wrong.push(...judged.wrong);
      for (const kind of judged.kinds) bump(kind);
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const kind of [
      'unread',
      'fresh:passage',
      'fresh:collection',
      'fresh:planted today',
      'fresh:phrase',
      'fresh:join',
      'mixed',
      'taught:left-out',
      'taught:one',
      'taught:many',
    ])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(1);
  });
});
