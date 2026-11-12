/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noTernary, effect/noGlobals, effect/noRuntimeTypeof -- a generated walk through the Add a list sheet under the real root: it drives the root one awaited tap at a time through React's promise-based `act`, names faults by their JSON, reads the model's undefined as none, and tells the bar's reading of the field from the heading shown off it by its type. */

/**
 * The Add a list sheet walked under the real `<Root />` (hsguards7 §C), for
 * the parts `src/shelves/root*.test.tsx`, over `bar-rig.tsx` with the
 * collections a world teaches handed to the app's layer.
 *
 * A seed is one world and one script, drawn by the models alone: the
 * collections taught (none, protection alone, several with protection in
 * either order, several without it, an unknown id before or after a known
 * one); the stored passages (none, or one to three ranges, each a pick
 * whole, a pick in part, Proverbs 18:10, a range of the protection
 * collection or a promise of a shelf; three failed reads of them, so
 * unread); the app's own verse planted or not, and one loose planted verse
 * or none. The script opens the sheet by `Add a list`, taps up to four
 * shelves (most often `Proverbs`, a taught
 * collection's own shelf or `Strength`), plants once, opens the sheet again
 * on that shelf, and taps `Done`. A world with unread passages or three
 * held, or a plant that makes three, offers no `Add a list`.
 *
 * After every command the sheet equals `sheetWant` over rows of verse
 * membership (the app's own row, the held ranges and the taught collections
 * by `listsModel`, each planted verse); each offer shown reads
 * `In your field` exactly when home, under the sheet, draws a plant for
 * every verse of it; home's rows equal `fieldRule` over the disk and
 * `fieldPassagesModel`; the stored passages are the model's and no other key
 * changed; and every frame kept the rig's rules.
 */

import passage from 'virtual:heartseed-passage';

import { COLLECTIONS } from '../promises';
import { mountBar, readBar } from './bar-rig';
import { START } from './clock';
import { fieldRule, heldOn, recallOf } from './field-model';
import { record } from './field-rig';
import { below, DAY, random } from './garden-model';
import { BASE_SHELVES, listsModel, offerModel, shelvesModel, type ModelList } from './home-model';
import { device } from './one';
import { KEY, readRule, storedText, verseRef, type Held, type Span } from './passages-model';
import { CORPUS } from './passages-rig';
import { fieldPassagesModel } from './promise-model';
import { activateSheet, readSheet, settleSheet, tapSheet } from './shelves-rig';
import {
  done,
  opened,
  plant,
  sheetWant,
  tapShelf,
  type SheetModel,
  type SheetSeen,
} from './shelves-model';

/** A shelf of lists among the first 17, by its id and title. */
interface Listed {
  readonly id: string;
  readonly title: string;
  readonly lists: readonly ModelList[];
}

const OWN = [{ title: passage.reference, verses: [passage.reference] }];
const LISTED: readonly Listed[] = shelvesModel()
  .slice(0, BASE_SHELVES)
  .flatMap((shelf) =>
    shelf.lists === 'chooser' ? [] : [{ id: shelf.id, title: shelf.title, lists: shelf.lists }],
  );
const PICKS = LISTED.slice(0, 3).flatMap((shelf) => shelf.lists);
const IDS = COLLECTIONS.map((each) => each.id);
const PROTECTION = 'protection';
const PROVERB = 'Proverbs 18:10';
/** The collections whose verses cover a pick or the app's own verse: teaching one shows on a picks shelf or on `Strength`. */
const LEAN = ['guidance', 'peace', 'strength'];
const UNKNOWN = 'no-such-collection';
const SHELF_TAPS = 4;

const versesOf = (span: Span) => {
  const out: string[] = [];
  for (let verse = span.first; verse <= span.last; verse++)
    out.push(verseRef(span.book, span.chapter, verse));
  return out;
};

/** A taught collection's verses, each once, by the committed list. */
const taughtVerses = (ids: readonly string[]) =>
  ids.flatMap((id) =>
    COLLECTIONS.filter((each) => each.id === id).flatMap((each) => each.promises.flatMap(versesOf)),
  );

const mixed = (seed: number) => {
  let s = (seed + 0x7007) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return (s ^ (s >>> 16)) >>> 0;
};

const pick = <A>(next: () => number, list: readonly A[]): A => list[below(next, list.length)]!;

const unique = <A>(list: readonly A[]) => [...new Set(list)];

/** The collections a world's layer teaches, and which kind of set it is. */
const taughtOf = (next: () => number): [string, string[]] => {
  const others = IDS.filter((id) => id !== PROTECTION);
  const other = () => (below(next, 2) === 0 ? pick(next, LEAN) : pick(next, others));
  const roll = below(next, 9);
  if (roll === 0) return ['none', []];
  if (roll <= 2) return ['protection', [PROTECTION]];
  if (roll <= 4) {
    const several = unique([other(), PROTECTION, other()]);
    if (below(next, 2) === 0) several.reverse();
    return ['several', several];
  }
  if (roll <= 6) return ['without', unique([other(), other()])];
  const known = below(next, 2) === 0 ? [PROTECTION] : [other()];
  return ['unknown', below(next, 2) === 0 ? [UNKNOWN, ...known] : [...known, UNKNOWN]];
};

/** One stored range: a pick whole, a pick in part, a range of the taught collection's (the proverb's among them), or a promise of a shelf. */
const rangeOf = (next: () => number): [string, Span] => {
  const roll = below(next, 5);
  if (roll === 0) return ['pick', pick(next, PICKS).range!];
  if (roll === 1) return ['proverb', { book: 20, chapter: 18, first: 10, last: 10 }];
  if (roll === 2) {
    const wide = PICKS.filter((list) => list.verses.length > 2);
    const span = pick(next, wide).range!;
    return ['part', { ...span, first: span.first + 1 }];
  }
  if (roll === 3) {
    const protection = COLLECTIONS.find((each) => each.id === PROTECTION);
    return ['taught-range', pick(next, protection?.promises ?? [])];
  }
  const shelf = pick(next, LISTED.slice(3));
  return ['promise', pick(next, shelf.lists).range!];
};

/** A world: the collections taught and their kind, the stored text, its failed reads and each range's kind, and the verses planted. */
interface World {
  readonly taughtKind: string;
  readonly taught: readonly string[];
  readonly reads: number;
  readonly kinds: readonly string[];
  readonly raw: string | undefined;
  readonly planted: readonly string[];
}

/** The stored passages of a world: no key, or one to three ranges, read whole or failing three reads. */
const storedOf = (next: () => number) => {
  const storedRoll = below(next, 8);
  const reads = storedRoll === 0 ? 3 : 0;
  const kinds: string[] = [];
  if (storedRoll === 1) return { reads, kinds, raw: undefined };
  const count = storedRoll === 7 ? 3 : 1 + below(next, 2);
  const spans: Span[] = [];
  for (let at = 0; at < count; at++) {
    const [kind, span] = rangeOf(next);
    kinds.push(kind);
    spans.push(span);
  }
  return { reads, kinds, raw: storedText(spans) };
};

/** The verses a world has planted: the app's own or another, and one loose verse or none. */
const plantedOf = (next: () => number) => {
  const planted: string[] = [];
  if (below(next, 3) > 0) planted.push(passage.reference);
  else planted.push('Genesis 1:1');
  const looseRoll = below(next, 6);
  if (looseRoll === 0) planted.push(PROVERB);
  if (looseRoll === 1) planted.push('Proverbs 16:3');
  if (looseRoll === 2) planted.push('Psalms 56:3');
  if (looseRoll === 3) planted.push('John 14:27');
  return planted;
};

const worldOf = (next: () => number): World => {
  const [taughtKind, taught] = taughtOf(next);
  const stored = storedOf(next);
  return { taughtKind, taught, ...stored, planted: plantedOf(next) };
};

type Reach = (name: string) => void;

/** The field's rows by verse membership: the app's own row, the passages `held`, the taught collections and each planted verse. */
const rowsOf = (world: World, held: Held): string[][] => [
  ...listsModel(OWN, held, world.taught).map((list) => [...list.verses]),
  ...world.planted.map((verse) => [verse]),
];

/** Whether the field holds every verse of `verses` with the rows of `source` left out. */
const without = (world: World, held: Held, verses: readonly string[], source: string) => {
  const rows: (readonly string[])[] = [];
  if (source !== 'own') rows.push([passage.reference]);
  if (source !== 'held' && held.tag === 'Read') rows.push(held.passages.flatMap(versesOf));
  if (source !== 'taught') rows.push(taughtVerses(world.taught));
  if (source !== 'planted') rows.push(world.planted);
  return verses.every((verse) => rows.some((row) => row.includes(verse)));
};

/** Whether `list` needs a taught collection after the first known one. */
const needsLater = (world: World, held: Held, list: ModelList) => {
  const first: (readonly string[])[] = [[passage.reference], world.planted];
  if (held.tag === 'Read') first.push(held.passages.flatMap(versesOf));
  first.push(taughtVerses(world.taught.filter((id) => IDS.includes(id)).slice(0, 1)));
  return !list.verses.every((verse) => first.some((row) => row.includes(verse)));
};

/** Proverbs 18:10's offer tallied by whether protection is taught and what else holds it. */
const tallyProverb = (world: World, held: Held, list: ModelList, state: string, reach: Reach) => {
  const teaches = world.taught.includes(PROTECTION);
  const byOthers = without(world, held, list.verses, 'taught');
  if (teaches && !byOthers) {
    reach('proverb:in-field:by-taught');
    reach(`proverb:by-taught:${world.taughtKind}`);
  }
  if (teaches && byOthers) reach('proverb:in-field:taught-and-more');
  if (!teaches && state === 'in field') reach('proverb:in-field:untaught');
  if (!teaches && state === 'plant') reach('proverb:plant:untaught');
  if (!teaches && state === 'full') reach('proverb:full:untaught');
};

/** One offer tallied by what the model shows on it and which rows it needs; answers whether it is in the field. */
const tallyOffer = (world: World, held: Held, list: ModelList, reach: Reach) => {
  const state = offerModel(list.verses, held, rowsOf(world, held));
  reach(`offer:${state}`);
  if (state === 'in field')
    for (const source of ['own', 'held', 'taught', 'planted'])
      if (!without(world, held, list.verses, source)) reach(`in-field:needs-${source}`);
  if (
    state === 'in field' &&
    !without(world, held, list.verses, 'taught') &&
    needsLater(world, held, list)
  )
    reach('in-field:needs-later-taught');
  const some = list.verses.some((verse) => taughtVerses(world.taught).includes(verse));
  if (state !== 'in field' && some) reach('taught:in-part');
  if (list.title === PROVERB) tallyProverb(world, held, list, state, reach);
  return state === 'in field';
};

/** The open shelf's offers tallied, and a taught collection's own shelf wholly in the field. */
const tallyShelf = (world: World, model: SheetModel, reach: Reach) => {
  const shelf = LISTED.find((each) => each.title === model.shelf);
  if (shelf === undefined) return;
  const inField = shelf.lists.map((list) => tallyOffer(world, model.held, list, reach));
  if (world.taught.includes(shelf.id) && inField.every((each) => each)) reach('taught-shelf:whole');
};

/** A reader's command and what follows it by the models. */
interface Step {
  readonly name: string;
  readonly act:
    | { readonly kind: 'open'; readonly by: 'add-list' }
    | { readonly kind: 'shelf'; readonly title: string }
    | { readonly kind: 'plant'; readonly title: string }
    | { readonly kind: 'done' };
  /** The sheet after the step, by the model. */
  readonly want: SheetSeen;
  /** The stored passages after the step, by the model. */
  readonly stored: string | undefined;
}

/** The sheet's script over a world whose passages read with fewer than 3 held, into `steps`; answers how many `Add a list` home offers at its end. */
const sheetScript = (
  next: () => number,
  world: World,
  held0: Held,
  steps: Step[],
  reach: Reach,
) => {
  let model: SheetModel = opened(held0);
  let written = false;
  const push = (name: string, act: Step['act']) =>
    steps.push({
      name,
      act,
      want: sheetWant(model, rowsOf(world, model.held)),
      stored: written && model.held.tag === 'Read' ? storedText(model.held.passages) : world.raw,
    });
  const open = () => {
    const where = 'add-list';
    model = opened(model.held, model.counts);
    reach(`open:${where}`);
    push(`open by ${where}`, { kind: 'open', by: where });
  };
  /** A shelf to tap: Proverbs most often, a taught collection's own, the shelf of the app's own verse, or any. */
  const shelfOf = () => {
    const roll = below(next, 8);
    const own = LISTED.filter((shelf) => world.taught.includes(shelf.id));
    if (roll <= 2) return 'Proverbs';
    if (roll === 3 && own.length > 0) return pick(next, own).title;
    if (roll === 4) return 'Strength';
    if (roll === 5) return pick(next, ['Psalms', 'The Gospel of John']);
    return pick(next, LISTED).title;
  };
  const offered = (list: ModelList) =>
    offerModel(list.verses, model.held, rowsOf(world, model.held));
  open();
  reach(`sheet:taught:${world.taughtKind}`);
  let planted1 = false;
  for (let at = 0; at < SHELF_TAPS; at++) {
    const title = shelfOf();
    if (model.shelf === title) continue;
    model = tapShelf(model, title);
    push(`shelf ${title}`, { kind: 'shelf', title });
    tallyShelf(world, model, reach);
    const shelf = LISTED.find((each) => each.title === title);
    const offers = (shelf?.lists ?? []).filter((list) => offered(list) === 'plant');
    if (planted1 || offers.length === 0 || below(next, 3) !== 0) continue;
    const list = pick(next, offers);
    planted1 = true;
    written = true;
    model = plant(CORPUS, model, list.range!, false).model;
    reach('plant:landed');
    push(`plant ${list.title}`, { kind: 'plant', title: list.title });
    if (model.held.tag === 'Read' && model.held.passages.length >= 3) {
      reach('plant:to-3:no-add');
      return 0;
    }
    open();
    model = tapShelf(model, title);
    push(`shelf ${title} again`, { kind: 'shelf', title });
    if (offered(list) === 'in field') reach('plant:then-in-field');
    tallyShelf(world, model, reach);
  }
  model = done(model);
  push('Done', { kind: 'done' });
  return 1;
};

/** The world and the script of `seed`, by the models alone. */
const scriptOf = (seed: number) => {
  const next = random(mixed(seed));
  const world = worldOf(next);
  const held = readRule(CORPUS, world.raw, world.reads);
  const reached = new Map<string, number>();
  const reach = (name: string) => {
    reached.set(name, (reached.get(name) ?? 0) + 1);
  };
  reach(`taught:${world.taughtKind}`);
  reach(`launch:${held.tag}`);
  for (const kind of held.tag === 'Read' ? world.kinds : []) reach(`stored:${kind}`);
  reach(world.planted.includes(passage.reference) ? 'own:planted' : 'own:not-planted');
  const steps: Step[] = [];
  const script = { ...world, held, steps, reached };
  if (held.tag === 'Unread' || held.passages.length >= 3) {
    reach(held.tag === 'Unread' ? 'unread:no-add' : 'held-3:no-add');
    return { ...script, adds: 0 };
  }
  return { ...script, adds: sheetScript(next, world, held, steps, reach) };
};

/** Launches the real root over the world of `seed` and replays its script; answers its faults and the cases the script reaches. */
export const walkRoot = async (seed: number) => {
  const script = scriptOf(seed);
  const faults: string[] = [];
  const disk = new Map<string, string | null>(
    script.planted.map((verse) => record(recallOf(verse, START - DAY, 3, 0))),
  );
  if (script.raw !== undefined) disk.set(KEY, script.raw);
  device.launch(disk);
  const start = new Map(device.disk);
  const rig = await mountBar(
    script.reads,
    script.held.tag === 'Unread',
    null,
    { now: START },
    script.taught,
  );
  const fail = (text: string) => {
    if (faults.length < 6) faults.push(`seed ${seed} ${text}`);
  };
  /** Home's rows as the field's model has them over the disk, the passages the model holds and the collections taught. */
  const homeWant = (held: Held) =>
    fieldRule(heldOn(device.disk), fieldPassagesModel(OWN, held, script.taught)).rows.map(
      (row) => ({
        title: row.title,
        plants: row.plants.map((each) => `${each.reference}, ${each.stage}`),
      }),
    );
  const homeSeen = () => {
    const seen = readBar(rig.host);
    if (typeof seen === 'string') return seen;
    if ('list' in seen) return `the list ${seen.list}`;
    return seen.rows.map((row) => ({ title: row.title, plants: row.plants }));
  };
  const home = async (step: string, held: Held) => {
    const want = JSON.stringify(homeWant(held));
    if (!(await rig.until(() => JSON.stringify(homeSeen()) === want)))
      fail(
        `${step}: home ${JSON.stringify(homeSeen()).slice(0, 240)} where the model has ${want.slice(0, 240)}`,
      );
  };
  /** Each offer shown reads `In your field` exactly when home, under the sheet, draws a plant for each of its verses. */
  const drawnOnHome = (step: string) => {
    const seen = readSheet();
    if (seen === 'closed') return;
    const labels = [...rig.host.querySelectorAll('[data-testid="field-plant"]')].map(
      (node) => node.getAttribute('aria-label') ?? '',
    );
    const drawn = (verse: string) => labels.some((label) => label.startsWith(`${verse}, `));
    const shown = seen.shelves.find(([, expanded]) => expanded === 'true');
    const shelf = LISTED.find((each) => each.title === shown?.[0]);
    for (const [title, , state] of seen.offers) {
      const list = shelf?.lists.find((each) => each.title === title);
      if (list === undefined) {
        fail(`${step}: the offer ${title} is no list of the open shelf`);
        continue;
      }
      if ((state === 'In your field') !== list.verses.every(drawn))
        fail(
          `${step}: the offer ${title} reads ${state || 'nothing'} while home draws ${list.verses.filter(drawn).length} of its ${list.verses.length} verses`,
        );
    }
  };
  /** Home's `Add a list`, or none over unread passages and at 3 held. */
  const adds = (step: string, want: number) => {
    const seen = readBar(rig.host);
    if (typeof seen === 'string' || 'list' in seen || seen.add !== want)
      fail(
        `${step}: home offers ${typeof seen === 'string' || 'list' in seen ? JSON.stringify(seen) : seen.add} Add a list, not ${want}`,
      );
  };
  let held: Held = script.held;
  /** Taps what `step` names, and keeps the passages a plant adds. */
  const perform = async (step: Step) => {
    const { act } = step;
    if (act.kind === 'open') {
      if (!(await rig.tapId(act.by))) fail(`${step.name}: no ${act.by}`);
      else if (!(await activateSheet(rig.until))) fail(`${step.name}: no sheet came`);
    } else if (act.kind === 'shelf') {
      if (!(await tapSheet(act.title))) fail(`${step.name}: no shelf`);
    } else if (act.kind === 'plant') {
      if (!(await tapSheet(`Plant ${act.title}`))) fail(`${step.name}: no Plant ${act.title}`);
      const list = LISTED.flatMap((shelf) => shelf.lists).find((each) => each.title === act.title);
      if (held.tag === 'Read' && list?.range !== undefined)
        held = { tag: 'Read', passages: [...held.passages, list.range] };
    } else if (!(await tapSheet('Done'))) fail(`${step.name}: no Done`);
  };
  /** Holds the screen after `step` to the models; answers whether the sheet came as the model has it. */
  const judge = async (step: Step) => {
    const got = await settleSheet(rig.until, step.want);
    if (got !== undefined) {
      fail(
        `${step.name}: the sheet ${JSON.stringify(got).slice(0, 400)} where the model has ${JSON.stringify(step.want).slice(0, 400)}`,
      );
      drawnOnHome(step.name);
      return false;
    }
    await home(step.name, held);
    drawnOnHome(step.name);
    if (device.disk.get(KEY) !== step.stored)
      fail(
        `${step.name}: the stored passages ${device.disk.get(KEY)} where the model has ${step.stored}`,
      );
    for (const [key, value] of device.disk)
      if (key !== KEY && start.get(key) !== value) fail(`${step.name}: the key ${key} written`);
    for (const fault of rig.faults.splice(0)) fail(`${step.name}: ${fault}`);
    return true;
  };
  await home('launch', script.held);
  if (script.steps.length === 0) adds('launch', 0);
  for (const step of script.steps) {
    if (faults.length > 0) break;
    await perform(step);
    if (faults.length > 0 || !(await judge(step))) break;
  }
  if (faults.length === 0) adds('end', script.adds);
  for (const fault of rig.faults.splice(0)) fail(`end: ${fault}`);
  await rig.leave();
  const reached: ReadonlyMap<string, number> = script.reached;
  return { faults, reached };
};
