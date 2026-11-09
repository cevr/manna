/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noTernary, effect/noGlobals -- a generated walk through the field's bar: it drives the root one awaited tap at a time, names faults by their JSON, and reads the model's undefined as none. */

/**
 * A generated reader's walk through the field's bar and rows, for the
 * bar's parts (`src/field/bar-*.test.tsx`), over `bar-rig.tsx`, judged after
 * every tap against `choose-model.ts` (the field, the bar and the ask) and
 * the passages' model.
 *
 * A device holds the promise planted 0, 1, 2 or 6 days back, `Genesis 1:1`
 * planted in half, and a stored value (`storedOf`: no key, `[]`, a garbled
 * value, or 1-6 passages with equal ones, overlaps, one over the promise's
 * verse and a Psalms 119 range past 20 verses), a verse of some held
 * passages planted, and 0-3 failed reads of the passages' key alone. Each
 * step, over passages read: a row's `Remove` (any of equal rows), then
 * `Keep`, another row's `Remove`, leaving, or the ask's `Remove` (its write
 * landing or refused; once, twice in one turn, or with `Today` or `Keep` in
 * the same turn; a refusal retried in half); `Today` and back; or
 * `Add verses` (the bar's or the row's), then back to the field or a verse
 * planted. Over unread
 * passages, `Today` and back. After every tap the screen is the model's,
 * the stored passages are the start's until a change lands and the model's
 * list after, no other key is written, and every frame kept the rules.
 */

import passage from 'virtual:heartseed-passage';

import { fieldWant, notRemoved, QUIET, type Asking } from './choose-model';
import { bookName, TARGETS } from './chooser-rig';
import { record } from './field-rig';
import { heldOn, recallOf } from './field-model';
import { below, DAY, random } from './garden-model';
import { device } from './one';
import { mountBar } from './bar-rig';
import {
  addRule,
  KEY,
  readRule,
  removeRule,
  spanRef,
  storedText,
  verseRef,
  type Held,
  type Span,
} from './passages-model';
import { CORPUS, countIn, storedOf } from './passages-rig';

const PROMISE = passage.reference;

/** `seed` mixed, so neighbouring seeds start the generator far apart. */
const mixed = (seed: number) => {
  let s = (seed + 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return (s ^ (s >>> 16)) >>> 0;
};

/** The spans a stored value holds as written, whether or not a launch reads them: none when it is not a list of ranges. */
const spansIn = (raw: string | undefined): Span[] => {
  const read = readRule(CORPUS, raw, 0);
  return read.tag === 'Read' ? [...read.passages] : [];
};

const sameSpan = (a: Span, b: Span) =>
  a.book === b.book && a.chapter === b.chapter && a.first === b.first && a.last === b.last;

/** Whether a held passage names verse `reference`. */
const named = (held: ReadonlyArray<Span>, reference: string) =>
  held.some((span) => {
    for (let verse = span.first; verse <= span.last; verse++)
      if (verseRef(span.book, span.chapter, verse) === reference) return true;
    return false;
  });

/** What a walk leans toward: the ask's answers, two taps in one turn, or every stored kind and the ways in and out of the bar. */
export type Lean = 'remove' | 'twice' | 'bar';

/** A stored value of a list of passages, from `next` (`storedOf`, drawn again until it is one). */
const listOf = (next: () => number, seed: number) => {
  for (let tries = 0; tries < 8; tries++) {
    const drawn = storedOf(next, seed);
    if (drawn[0].startsWith('stored')) return drawn;
  }
  return storedOf(next, seed);
};

/** A device from `next`: its stored value and kind, the failed reads of the passages' key, and the recalls on its disk (the promise's, maybe `Genesis 1:1`'s, and a verse of some stored passages). */
const deviceOf = (next: () => number, seed: number, lean: Lean) => {
  const [kind, raw] = lean === 'bar' ? storedOf(next, seed) : listOf(next, seed);
  const reads =
    (lean === 'bar' ? [0, 1, 2, 3, 3] : [0, 0, 1, 2])[below(next, lean === 'bar' ? 5 : 4)] ?? 0;
  const now = Date.now();
  const back = [0, 1, 2, 6][below(next, 4)] ?? 0;
  const recalls = [recallOf(PROMISE, now - back * DAY - 3_600_000, 3, 0)];
  if (below(next, 2) === 0) recalls.push(recallOf('Genesis 1:1', now - 2 * DAY, 3, 0));
  for (const span of spansIn(raw)) {
    if (below(next, 2) !== 0) continue;
    const verse = span.first + below(next, span.last - span.first + 1);
    const at = now - DAY - below(next, 9) * 60_000;
    recalls.push(recallOf(verseRef(span.book, span.chapter, verse), at, 3, 0));
  }
  return { kind, raw, reads, recalls };
};

/** The cases a device reaches at its launch. */
const launchCases = (drawn: ReturnType<typeof deviceOf>, held: Held) => {
  const { kind, raw, reads, recalls } = drawn;
  const reached = new Set<string>([`stored:${kind}`, `reads:${reads}`, `launch:${held.tag}`]);
  const planted = recalls.map((recall) => recall.reference);
  if (planted.includes('Genesis 1:1')) reached.add('other plant');
  if (held.tag === 'Unread') {
    if (planted.some((reference) => named(spansIn(raw), reference)))
      reached.add('unread:a planted passage verse as its own row');
    return reached;
  }
  reached.add(`held:${Math.min(held.passages.length, 5)}`);
  if (held.passages.length >= 4) reached.add('stored:4+');
  if (named(held.passages, PROMISE)) reached.add('stored:over-promise');
  return reached;
};

/** One generated reader's walk from `seed`, `steps` commands long; answers its faults and the cases it reached. */
export const walkBar = async (seed: number, steps: number, lean: Lean) => {
  const next = random(mixed(seed));
  const drawn = deviceOf(next, seed, lean);
  const { raw, reads } = drawn;
  const disk = new Map<string, string | null>(drawn.recalls.map(record));
  if (raw !== undefined) disk.set(KEY, raw);
  device.launch(disk);
  const start = new Map(device.disk);
  let held: Held = readRule(CORPUS, raw, reads);
  let written = false;
  let bar: Asking = QUIET;
  let screen: 'field' | 'Today' | 'Add a passage' = 'Today';
  const reached = launchCases(drawn, held);
  const faults: string[] = [];
  const log: string[] = [];
  const rig = await mountBar(reads, held.tag === 'Unread');
  const want = () => {
    if (screen !== 'field') return screen;
    return fieldWant(heldOn(device.disk), PROMISE, held, bar);
  };
  const settle = async (step: string) => {
    if (faults.length > 0) return;
    log.push(step);
    const goal = want();
    const got = await rig.settle(goal);
    if (got !== undefined)
      faults.push(
        `${step} after ${log.slice(-6, -1).join(' > ')}: ${JSON.stringify(got).slice(0, 300)} where the model has ${JSON.stringify(goal).slice(0, 300)}`,
      );
    const stored = device.disk.get(KEY);
    const expected = written && held.tag === 'Read' ? storedText(held.passages) : raw;
    if (stored !== expected)
      faults.push(`${step}: the stored passages ${stored} where the model has ${expected}`);
    for (const [key, value] of device.disk)
      if (key !== KEY && start.get(key) !== value) faults.push(`${step}: the key ${key} written`);
    for (const key of start.keys())
      if (!device.disk.has(key)) faults.push(`${step}: the key ${key} removed`);
    faults.push(...rig.faults.splice(0).map((fault) => `${step}: ${fault}`));
  };
  const passages = () => (held.tag === 'Read' ? held.passages : []);
  /** Taps the `Remove` of held passage `at`, by its place among the rows of equal title. */
  const ask = async (at: number) => {
    const span = passages()[at] as Span;
    const nth = passages()
      .slice(0, at)
      .filter((each) => sameSpan(each, span)).length;
    if (nth > 0) reached.add('ask:a later equal row');
    if (bar.ask !== undefined) reached.add('ask:moved');
    if (bar.alert !== undefined) reached.add('alert:cleared by a tap');
    await rig.tap(`Remove ${spanRef(span)}`, nth);
    bar = { ask: span, alert: undefined };
    await settle(`ask ${spanRef(span)}#${nth}`);
    return span;
  };
  const round = async (label: string) => {
    if (bar.ask !== undefined) reached.add('ask:dropped by leaving');
    if (bar.alert !== undefined) reached.add('alert:dropped by leaving');
    await rig.tap('Today');
    screen = 'Today';
    await settle(`${label}: Today`);
    await rig.tap('Your field');
    screen = 'field';
    bar = QUIET;
    await settle(`${label}: the field again`);
  };
  /** The ask's `Remove`, its write refused or not, tapped `how`. */
  const confirm = async (span: Span, refused: boolean, how: number) => {
    const count = passages().length;
    const equals = passages().filter((each) => sameSpan(each, span)).length;
    const planted = heldOn(device.disk)
      .map((recall) => recall.reference)
      .filter((reference) => named([span], reference));
    device.fail('set', refused ? 1 : 0);
    const ways = ['once', 'twice', 'then Today', 'then Keep'] as const;
    const way = ways[how] ?? 'once';
    if (way === 'once') await rig.tap('Remove');
    if (way === 'twice') await rig.tap('Remove', 0, true);
    if (way === 'then Today') await rig.tapBoth('Remove', 'Today');
    if (way === 'then Keep') await rig.tapBoth('Remove', 'Keep');
    const answer = removeRule(held, span, refused);
    reached.add(`remove:${answer.outcome}`);
    reached.add(`remove:${way}:${answer.outcome}`);
    if (answer.outcome === 'Removed') {
      reached.add(`remove:from-${count >= 4 ? '4+' : count}`);
      if (equals > 1) reached.add('remove:one of equals');
      held = answer.held;
      written = true;
      bar = QUIET;
      if (planted.some((reference) => !named(passages(), reference)))
        reached.add('removed:a planted verse as its own row');
    } else bar = { ask: undefined, alert: notRemoved(spanRef(span)) };
    await settle(`remove ${spanRef(span)} ${way}${refused ? ', refused' : ''}`);
    device.fail('set', 0);
    return answer.outcome;
  };
  const remove = async () => {
    const at = below(next, passages().length);
    let span = await ask(at);
    const roll = below(next, lean === 'bar' ? 4 : 8);
    if (roll === 0) {
      reached.add('remove:Keep');
      await rig.tap('Keep');
      bar = QUIET;
      await settle('keep');
      return;
    }
    if (roll === 1) {
      span = await ask(below(next, passages().length));
      reached.add('ask:moved');
    }
    if (roll === 2) return round('leave the ask');
    const refused = below(next, lean === 'twice' ? 2 : 3) === 0;
    const how = lean === 'twice' ? 1 + below(next, 3) : below(next, 4);
    const outcome = await confirm(span, refused, how);
    if (outcome === 'Failed' && below(next, 2) === 0) {
      const at = passages().findIndex((each) => sameSpan(each, span));
      await ask(at);
      if ((await confirm(span, false, 0)) === 'Removed') reached.add('remove:retry landed');
    }
  };
  const add = async () => {
    if (bar.alert !== undefined) reached.add('alert:cleared by a tap');
    const where = below(next, 2) === 0 ? 'add-verses' : 'add-row';
    reached.add(`add:by ${where}`);
    await rig.tapId(where);
    screen = 'Add a passage';
    bar = QUIET;
    await settle(`add verses by ${where}`);
    if (below(next, 2) === 0) {
      reached.add('add:left');
      await rig.tap('Your field');
      screen = 'field';
      await settle('back to the field');
      return;
    }
    const target = TARGETS[below(next, TARGETS.length)] ?? TARGETS[0];
    const name = bookName(target.book);
    await rig.tap(name);
    await rig.tap(`${name} ${target.chapter}`);
    const verse = 1 + below(next, countIn(target.book, target.chapter));
    await rig.tap(verseRef(target.book, target.chapter, verse));
    const count = passages().length;
    await rig.tap('Plant');
    const answer = addRule(CORPUS, held, { ...target, first: verse, last: verse }, false);
    reached.add(`add:${answer.outcome}`);
    if (answer.outcome === 'Added') {
      reached.add(`add:from-${count}`);
      held = answer.held;
      written = true;
      screen = 'field';
      if (passages().length >= 3) reached.add('limit:after an add');
    }
    await settle(`plant ${spanRef({ ...target, first: verse, last: verse })}`);
  };
  screen = 'Today';
  await settle('launch');
  await rig.until(() => rig.control('Your field') !== undefined);
  await rig.tap('Your field');
  screen = 'field';
  await settle('the field');
  if (passages().length >= 3) reached.add('limit:at launch');
  for (let step = 0; step < steps && faults.length === 0; step++) {
    const count = passages().length;
    const roll = below(next, lean === 'bar' ? 4 : 8);
    if (held.tag === 'Unread' || roll === 0) await round('round trip');
    else if (count > 0 && (roll >= 2 || count >= 3)) await remove();
    else await add();
  }
  await rig.leave();
  device.fail('set', 0);
  return { faults, reached };
};

/** Walks `seeds`, `steps` commands each; answers the faults of the first device with any (by seed), and how many devices reached each case. */
export const walkBars = async (seeds: ReadonlyArray<number>, steps: number, lean: Lean) => {
  const reached = new Map<string, number>();
  for (const seed of seeds) {
    const result = await walkBar(seed, steps, lean);
    if (result.faults.length > 0)
      return { faults: [`seed ${seed}`, ...result.faults.slice(0, 4)], reached };
    for (const each of result.reached) reached.set(each, (reached.get(each) ?? 0) + 1);
  }
  return { faults: [], reached };
};
