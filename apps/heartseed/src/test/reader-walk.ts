/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, eslint/no-unmodified-loop-condition, effect/noTernary, effect/noGlobals, effect/noTryCatch -- a generated reader through the root: it drives launches one awaited tap at a time over a disk, a clock and a zone kept in plain values the steps change (the zone in `process.env.TZ`, put back in a `finally`), names faults by their JSON, and reads the model's undefined and null as none. */

/**
 * A generated reader's walk through Today, the field and the chooser, for
 * the reader's parts (`src/chooser/reader-*.test.tsx`), over the run's rig
 * (`run-rig.tsx`: the root over a disk, a recognizer that hears the text the
 * walk names, Effect's clock frozen where the walk sets it), judged after
 * every command against the models: Today by `run-model.ts` over
 * `session-model.ts`'s plan of hskjv's pieces (`passages-model.ts`), made at
 * each making (the launch's first show, a landed add or remove, a Minutes
 * tap); the field and the bar by `choose-model.ts`'s `fieldWant`; the
 * chooser by its `chooserWant`.
 *
 * A device lies in UTC, Los Angeles, Kathmandu, Lord Howe or Chatham, on a
 * day of 2026 at 06:00-21:59 local, with the promise planted 0 (the first
 * minute's day), 1, 2 or 6 days back, `Genesis 1:1` planted in half, a
 * stored value (`storedOf`: no key, `[]`, garbled, or ranges with equal
 * ones, one over the promise's verse and a Psalms 119 range past 20 verses),
 * recalls on a verse of some stored passages 1-9 days back, the minutes
 * stored in a quarter, and 0-3 failed reads of the passages' key alone.
 *
 * Commands by screen. Today: `Your field`, `Say it` heard then `Next`, a
 * Minutes tap, or a relaunch after the next 04:00 local. The field: `Today`,
 * a remove (`Keep`, the ask moved, or the ask's `Remove` landing or refused,
 * once or twice in one turn), or an add: a target chapter (Psalms 119 and
 * 117, the promise's chapter, John 15, one of 20 verses, one of 21, or any), a back to
 * the books or the chapters and in again, 1-4 verse taps by pattern, then
 * leaving or `Plant` (refused or twice in one turn), retried after a refusal
 * in half.
 *
 * After every command the settled screen is the model's, and the disk holds
 * the start's keys unchanged but the passages and the minutes, the passages
 * the launch's value until a change lands and the model's list after, the
 * minutes only after a tap, and no other new key but each recital's recall.
 * Every frame of every screen keeps `barFaults` (the scroll rule on Today,
 * the field and the chooser, one heading, `Listening` only on Today, nothing
 * offered over unread passages, `Plant` only over 1-20 verses, AA off
 * Today).
 */

import { Effect, Layer, MutableRef } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import { MINUTES_KEY } from '../session/service';
import { barFaults, readBar } from './bar-rig';
import {
  backRule,
  chooserWant,
  fieldWant,
  notPlanted,
  notRemoved,
  OPENED,
  QUIET,
  tapRule,
  type Asking,
  type Choosing,
} from './choose-model';
import { bookName, labelOf, readChooser, TARGETS } from './chooser-rig';
import { tapsOf } from './chooser-walk';
import { heldOn, recallOf } from './field-model';
import { below, keyOf, random } from './garden-model';
import {
  addRule,
  KEY,
  piecesRule,
  readRule,
  removeRule,
  spanRef,
  storedText,
  verseRef,
  type Held,
  type Span,
} from './passages-model';
import { CORPUS, countIn, storedOf } from './passages-rig';
import { actionModel, madeModel, NO_RUN, nextModel, shownModel, startedModel } from './run-model';
import { deviceOf, launch, PASSAGE, type Launch } from './run-rig';
import { expandRule, pieceRule, verseOfRule, withPhrasesRule } from './phrase-model';
import { countsModel, DAY, localDay, MINUTE, planModel } from './session-model';
import { listenModel } from './wake-model';
import { wallAt } from './wake-walk';
import { hostZone, offsetIn, restore, travel } from './zone';

const PROMISE = passage.reference;

/** The zones a reader lives in: UTC, a whole hour west, three quarters east, a half hour of daylight saving, and three quarters past +12. */
const ZONES = [
  'UTC',
  'America/Los_Angeles',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'Pacific/Chatham',
] as const;

const CHOICES = [2, 5, 10, 20] as const;

/** The chapters an add aims at: Psalms 119 (176 verses) and 117, the promise's chapter, John 15, one of exactly 20 verses and one of 21. */
const AIMS = [
  TARGETS[0],
  TARGETS[1],
  TARGETS[2],
  { book: 43, chapter: 15 },
  TARGETS[3],
  TARGETS[4],
];

/** `seed` mixed, so neighbouring seeds start the generator far apart. */
const mixed = (seed: number) => {
  let s = (seed + 0x2545f491) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return (s ^ (s >>> 16)) >>> 0;
};

const sameSpan = (a: Span, b: Span) =>
  a.book === b.book && a.chapter === b.chapter && a.first === b.first && a.last === b.last;

const versesOf = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, index) =>
    verseRef(span.book, span.chapter, span.first + index),
  );

/** How the walk's store fails the passages' key alone: its next `reads` reads, and every write while `refuse`. */
interface KeyFaults {
  reads: number;
  refuse: boolean;
}

const failure = (method: string, key: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method}`, method, key });

/** The disk's store with the passages' key failing as `faults` says; every other call is the disk's own. */
const keyFailing = (faults: KeyFaults) => (disk: Layer.Layer<KeyValueStore.KeyValueStore>) =>
  Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.map(KeyValueStore.KeyValueStore, (real) =>
      KeyValueStore.KeyValueStore.of({
        ...real,
        get: (key) =>
          Effect.suspend(() => {
            if (key !== KEY || faults.reads === 0) return real.get(key);
            faults.reads -= 1;
            return Effect.fail(failure('get', key));
          }),
        set: (key, value) =>
          Effect.suspend(() => {
            if (key === KEY && faults.refuse) return Effect.fail(failure('set', key));
            return real.set(key, value);
          }),
      }),
    ),
  ).pipe(Layer.provide(disk));

/** What a walk leans toward: Today's commands (recitals, Minutes, mornings), or the changes (adds and removes). */
export type Lean = 'today' | 'change';

/** The recalls by reference a disk holds. */
const plantsIn = (disk: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const recall of heldOn(disk))
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  return plants;
};

/** The screens the root shows, as the model holds them. */
type Screen = 'Today' | 'field' | 'chooser';

/** One generated reader's walk from `seed`, `steps` commands long; answers its faults and the cases it reached. */
export const walkReader = async (seed: number, steps: number, lean: Lean) => {
  const next = random(mixed(seed));
  const zone = ZONES[below(next, ZONES.length)] ?? 'UTC';
  const before = hostZone();
  travel(zone);
  try {
    return await walkIn(next, zone, steps, lean);
  } finally {
    restore(before);
  }
};

const walkIn = async (next: () => number, zone: string, steps: number, lean: Lean) => {
  const reached = new Set<string>([`zone:${zone}`]);
  const faults: string[] = [];
  const log: string[] = [];
  const time = { now: wallAt(zone, Date.UTC(2026, 0, 1) + below(next, 365) * DAY, 0, 6) };
  time.now += below(next, 16 * 60) * MINUTE;
  const stamp = (reference: string, at: number): Recall => ({
    ...recallOf(reference, at, 3, 0),
    offset: offsetIn(zone, at),
  });
  const back = [0, 1, 2, 6][below(next, 4)] ?? 0;
  if (back === 0) reached.add('gen:first-minute-day');
  const records = [stamp(PROMISE, time.now - back * DAY - (20 + below(next, 60)) * MINUTE)];
  if (below(next, 2) === 0)
    records.push(stamp('Genesis 1:1', time.now - (2 + below(next, 6)) * DAY));
  let drawn = storedOf(next, below(next, 1000));
  if (lean === 'today' && !drawn[0].startsWith('stored')) drawn = storedOf(next, below(next, 1000));
  const [kind, raw] = drawn;
  reached.add(kind.startsWith('garbled') ? 'gen:garbled' : `gen:${kind}`);
  const stored = readRule(CORPUS, raw, 0);
  for (const span of stored.tag === 'Read' ? stored.passages : []) {
    if (below(next, 2) !== 0) continue;
    const verse = span.first + below(next, span.last - span.first + 1);
    records.push(
      stamp(verseRef(span.book, span.chapter, verse), time.now - (1 + below(next, 9)) * DAY),
    );
  }
  const entries: (readonly [string, string])[] = records.map(
    (recall) => [keyOf(recall), JSON.stringify(recall)] as const,
  );
  if (raw !== undefined) entries.push([KEY, raw]);
  let minutes = 5;
  if (below(next, 4) === 0) {
    minutes = CHOICES[below(next, 4)] ?? 5;
    entries.push([MINUTES_KEY, String(minutes)]);
  }
  const keyFaults: KeyFaults = { reads: [0, 0, 0, 1, 2, 3][below(next, 6)] ?? 0, refuse: false };
  reached.add(`gen:read-faults-${keyFaults.reads}`);
  const device = deviceOf(entries);
  const start = new Map(device.disk);
  const recalls = new Set<string>();
  let held: Held = readRule(CORPUS, raw, keyFaults.reads);
  reached.add(`launch:${held.tag}`);
  if (held.tag === 'Read' && held.passages.length >= 4) reached.add('gen:stored-4+');
  let written = false;
  let minutesWritten = false;
  let run = NO_RUN;
  let screen: Screen = 'Today';
  let bar: Asking = QUIET;
  let choosing: Choosing = OPENED;
  let mornings = 0;
  let addedOnPlantedDay = false;

  const pieces = () =>
    piecesRule(CORPUS, [PASSAGE], held, (text) => sourceWords(text).length, withPhrasesRule);
  const recallsNow = (reference: string) => plantsIn(device.disk).get(reference)?.length ?? 0;
  const planOf = () =>
    planModel({
      plants: plantsIn(device.disk),
      pieces: expandRule(pieces(), plantsIn(device.disk)),
      at: time.now,
      offset: offsetIn(zone, time.now),
      minutes,
    });
  const planNow = () => planOf().items;
  const passages = () => (held.tag === 'Read' ? held.passages : []);
  const isPassageVerse = (reference: string) =>
    passages().some((span) => versesOf(span).includes(verseOfRule(reference)));

  const todayWant = () => {
    if (held.tag === 'Unread')
      return {
        heading: 'Today',
        references: [PROMISE],
        actions: ['Say it'],
        counts: [],
        listen: false,
      };
    const shown = shownModel(run, recallsNow);
    const action = actionModel(run, recallsNow);
    return {
      heading: 'Today',
      references: shown === null ? [] : [shown.reference],
      actions: action === null ? [] : [action],
      counts: run.plan === null ? [] : [countsModel(run.plan, recallsNow)],
      listen: listenModel(run, recallsNow, {
        unread: false,
        voiceOn: true,
        reading: false,
        underWay: false,
      }),
    };
  };
  const want = () => {
    if (screen === 'Today') return todayWant();
    if (screen === 'field') return fieldWant(heldOn(device.disk), PROMISE, held, bar);
    return chooserWant(CORPUS, choosing);
  };

  let app: Launch | undefined;
  const known = new Map<string, boolean>();
  const frames: string[] = [];
  let watch: MutationObserver | undefined;
  const opened = async () => {
    app = await launch(device, { unread: false, refuse: false }, time, [PASSAGE], {
      store: keyFailing(keyFaults),
    });
    const host = app.host;
    watch = new MutationObserver(() => {
      for (const fault of barFaults(host, held.tag === 'Unread', known))
        if (frames.length < 8) frames.push(fault);
    });
    watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    return app;
  };
  const screenOf = () => {
    const at = app as Launch;
    if (screen === 'Today')
      return {
        heading: at.headings().join('|'),
        references: at.references(),
        actions: at.actions(),
        counts: at.counts(),
        listen: at.has('Listen'),
      };
    if (screen === 'field') return readBar(at.host);
    return readChooser(at.host);
  };

  /** C12: what is wrong of one key the disk holds now, but the passages': the minutes off the last tap, a start key changed, or a key added but an expected recall. */
  const keyFault = (key: string, value: string): string[] => {
    if (key === KEY) return [];
    if (key === MINUTES_KEY && minutesWritten)
      return value === String(minutes) ? [] : [`the minutes ${value}, not ${minutes}`];
    if (start.has(key)) return start.get(key) === value ? [] : [`the key ${key} changed`];
    return recalls.has(key) ? [] : [`the key ${key} added`];
  };
  /** C12: what the disk holds wrong now: the passages off the model's, a start key changed or removed, a key added but an expected recall, the minutes after a tap, or an expected recall missing. */
  const diskFaults = () => {
    const out: string[] = [];
    const kept = device.disk.get(KEY);
    const expected = written && held.tag === 'Read' ? storedText(held.passages) : raw;
    if (kept !== expected) out.push(`the stored passages ${kept} where the model has ${expected}`);
    for (const [key, value] of device.disk) out.push(...keyFault(key, value));
    for (const key of start.keys()) if (!device.disk.has(key)) out.push(`the key ${key} removed`);
    for (const key of recalls) if (!device.disk.has(key)) out.push(`no recall ${key}`);
    return out;
  };
  const settle = async (step: string) => {
    if (faults.length > 0) return;
    const at = app as Launch;
    log.push(step);
    const goal = JSON.stringify(want());
    if (!(await at.until(() => JSON.stringify(screenOf()) === goal)))
      faults.push(
        `${step} after ${log.slice(-7, -1).join(' > ')}: ${JSON.stringify(screenOf()).slice(0, 400)} where the model has ${goal.slice(0, 400)}`,
      );
    faults.push(...diskFaults().map((each) => `${step}: ${each}`));
    faults.push(...[...frames.splice(0), ...at.faults.splice(0)].map((each) => `${step}: ${each}`));
    if (screen === 'Today') tallyToday();
  };
  const tallyToday = () => {
    if (held.tag === 'Unread') return;
    if (todayWant().listen) reached.add('today:listen');
    if (addedOnPlantedDay && mornings === 0 && planOf().fresh === 'planted today')
      reached.add('today:no-new-on-a-planted-day');
    const shown = shownModel(run, recallsNow);
    if (shown === null || shown.reference === PROMISE || !isPassageVerse(shown.reference)) return;
    reached.add(shown.fresh ? 'today:fresh-passage-verse' : 'today:review-passage-verse');
    if (shown.reference !== verseOfRule(shown.reference))
      reached.add(shown.fresh ? 'today:fresh-phrase' : 'today:review-phrase');
    if (shown.fresh && mornings > 0 && addedOnPlantedDay)
      reached.add('day:new-after-a-planted-day');
  };

  /** Clicks `nodes` in one turn. */
  const click = async (...nodes: (Element | undefined)[]) => {
    await act(async () => {
      for (const node of nodes)
        node?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
        );
    });
  };
  /** The `nth` control named `label` (from 0), if it shows. */
  const control = (label: string, nth = 0) =>
    [
      ...(app as Launch).host.querySelectorAll(
        '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]',
      ),
    ].filter((node) => labelOf(node) === label)[nth];
  const tap = (label: string, nth = 0) => click(control(label, nth));
  /** A making at a landed change or a Minutes tap: no recital is ever under way here. */
  const made = (what: string) => {
    run = madeModel(run, planNow(), false);
    reached.add(`made:${what}`);
  };

  const today = async () => {
    if (bar.ask !== undefined) reached.add('ask:dropped by leaving');
    if (bar.alert !== undefined) reached.add('alert:dropped by leaving');
    await tap('Today');
    screen = 'Today';
    await settle('Today');
  };
  const field = async () => {
    await tap('Your field');
    screen = 'field';
    bar = QUIET;
    await settle('the field');
  };
  const say = async () => {
    const shown = shownModel(run, recallsNow);
    if (shown === null) return field();
    const piece = pieceRule(pieces(), shown.reference);
    if (piece === undefined) {
      faults.push(`an item of no piece: ${shown.reference}`);
      return;
    }
    const at = app as Launch;
    time.now += 30_000;
    MutableRef.set(at.hearing, { kind: 'heard', text: piece.text, skip: [] });
    run = startedModel(run, recallsNow);
    recalls.add(keyOf({ reference: piece.reference, startedAt: time.now }));
    await tap('Say it');
    if (!(await at.until(() => at.has('Listening'))))
      faults.push(`${shown.reference} never listened`);
    await tap('Listening');
    await at.until(() => !at.has('Listening'));
    reached.add('today:said');
    if (shown.fresh) reached.add('today:said-new');
    await settle(`said ${shown.reference}`);
    await tap('Next');
    run = nextModel(run);
    await settle('Next');
  };
  const minutesTap = async () => {
    const choice = CHOICES.filter((each) => each !== minutes)[below(next, 3)] ?? 2;
    await tap(`${choice} min`);
    minutes = choice;
    minutesWritten = true;
    made('minutes');
    await settle(`${choice} min`);
  };
  const relaunch = async () => {
    watch?.disconnect();
    await (app as Launch).leave();
    time.now = wallAt(zone, time.now, -1, 4) + (30 + below(next, 5 * 60)) * MINUTE;
    mornings += 1;
    reached.add(mornings === 1 ? 'day:next-morning' : 'day:after');
    keyFaults.reads = 0;
    held = readRule(CORPUS, device.disk.get(KEY), 0);
    run = NO_RUN;
    screen = 'Today';
    bar = QUIET;
    const at = await opened();
    await at.until(() => at.headings().includes('Today'));
    run = madeModel(NO_RUN, planNow(), false);
    await settle(`relaunch ${mornings}`);
  };

  /** Taps the `Remove` of held passage `at`, by its place among the rows of equal title. */
  const ask = async (at: number) => {
    const span = passages()[at] as Span;
    const nth = passages()
      .slice(0, at)
      .filter((each) => sameSpan(each, span)).length;
    if (bar.ask !== undefined) reached.add('ask:moved');
    if (bar.alert !== undefined) reached.add('alert:cleared by a tap');
    await tap(`Remove ${spanRef(span)}`, nth);
    bar = { ask: span, alert: undefined };
    await settle(`ask ${spanRef(span)}#${nth}`);
    return span;
  };
  const confirm = async (span: Span) => {
    const refused = below(next, 5) === 0;
    const twice = below(next, 5) === 0;
    const equals = passages().filter((each) => sameSpan(each, span)).length;
    keyFaults.refuse = refused;
    const node = control('Remove');
    await click(node, twice ? node : undefined);
    const answer = removeRule(held, span, refused);
    reached.add(`remove:${answer.outcome}`);
    if (twice) reached.add('remove:double');
    if (answer.outcome === 'Removed') {
      if (equals > 1) reached.add('remove:one-of-equals');
      held = answer.held;
      written = true;
      bar = QUIET;
      made('remove');
    } else bar = { ask: undefined, alert: notRemoved(spanRef(span)) };
    await settle(`remove ${spanRef(span)}${twice ? ' twice' : ''}${refused ? ', refused' : ''}`);
    keyFaults.refuse = false;
    return answer.outcome;
  };
  const remove = async () => {
    const span = await ask(below(next, passages().length));
    const roll = below(next, 6);
    if (roll === 0) {
      reached.add('remove:Keep');
      await tap('Keep');
      bar = QUIET;
      return settle('Keep');
    }
    const asked = roll === 1 ? await ask(below(next, passages().length)) : span;
    if ((await confirm(asked)) === 'Failed' && below(next, 2) === 0) {
      await ask(passages().findIndex((each) => sameSpan(each, asked)));
      await confirm(asked);
    }
  };

  /** A back on the chooser, by the model's name for it. */
  const backOnce = async (step: string) => {
    await tap(chooserWant(CORPUS, choosing).back);
    const after = backRule(choosing);
    if (after === undefined) {
      screen = 'field';
      bar = QUIET;
    } else choosing = after;
    await settle(step);
  };
  const plant = async (span: Span): Promise<void> => {
    const refused = below(next, 6) === 0;
    const twice = below(next, 7) === 0;
    keyFaults.refuse = refused;
    const node = control('Plant');
    await click(node, twice ? node : undefined);
    const answer = addRule(CORPUS, held, span, refused);
    reached.add(`add:${answer.outcome}`);
    if (twice) reached.add('add:double');
    if (answer.outcome === 'Added') {
      tallyPlanted(span);
      held = answer.held;
      written = true;
      screen = 'field';
      bar = QUIET;
      made('add');
      await settle(`plant ${spanRef(span)}${twice ? ' twice' : ''}`);
      keyFaults.refuse = false;
      return;
    }
    choosing = { ...choosing, line: notPlanted(spanRef(span)) };
    await settle(`plant ${spanRef(span)} ${answer.outcome}`);
    keyFaults.refuse = false;
    if (below(next, 2) === 0) {
      reached.add('add:retried');
      return plant(span);
    }
    reached.add('choose:left');
    while (screen === 'chooser') await backOnce('leaving');
  };
  const tallyPlanted = (span: Span) => {
    const size = span.last - span.first + 1;
    if (size === 1) reached.add('planted:one-verse');
    if (size === 20) reached.add('planted:twenty');
    if (span.first === 1 && span.last === countIn(span.book, span.chapter))
      reached.add('planted:whole-chapter');
    if (versesOf(span).includes(PROMISE)) reached.add('planted:over-promise');
    const day = localDay(time.now, offsetIn(zone, time.now));
    for (const plant of plantsIn(device.disk).values()) {
      const first = plant.toSorted((a, b) => a.startedAt - b.startedAt)[0];
      if (first !== undefined && localDay(first.startedAt, first.offset) === day) {
        reached.add('planted:on-a-planted-day');
        addedOnPlantedDay = true;
        return;
      }
    }
  };
  /** 1-4 taps by pattern on a chapter of `count` verses, each judged against the range rule. */
  const tapVerses = async (count: number) => {
    const [pattern, taps] = tapsOf(next, count);
    reached.add(`tap:${pattern}`);
    for (const verse of taps) {
      const after = tapRule(choosing.chosen, verse, count);
      const before = choosing.chosen;
      if (before !== undefined && after === undefined) reached.add('tap:toggle-off');
      const clipped =
        before !== undefined && after !== undefined && after.last - after.first === 19;
      if (clipped && verse - before.first > 19) reached.add('clip:forward');
      if (clipped && before.first - verse > 19) reached.add('clip:back');
      await click((app as Launch).host.querySelectorAll('[data-testid="verse"]')[verse - 1]);
      choosing = { ...choosing, chosen: after, line: undefined };
      await settle(`verse ${verse}`);
    }
  };
  const add = async () => {
    await tap('Add a passage');
    screen = 'chooser';
    choosing = OPENED;
    await settle('Add a passage');
    const book = CORPUS.books[below(next, 66)] ?? 1;
    const aim = AIMS[below(next, AIMS.length + 1)] ?? {
      book,
      chapter: 1 + below(next, CORPUS.counts.get(book) ?? 1),
    };
    const name = bookName(aim.book);
    const toBook = async (step: string) => {
      await tap(name);
      choosing = { step: { at: 'chapters', book: aim.book }, chosen: undefined, line: undefined };
      await settle(step);
    };
    const toChapter = async (step: string) => {
      await tap(`${name} ${aim.chapter}`);
      choosing = { step: { at: 'verses', ...aim }, chosen: undefined, line: undefined };
      await settle(step);
    };
    await toBook(`book ${name}`);
    if (below(next, 6) === 0) {
      reached.add('back:books');
      await backOnce('back to the books');
      await toBook(`book ${name} again`);
    }
    await toChapter(`chapter ${aim.chapter}`);
    const count = countIn(aim.book, aim.chapter);
    if (count === 176) reached.add('chapter:176');
    if (below(next, 6) === 0) {
      reached.add('back:chapters');
      await backOnce('back to the chapters');
      await toChapter(`chapter ${aim.chapter} again`);
    }
    await tapVerses(count);
    const chosen = choosing.chosen;
    if (chosen === undefined || below(next, 6) === 0) {
      reached.add('choose:left');
      while (screen === 'chooser') await backOnce('leaving');
      return;
    }
    await plant({ ...aim, first: chosen.first, last: chosen.last });
  };

  const onToday = async () => {
    if (held.tag === 'Unread') return below(next, 3) === 0 ? relaunch() : field();
    const roll = below(next, 20);
    const say_ = lean === 'today' ? 9 : 4;
    const minutes_ = say_ + 2;
    const morning = minutes_ + (lean === 'today' ? 4 : 2);
    if (roll < say_) return say();
    if (roll < minutes_) return minutesTap();
    if (roll < morning) return relaunch();
    return field();
  };
  const onField = async () => {
    const count = passages().length;
    const roll = below(next, 10);
    if (held.tag === 'Unread' || roll < (lean === 'today' ? 4 : 2)) return today();
    if (count > 0 && (roll < 6 || count >= 3)) return remove();
    return add();
  };

  log.push(`${zone}, promise ${back} days back, ${kind}, ${keyFaults.reads} failed reads`);
  const first = await opened();
  await first.until(() => first.headings().includes('Today'));
  run = madeModel(NO_RUN, planNow(), false);
  await settle('launch');
  for (let step = 0; step < steps && faults.length === 0; step++) {
    if (screen === 'Today') await onToday();
    else await onField();
  }
  watch?.disconnect();
  await (app as Launch).leave();
  return { faults, reached };
};

/** Walks `seeds`, `steps` commands each; answers the faults of the first device with any (by seed), and how many devices reached each case. */
export const walkReaders = async (seeds: ReadonlyArray<number>, steps: number, lean: Lean) => {
  const reached = new Map<string, number>();
  for (const seed of seeds) {
    const result = await walkReader(seed, steps, lean);
    if (result.faults.length > 0)
      return { faults: [`seed ${seed}`, ...result.faults.slice(0, 4)], reached };
    for (const each of result.reached) reached.set(each, (reached.get(each) ?? 0) + 1);
  }
  return { faults: [], reached };
};
