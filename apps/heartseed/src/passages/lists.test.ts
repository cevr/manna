/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the property plays each generated device's commands one after another through the service's promise-run calls, over the device stand-in's plain maps, writes expected values as plain branches, and compares values as JSON text. */

/**
 * What a reader holds, passages and lists planted whole (hshandbook R1-R6),
 * over the app's real store, judged at the service's seam against the
 * model (`test/handbook-model.ts`, over `test/passages-model.ts`).
 * Generated devices hold both stored texts (no key, `[]`, held, past the
 * limit, seven garbled forms of the lists' text, unknown and repeated ids)
 * and meet failed reads per key; then generated commands (add, remove,
 * plant, uproot, 2-4 calls at once, a relaunch), one write in six refused.
 * After every command the answer, the view, both stored texts, the writes
 * each key took and the reads since the launch are the model's.
 *
 * It catches two locks or none, a limit counting passages alone, an unknown
 * id counted or shown, an id shown twice, a garbled lists' text read as
 * none, a change while unread, `Full` judged before `Invalid`, a held id
 * planted twice, a plant or uproot dropping unknown ids, an uproot of the
 * first equal entry alone, and a view changed before its write.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Exit, Layer, Logger, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { layer, Passages, type PassagesView } from '../passages';
import { store } from '../store';
import { below, random } from '../test/garden-model';
import {
  addStep,
  countOf,
  heldLists,
  KNOWN_IDS,
  knows,
  LISTS,
  type Model,
  MOST,
  plantRule,
  readModel,
  removeStep,
  type Step,
  TRIES,
  uprootRule,
} from '../test/handbook-model';
import { device } from '../test/one';
import { KEY, readRule, type Span, storedText } from '../test/passages-model';
import { CORPUS, instantSleeps } from '../test/passages-rig';

type Next = () => number;

const P = KEY;
const L = LISTS;

/** The store's faults and counts for one launch, per key. */
interface Faults {
  gets: Record<string, number>;
  sets: number;
  got: Record<string, number>;
  set: Record<string, number>;
}

const faults: Faults = { gets: {}, sets: 0, got: {}, set: {} };

const bumpIn = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** The app's store, counting each key's reads and writes, failing a key's next reads and the next writes as `faults` says, and yielding before each write so calls made at once can interleave. */
const faulty = Layer.effect(
  KeyValueStore.KeyValueStore,
  Effect.map(KeyValueStore.KeyValueStore, (real) =>
    KeyValueStore.KeyValueStore.of({
      ...real,
      get: (key) =>
        Effect.suspend(() => {
          bumpIn(faults.got, key);
          if ((faults.gets[key] ?? 0) === 0) return real.get(key);
          faults.gets[key] = (faults.gets[key] ?? 0) - 1;
          return Effect.fail(
            new KeyValueStore.KeyValueStoreError({ message: 'get', method: 'get', key }),
          );
        }),
      set: (key, value) =>
        Effect.andThen(
          Effect.yieldNow,
          Effect.suspend(() => {
            bumpIn(faults.set, key);
            if (faults.sets === 0) return real.set(key, value);
            faults.sets -= 1;
            return Effect.fail(
              new KeyValueStore.KeyValueStoreError({ message: 'set', method: 'set', key }),
            );
          }),
        ),
    }),
  ),
).pipe(Layer.provide(store));

/** One launch of the service over the device as it stands. */
const launch = async () => {
  const scope = await Effect.runPromise(Scope.make());
  const services = await Effect.runPromise(
    Layer.buildWithScope(
      layer.pipe(
        Layer.provide(faulty),
        Layer.provideMerge(Layer.merge(instantSleeps, Logger.layer([]))),
      ),
      scope,
    ),
  );
  const run = <A>(effect: Effect.Effect<A>): Promise<A> =>
    Effect.runPromise(Effect.provideContext(effect, services));
  return { passages: Context.get(services, Passages), run, scope };
};

type Live = Awaited<ReturnType<typeof launch>>;

const SPANS: readonly Span[] = [
  { book: 19, chapter: 46, first: 1, last: 3 },
  { book: 43, chapter: 15, first: 1, last: 3 },
  { book: 20, chapter: 4, first: 23, last: 23 },
  { book: 19, chapter: 23, first: 1, last: 6 },
  { book: 1, chapter: 1, first: 1, last: 20 },
];
const BAD_SPANS: readonly Span[] = [
  { book: 19, chapter: 119, first: 1, last: 21 },
  { book: 19, chapter: 46, first: 0, last: 3 },
  { book: 67, chapter: 1, first: 1, last: 1 },
  { book: 19, chapter: 46, first: 3, last: 1 },
];
/** A few of the build's lists, so a walk meets a held one often. */
const IDS = [KNOWN_IDS[0], KNOWN_IDS[1], KNOWN_IDS[2], KNOWN_IDS[60], KNOWN_IDS[130]] as string[];
const UNKNOWN = ['no-such-list', '', 'bhb-0', 'BHB-30', ' bhb-30'];
const GARBLED_LISTS: readonly (readonly [string, string])[] = [
  ['not JSON', '{'],
  ['a string', '"bhb-30"'],
  ['an object', '{"0":"bhb-30"}'],
  ['a number entry', '["bhb-30",7]'],
  ['a null entry', '[null]'],
  ['a nested array', '[["bhb-30"]]'],
  ['null', 'null'],
];
const GARBLED_PASSAGES = ['{', '[{"book":19}]', '"x"'];

const pick = <A>(next: Next, from: readonly A[]) => from[below(next, from.length)] as A;

/** A device's stored passages: no key, `[]`, 1 to 4 spans, or a text that does not decode. */
const passagesOf = (next: Next): readonly [string, string | undefined] => {
  const roll = below(next, 10);
  if (roll === 0) return ['P none', undefined];
  if (roll === 1) return ['P []', '[]'];
  if (roll === 2) return ['P garbled', pick(next, GARBLED_PASSAGES)];
  const count = roll === 3 ? 4 : below(next, 4);
  return [
    `P ${Math.min(count, 3)}${count > 3 ? '+' : ''}`,
    storedText(Array.from({ length: count }, () => pick(next, SPANS))),
  ];
};

/** A device's stored lists: no key, `[]`, 1 to 4 ids (known, repeated, unknown), or a text that does not decode. */
const listsOf = (next: Next): readonly [string, string | undefined] => {
  const roll = below(next, 12);
  if (roll <= 1) return ['L none', undefined];
  if (roll === 2) return ['L []', '[]'];
  if (roll === 3) {
    const [name, raw] = pick(next, GARBLED_LISTS);
    return [`L garbled: ${name}`, raw];
  }
  const ids = Array.from({ length: 1 + below(next, 4) }, () => {
    const kind = below(next, 6);
    if (kind === 0) return pick(next, UNKNOWN);
    return pick(next, IDS);
  });
  return ['L ids', JSON.stringify(ids)];
};

type Coverage = Map<string, number>;

/** One call made at once with others: its name, the call, and its rule. */
interface AtOnce {
  readonly name: string;
  readonly call: Effect.Effect<string>;
  readonly rule: (model: Model) => Step;
}

/** One generated device: its launches, the model beside it, and each command played and judged. */
class Walk {
  model: Model = { tag: 'Unread' };
  live!: Live;
  diskP: string | undefined;
  diskL: string | undefined;
  sets: Record<string, number> = {};
  gets: Record<string, number> = {};
  steps: string[] = [];

  constructor(
    readonly seed: number,
    readonly next: Next,
    readonly coverage: Coverage,
    readonly failures: string[],
  ) {}

  bump(key: string) {
    this.coverage.set(key, (this.coverage.get(key) ?? 0) + 1);
  }

  fail(what: string) {
    if (this.failures.length < 12)
      this.failures.push(`seed ${this.seed}: ${what} after ${this.steps.slice(-6).join(' | ')}`);
  }

  /** A launch over the disk as it stands, each key's read failing `failedP` and `failedL` times. */
  async start(failedP: number, failedL: number, first: boolean) {
    faults.gets = { [P]: failedP, [L]: failedL };
    faults.sets = 0;
    faults.got = {};
    faults.set = {};
    this.sets = {};
    this.live = await launch();
    this.model = readModel(CORPUS, this.diskP, failedP, this.diskL, failedL);
    this.gets = { ...faults.got };
    const wantP = Math.min(failedP + 1, TRIES);
    const wantL = Math.min(failedL + 1, TRIES);
    if ((faults.got[P] ?? 0) !== wantP)
      this.fail(`launch: ${faults.got[P] ?? 0} reads of the passages, model ${wantP}`);
    if ((faults.got[L] ?? 0) !== wantL)
      this.fail(`launch: ${faults.got[L] ?? 0} reads of the lists, model ${wantL}`);
    this.bumpLaunch(failedP, failedL);
    if (!first) this.bump('relaunch');
    await this.check(first ? 'launch' : 'relaunch');
  }

  /** What a launch read, as coverage. */
  bumpLaunch(failedP: number, failedL: number) {
    if (this.model.tag === 'Unread') {
      const byP = readRule(CORPUS, this.diskP, failedP).tag === 'Unread';
      this.bump(byP ? 'launch:unread by the passages' : 'launch:unread by the lists');
      if (!byP && failedL >= TRIES) this.bump('launch:unread by the lists’ reads');
      if (!byP && failedL < TRIES) this.bump('launch:unread by the lists’ text');
    } else {
      this.bump(`launch:read holding ${Math.min(4, countOf(this.model))}`);
      if (this.model.stored.some((id) => !knows(id))) this.bump('launch:an unknown id stored');
      if (this.model.stored.length > new Set(this.model.stored).size)
        this.bump('launch:an id stored twice');
    }
  }

  /** After a step: the view, both stored texts, each key's writes, and no read since the launch, against the model. */
  async check(step: string) {
    this.steps.push(step);
    this.checkView(step, await this.live.run(this.live.passages.view));
    this.checkStore(step);
  }

  /** The view against the model's. */
  checkView(step: string, view: PassagesView) {
    const got = JSON.stringify(
      view._tag === 'Read'
        ? { tag: 'Read', passages: view.passages, lists: view.lists }
        : { tag: view._tag },
    );
    const want = JSON.stringify(
      this.model.tag === 'Read'
        ? { tag: 'Read', passages: this.model.passages, lists: heldLists(this.model.stored) }
        : this.model,
    );
    if (got !== want) this.fail(`${step}: view ${got}, model ${want}`);
  }

  /** Both stored texts, each key's writes and reads, and no write while unread, against the model. */
  checkStore(step: string) {
    const onP = device.disk.get(P) ?? undefined;
    const onL = device.disk.get(L) ?? undefined;
    if (onP !== this.diskP) this.fail(`${step}: stored passages ${onP}, model ${this.diskP}`);
    if (onL !== this.diskL) this.fail(`${step}: stored lists ${onL}, model ${this.diskL}`);
    this.checkCalls(step);
  }

  /** Each key's writes and reads, and no write while unread, against the model. */
  checkCalls(step: string) {
    for (const key of [P, L])
      if ((faults.set[key] ?? 0) !== (this.sets[key] ?? 0))
        this.fail(
          `${step}: ${faults.set[key] ?? 0} writes of ${key}, model ${this.sets[key] ?? 0}`,
        );
    for (const key of Object.keys(faults.set))
      if (key !== P && key !== L) this.fail(`${step}: the key ${key} written`);
    for (const key of [P, L])
      if ((faults.got[key] ?? 0) !== (this.gets[key] ?? 0))
        this.fail(`${step}: ${key} read again after the launch`);
    if (this.model.tag === 'Unread' && Object.keys(faults.set).length > 0)
      this.fail(`${step}: a write while unread`);
  }

  /** Takes a step's result into the model and its disk. */
  take(step: Step) {
    if (step.wrote === 'P') bumpIn(this.sets, P);
    if (step.wrote === 'L') bumpIn(this.sets, L);
    this.model = step.model;
    if (!step.landed || step.model.tag !== 'Read') return;
    if (step.wrote === 'P') this.diskP = storedText(step.model.passages);
    if (step.wrote === 'L') this.diskL = JSON.stringify(step.model.stored);
  }

  /** One call and its rule: the answer and everything after it judged. */
  async one(
    name: string,
    call: Effect.Effect<string>,
    rule: (model: Model, refused: boolean) => Step,
    refused: boolean,
  ) {
    const before = this.model;
    faults.sets = refused ? 1 : 0;
    const want = rule(this.model, refused);
    const got = await this.live.run(call);
    faults.sets = 0;
    if (got !== want.answer) this.fail(`${name}: ${got}, model ${want.answer}`);
    this.take(want);
    const kind = name.split(' ')[0];
    this.bump(`${kind}:${want.answer}`);
    if (before.tag === 'Read' && (want.answer === 'Added' || want.answer === 'Full')) {
      const lists = heldLists(before.stored).length;
      const mix =
        lists === 0 ? 'passages alone' : before.passages.length === 0 ? 'lists alone' : 'both';
      this.bump(`${kind}:${want.answer} over ${mix}`);
      if (want.answer === 'Added') this.bump(`${kind}:Added from ${countOf(before)} held`);
    }
    if (before.tag === 'Read' && want.landed && before.stored.some((id) => !knows(id)))
      this.bump(`${kind}:landed beside an unknown id`);
    if (
      before.tag === 'Read' &&
      want.answer === 'Removed' &&
      want.model.tag === 'Read' &&
      name.startsWith('uproot') &&
      before.stored.length - want.model.stored.length > 1
    )
      this.bump('uproot:an id stored twice, both gone');
    await this.check(`${name} ${got}`);
    return want.answer;
  }

  add(span: Span, refused: boolean) {
    return this.one(
      `add ${JSON.stringify(span)}`,
      this.live.passages.add(span),
      (model, no) => addStep(CORPUS, model, span, no),
      refused,
    );
  }

  remove(span: Span, refused: boolean) {
    return this.one(
      `remove ${JSON.stringify(span)}`,
      this.live.passages.remove(span),
      (model, no) => removeStep(model, span, no),
      refused,
    );
  }

  plant(id: string, refused: boolean) {
    return this.one(
      `plant ${JSON.stringify(id)}`,
      this.live.passages.plant(id),
      (model, no) => plantRule(model, id, no),
      refused,
    );
  }

  uproot(id: string, refused: boolean) {
    return this.one(
      `uproot ${JSON.stringify(id)}`,
      this.live.passages.uproot(id),
      (model, no) => uprootRule(model, id, no),
      refused,
    );
  }

  /** Several adds and plants at once, answered in call order, one at a time. */
  async atOnce() {
    const before = countOf(this.model);
    const calls = Array.from({ length: 2 + below(this.next, 3) }, (): AtOnce => {
      if (below(this.next, 2) === 0) {
        const span = pick(this.next, SPANS);
        return {
          name: 'add',
          call: this.live.passages.add(span),
          rule: (model) => addStep(CORPUS, model, span, false),
        };
      }
      const id = pick(this.next, IDS);
      return {
        name: 'plant',
        call: this.live.passages.plant(id),
        rule: (model) => plantRule(model, id, false),
      };
    });
    const answers = await this.live.run(
      Effect.forEach(calls, (each) => each.call, { concurrency: 4 }),
    );
    for (const [index, each] of calls.entries()) {
      const want = each.rule(this.model);
      if (answers[index] !== want.answer)
        this.fail(`at once #${index} ${each.name}: ${answers[index]}, model ${want.answer}`);
      this.take(want);
      this.bump(`at once:${each.name}:${want.answer}`);
    }
    const kinds = new Set(calls.map((each) => each.name));
    if (kinds.size === 2) this.bump('at once:a passage and a list');
    if (this.model.tag === 'Read' && before < MOST && before + calls.length > MOST)
      this.bump('at once:past the limit');
    if (countOf(this.model) > Math.max(MOST, before))
      this.fail(`at once: ${countOf(this.model)} held from ${before}`);
    await this.check(`${calls.length} at once ${answers.join(',')}`);
  }

  async command() {
    const roll = below(this.next, 16);
    const refused = below(this.next, 6) === 0;
    if (roll <= 4) return this.passageCommand(roll, refused);
    if (roll <= 12) return this.listCommand(roll, refused);
    if (roll <= 14) return this.atOnce();
    await Effect.runPromise(Scope.close(this.live.scope, Exit.void));
    await this.start(
      pick(this.next, [0, 0, 0, 1, 2, 3]),
      pick(this.next, [0, 0, 0, 1, 2, 3, 4]),
      false,
    );
  }

  /** Rolls 0-4: an add (refused, then again), an add of a bad span, or a remove. */
  async passageCommand(roll: number, refused: boolean) {
    const passages = this.model.tag === 'Read' ? this.model.passages : [];
    if (roll <= 2) {
      if ((await this.add(pick(this.next, SPANS), refused)) === 'Failed') {
        this.bump('add:refused, then again');
        await this.add(pick(this.next, SPANS), false);
      }
      return;
    }
    if (roll === 3) return void (await this.add(pick(this.next, BAD_SPANS), false));
    if (roll === 4) {
      const span = passages.length > 0 ? pick(this.next, passages) : pick(this.next, SPANS);
      return void (await this.remove({ ...span }, refused));
    }
  }

  /** Rolls 5-12: a plant or an uproot. */
  listCommand(roll: number, refused: boolean) {
    const held = this.model.tag === 'Read' ? heldLists(this.model.stored) : [];
    if (roll <= 9) return this.plantCommand(roll, refused, held);
    return this.uprootCommand(roll, refused, held);
  }

  /** Rolls 5-9: a plant (refused, then again), of an unknown id, or of a held one. */
  async plantCommand(roll: number, refused: boolean, held: readonly string[]) {
    if (roll <= 7) {
      const free = IDS.filter((id) => !held.includes(id));
      const id = free.length > 0 ? pick(this.next, free) : pick(this.next, IDS);
      if ((await this.plant(id, refused)) === 'Failed') {
        this.bump('plant:refused, then again');
        await this.plant(id, false);
      }
      return;
    }
    if (roll === 8) return void (await this.plant(pick(this.next, UNKNOWN), false));
    if (roll === 9) {
      const id = held.length > 0 ? pick(this.next, held) : pick(this.next, IDS);
      return void (await this.plant(id, false));
    }
  }

  /** Rolls 10-12: an uproot (refused, then again), or an uproot of an unknown id. */
  async uprootCommand(roll: number, refused: boolean, held: readonly string[]) {
    const model = this.model;
    if (roll <= 11) {
      const id = held.length > 0 ? pick(this.next, held) : pick(this.next, IDS);
      if ((await this.uproot(id, refused)) === 'Failed') {
        this.bump('uproot:refused, then again');
        await this.uproot(id, false);
      }
      return;
    }
    if (roll === 12) {
      const stored = model.tag === 'Read' ? model.stored.filter((id) => !knows(id)) : [];
      const id = stored.length > 0 ? pick(this.next, stored) : pick(this.next, UNKNOWN);
      if (stored.length > 0) this.bump('uproot:of an unknown id stored');
      return void (await this.uproot(id, false));
    }
  }
}

/** Launches one generated device and plays its commands. */
const walk = async (seed: number, coverage: Coverage, failures: string[]) => {
  const next: Next = random(seed * 613);
  const [namedP, rawP] = passagesOf(next);
  const [namedL, rawL] = listsOf(next);
  const disk: [string, string][] = [];
  if (rawP !== undefined) disk.push([P, rawP]);
  if (rawL !== undefined) disk.push([L, rawL]);
  device.launch(disk);
  const one = new Walk(seed, next, coverage, failures);
  one.diskP = rawP;
  one.diskL = rawL;
  one.bump(namedP);
  one.bump(namedL);
  await one.start(pick(next, [0, 0, 0, 0, 1, 2, 3, 4]), pick(next, [0, 0, 0, 0, 1, 2, 3, 4]), true);
  for (let n = 8 + below(next, 9); n > 0; n--) await one.command();
  await Effect.runPromise(Scope.close(one.live.scope, Exit.void));
};

const DEVICES = 700;

const FLOORS = {
  'P none': 10,
  'P []': 10,
  'P garbled': 10,
  'P 3+': 10,
  'L none': 20,
  'L []': 10,
  'L ids': 100,
  ...Object.fromEntries(GARBLED_LISTS.map(([name]) => [`L garbled: ${name}`, 2])),
  'launch:unread by the passages': 20,
  'launch:unread by the lists’ reads': 10,
  'launch:unread by the lists’ text': 10,
  'launch:read holding 0': 10,
  'launch:read holding 3': 10,
  'launch:read holding 4': 10,
  'launch:an unknown id stored': 20,
  'launch:an id stored twice': 10,
  relaunch: 100,
  'add:Added': 100,
  'add:Added over lists alone': 20,
  'add:Added over both': 20,
  'add:Full': 100,
  'add:Full over lists alone': 10,
  'add:Full over both': 30,
  'add:Full over passages alone': 10,
  'add:Invalid': 50,
  'add:Unread': 30,
  'add:Failed': 15,
  'add:refused, then again': 15,
  'remove:Removed': 40,
  'remove:Absent': 20,
  'remove:Unread': 10,
  'remove:Failed': 5,
  'plant:Added': 150,
  'plant:Added from 0 held': 20,
  'plant:Added from 1 held': 20,
  'plant:Added from 2 held': 20,
  'plant:Added over passages alone': 20,
  'plant:Added over both': 20,
  'plant:Full': 100,
  'plant:Full over passages alone': 10,
  'plant:Full over lists alone': 10,
  'plant:Full over both': 30,
  'plant:Held': 50,
  'plant:Invalid': 50,
  'plant:Unread': 30,
  'plant:Failed': 20,
  'plant:refused, then again': 20,
  'plant:landed beside an unknown id': 10,
  'uproot:Removed': 100,
  'uproot:Absent': 50,
  'uproot:Unread': 20,
  'uproot:Failed': 10,
  'uproot:refused, then again': 10,
  'uproot:landed beside an unknown id': 10,
  'uproot:an id stored twice, both gone': 5,
  'uproot:of an unknown id stored': 10,
  'at once:add:Added': 30,
  'at once:plant:Added': 30,
  'at once:add:Full': 30,
  'at once:plant:Full': 30,
  'at once:a passage and a list': 50,
  'at once:past the limit': 30,
} satisfies Record<string, number>;

describe('what a reader holds, passages and lists, over generated devices', () => {
  it('reads both keys, and adds, removes, plants and uproots as the rules do, through faults, at every step', async () => {
    expect(KNOWN_IDS.length).toBe(131);
    const coverage: Coverage = new Map();
    const failures: string[] = [];
    for (let seed = 1; seed <= DEVICES && failures.length === 0; seed++)
      await walk(seed, coverage, failures);
    expect(failures.slice(0, 5)).toEqual([]);
    const short = Object.entries(FLOORS)
      .filter(([key, floor]) => (coverage.get(key) ?? 0) < floor)
      .map(([key, floor]) => `${key} ${coverage.get(key) ?? 0}/${floor}`);
    expect(short).toEqual([]);
  });
});
