/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noNewError, eslint/no-await-in-loop -- a source answers a Promise the host awaits, one answer after another as the host asks, a refused device call is a rejection as the device's is, and a Bun test in an Exact app's folder imports no effect (docs/exact.md). */

/**
 * The tuner's sources carry the current app's session as its `Tuner.tsx`
 * does: over generated histories of the world's events (the screen opened,
 * covered and shown, the app active or not, the player sounding, a tap to
 * listen again, the ear's end, the screen closed) and the device's answers
 * (the permission granted, a prompt answered either way, or denied; the ear
 * refusing a start), each answer `tunerStep` and `tunerHear` give is the
 * phase and the player's pauses a reference reaches by the current app's
 * `step`, each work item carried at once and in order as `Tuner.tsx`
 * carries it. And the microphone is held exactly while the session holds it.
 */

import { describe, expect, test } from 'bun:test';

import {
  Event,
  holdsMicrophone,
  opened,
  type Permission,
  type Session,
  step,
  type Work,
} from '@manna/hymnal-app/tuner/session';

import { pick, type Random, seeded } from '../test/random.ts';
import { type Mic, type Native, permissionOf, tunerSources } from './sources.ts';

/** The device as one history finds it. */
interface World {
  state: 'granted' | 'prompt' | 'denied';
  answer: 'granted' | 'denied';
  refuse: boolean;
  open: Set<string>;
  listening: boolean;
  ends: number;
  ended: string;
  tracks: number;
}

/** The microphone and the app's module over `world`. */
interface Fakes {
  readonly mic: Mic;
  readonly native: Native;
}

const fakes = (world: World): Fakes => ({
  mic: {
    status: async () => world.state,
    open: async () => {
      if (world.state === 'prompt') world.state = world.answer;
      if (world.state !== 'granted') throw new Error('not allowed');
      world.tracks += 1;
      const id = `track-${world.tracks}`;
      world.open.add(id);
      return id;
    },
    close: async (track) => {
      world.open.delete(track);
    },
  },
  native: {
    available: true,
    later: async (request) => {
      switch (request['op']) {
        case 'tuner.listen':
          if (world.refuse) throw new Error('refused');
          world.listening = true;
          return { rate: 44100, ends: world.ends };
        case 'tuner.stop':
          world.listening = false;
          return { ends: world.ends };
        case 'tuner.take':
          return { frames: [], ends: world.ends, ended: world.ended };
        default:
          return {};
      }
    },
    watch: () => {},
  },
});

/** The reference: the current app's `step`, each work item carried at once, in order. */
const reference = (world: World) => {
  let session: Session | undefined;
  let pauses = 0;
  const carry = (work: Work): Event | undefined => {
    switch (work._tag) {
      case 'ReadPermission':
        return Event.Read({ permission: permissionOf(world.state), check: work.check });
      case 'AskPermission': {
        const answer: Permission = world.answer;
        return Event.Answered({ permission: answer });
      }
      case 'PausePlayer':
        pauses += 1;
        return undefined;
      case 'Start':
        return world.refuse
          ? Event.Refused({ attempt: work.attempt })
          : Event.Started({ attempt: work.attempt });
      case 'Stop':
        return undefined;
    }
  };
  const drive = (work: ReadonlyArray<Work>) => {
    const queue = [...work];
    while (queue.length > 0) {
      const next = carry(queue.shift() as Work);
      if (next === undefined || session === undefined) continue;
      const stepped = step(session, next);
      session = stepped.session;
      queue.push(...stepped.work);
    }
  };
  return {
    open: (active: boolean, sounding: boolean) => {
      const first = opened(active, sounding);
      session = first.session;
      drive(first.work);
    },
    tell: (event: Event) => {
      if (session === undefined) return;
      const stepped = step(session, event);
      session = stepped.session;
      drive(stepped.work);
    },
    phase: () => session?.phase._tag ?? 'Closed',
    pauses: () => pauses,
    holds: () => session !== undefined && holdsMicrophone(session.phase),
  };
};

type Told =
  | { readonly kind: 'active' | 'sounding'; readonly on: boolean }
  | { readonly kind: 'covered'; readonly on: boolean }
  | { readonly kind: 'tapped' | 'close' | 'open' }
  | { readonly kind: 'end'; readonly reason: 'interruption' | 'route' | 'failure' };

const toldOf = (random: Random): Told => {
  const kind = pick(random, [
    'active',
    'active',
    'sounding',
    'sounding',
    'covered',
    'covered',
    'tapped',
    'tapped',
    'end',
    'end',
    'close',
    'open',
  ] as const);
  if (kind === 'end')
    return { kind, reason: pick(random, ['interruption', 'route', 'failure'] as const) };
  if (kind === 'tapped' || kind === 'close' || kind === 'open') return { kind };
  return { kind, on: random() < 0.5 };
};

/** A fresh device as one history finds it. */
const worldOf = (random: Random): World => ({
  state: pick(random, ['granted', 'granted', 'prompt', 'denied'] as const),
  answer: pick(random, ['granted', 'denied'] as const),
  refuse: random() < 0.15,
  open: new Set(),
  listening: false,
  ends: 0,
  ended: '',
  tracks: 0,
});

/** One history: the port and the reference told each event alike. */
const historyOf = async (random: Random, world: World) => {
  const theirs = reference(world);
  const { mic, native } = fakes(world);
  const ours = tunerSources(mic, () => {});
  let active = random() < 0.9;
  let sounding = random() < 0.3;
  const ask = (kind: string, word = '') =>
    ours.tunerStep([kind, word, active, sounding, ''], null, null, native);
  theirs.open(active, sounding);
  let got = await ask('open');
  const tell = async (told: Told) => {
    switch (told.kind) {
      case 'active':
        active = told.on;
        theirs.tell(Event.Active({ active }));
        got = await ask('active');
        return;
      case 'sounding':
        sounding = told.on;
        theirs.tell(Event.Sounding({ sounding }));
        got = await ask('sounding');
        return;
      case 'covered':
        theirs.tell(Event.Covered({ covered: told.on }));
        got = await ask('covered', told.on ? 'covered' : 'shown');
        return;
      case 'tapped':
        theirs.tell(Event.Tapped());
        got = await ask('tapped');
        return;
      case 'close':
        theirs.tell(Event.Closed());
        got = await ask('close');
        return;
      case 'open':
        if (theirs.phase() !== 'Closed') return;
        world.state = pick(random, ['granted', 'prompt', 'denied'] as const);
        theirs.open(active, sounding);
        got = await ask('open');
        return;
      case 'end':
        if (theirs.phase() !== 'Listening') return;
        world.ends += 1;
        world.ended = told.reason;
        world.listening = false;
        theirs.tell(Event.Ended({ reason: told.reason }));
        await ours.tunerHear([got.serial, ''], null, null, native);
    }
  };
  const shown = async () => ({
    phase: (await ours.tunerHear([got.serial, ''], null, null, native)).phase,
    pauses: got.pauses,
  });
  return { theirs, tell, shown };
};

describe('the tuner’s session', () => {
  test('every answer is the current app’s phase and pauses, over generated histories', async () => {
    const random = seeded(17);
    const seen = new Set<string>();
    for (let run = 0; run < 120; run++) {
      const world = worldOf(random);
      const { theirs, tell, shown } = await historyOf(random, world);
      for (let k = 0; k < 14; k++) {
        expect(await shown()).toEqual({ phase: theirs.phase(), pauses: theirs.pauses() });
        expect(world.listening).toBe(theirs.holds() && theirs.phase() === 'Listening');
        expect(world.open.size).toBe(theirs.holds() ? 1 : 0);
        seen.add(theirs.phase());
        await tell(toldOf(random));
      }
    }
    expect(
      ['Listening', 'Denied', 'Ended', 'Away', 'Closed'].filter((tag) => !seen.has(tag)),
    ).toEqual([]);
  });

  test('a prompt is asked once in an opening, and its answer decides', async () => {
    for (const answer of ['granted', 'denied'] as const) {
      const world = { ...worldOf(seeded(2)), state: 'prompt' as const, answer, refuse: false };
      const { mic, native } = fakes(world);
      const sources = tunerSources(mic, () => {});
      const got = await sources.tunerStep(['open', '', true, false, ''], null, null, native);
      expect(got.phase).toBe(answer === 'granted' ? 'Listening' : 'Denied');
    }
  });

  test('without the app’s module there is no ear, and a start is refused', async () => {
    const world = { ...worldOf(seeded(2)), state: 'granted' as const, refuse: false };
    const sources = tunerSources(fakes(world).mic, () => {});
    expect(await sources.tunerEarOf(null, null, null, null)).toEqual({ ear: false });
    const got = await sources.tunerStep(['open', '', true, false, ''], null, null, null);
    expect([got.phase, got.reason]).toEqual(['Ended', 'failure']);
    expect(world.open.size).toBe(0);
  });
});
