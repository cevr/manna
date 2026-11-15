/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, eslint/complexity -- Exact's app folder cannot import effect (docs/exact.md): a model checker, a breadth-first search of every interleaving that names each action plainly, tells states apart by their JSON, and returns a broken property with its trace. */

/**
 * The protocol of `protocol.qnt`, checked exhaustively over `step` itself
 * (A3): the reader, one `audio` element per load and the platform (the lock
 * screen, an interruption) act in any interleaving, and each event the
 * element raises reaches the player as its own call, late, after any number
 * of the reader's taps, the platform's acts and other elements' events.
 * Exact queues the calls of one mutation (`playerStepped … queue`), so one
 * element's events arrive in the order it raised them; another element's
 * come before or after them in any order. Each step's answer is drawn before
 * the next is stepped, so the element is told every command (`render`).
 * Every state reachable within `DEPTH` actions is visited once, and in each:
 *
 * - never two loads sounding: once every event is stepped, the element that
 *   sounds is the held load's, and only while the player wants to hear it;
 * - a pause is never undone by a late device event: after the reader's
 *   pause, with no play, resume, retry or remote play since, once every
 *   event is stepped the player is paused and the element silent;
 * - settled, the element does what the reader last asked: after a reader's
 *   ask that turned the player to play, with no pause, stop or platform
 *   act since, once every event is stepped the player wants to hear and the
 *   element sounds (a failed load aside);
 * - a resume is never undone by a late echo: in that same span, no event
 *   the element raised doing what the player told it (its echo, known here
 *   by where it was raised, not by `step`'s `owed`) turns the player to
 *   pause, at any moment, settled or not;
 * - a stale event is inert: an event of any load but the held one changes
 *   nothing.
 */

import { describe, expect, it } from 'bun:test';

import { TRACKS } from './fixtures.testing.ts';
import { type Input, type State, deviceOf, initial, step } from './step.ts';

const DEPTH = 20;
const INBOX = 4;

/** An event the element raised, not yet stepped. */
interface Event {
  readonly _tag: 'loaded' | 'played' | 'playing' | 'paused' | 'waiting' | 'ended' | 'failed';
  readonly id: number;
  /** The element raised it doing what the player told it, not on the platform's act. */
  readonly echo?: true;
}

interface Element {
  readonly id: number;
  readonly sounding: boolean;
  /** It failed: it never plays again. */
  readonly broken: boolean;
}

interface World {
  readonly player: State;
  readonly element: Element | undefined;
  readonly inbox: ReadonlyArray<Event>;
  /** The reader paused, and nothing since asked to hear. */
  readonly held: boolean;
  /**
   * The reader's ask turned the player to play (a resume, or a new load),
   * and since then neither the reader nor the platform stopped it (no pause
   * or stop, no element paused, ended or failed). An ask the player already
   * held changes nothing, so it sets nothing here.
   */
  readonly hearing: boolean;
}

const asInput = (event: Event): Input => {
  if (event._tag === 'loaded') return { _tag: 'loaded', id: event.id, duration: 6 };
  if (event._tag === 'failed') return { _tag: 'failed', id: event.id, why: 'network' };
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
 * player asks it to play again.
 */
const stepped = (world: World, input: Input): World | undefined => {
  const player = step(world.player, input).state;
  const wanted = deviceOf(player);
  const told = { ...world, player };
  const { element } = world;
  if (JSON.stringify(wanted) === JSON.stringify(deviceOf(world.player))) return told;
  if (wanted === undefined) return { ...told, element: undefined };
  if (element?.id !== wanted.load) {
    const id = wanted.load;
    const loaded: Event = { _tag: 'loaded', id };
    return raise(
      told,
      { id, sounding: !wanted.paused, broken: false },
      wanted.paused ? [loaded] : [loaded, ...starts(id, true)],
    );
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
  return { ...after, held: input._tag === 'stop' ? false : held, hearing };
};

/** Every action enabled in `world`, named, with the world after it. */
const actions = (world: World): ReadonlyArray<readonly [string, World]> => {
  const out: Array<readonly [string, World]> = [];
  const add = (name: string, after: World | undefined) => {
    if (after !== undefined) out.push([name, after]);
  };

  for (const input of READER) add(nameOf(input), byReader(world, input));

  const { element } = world;
  const stopped = (after: World | undefined) => after && { ...after, hearing: false };
  if (element?.sounding === true) {
    const { id } = element;
    add('element waits', raise(world, element, [{ _tag: 'waiting', id }]));
    const silent = { id, sounding: false, broken: false };
    add('element ends', stopped(raise(world, silent, [{ _tag: 'ended', id }])));
    add(
      'element fails',
      stopped(raise(world, { ...silent, broken: true }, [{ _tag: 'failed', id }])),
    );
    add('platform pauses', stopped(raise(world, silent, [{ _tag: 'paused', id }])));
  }
  if (element?.sounding === false && !element.broken) {
    const after = raise(world, { ...element, sounding: true }, starts(element.id, false));
    add('platform plays', after && { ...after, held: false });
  }

  for (const id of new Set(world.inbox.map((event) => event.id))) {
    const at = world.inbox.findIndex((event) => event.id === id);
    const event = world.inbox[at]!;
    const rest = { ...world, inbox: world.inbox.filter((_, index) => index !== at) };
    add(`deliver ${event.echo ? 'echo ' : ''}${event._tag} ${id}`, stepped(rest, asInput(event)));
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
    world.element,
    world.inbox,
    world.held,
    world.hearing,
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
  if (
    settled &&
    world.held &&
    (!silent || (held?.phase === 'paused' && held.wants !== 'pause') || sounds)
  )
    return 'a pause is never undone by a late device event';
  if (settled && world.hearing && held?.phase !== 'failed' && (held?.wants !== 'play' || !sounds))
    return 'settled, the element does what the reader last asked';
  const echo = /^deliver echo \w+ (\d+)$/u.exec(name);
  if (
    echo !== null &&
    before.hearing &&
    Number(echo[1]) === before.player.held?.load &&
    world.player.held?.wants !== 'play'
  )
    return 'a resume is never undone by a late echo';
  const delivered = /^deliver (?:echo )?\w+ (\d+)$/u.exec(name);
  if (
    delivered !== null &&
    Number(delivered[1]) !== before.player.held?.load &&
    without(world.player) !== without(before.player)
  )
    return 'a stale event is inert';
  return undefined;
};

/** Every reachable world within `depth`, or the first trace that breaks a property. */
const explore = (depth: number) => {
  const start: World = {
    player: initial,
    element: undefined,
    inbox: [],
    held: false,
    hearing: false,
  };
  const seen = new Set<string>([keyOf(start)]);
  let frontier: ReadonlyArray<readonly [World, ReadonlyArray<string>]> = [[start, []]];
  for (let level = 0; level < depth; level++) {
    const next: Array<readonly [World, ReadonlyArray<string>]> = [];
    for (const [world, trace] of frontier)
      for (const [name, after] of actions(world)) {
        const path = [...trace, name];
        const rule = broken(world, name, after);
        if (rule !== undefined) return { states: seen.size, broken: { rule, trace: path } };
        const key = keyOf(after);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push([after, path]);
      }
    frontier = next;
  }
  return { states: seen.size, broken: undefined };
};

describe('the protocol (protocol.qnt) holds in every interleaving', () => {
  it(`keeps its five properties in every state within ${DEPTH} actions`, () => {
    const { states, broken: found } = explore(DEPTH);
    expect(found).toBeUndefined();
    expect(states).toBeGreaterThan(10_000);
  });
});
