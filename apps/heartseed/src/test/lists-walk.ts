/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noTernary, effect/noGlobals -- a generated walk through the field with Handbook lists planted: it drives the root one awaited tap at a time, names faults and stored texts by their JSON, dates recalls by the host's clock, and reads the model's undefined as none. */

/**
 * Generated readers' walks with Handbook lists: through the field with
 * planted lists (hshandbook E, `walkListBars`, for the parts
 * `src/field/bar-planted-*.test.tsx`, over `bar-rig.tsx`, judged after
 * every tap against `choose-model.ts`'s `fieldWant`), and through the Add
 * verses sheet's Handbook shelves (hshandbook D, `walkListShelves`, for the
 * parts `src/shelves/walk-lists-*.test.tsx`, over `shelves-rig.tsx`, judged
 * after every command against `shelves-model.ts`'s `sheetWant`); both by the
 * lists' and passages' rules of `handbook-model.ts`.
 *
 * A field device holds the promise planted yesterday, 0-2 stored passages
 * (one of them now and then over a verse of a held list), 1-3 stored lists
 * of at most 12 verses, now and then with an id this build does not know
 * or an id stored twice, and a recall on a verse of a held list now and
 * then. Its launch lands on home. Each step: a list furrow's `Remove`, then
 * `Keep` or the ask's `Remove` (its write landing or refused; once or twice
 * in one turn; a refusal retried in half); a passage's `Remove` and the
 * ask's `Remove`; `Add verses`, a small list's shelf and its `Plant`; or a
 * relaunch. After every tap home's rows, add, limit, ask and alert are the
 * model's, the sheet is closed, both stored texts are the start's until a
 * change lands and the model's after (unknown ids in place), no other key
 * is written or removed (no recall), and every frame kept the root's rule
 * and the bar's.
 *
 * A sheet device holds the promise planted or not, 0-3 stored picks, the
 * lists' key absent, `[]`, 1 or 3 small lists (now and then with an unknown
 * id or an id twice) or garbled, and now and then a recall on one verse of
 * a small list. With the sheet open, each command opens, switches or closes
 * a shelf (a Handbook shelf with a small list, or one of picks), taps
 * `Plant` on a small list or a pick the model offers (its write landing or
 * refused, one time in four; once, twice in one turn, then `Done` in one
 * turn, or held until the pending frame shows; after a refusal a retry, a
 * shelf, or leaving), or closes the sheet; with it closed, the stand-in's
 * `Add verses` opens it again. After every command the sheet and the
 * stand-in's counts are the model's, both stored texts are the start's
 * until a plant lands and the model's after (unknown ids in place), no
 * other key is written, and every frame kept the sheet's rule.
 */

import passage from 'virtual:heartseed-passage';

import { fieldWant, notRemoved, QUIET, type Asking, type FieldSeen } from './choose-model';
import { record } from './field-rig';
import { heldOn, recallOf } from './field-model';
import { below, DAY, random } from './garden-model';
import {
  HANDBOOK_ORDER,
  heldLists,
  LISTS,
  plantRule,
  readModel,
  removeStep,
  uprootRule,
  type Model,
  type ModelHandbookList,
} from './handbook-model';
import { BASE_SHELVES, shelvesModel, type ModelList } from './home-model';
import { device } from './one';
import { mountBar } from './bar-rig';
import { KEY, spanRef, storedText, verseRef, type Held, type Span } from './passages-model';
import { CORPUS } from './passages-rig';
import { activateSheet, mountShelves, settleSheet, tapSheet } from './shelves-rig';
import {
  done,
  opened,
  plant,
  plantList,
  sheetWant,
  tapShelf,
  type SheetModel,
} from './shelves-model';

const PROMISE = passage.reference;

/** An id no build knows. */
const UNKNOWN = 'bhb-0';

/** The Handbook lists of at most 12 verses: the ones the screen walks draw (Decided 9). */
export const SMALL_LISTS: readonly ModelHandbookList[] = HANDBOOK_ORDER.filter(
  (list) => list.verses.length <= 12,
);

/** The passages a device may hold beside its lists. */
const PASSAGES: readonly Span[] = [
  { book: 19, chapter: 46, first: 1, last: 3 },
  { book: 43, chapter: 15, first: 1, last: 3 },
];

/** `seed` mixed, so neighbouring seeds start the generator far apart. */
const mixed = (seed: number) => {
  let s = (seed + 0x2545f491) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return (s ^ (s >>> 16)) >>> 0;
};

const pick = <A>(next: () => number, from: readonly A[]): A => from[below(next, from.length)] as A;

/** A device from `next`: its stored passages and lists as texts, and the recalls on its disk. */
const deviceOf = (next: () => number) => {
  const now = Date.now();
  const recalls = [recallOf(PROMISE, now - DAY - 3_600_000, 3, 0)];
  const lists: ModelHandbookList[] = [];
  const count = 1 + below(next, 3);
  while (lists.length < count) {
    const list = pick(next, SMALL_LISTS);
    if (!lists.includes(list)) lists.push(list);
  }
  const stored: string[] = lists.map((list) => list.id);
  if (below(next, 2) === 0) stored.splice(below(next, stored.length + 1), 0, UNKNOWN);
  if (below(next, 4) === 0) stored.push(pick(next, lists).id);
  const passages = PASSAGES.slice(0, below(next, 3));
  if (below(next, 2) === 0) {
    const list = pick(next, lists);
    const at = below(next, list.verses.length);
    recalls.push(recallOf(list.verses[at] as string, now - 2 * DAY, 3, 0));
    if (below(next, 3) === 0 && passages.length < 2) {
      const [book, chapter, verse] = list.places[at] as readonly [number, number, number];
      passages.push({ book, chapter, first: verse, last: verse });
    }
  }
  return {
    rawP: passages.length === 0 ? undefined : storedText(passages),
    rawL: JSON.stringify(stored),
    recalls,
  };
};

/** The passages' model's view of `model`, the lists held beside the passages. */
const heldOf = (model: Model): Held =>
  model.tag === 'Unread'
    ? { tag: 'Unread' }
    : { tag: 'Read', passages: model.passages, lists: heldLists(model.stored) };

const titleOf = (id: string) => HANDBOOK_ORDER.find((list) => list.id === id)?.title ?? id;

/** The verses with a recall that show in two rows or more of `want`. */
const shared = (want: FieldSeen, planted: ReadonlySet<string>) => {
  const rows = new Map<string, number>();
  for (const row of want.rows)
    for (const plant of row.plants) {
      const verse = plant.slice(0, plant.indexOf(', '));
      if (planted.has(verse)) rows.set(verse, (rows.get(verse) ?? 0) + 1);
    }
  return [...rows.values()].some((n) => n >= 2);
};

/** One generated reader's walk from `seed`, `steps` commands long; answers its faults and the cases it reached. */
export const walkListBar = async (seed: number, steps: number) => {
  const next = random(mixed(seed));
  const drawn = deviceOf(next);
  const disk = new Map<string, string | null>(drawn.recalls.map(record));
  if (drawn.rawP !== undefined) disk.set(KEY, drawn.rawP);
  disk.set(LISTS, drawn.rawL);
  device.launch(disk);
  const start = new Map(device.disk);
  let model = readModel(CORPUS, drawn.rawP, 0, drawn.rawL, 0);
  let wroteP = false;
  let wroteL = false;
  let bar: Asking = QUIET;
  const reached = new Set<string>();
  const faults: string[] = [];
  const log: string[] = [];
  let rig = await mountBar(0, model.tag === 'Unread');
  const stored = () => (model.tag === 'Read' ? model.stored : []);
  if (stored().includes(UNKNOWN)) reached.add('lists:unknown');
  if (new Set(stored()).size < stored().length) reached.add('lists:twice');
  const passages = () => (model.tag === 'Read' ? model.passages : []);
  const held = () => heldLists(stored());
  const count = () => passages().length + held().length;
  const want = () => fieldWant(heldOn(device.disk), PROMISE, heldOf(model), bar);
  const planted = () => new Set(heldOn(device.disk).map((recall) => recall.reference));
  const settle = async (step: string) => {
    if (faults.length > 0) return;
    log.push(step);
    const goal = want();
    if (goal.limit !== undefined && held().length > 0) reached.add('limit:with a list held');
    if (shared(goal, planted())) reached.add('shared verse');
    const got = await rig.settle(goal);
    if (got !== undefined)
      faults.push(
        `${step} after ${log.slice(-6, -1).join(' > ')}: ${JSON.stringify(got).slice(0, 300)} where the model has ${JSON.stringify(goal).slice(0, 300)}`,
      );
    const sheet = await settleSheet(rig.until, 'closed');
    if (sheet !== undefined)
      faults.push(`${step}: the sheet ${JSON.stringify(sheet).slice(0, 200)}`);
    const passagesText = device.disk.get(KEY);
    const wantP = wroteP ? storedText(passages()) : drawn.rawP;
    if (passagesText !== wantP)
      faults.push(`${step}: the stored passages ${passagesText} where the model has ${wantP}`);
    const listsText = device.disk.get(LISTS);
    const wantL = wroteL ? JSON.stringify(stored()) : drawn.rawL;
    if (listsText !== wantL)
      faults.push(`${step}: the stored lists ${listsText} where the model has ${wantL}`);
    for (const [key, value] of device.disk)
      if (key !== KEY && key !== LISTS && start.get(key) !== value)
        faults.push(`${step}: the key ${key} written`);
    for (const key of start.keys())
      if (!device.disk.has(key)) faults.push(`${step}: the key ${key} removed`);
    faults.push(...rig.faults.splice(0).map((fault) => `${step}: ${fault}`));
  };
  /** Taps the `Remove` of the held list `id` and settles on its ask. */
  const ask = async (id: string) => {
    const title = titleOf(id);
    if (!(await rig.tap(`Remove ${title}`))) faults.push(`no Remove ${title}`);
    bar = { ask: title, alert: undefined };
    await settle(`ask ${title}`);
  };
  /** The ask's `Remove` for the list `id`, its write refused or not, tapped twice in one turn when `twice`. */
  const confirm = async (id: string, refused: boolean, twice: boolean) => {
    const title = titleOf(id);
    const before = model;
    const limited = count() >= 3;
    const loose = [...planted()].filter((verse) => {
      const rows = want().rows.filter((row) => row.plants.some((p) => p.startsWith(`${verse}, `)));
      return rows.length === 1 && rows[0]?.title === title;
    });
    device.fail('set', refused ? 1 : 0);
    await rig.tap('Remove', 0, twice);
    const step = uprootRule(model, id, refused);
    reached.add(`uproot:${step.answer}`);
    if (step.answer === 'Removed') {
      if (twice) reached.add('uproot:twice');
      const kept = before.tag === 'Read' ? before.stored : [];
      if (kept.some((each) => each !== id && !HANDBOOK_ORDER.some((list) => list.id === each)))
        reached.add('uproot:unknown kept');
      if (kept.filter((each) => each === id).length >= 2)
        reached.add('uproot:an id stored twice, both gone');
      model = step.model;
      wroteL = true;
      bar = QUIET;
      if (limited && count() < 3) reached.add('limit lifted by an uproot');
      if (loose.some((verse) => want().rows.some((row) => row.title === verse)))
        reached.add('uproot:a loose row returns');
    } else bar = { ask: undefined, alert: notRemoved(title) };
    await settle(`remove ${title}${twice ? ' twice' : ''}${refused ? ', refused' : ''}`);
    device.fail('set', 0);
    return step.answer;
  };
  const uproot = async () => {
    const id = pick(next, held());
    await ask(id);
    if (below(next, 5) === 0) {
      reached.add('uproot:Keep');
      await rig.tap('Keep');
      bar = QUIET;
      await settle('keep');
      return;
    }
    const answer = await confirm(id, below(next, 4) === 0, below(next, 3) === 0);
    if (answer === 'Failed' && below(next, 2) === 0) {
      await ask(id);
      if ((await confirm(id, false, false)) === 'Removed') reached.add('uproot:retry landed');
    }
  };
  const removePassage = async () => {
    const span = pick(next, passages());
    if (!(await rig.tap(`Remove ${spanRef(span)}`))) faults.push(`no Remove ${spanRef(span)}`);
    bar = { ask: span, alert: undefined };
    await settle(`ask ${spanRef(span)}`);
    await rig.tap('Remove');
    const step = removeStep(model, span, false);
    reached.add(`passage:${step.answer}`);
    model = step.model;
    wroteP = wroteP || step.landed;
    bar = QUIET;
    await settle(`remove ${spanRef(span)}`);
  };
  const relaunch = async () => {
    await rig.leave();
    device.launch(device.disk);
    rig = await mountBar(0, model.tag === 'Unread');
    bar = QUIET;
    if (held().length > 0) reached.add('relaunch');
    await settle('relaunch');
  };
  /** `Add verses`, the shelf of a small list home does not show whole, and its `Plant`; a relaunch when none may be planted. */
  const plantThrough = async () => {
    const shown = new Set(
      want().rows.flatMap((row) => row.plants.map((plant) => plant.slice(0, plant.indexOf(', ')))),
    );
    const choices = SMALL_LISTS.filter(
      (list) => !held().includes(list.id) && !list.verses.every((verse) => shown.has(verse)),
    );
    if (model.tag === 'Unread' || count() >= 3 || choices.length === 0) return relaunch();
    const list = pick(next, choices);
    if (!(await rig.tapId('add-verses'))) faults.push('no add-verses');
    if (!(await activateSheet(rig.until))) faults.push('the sheet never became active');
    if (!(await tapSheet(list.section))) faults.push(`no shelf ${list.section}`);
    if (!(await tapSheet(`Plant ${list.title}`))) faults.push(`no Plant ${list.title}`);
    const step = plantRule(model, list.id, false);
    model = step.model;
    wroteL = true;
    bar = QUIET;
    reached.add('plant:list');
    await settle(`plant ${list.title}`);
  };
  await settle('launch');
  for (let step = 0; step < steps && faults.length === 0; step++) {
    const roll = below(next, 10);
    if (held().length > 0 && roll < 4) await uproot();
    else if (passages().length > 0 && roll < 6) await removePassage();
    else if (roll < 8) await plantThrough();
    else await relaunch();
  }
  await rig.leave();
  device.fail('set', 0);
  return { faults, reached };
};

/** The model's shelves: the first 17, then the Handbook's. */
const SHELVES = shelvesModel();
const HANDBOOK_SHELVES = SHELVES.slice(BASE_SHELVES).map((shelf) => shelf.title);

/** The Handbook shelves that offer a small list, and the shelves of picks a walk may open beside them. */
const SMALL_SHELVES = [...new Set(SMALL_LISTS.map((list) => list.section))];
const PICK_SHELVES = ['Psalms', 'Proverbs'];

/** The model lists of the shelf `title`. */
const shelfLists = (title: string): readonly ModelList[] => {
  const lists = SHELVES.find((shelf) => shelf.title === title)?.lists;
  return lists === undefined || lists === 'chooser' ? [] : lists;
};

/** The picks a sheet device may hold. */
const DEVICE_PICKS: readonly Span[] = [
  { book: 19, chapter: 1, first: 1, last: 3 },
  { book: 20, chapter: 15, first: 1, last: 1 },
  { book: 43, chapter: 14, first: 27, last: 27 },
];

/** The verses of `span`, by reference. */
const spanVerses = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, index) =>
    verseRef(span.book, span.chapter, span.first + index),
  );

/** Lists' stored texts that do not decode. */
const GARBLED_LISTS = ['["bhb-2176"', 'null', '{"id":"bhb-2176"}', '[2176]', '"bhb-2176"'];

/** A sheet device from `next`: its stored passages and lists as texts, the kind of its lists, the promise planted or not, and the small list one verse of which it holds a recall on. */
const shelfDeviceOf = (next: () => number) => {
  const roll = below(next, 10);
  const passages = DEVICE_PICKS.slice(0, roll < 4 ? 0 : roll < 7 ? 1 : roll < 9 ? 2 : 3);
  const kindRoll = below(next, 8);
  const ids: string[] = [];
  const many = below(next, 4) === 0 ? 3 : 1;
  while (ids.length < many) {
    const list = pick(next, SMALL_LISTS);
    if (!ids.includes(list.id)) ids.push(list.id);
  }
  let kind = 'held';
  let rawL: string | undefined = JSON.stringify(ids);
  if (kindRoll === 0) [kind, rawL] = ['none', undefined];
  else if (kindRoll === 1) [kind, rawL] = ['none', '[]'];
  else if (kindRoll === 2) [kind, rawL] = ['garbled', pick(next, GARBLED_LISTS)];
  else if (kindRoll === 3) {
    kind = 'unknown';
    rawL = JSON.stringify([...ids.slice(0, 1), UNKNOWN, ...ids.slice(1)]);
  } else if (kindRoll === 4) [kind, rawL] = ['twice', JSON.stringify([...ids, ids[0]])];
  const own = below(next, 2) === 0;
  const loose = below(next, 3) === 0 ? pick(next, SMALL_LISTS) : undefined;
  return {
    rawP: passages.length === 0 ? undefined : storedText(passages),
    rawL,
    kind,
    own,
    loose: loose?.verses[below(next, loose.verses.length)],
  };
};

/** How a reader taps `Plant`: once, twice in one turn, then `Done` in one turn, or once with its write held. */
const HOWS = ['once', 'twice', 'then-Done', 'held', 'once'] as const;
type How = (typeof HOWS)[number];

/** One generated reader's walk through the Add verses sheet with Handbook shelves, from `seed`, `steps` commands long; answers its faults and how often it reached each case. */
export const walkListShelf = async (seed: number, steps: number) => {
  const next = random(mixed(seed + 7_919));
  const drawn = shelfDeviceOf(next);
  const at = Date.now() - DAY;
  const disk = new Map<string, string | null>();
  if (drawn.own) disk.set(...record(recallOf(PROMISE, at, 3, 0)));
  if (drawn.loose !== undefined) disk.set(...record(recallOf(drawn.loose, at, 3, 0)));
  if (drawn.rawP !== undefined) disk.set(KEY, drawn.rawP);
  if (drawn.rawL !== undefined) disk.set(LISTS, drawn.rawL);
  device.launch(disk);
  const start = new Map(device.disk);
  let lists = readModel(CORPUS, drawn.rawP, 0, drawn.rawL, 0);
  let model: SheetModel = opened(heldOf(lists));
  let wroteP = false;
  let wroteL = false;
  const reached = new Map<string, number>([[`lists:${drawn.kind}`, 1]]);
  const reach = (name: string) => reached.set(name, (reached.get(name) ?? 0) + 1);
  const faults: string[] = [];
  const log: string[] = [];
  const stored = () => (lists.tag === 'Read' ? lists.stored : []);
  const held = () => heldLists(stored());
  const passages = () => (model.held.tag === 'Read' ? model.held.passages : []);
  const count = () => passages().length + held().length;
  /** The field's rows as the model holds them: the own row, each held range, each held list, and the loose verse. */
  const rows = (): (readonly string[])[] => {
    const out: (readonly string[])[] = [[PROMISE]];
    if (model.held.tag === 'Read') {
      for (const span of model.held.passages) out.push(spanVerses(span));
      for (const id of held())
        out.push(HANDBOOK_ORDER.find((list) => list.id === id)?.verses ?? []);
    }
    if (drawn.loose !== undefined) out.push([drawn.loose]);
    return out;
  };
  const rig = await mountShelves();
  const settle = async (step: string) => {
    if (faults.length > 0) return;
    log.push(step);
    const want = sheetWant(model, rows());
    const got = await rig.settle(want);
    if (got !== undefined)
      faults.push(
        `${step} after ${log.slice(-6, -1).join(' > ')}: ${JSON.stringify(got).slice(0, 300)} where the model has ${JSON.stringify(want).slice(0, 300)}`,
      );
    if (JSON.stringify(rig.counts) !== JSON.stringify(model.counts))
      faults.push(
        `${step}: the counts ${JSON.stringify(rig.counts)} where the model has ${JSON.stringify(model.counts)}`,
      );
    const wantL = wroteL ? JSON.stringify(stored()) : drawn.rawL;
    if (device.disk.get(LISTS) !== wantL)
      faults.push(
        `${step}: the stored lists ${device.disk.get(LISTS)} where the model has ${wantL}`,
      );
    const wantP = wroteP ? storedText(passages()) : drawn.rawP;
    if (device.disk.get(KEY) !== wantP)
      faults.push(
        `${step}: the stored passages ${device.disk.get(KEY)} where the model has ${wantP}`,
      );
    for (const [key, value] of device.disk)
      if (key !== KEY && key !== LISTS && start.get(key) !== value)
        faults.push(`${step}: the key ${key} written`);
    faults.push(...rig.faults.splice(0).map((fault) => `${step}: ${fault}`));
  };
  const tallyLimit = () => {
    if (model.open && model.held.tag === 'Read' && count() >= 3 && held().length > 0)
      reach('limit');
  };
  /** A Handbook shelf opened tallied: unread, and each held list's offer in the field. */
  const tallyOpen = () => {
    if (model.shelf === null || !HANDBOOK_SHELVES.includes(model.shelf)) return;
    if (model.held.tag === 'Unread') return reach('unread');
    for (const list of shelfLists(model.shelf))
      if (held().includes(list.id)) reach('offer:in-field');
  };
  const tapShelfHead = async (title: string) => {
    const handbook = HANDBOOK_SHELVES.includes(title);
    if (model.shelf === null && handbook) reach('shelf:open');
    if (
      model.shelf !== null &&
      model.shelf !== title &&
      handbook !== HANDBOOK_SHELVES.includes(model.shelf)
    )
      reach('shelf:switch');
    await rig.tap(title);
    model = tapShelf(model, title);
    await settle(`shelf ${title}`);
    tallyOpen();
  };
  /** A shelf head to tap: the open one (a close) one time in three, a shelf of picks one time in five, a held list's or the loose verse's shelf now and then, else a Handbook shelf with a small list. */
  const randomShelf = () => {
    if (model.shelf !== null && below(next, 3) === 0) return model.shelf;
    if (below(next, 5) === 0) return pick(next, PICK_SHELVES);
    const mine = HANDBOOK_ORDER.filter(
      (list) => held().includes(list.id) || list.verses.includes(drawn.loose ?? ''),
    );
    if (mine.length > 0 && below(next, 3) === 0) return pick(next, mine).section;
    return pick(next, SMALL_SHELVES);
  };
  const close = async (by: 'Done' | 'Escape') => {
    if (by === 'Done') await rig.tap('Done');
    else await rig.escape();
    model = done(model);
    await settle(by);
  };
  /** The offers the model shows `Plant` on in the open shelf: picks, and Handbook lists of at most 12 verses. */
  const plantable = () => {
    const want = sheetWant(model, rows());
    if (want === 'closed' || model.shelf === null) return [];
    return shelfLists(model.shelf).filter(
      (list) =>
        list.verses.length <= 12 &&
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
  /** A landed list plant tallied: from how many held, beside a passage or an unknown id, by two taps, after a retry. */
  const tallyListAdded = (how: How, from: number, retry: boolean) => {
    reach(`plant:list:Added:from-${from}`);
    if (passages().length > 0) reach('plant:list:Added:with a passage');
    if (stored().includes(UNKNOWN)) reach('plant:list:Added:beside an unknown id');
    if (how === 'twice') reach('plant:list:twice');
    if (retry) reach('retry landed');
  };
  const tapPlant = async (list: ModelList, retry: boolean): Promise<void> => {
    const label = `Plant ${list.title}`;
    const refused = below(next, 4) === 0;
    const how: How = HOWS[below(next, HOWS.length)] ?? 'once';
    const from = count();
    device.fail('set', refused ? 1 : 0);
    await press(label, how);
    let outcome: string;
    if (list.source.tag === 'Handbook') {
      const answer = plantList(model, list.id, list.title, refused);
      model = answer.model;
      outcome = answer.outcome;
      reach(`plant:list:${outcome}`);
      if (outcome === 'Added' && lists.tag === 'Read') {
        lists = { ...lists, stored: [...lists.stored, list.id] };
        wroteL = true;
        tallyListAdded(how, from, retry);
      }
    } else {
      const answer = plant(CORPUS, model, list.range ?? DEVICE_PICKS[0]!, refused);
      model = answer.model;
      outcome = answer.outcome;
      reach(`plant:pick:${outcome}`);
      if (outcome === 'Added') {
        wroteP = true;
        if (held().length > 0) reach('plant:pick:Added:with a list');
      }
    }
    await settle(`${label} ${how} ${outcome}`);
    device.fail('set', 0);
    if (outcome !== 'Failed' || faults.length > 0) return;
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
    const roll = below(next, 12);
    const offers = plantable();
    if (roll < 4 || (roll < 10 && offers.length === 0)) await tapShelfHead(randomShelf());
    else if (roll < 10) await tapPlant(pick(next, offers), false);
    else await close(roll === 10 ? 'Done' : 'Escape');
  }
  await rig.leave();
  device.fail('set', 0);
  return { faults, reached };
};

/** Walks `seeds` through the sheet, `steps` commands each; answers the faults of the first device with any (by seed), and how often each case was reached over them all. */
export const walkListShelves = async (seeds: ReadonlyArray<number>, steps: number) => {
  const reached = new Map<string, number>();
  for (const seed of seeds) {
    const result = await walkListShelf(seed, steps);
    if (result.faults.length > 0)
      return { faults: [`seed ${seed}`, ...result.faults.slice(0, 4)], reached };
    for (const [each, n] of result.reached) reached.set(each, (reached.get(each) ?? 0) + n);
  }
  return { faults: [], reached };
};

/** Walks `seeds`, `steps` commands each; answers the faults of the first device with any (by seed), and how many devices reached each case. */
export const walkListBars = async (seeds: ReadonlyArray<number>, steps: number) => {
  const reached = new Map<string, number>();
  for (const seed of seeds) {
    const result = await walkListBar(seed, steps);
    if (result.faults.length > 0)
      return { faults: [`seed ${seed}`, ...result.faults.slice(0, 4)], reached };
    for (const each of result.reached) reached.set(each, (reached.get(each) ?? 0) + 1);
  }
  return { faults: [], reached };
};
