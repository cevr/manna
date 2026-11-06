/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the property plays each generated device's commands one after another through the service's promise-run calls, over the device stand-in's plain maps, writes expected values as plain branches, and compares values as JSON text. */

/**
 * The reader's passages over the app's real store (hskjv P3-P5): generated
 * devices, each a stored value and a launch's read faults, then a run of
 * adds and removes with refused writes, judged step by step against the
 * model (`test/passages-model.ts`): every answer, the view, the stored
 * text and the writes the device took.
 *
 * The devices (`test/passages-rig.tsx`) hold no key, `[]`, one to five
 * choosable ranges with repeats (some past 20 verses, some past 3
 * passages) or one of ten values that do not decode, and meet 0 to 4
 * failed reads or 1 to 3 failed opens. The commands add choosable ranges
 * (one verse, 2-19, exactly 20, a whole short chapter, a range over Isaiah
 * 41:10, a passage held already, one overlapping it), each unchoosable
 * kind, refused writes and the same add again, two and three adds at once,
 * and removes of a passage held twice or more, of one held once, of one
 * absent, refused and again.
 *
 * It catches a read that retries other than three times in all, takes a
 * value that does not decode for no passages, caps a stored list at read,
 * writes when unread, answers in another order (`Full` before `Invalid`,
 * `Invalid` before `Unread`), caps other than 3 and 20, changes the view
 * before or without its write, lets adds at once pass the cap, removes any
 * equal passage but the first, stores a field beyond the four, reads the
 * key again after the launch, and logs anything but its event names, the
 * key, the method, a count and a reason. It misses what the device does
 * with a write after it took it.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Exit, Scope } from 'effect';

import type { AddAnswer, RemoveAnswer } from '../passages';
import { below, random } from '../test/garden-model';
import { device } from '../test/one';
import {
  addRule,
  CAP_PASSAGES,
  type Held,
  KEY,
  readRule,
  removeRule,
  type Span,
  storedText,
} from '../test/passages-model';
import {
  choosableOf,
  CORPUS,
  GARBLED,
  INVALID,
  launchPassages,
  storedOf,
  unchoosableOf,
} from '../test/passages-rig';

const DEVICES = 300;

/** The kinds of command, and how often each comes. */
const COMMANDS = [
  'add',
  'add',
  'add',
  'invalid',
  'remove held',
  'remove held',
  'remove absent',
  'at once',
] as const;

/** The log lines a launch may write: these names, with these annotations, or the store's own failure line. */
const LOG =
  /^passages\.(read\.retry|read\.failed|write\.failed) \{("(key|method|reason|passages)":("[\w/.]+"|\d+),?)+\}$|^store\.failed /u;

const json = <A>(value: A) => JSON.stringify(value);

const viewText = (view: { readonly _tag: string; readonly passages?: ReadonlyArray<Span> }) =>
  json(view._tag === 'Read' ? { tag: 'Read', passages: view.passages } : { tag: view._tag });

const heldText = (held: Held) =>
  json(held.tag === 'Read' ? { tag: 'Read', passages: held.passages } : held);

type Coverage = Map<string, number>;

/** One generated device: its launch, the model beside it, and each command played and judged. */
class Walk {
  held: Held;
  written = false;
  writes = 0;
  steps: string[];
  gets = 0;

  constructor(
    readonly seed: number,
    readonly next: () => number,
    readonly raw: string | undefined,
    readonly faults: number,
    readonly live: Effect.Success<typeof launchPassages>,
    readonly coverage: Coverage,
    readonly failures: string[],
  ) {
    this.held = readRule(CORPUS, raw, faults);
    this.steps = [`${faults} failed reads`];
  }

  bump(key: string) {
    this.coverage.set(key, (this.coverage.get(key) ?? 0) + 1);
  }

  fail(what: string) {
    this.failures.push(`seed ${this.seed}: ${what} after ${this.steps.slice(-6).join(' | ')}`);
  }

  passages() {
    return this.held.tag === 'Read' ? this.held.passages : [];
  }

  /** After a step: the view, the stored text and the writes taken, against the model. */
  async check(step: string) {
    this.steps.push(step);
    const view = await this.live.run(this.live.passages.view);
    if (viewText(view) !== heldText(this.held))
      this.fail(`${step}: view ${viewText(view)}, model ${heldText(this.held)}`);
    const disk = device.disk.get(KEY) ?? undefined;
    const want = this.written ? storedText(this.passages()) : this.raw;
    if (disk !== want) this.fail(`${step}: stored ${disk}, model ${want}`);
    if (device.calls.set !== this.writes)
      this.fail(`${step}: ${device.calls.set} writes, model ${this.writes}`);
  }

  async add(span: Span, kind: string, refused: boolean) {
    device.fail('set', refused ? 1 : 0);
    const before = this.held;
    const want = addRule(CORPUS, this.held, span, refused);
    const got: AddAnswer = await this.live.run(this.live.passages.add(span));
    device.fail('set', 0);
    if (got !== want.outcome) this.fail(`add ${kind} ${json(span)}: ${got}, model ${want.outcome}`);
    if (want.outcome === 'Added' || want.outcome === 'Failed') this.writes += 1;
    if (want.outcome === 'Added') this.written = true;
    this.held = want.held;
    this.bump(`add:${want.outcome}`);
    if (before.tag === 'Read') this.bump(`add from ${Math.min(4, before.passages.length)} held`);
    if (
      want.outcome === 'Invalid' &&
      before.tag === 'Read' &&
      before.passages.length >= CAP_PASSAGES
    )
      this.bump('clash:invalid on a full list');
    if (want.outcome === 'Unread' && kind.startsWith('invalid'))
      this.bump('clash:invalid on unread');
    await this.check(`add ${kind} ${got}`);
    return want.outcome;
  }

  async remove(span: Span, kind: string, refused: boolean) {
    device.fail('set', refused ? 1 : 0);
    const before = this.passages();
    const want = removeRule(this.held, span, refused);
    const got: RemoveAnswer = await this.live.run(this.live.passages.remove(span));
    device.fail('set', 0);
    if (got !== want.outcome)
      this.fail(`remove ${kind} ${json(span)}: ${got}, model ${want.outcome}`);
    if (want.outcome === 'Removed' || want.outcome === 'Failed') this.writes += 1;
    if (want.outcome === 'Removed') this.written = true;
    this.held = want.held;
    this.bump(`remove:${want.outcome}`);
    const last = before.findLastIndex((each) => json(each) === json(span));
    const lastGone = storedText(before.filter((_, index) => index !== last));
    if (want.outcome === 'Removed' && lastGone !== storedText(this.passages()))
      this.bump('remove:first of equals, not the last');
    await this.check(`remove ${kind} ${got}`);
    return want.outcome;
  }

  /** Adds `spans` at once, in call order. */
  async atOnce(spans: ReadonlyArray<Span>) {
    const before = this.passages().length;
    const answers = await this.live.run(
      Effect.forEach(spans, (span) => this.live.passages.add(span), { concurrency: 3 }),
    );
    for (const [index, span] of spans.entries()) {
      const want = addRule(CORPUS, this.held, span, false);
      if (answers[index] !== want.outcome)
        this.fail(`at once #${index}: ${answers[index]}, model ${want.outcome}`);
      if (want.outcome === 'Added') {
        this.writes += 1;
        this.written = true;
      }
      this.held = want.held;
      this.bump(`at once:${want.outcome}`);
    }
    this.bump(`at once:${spans.length}`);
    if (this.held.tag === 'Read' && before + spans.length > CAP_PASSAGES)
      this.bump('at once:past the cap');
    await this.check(`${spans.length} adds at once ${answers.join(',')}`);
  }

  /** A passage held to remove: one held twice or more, three times in four when there is one. */
  heldToRemove() {
    const passages = this.passages();
    const twice = passages.filter(
      (each) => passages.filter((other) => json(other) === json(each)).length > 1,
    );
    const from = twice.length > 0 && below(this.next, 4) > 0 ? twice : passages;
    return from[below(this.next, from.length)];
  }

  async command(n: number) {
    const command = COMMANDS[below(this.next, COMMANDS.length)] ?? 'add';
    const refused = below(this.next, 7) === 0;
    if (command === 'add') {
      const [kind, chosen] = choosableOf(this.next, this.passages());
      const carried = { ...chosen, chosenAt: n };
      const span = below(this.next, 5) === 0 ? carried : chosen;
      this.bump(`gen:${kind}`);
      if (span === carried) this.bump('gen:a field beyond the four');
      if ((await this.add(span, kind, refused)) !== 'Failed') return;
      this.bump('add:refused, then again');
      await this.add(span, `${kind} again`, false);
      return;
    }
    if (command === 'invalid') {
      const kind = INVALID[(this.seed + n) % INVALID.length] ?? '21+ verses';
      this.bump(`invalid:${kind}`);
      await this.add(unchoosableOf(this.next, kind), `invalid ${kind}`, false);
      return;
    }
    const held = this.heldToRemove();
    if (command === 'remove held' && held !== undefined) {
      if ((await this.remove({ ...held }, 'held', refused)) !== 'Failed') return;
      this.bump('remove:refused, then again');
      await this.remove({ ...held }, 'held again', false);
      return;
    }
    if (command !== 'at once') {
      await this.remove(choosableOf(this.next, [])[1], 'absent', false);
      return;
    }
    await this.atOnce(
      Array.from(
        { length: 2 + below(this.next, 2) },
        () => choosableOf(this.next, this.passages())[1],
      ),
    );
  }
}

/** Launches one generated device and plays its commands. */
const walk = async (seed: number, coverage: Coverage, failures: string[]) => {
  const next = random(seed * 977);
  const [named, raw] = storedOf(next, seed);
  const faults = [0, 0, 0, 0, 1, 1, 2, 2, 3, 4][below(next, 10)] ?? 0;
  const byOpen = faults > 0 && faults < 4 && below(next, 3) === 0;
  device.launch(raw === undefined ? [] : [[KEY, raw]]);
  device.fail(byOpen ? 'open' : 'get', faults);
  const live = await Effect.runPromise(launchPassages);
  const one = new Walk(seed, next, raw, faults, live, coverage, failures);
  one.bump(
    named.startsWith('garbled')
      ? named
      : named.replace(/\d+$/u, (n) => (Number(n) >= 4 ? '4+' : n)),
  );
  one.bump(`read:${byOpen ? 'open' : 'get'} faults ${faults}`);
  if (one.held.tag === 'Unread')
    one.bump(faults >= 3 ? 'launch:unread:faults' : 'launch:unread:garbled');
  if (one.passages().some((span) => span.last - span.first >= 20))
    one.bump('stored:long, read whole');
  await one.check('launch');
  const gets = device.calls.get;
  for (let n = 6 + below(next, 9); n > 0; n--) await one.command(n);
  if (device.calls.get !== gets) one.fail('the passages were read again after the launch');
  const wrongLogs = live.logs.filter((line) => !LOG.test(line));
  if (wrongLogs.length > 0) one.fail(`logs ${json(wrongLogs)}`);
  await Effect.runPromise(Scope.close(live.scope, Exit.void));
};

const FLOORS = {
  'no key': 5,
  '[]': 5,
  'stored 1': 3,
  'stored 4+': 5,
  'stored:long, read whole': 10,
  'launch:unread:garbled': 10,
  'launch:unread:faults': 5,
  'read:get faults 0': 30,
  'read:get faults 1': 5,
  'read:get faults 2': 5,
  'read:get faults 3': 3,
  'read:get faults 4': 3,
  'read:open faults 1': 2,
  'read:open faults 2': 2,
  'add:Added': 100,
  'add:Full': 40,
  'add:Invalid': 40,
  'add:Unread': 20,
  'add:Failed': 15,
  'add from 0 held': 10,
  'add from 1 held': 10,
  'add from 2 held': 10,
  'add from 3 held': 10,
  'add from 4 held': 10,
  'add:refused, then again': 10,
  'clash:invalid on a full list': 10,
  'clash:invalid on unread': 3,
  'remove:Removed': 40,
  'remove:Absent': 20,
  'remove:Unread': 5,
  'remove:Failed': 5,
  'remove:refused, then again': 5,
  'remove:first of equals, not the last': 10,
  'at once:2': 10,
  'at once:3': 10,
  'at once:Full': 10,
  'at once:past the cap': 10,
  'gen:a passage held': 10,
  'gen:an overlap': 10,
  'gen:over the promise': 10,
  'gen:a whole short chapter': 10,
  'gen:exactly 20': 10,
  'gen:one verse': 10,
  'gen:a field beyond the four': 20,
  ...Object.fromEntries(INVALID.map((kind) => [`invalid:${kind}`, 3])),
  ...Object.fromEntries(GARBLED.map(([name]) => [`garbled: ${name}`, 2])),
};

describe('the reader’s passages, over generated devices', () => {
  it('reads, adds and removes as the rules do, through faults, at every step', async () => {
    const coverage: Coverage = new Map();
    const failures: string[] = [];
    for (let seed = 1; seed <= DEVICES; seed++) await walk(seed, coverage, failures);
    expect(failures.slice(0, 5)).toEqual([]);
    const short = Object.entries(FLOORS)
      .filter(([key, floor]) => (coverage.get(key) ?? 0) < floor)
      .map(([key, floor]) => `${key} ${coverage.get(key) ?? 0}/${floor}`);
    expect(short).toEqual([]);
  });
});
