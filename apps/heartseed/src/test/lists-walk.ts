/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noTernary, effect/noGlobals -- a generated walk through the field with Handbook lists planted: it drives the root one awaited tap at a time, names faults and stored texts by their JSON, dates recalls by the host's clock, and reads the model's undefined as none. */

/**
 * A generated reader's walk through the field with planted Handbook lists
 * (hshandbook E), for the parts `src/field/bar-planted-*.test.tsx`, over
 * `bar-rig.tsx`, judged after every tap against `choose-model.ts`'s
 * `fieldWant` and the lists' and passages' rules of `handbook-model.ts`.
 *
 * A device holds the promise planted yesterday, 0-2 stored passages (one
 * of them now and then over a verse of a held list), 1-3 stored lists of at
 * most 12 verses, now and then with an id this build does not know or an
 * id stored twice, and a recall on a verse of a held list now and then.
 * Its launch lands on home. Each step: a list furrow's `Remove`, then
 * `Keep` or the ask's `Remove` (its write landing or refused; once or twice
 * in one turn; a refusal retried in half); a passage's `Remove` and the
 * ask's `Remove`; or a relaunch. After every tap home's rows, add, limit,
 * ask and alert are the model's, the sheet is closed, both stored texts are
 * the start's until a change lands and the model's after (unknown ids in
 * place), no other key is written or removed (no recall), and every frame
 * kept the root's rule and the bar's.
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
  readModel,
  removeStep,
  uprootRule,
  type Model,
  type ModelHandbookList,
} from './handbook-model';
import { device } from './one';
import { mountBar } from './bar-rig';
import { KEY, spanRef, storedText, type Held, type Span } from './passages-model';
import { CORPUS } from './passages-rig';
import { settleSheet } from './shelves-rig';

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
  await settle('launch');
  for (let step = 0; step < steps && faults.length === 0; step++) {
    const roll = below(next, 8);
    if (held().length > 0 && roll < 5) await uproot();
    else if (passages().length > 0 && roll < 7) await removePassage();
    else await relaunch();
  }
  await rig.leave();
  device.fail('set', 0);
  return { faults, reached };
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
