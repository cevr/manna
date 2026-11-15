/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, eslint/complexity, effect/maxCognitiveComplexity -- Exact's app folder cannot import effect (docs/exact.md): a model checker, a breadth-first search of every interleaving that names each action plainly, tells states apart by their JSON, and returns a broken property with its trace. */

/**
 * The protocol of `protocol.qnt`, checked exhaustively over `step` itself
 * (A3): the reader, one `audio` element per load and the platform (the lock
 * screen's play and pause, an interruption) act in any interleaving, and
 * each event the element raises reaches the player as its own call, late,
 * after any number of the reader's taps, the platform's acts and other
 * elements' events. Exact queues the calls of one mutation (`playerStepped
 * … queue`), so one element's events arrive in the order it raised them;
 * another element's come before or after them in any order. Each step's
 * answer is drawn before the next is stepped, so the element is told every
 * command (`render`), a seek as `fastSeek`, which it answers with `seeked`.
 * A `time` or `seeked` names the seek the element had last been told when
 * it raised it: the action reads `player.seek` as the event fires, and the
 * view's seek is the one `playerTook` last sent with `fastSeek`; the call
 * itself may be stepped any time later.
 *
 * The first hymn sings stanzas 1 and 3 of three (its choice restored at the
 * start), so its recording has one span to skip; the element plays on from
 * place to place, into that span and past it, and the reader may seek into
 * stanza 3. Every state reachable within `DEPTH` actions is visited once,
 * and in each:
 *
 * - never two loads sounding: once every event is stepped, the element that
 *   sounds is the held load's, and only while the player wants to hear it;
 * - a pause is never undone by a late device event: after the reader's
 *   pause, with no play, resume, retry or remote play since, once every
 *   event is stepped the player is paused and the element silent;
 * - a remote pause during a skip stays paused: the same, after the lock
 *   screen's pause or an interruption;
 * - settled, the element does what the reader last asked: after a reader's
 *   ask that turned the player to play, with no pause, stop or platform
 *   act since, once every event is stepped the player wants to hear and the
 *   element sounds (a failed load aside);
 * - a resume is never undone by a late echo;
 * - a stale event is inert: an event of any load but the held one changes
 *   nothing;
 * - a seek is never undone by a late time: a `time` the element raised
 *   before it was told the player's latest seek leaves the place within a
 *   second of the place sent;
 * - a skip and a reader's seek sent at once end at the reader's place: when
 *   the reader's seek is the last seek sent, once every event is stepped
 *   the element and the player stand where the reader sent them.
 */

import { describe, expect, it } from 'bun:test';

import { TRACKS } from './fixtures.testing.ts';
import { type Input, type State, deviceOf, initial, step } from './step.ts';

/** The gate's depth keeps the unit task under its second; the round gate searches deeper by `PROTOCOL_DEPTH`. */
const DEPTH = Number(process.env['PROTOCOL_DEPTH'] ?? 10);
const INBOX = 4;

/** The places the element plays through, in the recording's seconds: the third is in the span stanza 2 leaves. */
const PLAYS = [0.6, 2.4, 3, 4.6, 6] as const;
/** Where the reader seeks: 3 s of the cut, inside stanza 3, at 5 s of the recording. */
const READER_SEEK = 3;
/** The recording's length. */
const LENGTH = 6;

/** An event the element raised, not yet stepped. */
interface Event {
  readonly _tag:
    | 'loaded'
    | 'played'
    | 'playing'
    | 'paused'
    | 'waiting'
    | 'ended'
    | 'failed'
    | 'time'
    | 'seeked';
  readonly id: number;
  /** The element raised it doing what the player told it, not on the platform's act. */
  readonly echo?: true;
  /** A time's place. */
  readonly place?: number;
  /** The last seek the element had been told when it raised this. */
  readonly told?: number;
}

interface Element {
  readonly id: number;
  readonly sounding: boolean;
  /** It failed: it never plays again. */
  readonly broken: boolean;
  /** Where it is, in the recording's seconds. */
  readonly place: number;
  /** The last seek it was told. */
  readonly told: number;
}

interface World {
  readonly player: State;
  readonly element: Element | undefined;
  readonly inbox: ReadonlyArray<Event>;
  /** The reader paused, and nothing since asked to hear. */
  readonly held: boolean;
  /** The lock screen paused, or an interruption, and nothing since asked to hear. */
  readonly stopped: boolean;
  /**
   * The reader's ask turned the player to play (a resume, or a new load),
   * and since then neither the reader nor the platform stopped it (no pause
   * or stop, no element paused, ended or failed). An ask the player already
   * held changes nothing, so it sets nothing here.
   */
  readonly hearing: boolean;
  /** The last seek sent was the reader's, to this place, and the element has not played on since. */
  readonly sent: number | undefined;
}

const asInput = (event: Event, player: State): Input => {
  if (event._tag === 'loaded') return { _tag: 'loaded', id: event.id, duration: LENGTH };
  if (event._tag === 'failed') return { _tag: 'failed', id: event.id, why: 'network' };
  const serial = event.told ?? player.held?.seek ?? 0;
  if (event._tag === 'time')
    return { _tag: 'time', id: event.id, serial, seconds: event.place ?? 0 };
  if (event._tag === 'seeked') return { _tag: 'seeked', id: event.id, serial };
  return { _tag: event._tag, id: event.id };
};

const raise = (world: World, element: Element | undefined, events: ReadonlyArray<Event>) =>
  world.inbox.length + events.length > INBOX
    ? undefined
    : { ...world, element, inbox: [...world.inbox, ...events] };

const starts = (id: number, echo: boolean): ReadonlyArray<Event> => [
  echo ? { _tag: 'played', id, echo } : { _tag: 'played', id },
  { _tag: 'playing', id },
];

/**
 * `world` with `input` stepped and its answer drawn: the view sets the
 * element's properties only where the answer changed them, as Exact
 * patches a node, so an element the platform paused stays paused until the
 * player asks it to play again; a new seek is a `fastSeek`, answered by
 * `seeked`.
 */
const stepped = (world: World, input: Input): World | undefined => {
  const { state: player, command } = step(world.player, input);
  const wanted = deviceOf(player);
  const told = { ...world, player };
  const { element } = world;
  if (JSON.stringify(wanted) === JSON.stringify(deviceOf(world.player))) return told;
  if (wanted === undefined) return { ...told, element: undefined, sent: undefined };
  if (element?.id !== wanted.load) {
    const id = wanted.load;
    const loaded: Event = { _tag: 'loaded', id };
    return raise(
      { ...told, sent: undefined },
      { id, sounding: !wanted.paused, broken: false, place: wanted.from, told: wanted.seek },
      wanted.paused ? [loaded] : [loaded, ...starts(id, true)],
    );
  }
  if (command?._tag === 'seek') {
    const moved = { ...element, place: command.seconds, told: command.serial };
    return raise({ ...told, sent: command.skip ? undefined : command.seconds }, moved, [
      { _tag: 'seeked', id: element.id, echo: true, told: command.serial },
    ]);
  }
  if (element.broken || element.sounding !== wanted.paused) return told;
  if (wanted.paused)
    return raise(told, { ...element, sounding: false }, [
      { _tag: 'paused', id: element.id, echo: true },
    ]);
  return raise(told, { ...element, sounding: true }, starts(element.id, true));
};

const READER: ReadonlyArray<Input> = [
  { _tag: 'play', track: TRACKS[0]! },
  { _tag: 'play', track: TRACKS[1]! },
  { _tag: 'pause' },
  { _tag: 'resume' },
  { _tag: 'retry' },
  { _tag: 'stop' },
  { _tag: 'seekTo', seconds: READER_SEEK },
];

const nameOf = (input: Input) =>
  input._tag === 'play' ? `reader play ${input.track.number}` : `reader ${input._tag}`;

/** `world` after the reader's `input`, its `held` and `hearing` kept, if the inbox has room. */
const byReader = (world: World, input: Input): World | undefined => {
  const after = stepped(world, input);
  if (after === undefined) return undefined;
  const asks = input._tag === 'play' || input._tag === 'resume' || input._tag === 'retry';
  const held =
    after.player.held !== undefined &&
    (input._tag === 'pause'
      ? (world.player.held?.wants === 'play' && after.player.held.wants === 'pause') || world.held
      : !asks && world.held);
  const asked =
    asks &&
    after.player.held?.wants === 'play' &&
    (world.player.held?.wants !== 'play' || after.player.held.load !== world.player.held.load);
  const hearing = asked || (input._tag !== 'pause' && input._tag !== 'stop' && world.hearing);
  return {
    ...after,
    held: input._tag === 'stop' ? false : held,
    stopped: asks || input._tag === 'stop' ? false : after.stopped,
    hearing,
  };
};

/**
 * `world` after the platform's own `input` (the lock screen's, an
 * interruption): the platform acts on the element first, which reports it
 * as its own event, and the player is told.
 */
const byPlatform = (world: World, input: Input): World | undefined => {
  const pausing =
    input._tag === 'interrupted' || (input._tag === 'remote' && input.action === 'pause');
  const { element } = world;
  let acted: World | undefined = world;
  if (element !== undefined && !element.broken && element.sounding === pausing)
    acted = pausing
      ? raise(world, { ...element, sounding: false }, [{ _tag: 'paused', id: element.id }])
      : raise(world, { ...element, sounding: true }, starts(element.id, false));
  if (acted === undefined) return undefined;
  const after = stepped(acted, input);
  if (after === undefined) return undefined;
  if (pausing)
    return {
      ...after,
      stopped:
        after.player.held !== undefined &&
        ((world.player.held?.wants === 'play' && after.player.held.wants === 'pause') ||
          world.stopped),
      hearing: false,
    };
  return { ...after, stopped: false, held: false };
};

/** The element's next place as it plays on. */
const onwards = (place: number) => PLAYS.find((each) => each > place);

/** Every action enabled in `world`, named, with the world after it. */
const actions = (world: World): ReadonlyArray<readonly [string, World]> => {
  const out: Array<readonly [string, World]> = [];
  const add = (name: string, after: World | undefined) => {
    if (after !== undefined) out.push([name, after]);
  };

  for (const input of READER) add(nameOf(input), byReader(world, input));
  add('platform remote pause', byPlatform(world, { _tag: 'remote', action: 'pause' }));
  add('platform remote play', byPlatform(world, { _tag: 'remote', action: 'play' }));
  add('platform interrupts', byPlatform(world, { _tag: 'interrupted' }));

  const { element } = world;
  const stopped = (after: World | undefined) => after && { ...after, hearing: false };
  if (element?.sounding === true) {
    const { id } = element;
    add('element waits', raise(world, element, [{ _tag: 'waiting', id }]));
    const next = onwards(element.place);
    if (next !== undefined)
      add(
        `element plays on to ${next}`,
        raise({ ...world, sent: undefined }, { ...element, place: next }, [
          { _tag: 'time', id, place: next, told: element.told },
        ]),
      );
    const silent = { ...element, sounding: false };
    add('element ends', stopped(raise(world, silent, [{ _tag: 'ended', id }])));
    add(
      'element fails',
      stopped(raise(world, { ...silent, broken: true }, [{ _tag: 'failed', id }])),
    );
    add('platform pauses', stopped(raise(world, silent, [{ _tag: 'paused', id }])));
  }
  if (element?.sounding === false && !element.broken) {
    const after = raise(world, { ...element, sounding: true }, starts(element.id, false));
    add('platform plays', after && { ...after, held: false, stopped: false });
  }

  for (const id of new Set(world.inbox.map((event) => event.id))) {
    const at = world.inbox.findIndex((event) => event.id === id);
    const event = world.inbox[at]!;
    const rest = { ...world, inbox: world.inbox.filter((_, index) => index !== at) };
    const told = event.told === undefined ? '' : ` told ${event.told}`;
    add(
      `deliver ${event.echo ? 'echo ' : ''}${event._tag} ${id}${told}`,
      stepped(rest, asInput(event, world.player)),
    );
  }
  return out;
};

/** A world as its states are told apart: a step's count aside. */
const keyOf = (world: World) =>
  JSON.stringify([
    world.player.held === undefined
      ? undefined
      : { ...world.player.held, track: world.player.held.track.number },
    world.player.loads,
    world.player.seeks,
    world.element,
    world.inbox,
    world.held,
    world.stopped,
    world.hearing,
    world.sent,
  ]);

const without = (state: State) =>
  JSON.stringify({ ...state, steps: 0, held: state.held && { ...state.held, track: 0 } });

/** The broken property in `world` after `name` from `before`, if one is. */
const broken = (before: World, name: string, world: World): string | undefined => {
  const { held } = world.player;
  const settled = world.inbox.length === 0;
  const sounds = world.element?.sounding === true;
  if (settled && sounds && (held?.load !== world.element?.id || held?.wants !== 'play'))
    return 'never two loads sounding';
  const silent = held?.phase === 'paused' || held?.phase === 'ended' || held?.phase === 'failed';
  const quiet = !silent || (held?.phase === 'paused' && held.wants !== 'pause') || sounds;
  if (settled && world.held && quiet) return 'a pause is never undone by a late device event';
  if (settled && world.stopped && quiet) return 'a remote pause during a skip stays paused';
  if (settled && world.hearing && held?.phase !== 'failed' && (held?.wants !== 'play' || !sounds))
    return 'settled, the element does what the reader last asked';
  const echo = /^deliver echo (?:played|paused|playing|waiting) (\d+)$/u.exec(name);
  if (
    echo !== null &&
    before.hearing &&
    Number(echo[1]) === before.player.held?.load &&
    world.player.held?.wants !== 'play'
  )
    return 'a resume is never undone by a late echo';
  const delivered = /^deliver (?:echo )?\w+ (\d+)/u.exec(name);
  if (
    delivered !== null &&
    Number(delivered[1]) !== before.player.held?.load &&
    without(world.player) !== without(before.player)
  )
    return 'a stale event is inert';
  const late = /^deliver time (\d+) told (\d+)$/u.exec(name);
  const was = before.player.held;
  if (
    late !== null &&
    was !== undefined &&
    held !== undefined &&
    Number(late[1]) === was.load &&
    Number(late[2]) < was.seek &&
    held.load === was.load &&
    held.seek === was.seek &&
    Math.abs(held.at - was.sought) >= 1
  )
    return 'a seek is never undone by a late time';
  if (
    settled &&
    world.sent !== undefined &&
    held !== undefined &&
    world.element?.id === held.load &&
    (held.sought !== world.sent || world.element.place !== world.sent)
  )
    return 'a skip and a reader’s seek sent at once end at the reader’s place';
  return undefined;
};

/** Every reachable world within `depth`, or the first trace that breaks a property. */
export const explore = (depth: number) => {
  const start: World = {
    player: step(initial, { _tag: 'restore', choices: { '1': [1, 3] } }).state,
    element: undefined,
    inbox: [],
    held: false,
    stopped: false,
    hearing: false,
    sent: undefined,
  };
  const seen = new Set<string>([keyOf(start)]);
  let frontier: ReadonlyArray<readonly [World, ReadonlyArray<string>]> = [[start, []]];
  const named = new Set<string>();
  for (let level = 0; level < depth; level++) {
    const next: Array<readonly [World, ReadonlyArray<string>]> = [];
    for (const [world, trace] of frontier)
      for (const [name, after] of actions(world)) {
        named.add(name.replace(/\d+/gu, 'n'));
        const path = [...trace, name];
        const rule = broken(world, name, after);
        if (rule !== undefined) return { states: seen.size, named, broken: { rule, trace: path } };
        const key = keyOf(after);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push([after, path]);
      }
    frontier = next;
  }
  return { states: seen.size, named, broken: undefined };
};

describe('the protocol (protocol.qnt) holds in every interleaving', () => {
  it(`keeps its eight properties in every state within ${DEPTH} actions`, () => {
    const { states, named, broken: found } = explore(DEPTH);
    expect(found).toBeUndefined();
    expect(states).toBeGreaterThan(10_000);
    for (const action of [
      'reader seekTo',
      'platform remote pause',
      'platform remote play',
      'platform interrupts',
      'element plays on to n.n',
      'deliver time n told n',
      'deliver echo seeked n told n',
    ])
      expect(named).toContain(action);
  });
});
