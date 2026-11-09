/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the walk plays each generated device's rounds one after another through promise-run calls; the app's forked Effect work runs on the host's clock, so each wait looks again every millisecond until the state it waits on lands, at most 2 s; the disk and the recognizer's flags are plain values a step changes; it switches the host's zone through `process.env.TZ` and puts it back, writes expected values as plain branches, and compares values as JSON text. */

/**
 * A Minutes making while the held item's recital listens or finishes, at
 * the session seam: no reader reaches one from the screen (while a recital
 * listens Today shows no `Your field`, and the Settings sheet is on home
 * alone), so the walk makes it through `Session.choose` over the app's own
 * layer (`appLayer`): Say it is `pressToday` over the real Dictation and
 * SayIt, its recognizer scripted (heard or unheard at `finish`, its end held
 * back while finishing until released), the store in memory and able to
 * refuse recall writes, the clock the test's.
 *
 * Generated devices, each four to six short pieces in two groups or (two in
 * five) a crowded garden of four long pieces in one group and one in
 * another, planted 20-60 days back, 10 or 20 minutes stored, in a zone of
 * `ZONES`, play up to five rounds: Say it on the item the model shows, its
 * recital listening or finishing; a Minutes making with the model's plan
 * made at that instant and the hold kept (`madeModel(…, true)`); the
 * recital ended heard, unheard, refused or cancelled; then `Next`. Each
 * ending at each moment, the held item placed first by the new plan with no
 * hold (`kept`) or not (`moved`), is a cell. After every step the session's
 * plan equals `planModel` at the last making, its hold the model's, and
 * `shownOf` the held item with its own piece while held, else the model's
 * first open item, else `Done`.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Exit, Layer, Logger, MutableRef, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { appLayer, pressToday } from '../app';
import { Dictation, DictationSource, type DictationEvent } from '../dictation';
import { CHAIN } from '../dictation/attempt';
import { recite } from '../dictation/script';
import { Chime, Garden } from '../garden';
import { sourceWords } from '../matcher/words';
import { Haptics, type Recall } from '../sayit';
import { MINUTES, type Minutes, type TextPiece } from '../session';
import { clockOf } from '../test/clock';
import { below, keyOf, pickOf, PREFIX, random } from '../test/garden-model';
import {
  madeModel,
  nextModel,
  NO_RUN,
  shownModel,
  startedModel,
  type RunModel,
} from '../test/run-model';
import { DAY, HOUR, MINUTE, type ModelItem, planModel } from '../test/session-model';
import { hostZone, offsetIn, restore, travel, ZONES } from '../test/zone';
import { VoiceSource, VoiceUnavailable } from '../voice';
import { shownOf } from './run';
import { MINUTES_KEY, Session } from './service';

const DEVICES = 16;
const ROUNDS = 5;
const SEED = 1;
const T0 = Date.UTC(2026, 4, 4, 13);
const HOWS = ['heard', 'unheard', 'refused', 'cancelled'] as const;
type How = (typeof HOWS)[number];
const ATS = ['listening', 'finishing'] as const;
type At = (typeof ATS)[number];
type Placed = 'moved' | 'kept';
const WORDS = ['amber', 'brook', 'cedar', 'dawn', 'ember', 'fern', 'grove', 'heron'] as const;

/** A making under way: the moment, the ending, and where the new plan with no hold places the held item. */
interface Cell {
  readonly how: How;
  readonly at: At;
  readonly placed: Placed;
  readonly key: string;
}

/** The 14 cells of a making under a recital: each ending at each moment, placed `moved` or `kept`; a cancel ends a listening recital alone. */
const DURING_CELLS: readonly Cell[] = HOWS.flatMap((how) =>
  ATS.flatMap((at) =>
    (['moved', 'kept'] as const).map((placed) => ({
      how,
      at,
      placed,
      key: `cell:${at}:${how}:${placed}`,
    })),
  ),
).filter((cell) => !(cell.how === 'cancelled' && cell.at === 'finishing'));

/** Each case the walk must reach at least once. */
const FLOORS = [
  ...DURING_CELLS.map((cell) => cell.key),
  'held:minutes',
  'held:minutes:first',
  'held:minutes:left-out',
  'made:held-not-first',
  'held:minutes:listening',
  'held:minutes:finishing',
];

const json = <A>(value: A) => JSON.stringify(value);

const pieceOf = (
  next: () => number,
  reference: string,
  group: string,
  words: number,
): TextPiece => {
  const text = Array.from({ length: words }, () => pickOf(next, WORDS)).join(' ');
  return { reference, text, words: sourceWords(text).length, group };
};

/** A device's pieces: two in five a crowded garden, else four to six short pieces in two groups. */
const piecesOf = (next: () => number): TextPiece[] => {
  if (next() < 0.4)
    return [
      ...Array.from({ length: 4 }, (_, at) =>
        pieceOf(next, `Alder ${1 + at}:${1 + below(next, 9)}`, 'G0', 80 + below(next, 11)),
      ),
      pieceOf(next, `Birch 1:${1 + below(next, 9)}`, 'G1', 60 + below(next, 21)),
    ];
  return Array.from({ length: 4 + below(next, 3) }, (_, at) =>
    pieceOf(
      next,
      `Alder ${1 + at}:${1 + below(next, 9)}`,
      at === 1 || next() < 0.25 ? 'G1' : 'G0',
      2 + below(next, 11),
    ),
  );
};

const recordOf = (next: () => number, piece: TextPiece, startedAt: number, zone: string) => {
  const recall: Recall = {
    reference: piece.reference,
    startedAt,
    offset: offsetIn(zone, startedAt),
    grade: pickOf(next, [1, 2, 3, 4] as const),
    suggested: pickOf(next, [1, 2, 3] as const),
    words: piece.words,
    missed: 0,
    peeked: 0,
    extra: 0,
  };
  return [keyOf(recall), json(recall)] as const;
};

const plantsOf = (disk: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of disk)
    if (key.startsWith(PREFIX)) {
      const recall: Recall = JSON.parse(value);
      plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
    }
  return plants;
};

type Hearing = { readonly kind: 'heard'; readonly text: string } | { readonly kind: 'unheard' };

/** The end a finishing recital waits for: held back once `defer` is set, sent by `pending`. */
interface Ending {
  defer: boolean;
  pending: (() => void) | null;
}

/** A generated device: its pieces, its disk, the clock's instant, its zone, the minutes chosen, and the flags a step sets on the store and the recognizer. */
interface Device {
  readonly pieces: readonly TextPiece[];
  readonly disk: Map<string, string>;
  readonly time: { now: number };
  readonly zone: string;
  minutes: Minutes;
  refuse: boolean;
  readonly hearing: MutableRef.MutableRef<Hearing>;
  readonly ending: Ending;
}

/** `run-rig`'s recognizer with no screen: at `finish` it recites what `hearing` holds or fails unheard, at once or, deferred, when released. */
const recognizerOf = (hearing: MutableRef.MutableRef<Hearing>, ending: Ending) => {
  const listener = MutableRef.make<((event: DictationEvent) => void) | null>(null);
  const open = MutableRef.make<number | null>(null);
  const emit = (event: DictationEvent) => MutableRef.get(listener)?.(event);
  const event = (session: number, kind: DictationEvent['kind']): DictationEvent => ({
    session,
    kind,
    final: false,
    runs: [],
    reason: '',
  });
  return Layer.succeed(
    DictationSource,
    DictationSource.of({
      engines: () => Effect.succeed(CHAIN.map((engine) => ({ engine, status: 'ready' }))),
      listen: (session) =>
        Effect.sync(() => {
          MutableRef.set(open, session);
          emit(event(session, 'start'));
        }),
      finish: Effect.sync(() => {
        const session = MutableRef.get(open);
        MutableRef.set(open, null);
        if (session === null) return;
        const heard = MutableRef.get(hearing);
        const send = () => {
          if (heard.kind === 'unheard') {
            emit({ ...event(session, 'fail'), reason: 'test: unheard' });
            return;
          }
          for (const step of recite(heard.text, { every: 5, pace: 1 }))
            emit({ ...event(session, 'result'), final: step.final, runs: step.runs });
          emit(event(session, 'end'));
        };
        if (!ending.defer) return send();
        ending.defer = false;
        ending.pending = send;
      }),
      cancel: Effect.sync(() => MutableRef.set(open, null)),
      subscribe: (next) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => MutableRef.set(listener, next)),
            () => Effect.sync(() => MutableRef.set(listener, null)),
          ),
        ),
    }),
  );
};

const silentVoice = Layer.succeed(
  VoiceSource,
  VoiceSource.of({
    voices: Effect.succeed([]),
    speak: () => Effect.fail(VoiceUnavailable.make({ reason: 'test' })),
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.void,
    subscribe: () => Effect.void,
  }),
);

/** A device's first state: its pieces planted once or twice each 20-60 days back, and 10 or 20 minutes stored. */
const deviceOf = (next: () => number): Device => {
  const zone = pickOf(next, ZONES);
  travel(zone);
  const time = { now: T0 + below(next, 60) * DAY + below(next, 24) * HOUR };
  const pieces = piecesOf(next);
  const disk = new Map<string, string>();
  for (const piece of pieces)
    for (let n = 1 + below(next, 2); n > 0; n--) {
      const [key, value] = recordOf(
        next,
        piece,
        time.now - (20 + below(next, 40)) * DAY - below(next, 20) * HOUR,
        zone,
      );
      disk.set(key, value);
    }
  const minutes = pickOf(next, [10, 20] as const);
  disk.set(MINUTES_KEY, String(minutes));
  return {
    pieces,
    disk,
    time,
    zone,
    minutes,
    refuse: false,
    hearing: MutableRef.make<Hearing>({ kind: 'unheard' }),
    ending: { defer: false, pending: null },
  };
};

/** The device's store: its disk, refusing recall writes while `refuse` is set. */
const storeOf = (device: Device) =>
  KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => device.disk.get(key)),
    set: (key, value) =>
      Effect.suspend(() => {
        if (device.refuse && key.startsWith(PREFIX))
          return Effect.fail(
            new KeyValueStore.KeyValueStoreError({ message: 'test', method: 'set', key }),
          );
        device.disk.set(key, value);
        return Effect.void;
      }),
    remove: (key) => Effect.sync(() => void device.disk.delete(key)),
    clear: Effect.sync(() => device.disk.clear()),
    size: Effect.sync(() => device.disk.size),
    keys: Effect.sync(() => [...device.disk.keys()]),
  });

/** The app's layer over the device, as the app builds it, with a silent voice, haptics and chime. */
const layerOf = (device: Device) =>
  appLayer({
    source: recognizerOf(device.hearing, device.ending),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.succeed(KeyValueStore.KeyValueStore, storeOf(device)),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: silentVoice,
    pieces: device.pieces,
  }).pipe(Layer.provideMerge(Layer.merge(clockOf(device.time), Logger.layer([]))));

type Services = Layer.Success<ReturnType<typeof layerOf>>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

/** Whether `holds` comes true within `ms`, looked at each millisecond. */
const until = async (holds: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!holds()) {
    if (Date.now() - start > ms) return false;
    await tick();
  }
  return true;
};

/** A round's draw: the ending, the moment, and the minutes chosen. */
interface Aim {
  readonly how: How;
  readonly at: At;
  readonly chosen: Minutes;
}

/** One device's walk: the device, the live layer, and the run model beside it. */
class Walk {
  readonly next: () => number;
  readonly tally: Map<string, number>;
  readonly failures: string[];
  readonly device: Device;
  readonly services: Context.Context<Services>;
  readonly trail: string[];
  model: RunModel = NO_RUN;

  constructor(
    next: () => number,
    tally: Map<string, number>,
    failures: string[],
    device: Device,
    services: Context.Context<Services>,
  ) {
    this.next = next;
    this.tally = tally;
    this.failures = failures;
    this.device = device;
    this.services = services;
    this.trail = [
      `launch(${device.zone},${new Date(device.time.now).toISOString()},${device.minutes} min)`,
    ];
  }

  run<A>(effect: Effect.Effect<A, never, Services>) {
    return Effect.runPromise(Effect.provideContext(effect, this.services));
  }

  get session() {
    return Context.get(this.services, Session);
  }

  get dictation() {
    return Context.get(this.services, Dictation);
  }

  get garden() {
    return Context.get(this.services, Garden);
  }

  status() {
    return Effect.runSync(this.dictation.view).status;
  }

  bump(key: string) {
    this.tally.set(key, (this.tally.get(key) ?? 0) + 1);
  }

  fail(message: string) {
    this.failures.push(`${message}\n  after: ${this.trail.slice(-8).join(' | ')}`);
  }

  readonly recallsNow = (reference: string) =>
    plantsOf(this.device.disk).get(reference)?.length ?? 0;

  /** The model's plan made now at `minutes`. */
  planAt(minutes: Minutes) {
    return planModel({
      plants: plantsOf(this.device.disk),
      pieces: this.device.pieces,
      at: this.device.time.now,
      offset: offsetIn(this.device.zone, this.device.time.now),
      minutes,
    }).items;
  }

  /** Where the plan made now at `minutes` with no hold places `reference`: shown first (`kept`) or not (`moved`). */
  placedAt(reference: string, minutes: Minutes): Placed {
    return shownModel({ plan: this.planAt(minutes), hold: null }, this.recallsNow)?.reference ===
      reference
      ? 'kept'
      : 'moved';
  }

  /** The session against the models: its plan, its hold, and what Today shows. */
  async check(step: string) {
    this.trail.push(step);
    const view = await this.run(this.session.view);
    const read = await this.run(this.garden.view);
    if (read._tag !== 'Read') return this.fail(`${step}: the garden unread`);
    const text = (item: Pick<ModelItem, 'reference' | 'fresh' | 'recalls'>) =>
      `${item.reference}/${item.fresh}/${item.recalls}`;
    const plan = Option.match(view.plan, {
      onNone: () => null,
      onSome: (made) => made.items.map(text),
    });
    const want = this.model.plan?.map(text) ?? null;
    if (json(plan) !== json(want)) this.fail(`${step}: plan ${json(plan)}, model ${json(want)}`);
    const held = Option.match(view.held, { onNone: () => null, onSome: (item) => item.reference });
    const wantHeld = this.model.hold?.reference ?? null;
    if (held !== wantHeld) this.fail(`${step}: held ${held}, model ${wantHeld}`);
    const shown = shownOf(view, Option.some(read));
    const wantShown = shownModel(this.model, this.recallsNow);
    const seen = shown._tag === 'Item' ? `${shown.piece.reference}|${shown.held}` : shown._tag;
    const expected =
      wantShown === null ? 'Done' : `${wantShown.reference}|${this.model.hold !== null}`;
    if (seen !== expected) this.fail(`${step}: Today shows ${seen}, model ${expected}`);
    const heldPiece = this.device.pieces.find(
      (each) => each.reference === this.model.hold?.reference,
    );
    if (heldPiece !== undefined && shown._tag === 'Item' && shown.piece.text !== heldPiece.text)
      this.fail(`${step}: ${heldPiece.reference} shown with another text`);
  }

  /** Say it on `piece`, the plan's item for it held in the same step, as Today's button presses it. */
  async press(piece: TextPiece) {
    const view = await this.run(this.session.view);
    const planned = Option.flatMap(view.plan, (made) =>
      Option.fromNullishOr(made.items.find((each) => each.reference === piece.reference)),
    );
    Effect.runFork(Effect.provideContext(pressToday(piece, planned), this.services));
  }

  /** The first press on `piece`, the model's hold taken, and its recital listening; false (a fault) when it never listens. */
  async say(piece: TextPiece) {
    this.model = startedModel(this.model, this.recallsNow);
    await this.press(piece);
    if (await until(() => this.status() === 'listening')) return true;
    this.fail(`${piece.reference}: never listened`);
    return false;
  }

  /** `Next`, the model's hold dropped, and a minute on. */
  async moveOn() {
    await this.run(this.session.next);
    this.model = nextModel(this.model);
    await this.check('Next');
    this.device.time.now += MINUTE;
  }

  /** A making with the plan done: the minutes drawn, an hour on. */
  async makeDone() {
    this.device.minutes = pickOf(this.next, MINUTES);
    this.device.time.now += HOUR;
    await this.run(this.session.choose(this.device.minutes));
    this.model = madeModel(this.model, this.planAt(this.device.minutes), false);
    await this.check(`${this.device.minutes} min, the plan done`);
  }

  /** A heard recital of `piece` with no making, then `Next`, so a later item can be placed `moved`. */
  async plain(piece: TextPiece) {
    MutableRef.set(this.device.hearing, { kind: 'heard', text: piece.text });
    const startedAt = this.device.time.now;
    if (!(await this.say(piece))) return false;
    await this.press(piece);
    if (
      !(await until(() => this.device.disk.has(keyOf({ reference: piece.reference, startedAt }))))
    )
      this.fail(`${piece.reference}: no recall kept`);
    await this.check(`a plain recital of ${piece.reference}`);
    await this.moveOn();
    this.bump('plain');
    return true;
  }

  /** The cells still open that a making for `reference` can reach, each with the minutes that place it so. */
  openFor(reference: string) {
    return DURING_CELLS.filter((cell) => (this.tally.get(cell.key) ?? 0) === 0).flatMap((cell) => {
      const ms = MINUTES.filter((m) => this.placedAt(reference, m) === cell.placed);
      return ms.length === 0 ? [] : [{ cell, ms }];
    });
  }

  /** The round's draw: an open cell, `moved` first, at the fewest minutes leaving the item out until one has. */
  aimOf(reference: string, open: ReturnType<Walk['openFor']>): Aim {
    const moved = open.filter((each) => each.cell.placed === 'moved');
    const pool = moved.length > 0 ? moved : open;
    const aim =
      pool.length > 0 && this.next() < 0.85 ? pool[below(this.next, pool.length)] : undefined;
    const how: How = aim?.cell.how ?? pickOf(this.next, HOWS);
    const at: At =
      aim?.cell.at ?? (how === 'cancelled' || this.next() < 0.5 ? 'listening' : 'finishing');
    const ms = aim?.ms ?? MINUTES;
    const leaving = ms.filter((m) => !this.planAt(m).some((each) => each.reference === reference));
    const chosen =
      (this.tally.get('held:minutes:left-out') ?? 0) === 0 && leaving.length > 0
        ? (leaving[0] ?? 2)
        : (ms[below(this.next, ms.length)] ?? 2);
    return { how, at, chosen };
  }

  /** The making under way: `Session.choose`, the model's plan made at that instant with the hold kept, the minutes written, the recital still `at`. */
  async making(item: ModelItem, { at, chosen }: Aim) {
    const before = this.model.hold;
    this.device.minutes = chosen;
    await this.run(this.session.choose(chosen));
    this.model = madeModel(this.model, this.planAt(chosen), true);
    if (!(await until(() => this.device.disk.get(MINUTES_KEY) === String(chosen))))
      this.fail(`${chosen} min while ${at}: the minutes not written`);
    const index = (this.model.plan ?? []).findIndex((each) => each.reference === before?.reference);
    this.bump('held:minutes');
    this.bump(`held:minutes:${at}`);
    if (index < 0) this.bump('held:minutes:left-out');
    else this.bump(index === 0 ? 'held:minutes:first' : 'held:minutes:later');
    const placed = this.placedAt(item.reference, chosen);
    if (placed === 'moved') this.bump('made:held-not-first');
    await this.check(`${chosen} min while ${at}`);
    if (this.status() !== at)
      this.fail(`${chosen} min while ${at}: the recital is ${this.status()} after the making`);
    return placed;
  }

  /** The recital's end of the kind drawn, then the recall kept exactly when heard. */
  async end(piece: TextPiece, { how, at }: Aim, startedAt: number) {
    if (how === 'cancelled') await this.run(this.dictation.cancel);
    else if (at === 'listening') await this.press(piece);
    else this.device.ending.pending?.();
    this.device.ending.pending = null;
    if (!(await until(() => this.status() === 'idle')))
      this.fail(`${how}: the recital never ended`);
    const key = keyOf({ reference: piece.reference, startedAt });
    if (how === 'heard') await until(() => this.device.disk.has(key));
    else await until(() => false, 5);
    this.device.refuse = false;
    if (this.device.disk.has(key) !== (how === 'heard'))
      this.fail(`${how}: recall kept ${this.device.disk.has(key)}`);
  }

  /** A round with a making under way: Say it, listening or finishing, the making, the ending, `Next`. */
  async under(item: ModelItem, piece: TextPiece, aim: Aim) {
    MutableRef.set(
      this.device.hearing,
      aim.how === 'unheard' ? { kind: 'unheard' } : { kind: 'heard', text: piece.text },
    );
    this.device.refuse = aim.how === 'refused';
    const startedAt = this.device.time.now;
    if (!(await this.say(piece))) return false;
    if (aim.at === 'finishing') {
      this.device.ending.defer = true;
      await this.press(piece);
      if (!(await until(() => this.status() === 'finishing'))) {
        this.fail(`${piece.reference}: never finishing`);
        return false;
      }
    }
    await this.check(`Say it on ${piece.reference}, ${aim.at}`);
    const placed = await this.making(item, aim);
    await this.end(piece, aim, startedAt);
    this.bump(`cell:${aim.at}:${aim.how}:${placed}`);
    await this.check(`${aim.how} ended`);
    await this.moveOn();
    return true;
  }

  /** One round on what the model shows; false once the walk must stop. */
  async round() {
    const item = shownModel(this.model, this.recallsNow);
    if (item === null) {
      await this.makeDone();
      return true;
    }
    const piece = this.device.pieces.find((each) => each.reference === item.reference);
    if (piece === undefined) {
      this.fail(`${item.reference} is no piece`);
      return false;
    }
    const open = this.openFor(item.reference);
    const movedLeft = DURING_CELLS.some(
      (cell) => cell.placed === 'moved' && (this.tally.get(cell.key) ?? 0) === 0,
    );
    if (open.every((each) => each.cell.placed !== 'moved') && movedLeft && this.next() < 0.7)
      return this.plain(piece);
    return this.under(item, piece, this.aimOf(item.reference, open));
  }
}

const playDevice = async (next: () => number, tally: Map<string, number>, failures: string[]) => {
  const device = deviceOf(next);
  const scope = Scope.makeUnsafe();
  const services = await Effect.runPromise(Layer.buildWithScope(layerOf(device), scope));
  const walk = new Walk(next, tally, failures, device, services);
  await walk.run(walk.garden.settled);
  await walk.run(walk.session.begin);
  walk.model = madeModel(NO_RUN, walk.planAt(device.minutes), false);
  await walk.check('begin');
  for (let round = 0; round < ROUNDS && failures.length === 0; round++)
    if (!(await walk.round())) break;
  await Effect.runPromise(Scope.close(scope, Exit.void));
};

/** Plays every device from one seed, the host's zone put back once they end, however they end. */
const playAll = (tally: Map<string, number>) => {
  const host = hostZone();
  const play = async () => {
    const failures: string[] = [];
    const next = random(SEED);
    for (let device = 0; device < DEVICES && failures.length === 0; device++)
      await playDevice(next, tally, failures);
    return failures;
  };
  return play().finally(() => restore(host));
};

describe('a Minutes making under a recital', () => {
  it('keeps the held item shown with its own piece while it listens or finishes, and its recall kept exactly when heard, over generated devices', async () => {
    const tally = new Map<string, number>();
    const failures = await playAll(tally);
    console.log(
      `coverage ${[...tally]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => `${key}=${count}`)
        .join(' ')}`,
    );
    expect(failures.slice(0, 2)).toEqual([]);
    expect(FLOORS.filter((key) => (tally.get(key) ?? 0) === 0)).toEqual([]);
  });
});
