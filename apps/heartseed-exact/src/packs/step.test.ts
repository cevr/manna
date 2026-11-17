/* oxlint-disable effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noNewError -- Exact's app folder cannot import effect (docs/exact.md): a model-based test over plain records; an event the walker cannot take is a broken test, said by a throw. */

/**
 * The download's protocol, model-based: `step` over generated histories of
 * the Read tab shown, Try again, days passing, the server's answers (a good
 * body, `304`, `500`, a refusal, a body cut short, one character changed,
 * a wrong format, an index out of range), a write that fails, Contract
 * keeping the version, a relaunch that keeps storage, the server's pack
 * changing, and answers that are no longer current; then every order of a
 * small alphabet of them, six deep. A small reference model says when a
 * fetch starts and what is kept, and after every event the invariants hold:
 * what is kept is a whole checked pack or nothing; a failed answer changes
 * nothing kept; one fetch at most, and a stray answer changes nothing; no
 * fetch within a week of a good check unless there is no pack, the reader
 * asks or the last try failed; after a failure the next showing fetches;
 * the version kept is never ahead of the file kept.
 */

import { describe, expect, it } from 'bun:test';

import { bodyOf, madePack } from '../test/commentary-packs';
import { seeded, type Random } from '../test/random';
import { checkPack as checkBody, type CommentaryPack, type PackCheck } from '../commentary/pack';
import {
  NOTHING_KEPT,
  START,
  WEEK,
  due,
  keptIn,
  keptOf,
  keptWith,
  step as stepWith,
  type Command as AnyCommand,
  type Heard,
  type Input,
  type Kept,
  type Machine,
} from './step';

/** The step over the commentary's pack and check, the walk's pack. */
type Command = AnyCommand<CommentaryPack>;

const DAY = 24 * 60 * 60 * 1000;
const HISTORIES = 300;
const EVENTS = 40;

/** How a server's answer goes wrong, or `well` for the server's own answer. */
type Outcome = 'well' | 'status' | 'refused' | 'cut' | 'flip' | 'format' | 'index';

/** One event of a history. */
type Event =
  | { readonly _tag: 'show' }
  | { readonly _tag: 'retry' }
  | { readonly _tag: 'days'; readonly ms: number }
  | {
      readonly _tag: 'answer';
      readonly outcome: Outcome;
      readonly writes: boolean;
      readonly cut: number;
    }
  | { readonly _tag: 'stray' }
  | { readonly _tag: 'keep' }
  | { readonly _tag: 'relaunch' }
  | { readonly _tag: 'publish'; readonly pack: CommentaryPack };

/** The small reference model: what a launch should take as kept, whether a fetch is out, whether the last try failed. */
interface Model {
  readonly kept: Kept;
  readonly loaded: boolean;
  readonly out: boolean;
  readonly failed: boolean;
}

/** The phone and the server: the launch's machine, the file, what Contract persisted and still owes, the fetch out, the server's pack. */
interface World {
  readonly machine: Machine;
  readonly model: Model;
  readonly now: number;
  readonly file: string | undefined;
  readonly fileVersions: ReadonlyArray<string>;
  readonly persisted: Kept;
  readonly owed: ReadonlyArray<Kept>;
  readonly out: ReadonlyArray<{ readonly id: number; readonly version: string }>;
  readonly server: CommentaryPack;
}

const checked = new Map<string, PackCheck>();

/** `checkPack`, remembered per body: the walk meets each body many times. */
const checkPack = (body: string): PackCheck => {
  const known = checked.get(body);
  if (known !== undefined) return known;
  const check = checkBody(body);
  checked.set(body, check);
  return check;
};

const step = (machine: Machine, input: Input) => stepWith(machine, input, checkPack);

const bodies = new WeakMap<CommentaryPack, string>();

/** A server pack's body, made once. */
const bodyFor = (pack: CommentaryPack): string => {
  const known = bodies.get(pack);
  if (known !== undefined) return known;
  const body = bodyOf(pack);
  bodies.set(pack, body);
  return body;
};

const MODEL_START: Model = { kept: NOTHING_KEPT, loaded: false, out: false, failed: false };

const worldOf = (server: CommentaryPack): World => ({
  machine: START,
  model: MODEL_START,
  now: Date.UTC(2026, 10, 16, 12),
  file: undefined,
  fileVersions: [],
  persisted: NOTHING_KEPT,
  owed: [],
  out: [],
  server,
});

const versionIn = (file: string | undefined) => {
  if (file === undefined) return '';
  const checked = checkPack(file);
  return checked._tag === 'Good' ? checked.pack.version : 'damaged';
};

/** The body a server's answer carries for `outcome`, from a good body. */
const spoiled = (body: string, pack: CommentaryPack, outcome: Outcome, cut: number): string => {
  switch (outcome) {
    case 'cut':
      return body.slice(0, Math.floor(cut * body.length));
    case 'flip': {
      const at =
        body.indexOf('"notes"') +
        Math.floor(cut * (body.indexOf('"verses"') - body.indexOf('"notes"')));
      return body.slice(0, at) + (body[at] === 'q' ? 'z' : 'q') + body.slice(at + 1);
    }
    case 'format':
      return bodyOf({ ...pack, format: 2 });
    case 'index':
      return bodyOf({ ...pack, verses: { ...pack.verses, '1.1': [[1, [pack.count]]] } });
    default:
      return body;
  }
};

/** What the server hears for a fetch naming `version`, going `outcome`. */
const heardOf = (world: World, version: string, outcome: Outcome, cut: number): Heard => {
  if (outcome === 'status') return { _tag: 'Status', status: 500 };
  if (outcome === 'refused') return { _tag: 'Refused' };
  if (outcome === 'well' && version === world.server.version) return { _tag: 'Same' };
  return { _tag: 'Body', body: spoiled(bodyFor(world.server), world.server, outcome, cut) };
};

/** Every fetch a step started, in order: a write it asked is made (or fails), and a keep is owed to Contract. */
interface Applied {
  readonly world: World;
  readonly fetched: ReadonlyArray<Command>;
}

const applyCommands = (
  world: World,
  machine: Machine,
  commands: ReadonlyArray<Command>,
  writes: boolean,
): Applied => {
  let next: World = { ...world, machine };
  const fetched: Array<Command> = [];
  for (const command of commands) {
    if (command._tag === 'Fetch') {
      fetched.push(command);
      next = { ...next, out: [...next.out, { id: command.id, version: command.version }] };
    }
    if (command._tag === 'Write') {
      if (writes)
        next = {
          ...next,
          file: command.body,
          fileVersions: [...next.fileVersions, command.pack.version],
        };
      const after = step(next.machine, {
        _tag: 'Wrote',
        id: command.id,
        now: next.now,
        ok: writes,
      });
      const inner = applyCommands(next, after.state, after.commands, writes);
      next = inner.world;
    }
    if (command._tag === 'Keep') {
      expect(command.kept.version).toBe(versionIn(next.file));
      next = { ...next, owed: [...next.owed, command.kept] };
    }
  }
  return { world: next, fetched };
};

/** The reference model's ask: load what is persisted once, then fetch unless one is out or none is owed. */
const modelAsk = (model: Model, now: number, force: boolean, persisted: Kept) => {
  const loaded = model.loaded ? model : { ...model, kept: persisted, loaded: true };
  const fetches =
    !loaded.out &&
    (force ||
      loaded.failed ||
      loaded.kept.version === '' ||
      Math.abs(now - loaded.kept.checkedAt) > WEEK);
  return { model: fetches ? { ...loaded, out: true } : loaded, fetches };
};

/** The reference model's answer: a good body written, a `304` with a pack kept, or a failure. */
const modelAnswer = (model: Model, world: World, heard: Heard, writes: boolean): Model => {
  const settled = { ...model, out: false };
  if (heard._tag === 'Same' && model.kept.version !== '')
    return {
      ...settled,
      kept: { version: model.kept.version, checkedAt: world.now },
      failed: false,
    };
  if (heard._tag === 'Body') {
    const checked = checkPack(heard.body);
    if (checked._tag === 'Good' && writes)
      return {
        ...settled,
        kept: { version: checked.pack.version, checkedAt: world.now },
        failed: false,
      };
  }
  return { ...settled, failed: true };
};

/** The Read tab shown, or Try again: a fetch exactly when the model says, never within a week of a good check unless asked or after a failure, and always after a failure. */
const asked = (world: World, force: boolean): World => {
  const before = world.machine;
  const found = keptOf(versionIn(world.file), world.persisted);
  const stepped = step(before, { _tag: 'Ask', now: world.now, force, found });
  const applied = applyCommands(world, stepped.state, stepped.commands, true);
  const expected = modelAsk(world.model, world.now, force, found);
  expect(applied.fetched.length).toBe(expected.fetches ? 1 : 0);
  const kept = before.loaded ? before.kept : found;
  if (applied.fetched.length > 0 && !force && !due(kept, world.now))
    expect(before.failed).toBe(true);
  if (before.failed && before.current === 0) expect(applied.fetched.length).toBe(1);
  return { ...applied.world, model: expected.model };
};

/** The fetch out answered: a failed or bad answer changes nothing kept. */
const answeredBy = (world: World, outcome: Outcome, writes: boolean, cut: number): World => {
  const fetch = world.out.at(-1);
  if (fetch === undefined) throw new Error('no fetch out');
  const heard = heardOf(world, fetch.version, outcome, cut);
  const stepped = step(world.machine, { _tag: 'Answered', id: fetch.id, now: world.now, heard });
  const applied = applyCommands({ ...world, out: [] }, stepped.state, stepped.commands, writes);
  const model = modelAnswer(world.model, world, heard, writes);
  if (model.failed) {
    expect(applied.world.file).toBe(world.file);
    expect(applied.world.owed).toEqual(world.owed);
    expect(applied.world.machine.kept).toEqual(world.machine.kept);
  }
  return { ...applied.world, model };
};

/** Answers and writes for fetches that are not the current one change nothing. */
const strays = (world: World): World => {
  const ids = [world.machine.current + 1, world.machine.last + 2, world.machine.current - 1];
  const heard: Heard = { _tag: 'Body', body: bodyFor(world.server) };
  for (const id of ids.filter((each) => each !== world.machine.current)) {
    const still = { state: world.machine, commands: [] };
    expect(step(world.machine, { _tag: 'Answered', id, now: world.now, heard })).toEqual(still);
    expect(step(world.machine, { _tag: 'Wrote', id, now: world.now, ok: true })).toEqual(still);
  }
  return world;
};

/** One event on `world`, every invariant checked across it. */
const happen = (world: World, event: Event): World => {
  switch (event._tag) {
    case 'show':
    case 'retry':
      return asked(world, event._tag === 'retry');
    case 'days':
      return { ...world, now: world.now + event.ms };
    case 'answer':
      return answeredBy(world, event.outcome, event.writes, event.cut);
    case 'stray':
      return strays(world);
    case 'keep':
      return { ...world, persisted: world.owed.at(-1) ?? world.persisted, owed: [] };
    case 'relaunch':
      return { ...world, machine: START, model: MODEL_START, out: [], owed: [] };
    case 'publish':
      return { ...world, server: event.pack };
  }
};

/** The invariants that hold between any two events. */
const holds = (world: World) => {
  if (world.file !== undefined) expect(checkPack(world.file)._tag).toBe('Good');
  expect(world.out.length).toBeLessThanOrEqual(1);
  expect(world.machine.current === 0).toBe(world.out.length === 0);
  expect(world.machine.kept).toEqual(world.model.loaded ? world.model.kept : NOTHING_KEPT);
  for (const kept of [world.persisted, world.machine.kept]) {
    if (kept.version === '') continue;
    expect(world.file).toBeDefined();
    expect(world.fileVersions).toContain(kept.version);
  }
  if (world.machine.loaded) expect(world.machine.kept.version).toBe(versionIn(world.file));
};

const OUTCOMES: ReadonlyArray<Outcome> = [
  'well',
  'well',
  'well',
  'status',
  'refused',
  'cut',
  'flip',
  'format',
  'index',
];

const eventOf = (random: Random, world: World): Event => {
  const roll = random.below(20);
  if (roll < 6 && world.out.length > 0)
    return {
      _tag: 'answer',
      outcome: random.pick(OUTCOMES),
      writes: random.chance(0.85),
      cut: random.next(),
    };
  if (roll < 9) return { _tag: 'show' };
  if (roll < 11) return { _tag: 'retry' };
  if (roll < 13) return { _tag: 'days', ms: random.below(10) * DAY + random.below(DAY) };
  if (roll < 15) return { _tag: 'keep' };
  if (roll < 16) return { _tag: 'stray' };
  if (roll < 18) return { _tag: 'relaunch' };
  return { _tag: 'publish', pack: madePack(random, 12) };
};

describe('the download, model-based', () => {
  it('holds every invariant over generated histories', () => {
    const random = seeded(21);
    const seen = new Map<string, number>();
    for (let history = 0; history < HISTORIES; history++) {
      let world = worldOf(madePack(random, 12));
      for (let at = 0; at < EVENTS; at++) {
        const event = eventOf(random, world);
        const name =
          event._tag === 'answer' ? `answer:${event.outcome}:${event.writes}` : event._tag;
        seen.set(name, (seen.get(name) ?? 0) + 1);
        world = happen(world, event);
        holds(world);
      }
    }
    for (const outcome of ['well', 'status', 'refused', 'cut', 'flip', 'format', 'index'])
      expect(seen.get(`answer:${outcome}:true`) ?? 0).toBeGreaterThan(20);
    expect(seen.get('answer:well:false') ?? 0).toBeGreaterThan(20);
    for (const name of ['show', 'retry', 'days', 'keep', 'stray', 'relaunch', 'publish'])
      expect(seen.get(name) ?? 0).toBeGreaterThan(100);
  });

  it('holds every invariant in every order of a small alphabet, 6 deep', () => {
    const random = seeded(22);
    const first = madePack(random, 6);
    const second = madePack(random, 6);
    const alphabet = (world: World): ReadonlyArray<Event> => [
      { _tag: 'show' },
      { _tag: 'retry' },
      { _tag: 'days', ms: 8 * DAY },
      { _tag: 'keep' },
      { _tag: 'relaunch' },
      { _tag: 'publish', pack: world.server === first ? second : first },
      ...(world.out.length === 0
        ? []
        : ([
            { _tag: 'answer', outcome: 'well', writes: true, cut: 0 },
            { _tag: 'answer', outcome: 'well', writes: false, cut: 0 },
            { _tag: 'answer', outcome: 'cut', writes: true, cut: 0.5 },
          ] as const)),
    ];
    let walked = 0;
    const walk = (world: World, depth: number) => {
      walked++;
      if (depth === 0) return;
      for (const event of alphabet(world)) {
        const next = happen(world, event);
        holds(next);
        walk(next, depth - 1);
      }
    };
    walk(worldOf(first), 6);
    expect(walked).toBeGreaterThan(20_000);
  });

  it('a relaunch between the write and the version reads the new file under the old version, and fetches again', () => {
    const random = seeded(23);
    const first = madePack(random, 6);
    const second = { ...madePack(random, 6) };
    let world = worldOf(first);
    for (const event of [
      { _tag: 'show' },
      { _tag: 'answer', outcome: 'well', writes: true, cut: 0 },
      { _tag: 'keep' },
      { _tag: 'publish', pack: second },
      { _tag: 'days', ms: 8 * DAY },
      { _tag: 'show' },
      { _tag: 'answer', outcome: 'well', writes: true, cut: 0 },
      { _tag: 'relaunch' },
    ] as const satisfies ReadonlyArray<Event>)
      world = happen(world, event);
    expect(versionIn(world.file)).toBe(second.version);
    expect(world.persisted.version).toBe(first.version);
    world = happen(world, { _tag: 'show' });
    expect(world.out).toEqual([{ id: 1, version: second.version }]);
    world = happen(world, { _tag: 'answer', outcome: 'well', writes: true, cut: 0 });
    expect(world.file).toBe(bodyOf(second));
    world = happen(world, { _tag: 'keep' });
    expect(world.persisted.version).toBe(second.version);
    expect(versionIn(world.file)).toBe(second.version);
  });
});

describe('what Contract persists of every pack', () => {
  it("sets one pack's line and leaves every other pack's as it was", () => {
    const random = seeded(24);
    const names = ['commentary', 'crossrefs', 'lexicon', 'words'];
    let text = '';
    const model = new Map<string, Kept>();
    for (let at = 0; at < 400; at++) {
      const name = random.pick(names);
      const kept: Kept = {
        version: `${random.below(3000)}-${random.below(0xffffffff).toString(16).padStart(8, '0')}`,
        checkedAt: random.below(2 ** 40),
      };
      text = keptWith(text, name, kept);
      model.set(name, kept);
      for (const each of names) expect(keptIn(text, each)).toEqual(model.get(each) ?? NOTHING_KEPT);
    }
    expect(text.split('\n').length).toBe(model.size);
    expect(keptIn('', 'commentary')).toEqual(NOTHING_KEPT);
    expect(keptIn('commentary 3-0000abcd', 'commentary')).toEqual(NOTHING_KEPT);
    expect(keptWith('commentary 3-0000abcd 5', 'commentary', NOTHING_KEPT)).toBe('');
  });
});
