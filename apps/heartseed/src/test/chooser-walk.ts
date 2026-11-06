/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, eslint/no-unmodified-loop-condition, effect/noTernary, effect/noGlobals -- a generated walk through the chooser: it drives the screen one awaited tap at a time (a back's closure moves the model's state the loops wait on), names faults by their JSON, and reads the model's undefined as none. */

/**
 * A generated reader's walk through the chooser, for the chooser's walk
 * parts (`src/chooser/walk-*.test.tsx`), over `chooser-rig.tsx`, judged
 * after every tap against `choose-model.ts` and the passages' model.
 *
 * A device holds no passages, one or two, three (so `Plant` answers
 * `Full`), or a garbled value (so it answers `Unread`). Each step opens a
 * chapter (Psalms 119 and 117, the promise's, one of exactly 20 verses, one of
 * 21, or any), backs out a step and in again now and then, taps verses by
 * pattern (one; forward or back up to 40 on; the one verse twice; a
 * restart; first to last; exactly 20), then leaves and opens again, or taps
 * `Plant`: its write landing or refused, two taps in one turn, or `Plant`
 * and a back in one turn; after a refusal it retries, taps a verse, or
 * leaves. After every tap the screen is the rule's, the stored passages are
 * the start's until an add lands and the model's list after, no other key
 * is written, and every frame kept the screen's rules.
 */

import {
  backRule,
  chooserWant,
  LIMIT,
  notPlanted,
  OPENED,
  tapRule,
  type Choosing,
} from './choose-model';
import { bookName, mountChooser, TARGETS } from './chooser-rig';
import { below, random } from './garden-model';
import { device } from './one';
import {
  addRule,
  KEY,
  readRule,
  spanRef,
  storedText,
  type Held,
  type Span,
} from './passages-model';
import { CORPUS, countIn, GARBLED } from './passages-rig';

/** The taps a reader makes on a chapter of `count` verses, by pattern, and the pattern's name. */
const tapsOf = (next: () => number, count: number): readonly [string, number[]] => {
  const a = 1 + below(next, count);
  const roll = below(next, 7);
  if (roll === 0) return ['one', [a]];
  if (roll === 1) return ['forward', [a, Math.min(count, a + 1 + below(next, 40))]];
  if (roll === 2) return ['back', [a, Math.max(1, a - 1 - below(next, 40))]];
  if (roll === 3) return ['toggle', [a, a, 1 + below(next, count)]];
  if (roll === 4) return ['restart', [a, Math.min(count, a + 1), 1 + below(next, count)]];
  if (roll === 5) return ['first to last', [1, count]];
  const first = 1 + below(next, Math.max(1, count - 19));
  return ['twenty', [first, Math.min(count, first + 19)]];
};

/** A device's stored value and its kind. */
const storedOf = (next: () => number): readonly [string, string | undefined] => {
  const roll = below(next, 6);
  if (roll === 0) return ['no key', undefined];
  if (roll === 1) return ['garbled', GARBLED[below(next, GARBLED.length)]?.[1]];
  const length = [0, 1, 2, 3][roll - 2] ?? 0;
  const list: Span[] = Array.from({ length }, () => {
    const { book, chapter } = TARGETS[below(next, TARGETS.length)] ?? TARGETS[0];
    const first = 1 + below(next, countIn(book, chapter));
    return { book, chapter, first, last: first };
  });
  return [`held ${length}`, storedText(list)];
};

/** `seed` mixed, so neighbouring seeds start the generator far apart. */
const mixed = (seed: number) => {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return (s ^ (s >>> 16)) >>> 0;
};

/** One generated reader's walk through the chooser from `seed`, `steps` chapters long; answers its faults and the cases it reached. */
export const walkChooser = async (seed: number, steps: number) => {
  const next = random(mixed(seed));
  const [kind, raw] = storedOf(next);
  const disk = new Map<string, string | null>();
  if (raw !== undefined) disk.set(KEY, raw);
  device.launch(disk);
  const start = new Map(device.disk);
  let held: Held = readRule(CORPUS, raw, 0);
  let written = false;
  let left = 0;
  let state: Choosing | undefined = OPENED;
  const reached = new Set<string>([`stored:${kind}`]);
  const faults: string[] = [];
  const log: string[] = [];
  const rig = await mountChooser();
  const settle = async (step: string) => {
    if (faults.length > 0) return;
    log.push(step);
    const want = state === undefined ? 'closed' : chooserWant(CORPUS, state);
    const got = await rig.settle(want);
    if (got !== undefined)
      faults.push(
        `${step} after ${log.slice(-6, -1).join(' > ')}: ${JSON.stringify(got).slice(0, 200)} where the rule has ${JSON.stringify(want).slice(0, 200)}`,
      );
    const stored = device.disk.get(KEY);
    const expected = written && held.tag === 'Read' ? storedText(held.passages) : raw;
    if (stored !== expected)
      faults.push(`${step}: the stored passages ${stored} where the rule has ${expected}`);
    for (const [key, value] of device.disk)
      if (key !== KEY && start.get(key) !== value) faults.push(`${step}: the key ${key} written`);
    if (rig.left.count !== left)
      faults.push(`${step}: left the chooser ${rig.left.count} times, not ${left}`);
    faults.push(...rig.faults.splice(0).map((fault) => `${step}: ${fault}`));
  };
  const back = async (step: string) => {
    if (state === undefined) return;
    await rig.tap(chooserWant(CORPUS, state).back);
    state = backRule(state);
    if (state === undefined) left += 1;
    await settle(step);
  };
  const leave = async () => {
    reached.add('left');
    while (state !== undefined) await back('leaving');
  };
  const open = async () => {
    while (state !== undefined && state.step.at !== 'books') await back('to the books');
    if (state === undefined) {
      await rig.tap('Add a passage');
      state = OPENED;
      reached.add('opened again');
      await settle('opened again');
    }
    const book = CORPUS.books[below(next, 66)] ?? 1;
    const target = TARGETS[below(next, 6)] ?? {
      book,
      chapter: 1 + below(next, CORPUS.counts.get(book) ?? 1),
    };
    const name = bookName(target.book);
    await rig.tap(name);
    state = { step: { at: 'chapters', book: target.book }, chosen: undefined, line: undefined };
    await settle(`book ${name}`);
    if (below(next, 6) === 0) {
      reached.add('back:books');
      await back('back to the books');
      await rig.tap(name);
      state = { step: { at: 'chapters', book: target.book }, chosen: undefined, line: undefined };
      await settle(`book ${name} again`);
    }
    await rig.tap(`${name} ${target.chapter}`);
    state = { step: { at: 'verses', ...target }, chosen: undefined, line: undefined };
    await settle(`chapter ${target.chapter}`);
    return target;
  };
  const tapAll = async (target: { book: number; chapter: number }) => {
    const count = countIn(target.book, target.chapter);
    const [pattern, verses] = tapsOf(next, count);
    reached.add(`taps:${pattern}`);
    for (const verse of verses) {
      if (state === undefined) return;
      await rig.tapVerseAt(verse);
      state = { ...state, chosen: tapRule(state.chosen, verse, count), line: undefined };
      await settle(`verse ${verse}`);
    }
  };
  const plant = async (target: { book: number; chapter: number }) => {
    if (state?.chosen === undefined) return;
    const span: Span = { ...target, first: state.chosen.first, last: state.chosen.last };
    const refused = below(next, 4) === 0;
    const how = below(next, 5);
    device.fail('set', refused ? 1 : 0);
    if (how === 0) await rig.tap('Plant', true);
    else if (how === 1) await rig.tapBoth('Plant', 'Chapters');
    else await rig.tap('Plant');
    const answer = addRule(CORPUS, held, span, refused);
    reached.add(`plant:${answer.outcome}`);
    if (how === 0) reached.add(`plant:twice:${answer.outcome}`);
    if (how === 1) reached.add(`plant:then-back:${answer.outcome}`);
    if (answer.outcome === 'Added') {
      reached.add(`added:from-${held.tag === 'Read' ? held.passages.length : 0}`);
      held = answer.held;
      written = true;
      left += 1;
      state = undefined;
      await settle('planted');
      device.fail('set', 0);
      return;
    }
    state = {
      ...(state as Choosing),
      line: answer.outcome === 'Full' ? LIMIT : notPlanted(spanRef(span)),
    };
    await settle(`plant ${answer.outcome}`);
    device.fail('set', 0);
    const after = below(next, 3);
    if (after === 0) {
      reached.add('after a refusal: retry');
      await plant(target);
    } else if (after === 1) {
      reached.add('after a refusal: a verse');
      await tapAll(target);
    } else {
      reached.add('after a refusal: leave');
      await leave();
    }
  };
  await settle('opened');
  for (let step = 0; step < steps && faults.length === 0; step++) {
    const target = await open();
    if (below(next, 8) === 0) {
      reached.add('back:chapters');
      await back('back to the chapters');
      await rig.tap(`${bookName(target.book)} ${target.chapter}`);
      state = { step: { at: 'verses', ...target }, chosen: undefined, line: undefined };
      await settle('chapter again');
    }
    await tapAll(target);
    if (state?.chosen === undefined || below(next, 6) === 0) await leave();
    else await plant(target);
  }
  await rig.leave();
  device.fail('set', 0);
  return { faults, reached };
};

/** Walks `seeds`, `steps` chapters each; answers the faults of the first device with any (by seed), and how many devices reached each case. */
export const walkChoosers = async (seeds: ReadonlyArray<number>, steps: number) => {
  const reached = new Map<string, number>();
  for (const seed of seeds) {
    const result = await walkChooser(seed, steps);
    if (result.faults.length > 0)
      return { faults: [`seed ${seed}`, ...result.faults.slice(0, 4)], reached };
    for (const each of result.reached) reached.set(each, (reached.get(each) ?? 0) + 1);
  }
  return { faults: [], reached };
};
