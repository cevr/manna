/**
 * The sheet's rule over generated worlds: seeded sequences of what a reader
 * and the phone do (open, a permission read and answered, the app leaving and
 * coming back, the player sounding and falling quiet, the ear starting,
 * refusing and ending on its own, a tap, the close), each world answering the
 * sheet's work as the phone would. After every step:
 * - the microphone and the player never run at once;
 * - the microphone is never held with the sheet closed or the app away;
 * - a start is asked only while active, granted and quiet;
 * - the player is paused only as the sheet begins to wait on it, and the
 *   system asks for the microphone at most once in an opening.
 * Then the world settles (active, granted, quiet, every answer in) and an
 * open sheet ends up listening.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import {
  Event,
  feedFrame,
  feedOf,
  hintOf,
  holdsMicrophone,
  labelOf,
  latch,
  needleOf,
  opened,
  type Permission,
  Phase,
  type Session,
  stringLabel,
  step,
  TUNED_FRAMES,
  unlatched,
  Work,
} from './session';
import { detect } from './pitch';
import { reading, readingOn, STRINGS } from './tuning';

/** A seeded generator of numbers in [0, 1) (mulberry32). */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// oxlint-disable-next-line effect/noGlobals -- the run's seed comes from its shell, outside any Effect.
const SEED = Number(process.env['TUNER_SEED'] ?? 20261031);
const WORLDS = 300;
const EVENTS = 40;

/** The phone around the sheet: what is pending, and what holds the microphone and the speaker. */
interface World {
  permission: Permission;
  active: boolean;
  /** Another route covers the sheet. */
  covered: boolean;
  sounding: boolean;
  microphone: boolean;
  /** Answers the phone owes the sheet, delivered in a drawn order. */
  pending: Array<Event>;
  asks: number;
  /** Settling: every start is taken. */
  settling: boolean;
}

const PERMISSIONS: ReadonlyArray<Permission> = ['undetermined', 'granted', 'denied'];

const none = Option.none<string>();

/** The reader's answer to the system's ask: the permission from then on. */
const answer = (world: World, draw: () => number): Option.Option<string> => {
  world.asks += 1;
  if (world.asks > 1) return Option.some('asked twice in one opening');
  world.permission = 'denied';
  if (draw() < 0.7) world.permission = 'granted';
  world.pending.push(Event.Answered({ permission: world.permission }));
  return none;
};

const pause = (world: World, before: Session, draw: () => number): Option.Option<string> => {
  if (!world.sounding) return Option.some('paused a quiet player');
  if (Phase.$is('Pausing')(before.phase)) return Option.some('paused the player twice');
  if (draw() < 0.8) world.pending.push(Event.Sounding({ sounding: false }));
  return none;
};

const start = (world: World, attempt: number, draw: () => number): Option.Option<string> => {
  if (!world.active) return Option.some('started while away');
  if (world.covered) return Option.some('started while covered');
  if (world.sounding) return Option.some('started while the player sounds');
  // The ear refuses without the microphone (it changed in Settings since the read), and now and then for no reason.
  // A start takes the microphone as it resolves, whatever stop came while it was in flight.
  if (world.permission === 'granted' && (world.settling || draw() < 0.85))
    world.pending.push(Event.Started({ attempt }));
  else world.pending.push(Event.Refused({ attempt }));
  return none;
};

/** One piece of work, carried out as the phone would; a violation is named, else none. */
const carryOne = (
  world: World,
  before: Session,
  work: Work,
  draw: () => number,
): Option.Option<string> =>
  Work.$match(work, {
    ReadPermission: ({ check }) => {
      world.pending.push(Event.Read({ permission: world.permission, check }));
      return none;
    },
    AskPermission: () => answer(world, draw),
    PausePlayer: () => pause(world, before, draw),
    Start: ({ attempt }) => start(world, attempt, draw),
    Stop: () => {
      world.microphone = false;
      return none;
    },
  });

/** Carries out a step's work as the phone would; a violation is named, else none. */
const carry = (
  world: World,
  before: Session,
  after: Session,
  work: ReadonlyArray<Work>,
  draw: () => number,
): Option.Option<string> => {
  for (const each of work) {
    const broken = carryOne(world, before, each, draw);
    if (Option.isSome(broken)) return broken;
  }
  return violation(world, after);
};

/** What the phone holds after a step, against the rule. */
const violation = (world: World, after: Session): Option.Option<string> => {
  if (world.microphone && world.sounding) return Option.some('listening and playing at once');
  if (world.microphone && !world.active) return Option.some('listening while away');
  if (world.microphone && world.covered) return Option.some('listening while covered');
  if (world.microphone && Phase.$is('Closed')(after.phase))
    return Option.some('listening after the close');
  if (Phase.$is('Listening')(after.phase) && !world.microphone)
    return Option.some('listening with no microphone');
  return Option.none();
};

/**
 * An answer the phone owes, as it arrives: the paused player falls quiet; a start takes the
 * microphone as it resolves, and the ear, listening already, answers a start as started.
 */
const deliver = (world: World, owed: Event): Event => {
  if (Event.$is('Sounding')(owed)) world.sounding = owed.sounding;
  if (Event.$is('Refused')(owed) && world.microphone)
    return deliver(world, Event.Started({ attempt: owed.attempt }));
  if (Event.$is('Started')(owed)) world.microphone = true;
  return owed;
};

/** One drawn happening: an answer the phone owes, or something the reader or the phone does. */
const happening = (world: World, draw: () => number): Event => {
  const roll = draw();
  if (world.pending.length > 0 && roll < 0.45) {
    const at = Math.floor(draw() * world.pending.length);
    const owed = world.pending.splice(at, 1)[0] ?? Event.Tapped();
    // The paused player falls quiet as its answer comes in.
    return deliver(world, owed);
  }
  if (roll < 0.55) {
    world.active = !world.active;
    return Event.Active({ active: world.active });
  }
  if (roll < 0.68) {
    world.sounding = !world.sounding;
    return Event.Sounding({ sounding: world.sounding });
  }
  if (roll < 0.74 && world.microphone) {
    world.microphone = false;
    const reasons = ['interruption', 'route', 'failure'] as const;
    return Event.Ended({ reason: reasons[Math.floor(draw() * reasons.length)] ?? 'route' });
  }
  if (roll < 0.8) {
    // Changed in Settings, as the reader may while the app is away.
    world.permission = PERMISSIONS[Math.floor(draw() * PERMISSIONS.length)] ?? 'granted';
    return Event.Tapped();
  }
  if (roll < 0.88) return Event.Tapped();
  if (roll < 0.98) {
    // A hymn link or another route pushes over the sheet, or goes back off it.
    world.covered = !world.covered;
    return Event.Covered({ covered: world.covered });
  }
  return Event.Closed();
};

/** Runs the world `seed`, adding to `coveredIn` each phase a `Covered` event met. */
const run = (seed: number, coveredIn: Set<string>) => {
  const draw = seeded(seed);
  const world: World = {
    permission: PERMISSIONS[Math.floor(draw() * 3)] ?? 'granted',
    active: draw() < 0.9,
    covered: false,
    sounding: draw() < 0.4,
    microphone: false,
    pending: [],
    asks: 0,
    settling: false,
  };
  const trail: Array<string> = [];
  const first = opened(world.active, world.sounding);
  let session = first.session;
  const apply = (event: Event, next: { session: Session; work: ReadonlyArray<Work> }) => {
    if (Event.$is('Covered')(event)) coveredIn.add(session.phase._tag);
    trail.push(`${event._tag} -> ${next.session.phase._tag} [${next.work.map((w) => w._tag)}]`);
    const broken = carry(world, session, next.session, next.work, draw);
    session = next.session;
    return broken;
  };
  const opening = carry(world, session, session, first.work, draw);
  if (Option.isSome(opening)) return { seed, broken: opening.value, trail };
  for (let k = 0; k < EVENTS; k += 1) {
    const event = happening(world, draw);
    const broken = apply(event, step(session, event));
    if (Option.isSome(broken)) return { seed, broken: broken.value, trail };
  }
  const closed = Phase.$is('Closed')(session.phase);
  const settled = settle(world, (event) => apply(event, step(session, event)));
  if (Option.isSome(settled)) return { seed, broken: settled.value, trail };
  if (!closed && !Phase.$is('Listening')(session.phase))
    return { seed, broken: `settled in ${session.phase._tag}, not listening`, trail };
  return { seed, broken: 'none', trail: [] };
};

/** Settles the world: every answer in, the player quiet, granted in Settings and back from away, a tap if it ended. */
const settle = (
  world: World,
  apply: (event: Event) => Option.Option<string>,
): Option.Option<string> => {
  world.settling = true;
  for (let round = 0; round < 6; round += 1) {
    const due = world.pending.splice(0);
    if (world.sounding) due.push(Event.Sounding({ sounding: false }));
    if (round === 0 && world.covered) {
      world.covered = false;
      due.push(Event.Covered({ covered: false }));
    }
    if (round < 2) due.push(Event.Active({ active: false }), Event.Active({ active: true }));
    due.push(Event.Tapped());
    for (const owed of due) {
      const event = deliver(world, owed);
      if (Event.$is('Active')(event)) {
        world.active = event.active;
        if (!event.active) world.permission = 'granted';
      }
      const broken = apply(event);
      if (Option.isSome(broken)) return broken;
    }
  }
  return none;
};

describe('the tuner sheet’s rule', () => {
  it(`never listens and plays at once, nor away or closed, over ${WORLDS} generated worlds`, () => {
    const coveredIn = new Set<string>();
    const broken = Array.from({ length: WORLDS }, (_, k) => run(SEED + k, coveredIn)).filter(
      (world) => world.broken !== 'none',
    );
    expect(broken.slice(0, 1)).toEqual([]);
    // The worlds cover the sheet in every phase it can stand in.
    expect([...coveredIn].toSorted()).toEqual(
      [
        'Checking',
        'Asking',
        'Denied',
        'Pausing',
        'Starting',
        'Listening',
        'Away',
        'Ended',
        'Closed',
      ].toSorted(),
    );
  });

  it('pauses a sounding player once, then listens when it falls quiet', () => {
    const open = opened(true, true);
    const granted = step(open.session, Event.Read({ permission: 'granted', check: 1 }));
    expect(granted.work.map((w) => w._tag)).toEqual(['PausePlayer']);
    const stillLoud = step(granted.session, Event.Sounding({ sounding: true }));
    expect(stillLoud.work).toEqual([]);
    const quiet = step(stillLoud.session, Event.Sounding({ sounding: false }));
    expect(quiet.work.map((w) => w._tag)).toEqual(['Start']);
    const listening = step(quiet.session, Event.Started({ attempt: 1 }));
    expect(listening.session.phase._tag).toBe('Listening');
    // A lock-screen Play while it listens ends the listening; nothing resumes the player.
    const played = step(listening.session, Event.Sounding({ sounding: true }));
    expect(played.session.phase).toEqual(Phase.Ended({ reason: 'player' }));
    expect(played.work.map((w) => w._tag)).toEqual(['Stop']);
  });

  it('asks once when undetermined, and shows Open Settings when denied', () => {
    const asked = step(
      opened(true, false).session,
      Event.Read({ permission: 'undetermined', check: 1 }),
    );
    expect(asked.work.map((w) => w._tag)).toEqual(['AskPermission']);
    const denied = step(asked.session, Event.Answered({ permission: 'denied' }));
    expect(denied.session.phase._tag).toBe('Denied');
    expect(denied.work).toEqual([]);
    // Back from Settings: it reads again, and listens once granted.
    const back = step(
      step(denied.session, Event.Active({ active: false })).session,
      Event.Active({ active: true }),
    );
    expect(back.work.map((w) => w._tag)).toEqual(['ReadPermission']);
    expect(
      step(back.session, Event.Read({ permission: 'granted', check: 2 })).work.map((w) => w._tag),
    ).toEqual(['Start']);
  });

  it('stops on the close, and gives back a start that resolves after it', () => {
    const starting = step(
      opened(true, false).session,
      Event.Read({ permission: 'granted', check: 1 }),
    );
    const closed = step(starting.session, Event.Closed());
    expect(closed.work).toEqual([{ _tag: 'Stop', reason: 'closed' }]);
    expect(step(closed.session, Event.Started({ attempt: 1 })).work).toEqual([
      { _tag: 'Stop', reason: 'late' },
    ]);
  });

  it('stops when covered, stays quiet through the app’s return, and listens once shown again', () => {
    const tags = (work: ReadonlyArray<Work>) =>
      work.map((w) => {
        if (Work.$is('Stop')(w)) return `Stop:${w.reason}`;
        return w._tag;
      });
    const starting = step(
      opened(true, false).session,
      Event.Read({ permission: 'granted', check: 1 }),
    );
    const listening = step(starting.session, Event.Started({ attempt: 1 }));
    const covered = step(listening.session, Event.Covered({ covered: true }));
    expect(covered.session.phase._tag).toBe('Away');
    expect(tags(covered.work)).toEqual(['Stop:covered']);
    // Background and back while covered: a read, never a start.
    const away = step(covered.session, Event.Active({ active: false }));
    const back = step(away.session, Event.Active({ active: true }));
    const read = step(back.session, Event.Read({ permission: 'granted', check: 2 }));
    expect([...tags(away.work), ...tags(back.work), ...tags(read.work)]).toEqual([
      'ReadPermission',
    ]);
    expect(read.session.phase._tag).toBe('Away');
    // Uncovered while in the background: nothing starts.
    const hidden = step(read.session, Event.Active({ active: false }));
    expect(step(hidden.session, Event.Covered({ covered: false })).work).toEqual([]);
    // Uncovered while active: it reads again, then starts.
    const shown = step(read.session, Event.Covered({ covered: false }));
    expect(tags(shown.work)).toEqual(['ReadPermission']);
    expect(tags(step(shown.session, Event.Read({ permission: 'granted', check: 3 })).work)).toEqual(
      ['Start'],
    );
    // A start that resolves after the cover is given back; covered while pausing stops into Away.
    const late = step(starting.session, Event.Covered({ covered: true }));
    expect(tags(late.work)).toEqual(['Stop:covered']);
    expect(tags(step(late.session, Event.Started({ attempt: 1 })).work)).toEqual(['Stop:late']);
    const pausing = step(
      opened(true, true).session,
      Event.Read({ permission: 'granted', check: 1 }),
    );
    const coveredPausing = step(pausing.session, Event.Covered({ covered: true }));
    expect(coveredPausing.session.phase._tag).toBe('Away');
    expect(step(coveredPausing.session, Event.Sounding({ sounding: false })).work).toEqual([]);
  });

  it('holds the microphone only while starting or listening', () => {
    expect(holdsMicrophone(Phase.Listening())).toBe(true);
    expect(holdsMicrophone(Phase.Pausing())).toBe(false);
  });
});

describe('the tuner sheet’s display', () => {
  it('names the string and how far off it is, or that it listens', () => {
    expect(labelOf(Option.some(reading(82.407 * 2 ** (-12 / 1200))))).toBe(
      'Low E string, 12 cents flat',
    );
    expect(labelOf(Option.some(reading(110 * 2 ** (3 / 1200))))).toBe('A string, in tune');
    expect(labelOf(Option.some(reading(329.63 * 2 ** (20 / 1200))))).toBe(
      'High E string, 20 cents sharp',
    );
    expect(labelOf(Option.none())).toBe('Listening');
    expect(stringLabel('B3', true)).toBe('B string, tuned');
  });

  it('reads a picked string however far off, and Auto as the nearest string', () => {
    const turn = (cents: number) => {
      if (Math.abs(cents) <= 5) return 'In tune';
      if (cents < 0) return 'Tighten';
      return 'Loosen';
    };
    const draw = seeded(SEED);
    const ids = STRINGS.map((string) => string.id);
    for (let k = 0; k < 500; k += 1) {
      // Log-uniform from an octave under low E to an octave over high E.
      const hz = 41.2 * 2 ** (draw() * 5);
      const auto = reading(hz);
      for (const id of ids) {
        const picked = readingOn(hz, id);
        const want = 1200 * Math.log2(hz / (STRINGS.find((s) => s.id === id)?.hz ?? 1));
        expect(picked.string).toBe(id);
        expect(picked.stringCents).toBeCloseTo(want, 6);
        expect(picked.inTune).toBe(Math.abs(want) <= 5);
        expect([picked.note, picked.octave, picked.cents]).toEqual([
          auto.note,
          auto.octave,
          auto.cents,
        ]);
        const hint = hintOf(Option.some(id), Option.some(picked));
        expect(hint).toBe(turn(want));
      }
      expect(Math.abs(auto.stringCents)).toBe(
        Math.min(...ids.map((id) => Math.abs(readingOn(hz, id).stringCents))),
      );
    }
    const far = Option.some(readingOn(110, 'E2'));
    expect(labelOf(far)).toBe('Low E string, 500 cents sharp');
    expect(needleOf(far)).toBe(50);
    expect(labelOf(Option.some(readingOn(82.407 / 2 ** (1190 / 1200), 'E2')))).toBe(
      'Low E string, 1190 cents flat',
    );
  });

  it('hints what to pluck, then which way to turn the peg', () => {
    expect(hintOf(Option.none(), Option.none())).toBe('Pluck any string');
    expect(hintOf(Option.some('E4'), Option.none())).toBe('Pluck the High E string');
    expect(hintOf(Option.none(), Option.some(reading(110)))).toBe('In tune');
    expect(hintOf(Option.none(), Option.some(reading(108)))).toBe('Tighten');
    expect(hintOf(Option.some('A2'), Option.some(readingOn(112, 'A2')))).toBe('Loosen');
  });

  it('holds the needle to ±50 cents, at centre while nothing is heard', () => {
    expect(needleOf(Option.some(reading(110 * 2 ** (80 / 1200))))).toBe(50);
    expect(needleOf(Option.none())).toBe(0);
  });

  it(`lights a string after ${TUNED_FRAMES} frames in a row in tune on it, and keeps it lit`, () => {
    const inTune = Option.some(reading(110));
    const off = Option.some(reading(110 * 2 ** (20 / 1200)));
    const frames = (from: typeof unlatched, heard: typeof inTune, count: number) =>
      Array.from({ length: count }).reduce<typeof unlatched>((at) => latch(at, heard), from);
    const almost = frames(unlatched, inTune, TUNED_FRAMES - 1);
    expect(almost.tuned.has('A2')).toBe(false);
    // A frame out of tune breaks the run.
    expect(latch(latch(almost, off), inTune).tuned.has('A2')).toBe(false);
    const lit = latch(almost, inTune);
    expect([...lit.tuned]).toEqual(['A2']);
    expect(frames(lit, Option.none(), 20).tuned.has('A2')).toBe(true);
  });

  it('feeds frames the reader reads as the feed names', () => {
    const feed = Option.getOrThrow(feedOf('E2:-12'));
    const frame = feedFrame(feed, 3, new Float32Array(2048));
    const heard = Option.map(detect(frame, 44_100), reading);
    expect(labelOf(heard)).toBe('Low E string, 12 cents flat');
    expect(feedOf('E2:-500')).toEqual(Option.none());
    expect(feedOf('C4:0')).toEqual(Option.none());
    expect(Option.getOrThrow(feedOf('A2:0'))).toEqual({ string: 'A2', cents: 0 });
  });
});
