/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noTernary, effect/noGlobals -- a generated walk through the Add verses sheet: it drives the sheet one awaited tap at a time, names faults by their JSON, and reads the model's undefined as none. */

/**
 * A generated reader's walk through the Add verses sheet (hsshelves B), for
 * the sheet's walk parts (`src/shelves/walk-*.test.tsx`), over
 * `shelves-rig.tsx`, judged after every command against `shelves-model.ts`.
 *
 * A device holds the promise planted or not, a stored value (no key or
 * `[]`; 1 to 3 ranges, each a pick, a promise of a collection shelf, a
 * range overlapping a pick in part, or a chooser target; 4 held; or a
 * garbled value), and now and then a recall on one verse of a one-verse
 * pick, which the field shows as a loose row. With the sheet open, each
 * command opens, switches or closes a shelf, taps `Plant` on an offer the
 * model shows it on (its write landing or refused, one time in four; once,
 * twice in one turn, then `Done` in one turn, or with its write held until
 * the pending frame shows; after a refusal a retry, a shelf, or leaving),
 * taps `Done`, presses Escape, or taps `Any passage`; with it closed, the
 * stand-in's `Add verses` opens it again. After every command the sheet is
 * the model's, the stand-in's counts are the model's, the stored passages
 * are the start's until an add lands and the model's list after, no other
 * key is written, and every frame kept the sheet's rule.
 */

import passage from 'virtual:heartseed-passage';

import { record } from './field-rig';
import { recallOf } from './field-model';
import { below, DAY, random } from './garden-model';
import { BASE_SHELVES, shelvesModel, type ModelList } from './home-model';
import { device } from './one';
import { KEY, readRule, storedText, verseRef, type Held, type Span } from './passages-model';
import { chapterOf, CORPUS, countIn, GARBLED } from './passages-rig';
import { mountShelves } from './shelves-rig';
import { any, done, opened, plant, sheetWant, tapShelf, type SheetModel } from './shelves-model';

const SHELVES = shelvesModel().slice(0, BASE_SHELVES);

/** The first 17 shelves of lists, by title, with each list and whether it is a pick or a promise; the Handbook's are `lists-walk.ts`'s. */
const LISTED = SHELVES.flatMap((shelf, index) =>
  shelf.lists === 'chooser'
    ? []
    : [{ title: shelf.title, lists: shelf.lists, kind: index <= 3 ? 'pick' : 'promise' }],
);
const PICKS = LISTED.filter((shelf) => shelf.kind === 'pick').flatMap((shelf) => shelf.lists);
const PROMISES = LISTED.filter((shelf) => shelf.kind === 'promise').flatMap((shelf) => shelf.lists);

/** The one-verse lists whose verse is not the app's own: a recall on one shows as a loose row. */
const LOOSE = LISTED.flatMap((shelf) => shelf.lists).filter(
  (list) => list.verses.length === 1 && list.verses[0] !== passage.reference,
);

const spanOf = (list: ModelList): Span => list.range ?? { book: 1, chapter: 1, first: 1, last: 1 };

/** The verses of `span`, by reference. */
const versesOf = (span: Span) => {
  const out: string[] = [];
  for (let verse = span.first; verse <= span.last; verse++)
    out.push(verseRef(span.book, span.chapter, verse));
  return out;
};

/** One stored range from `next`: a pick, a promise, a range over a pick in part, or a chooser target. */
const rangeOf = (next: () => number): Span => {
  const roll = below(next, 4);
  if (roll === 0) return spanOf(PICKS[below(next, PICKS.length)] ?? PICKS[0]!);
  if (roll === 1) return spanOf(PROMISES[below(next, PROMISES.length)] ?? PROMISES[0]!);
  if (roll === 2) {
    const wide = PICKS.filter((list) => list.verses.length > 1);
    const span = spanOf(wide[below(next, wide.length)] ?? wide[0]!);
    const last = Math.min(countIn(span.book, span.chapter), span.last + 1);
    return { ...span, first: span.first + 1, last };
  }
  const { book, chapter, count } = chapterOf(next);
  const first = 1 + below(next, count);
  return { book, chapter, first, last: first };
};

/** A device's stored value and its kind. */
const storedOf = (next: () => number): readonly [string, string | undefined] => {
  const roll = below(next, 8);
  if (roll === 0) return ['none', undefined];
  if (roll === 1) return ['none', '[]'];
  if (roll === 2) return ['garbled', GARBLED[below(next, GARBLED.length)]?.[1]];
  if (roll === 3)
    return [
      '4',
      storedText(Array.from({ length: 4 }, () => spanOf(PICKS[below(next, PICKS.length)]!))),
    ];
  return ['held', storedText(Array.from({ length: 1 + below(next, 3) }, () => rangeOf(next)))];
};

/** How a reader taps `Plant`: once, twice in one turn, then `Done` in one turn, or once with its write held. */
const HOWS = ['once', 'twice', 'then-Done', 'held', 'once'] as const;
type How = (typeof HOWS)[number];

/** `seed` mixed, so neighbouring seeds start the generator far apart. */
const mixed = (seed: number) => {
  let s = (seed + 0x5e1f) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return (s ^ (s >>> 16)) >>> 0;
};

/** A device from `next`, launched: its stored value and kind, and the one-verse list recalled loose, if any; the promise is planted yesterday or not. */
const launchDevice = (next: () => number) => {
  const [kind, raw] = storedOf(next);
  const own = below(next, 2) === 0;
  const loose = below(next, 3) === 0 ? LOOSE[below(next, LOOSE.length)] : undefined;
  const at = Date.now() - DAY;
  const disk = new Map<string, string | null>();
  if (own) disk.set(...record(recallOf(passage.reference, at, 3, 0)));
  if (loose !== undefined) disk.set(...record(recallOf(loose.verses[0] ?? '', at, 3, 0)));
  if (raw !== undefined) disk.set(KEY, raw);
  device.launch(disk);
  return { kind, raw, loose };
};

/** One generated reader's walk through the sheet from `seed`, `steps` commands long; answers its faults and how often it reached each case. */
export const walkShelf = async (seed: number, steps: number) => {
  const next = random(mixed(seed));
  const { kind, raw, loose } = launchDevice(next);
  const start = new Map(device.disk);
  let model: SheetModel = opened(readRule(CORPUS, raw, 0));
  let written = false;
  const reached = new Map<string, number>([[`stored:${kind}`, 1]]);
  const reach = (name: string) => reached.set(name, (reached.get(name) ?? 0) + 1);
  const faults: string[] = [];
  const log: string[] = [];
  /** The field's rows as the model holds them: the own row, each held range, and the loose verse. */
  const rowsOf = (held: Held): (readonly string[])[] => [
    [passage.reference],
    ...(held.tag === 'Read' ? held.passages.map(versesOf) : []),
    ...(loose === undefined ? [] : [loose.verses]),
  ];
  const rig = await mountShelves();
  const settle = async (step: string) => {
    if (faults.length > 0) return;
    log.push(step);
    const want = sheetWant(model, rowsOf(model.held));
    const got = await rig.settle(want);
    if (got !== undefined)
      faults.push(
        `${step} after ${log.slice(-6, -1).join(' > ')}: ${JSON.stringify(got).slice(0, 300)} where the model has ${JSON.stringify(want).slice(0, 300)}`,
      );
    if (JSON.stringify(rig.counts) !== JSON.stringify(model.counts))
      faults.push(
        `${step}: the counts ${JSON.stringify(rig.counts)} where the model has ${JSON.stringify(model.counts)}`,
      );
    const stored = device.disk.get(KEY);
    const expected = written && model.held.tag === 'Read' ? storedText(model.held.passages) : raw;
    if (stored !== expected)
      faults.push(`${step}: the stored passages ${stored} where the model has ${expected}`);
    for (const [key, value] of device.disk)
      if (key !== KEY && start.get(key) !== value) faults.push(`${step}: the key ${key} written`);
    faults.push(...rig.faults.splice(0).map((fault) => `${step}: ${fault}`));
  };
  /** Each shelf opened tallied: unread, and each offer in the field by a held range or by the loose verse alone. */
  const tallyOpen = () => {
    const shelf = LISTED.find((each) => each.title === model.shelf);
    if (shelf === undefined) return;
    if (model.held.tag === 'Unread') return reach('unread');
    const held = model.held.passages.flatMap(versesOf);
    for (const list of shelf.lists) {
      if (list.verses.every((verse) => held.includes(verse))) reach('offer:in-field:held');
      else if (list.verses.every((verse) => verse === loose?.verses[0]))
        reach('offer:in-field:loose');
    }
  };
  const tallyLimit = () => {
    if (model.open && model.held.tag === 'Read' && model.held.passages.length >= 3) reach('limit');
  };
  const tapShelfHead = async (title: string) => {
    const kind = model.shelf === null ? 'open' : model.shelf === title ? 'close' : 'switch';
    if (model.line.tag === 'Alert') reach('line cleared by a tap');
    reach(`shelf:${kind}`);
    await rig.tap(title);
    model = tapShelf(model, title);
    await settle(`shelf ${title}`);
    tallyOpen();
  };
  /** A shelf head to tap: the open one (a close) one time in three, the loose verse's shelf one time in four on a device with one, else any. */
  const randomShelf = () => {
    if (model.shelf !== null && below(next, 3) === 0) return model.shelf;
    if (loose !== undefined && below(next, 4) === 0)
      return LISTED.find((shelf) => shelf.lists.includes(loose))?.title ?? 'Psalms';
    return LISTED[below(next, LISTED.length)]?.title ?? 'Psalms';
  };
  const close = async (by: 'Done' | 'Escape') => {
    reach(`done:${by}`);
    if (by === 'Done') await rig.tap('Done');
    else await rig.escape();
    model = done(model);
    await settle(by);
  };
  /** The offers the model shows `Plant` on, in the open shelf. */
  const plantable = () => {
    const shelf = LISTED.find((each) => each.title === model.shelf);
    if (shelf === undefined) return [];
    const want = sheetWant(model, rowsOf(model.held));
    if (want === 'closed') return [];
    return shelf.lists.filter((list) =>
      want.offers.some(([title, , shown]) => title === list.title && shown === `Plant ${title}`),
    );
  };
  /** Taps `label` as `how` says; a held write must come while the plant is pending. */
  const press = async (label: string, how: How) => {
    if (how === 'held') {
      if (await rig.plantHeld(label, 'once')) reach('pending');
      else faults.push(`${label}: no write came while it was pending`);
    } else if (how === 'then-Done') await rig.tapBoth(label, 'Done');
    else await rig.tap(label, how === 'twice');
  };
  /** A landed add tallied: from how many held, of a pick or a promise, by two taps, after a retry. */
  const tallyAdded = (list: ModelList, how: How, from: number, retry: boolean) => {
    reach(`plant:Added:from-${from}`);
    reach(`plant:Added:${PICKS.includes(list) ? 'pick' : 'promise'}`);
    if (how === 'twice') reach('plant:twice');
    if (retry) reach('retry landed');
  };
  const tapPlant = async (list: ModelList, retry: boolean): Promise<void> => {
    const label = `Plant ${list.title}`;
    const refused = below(next, 4) === 0;
    const how: How = HOWS[below(next, HOWS.length)] ?? 'once';
    const from = model.held.tag === 'Read' ? model.held.passages.length : 0;
    device.fail('set', refused ? 1 : 0);
    await press(label, how);
    const answer = plant(CORPUS, model, spanOf(list), refused);
    model = answer.model;
    reach(`plant:${answer.outcome}`);
    if (how === 'then-Done') reach('plant:then-Done');
    if (answer.outcome === 'Added') {
      written = true;
      tallyAdded(list, how, from, retry);
    }
    await settle(`${label} ${how} ${answer.outcome}`);
    device.fail('set', 0);
    if (answer.outcome !== 'Failed' || faults.length > 0) return;
    const after = below(next, 3);
    if (after === 0) return tapPlant(list, true);
    if (after === 1) return tapShelfHead(randomShelf());
    return close(below(next, 2) === 0 ? 'Done' : 'Escape');
  };
  if (!(await rig.activate())) faults.push('the sheet never became active');
  await settle('opened');
  tallyLimit();
  for (let step = 0; step < steps && faults.length === 0; step++) {
    if (!model.open) {
      if (!(await rig.openAgain())) faults.push('the stand-in offers no Add verses');
      model = opened(model.held, model.counts);
      await settle('opened again');
      tallyLimit();
      continue;
    }
    const roll = below(next, 13);
    const offers = plantable();
    if (roll < 4 || (roll < 10 && offers.length === 0)) await tapShelfHead(randomShelf());
    else if (roll < 10) await tapPlant(offers[below(next, offers.length)] ?? offers[0]!, false);
    else if (roll < 12) await close(roll === 10 ? 'Done' : 'Escape');
    else {
      reach('any');
      await rig.tap('Any passage');
      model = any(model);
      await settle('Any passage');
    }
  }
  await rig.leave();
  device.fail('set', 0);
  return { faults, reached };
};

/** Walks `seeds`, `steps` commands each; answers the faults of the first device with any (by seed), and how often each case was reached over them all. */
export const walkShelves = async (seeds: ReadonlyArray<number>, steps: number) => {
  const reached = new Map<string, number>();
  for (const seed of seeds) {
    const result = await walkShelf(seed, steps);
    if (result.faults.length > 0)
      return { faults: [`seed ${seed}`, ...result.faults.slice(0, 4)], reached };
    for (const [each, count] of result.reached) reached.set(each, (reached.get(each) ?? 0) + count);
  }
  return { faults: [], reached };
};

/** The floors `reached` misses, each `[case, at least]`. */
export const missed = (
  reached: ReadonlyMap<string, number>,
  floors: ReadonlyArray<readonly [string, number]>,
) => floors.filter(([name, least]) => (reached.get(name) ?? 0) < least).map(([name]) => name);
