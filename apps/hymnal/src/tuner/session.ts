/**
 * The tuner sheet's rules, pure: when it listens, what it asks of the
 * permission, the ear and the player, and what it shows of a reading. The
 * sheet (`Tuner.tsx`) feeds this machine the world's events and carries out
 * the work each step names; it decides nothing itself.
 *
 * The rule: the sheet listens only while it is open, the app is active, no
 * other route covers it, the microphone is granted and the player is quiet.
 * Covered and active are two conditions, each from its own source (the
 * navigation and the app's state), so neither can lift the other. Opening it reads the
 * permission, and asks once when it is undetermined. A player that sounds as
 * listening would start is paused once, and listening starts when it is
 * quiet; a player that starts to sound while the sheet listens ends the
 * listening (`Tap to listen again`). Never listening and playing at once.
 * Nothing resumes the player.
 */

import { Array as Arr, Data, Match, Option } from 'effect';

import type { ListenEnd } from './native';
import { type Reading, STRINGS, type StringId } from './tuning';

export type Permission = 'undetermined' | 'granted' | 'denied';

/** Why the sheet stopped listening: an end the ear sent, or one the sheet made. */
export type StopReason =
  | Exclude<ListenEnd, 'stopped'>
  | 'player'
  | 'away'
  | 'covered'
  | 'closed'
  | 'late';

/** Where the sheet stands. */
export type Phase = Data.TaggedEnum<{
  /** It reads the permission. */
  Checking: {};
  /** The system asks the reader for the microphone. */
  Asking: {};
  /** The microphone is off for the app: `Open Settings`. */
  Denied: {};
  /** Granted, and the paused player is still to fall quiet. */
  Pausing: {};
  /** The ear is asked to start. */
  Starting: {};
  Listening: {};
  /** Granted, and the app is not active or another route covers the sheet: it listens again on its return. */
  Away: {};
  /** Listening ended on its own (an interruption, a route, a failure, the player): `Tap to listen again`. */
  Ended: { readonly reason: StopReason };
  Closed: {};
}>;
export const Phase = Data.taggedEnum<Phase>();

/** What the world tells the sheet. */
export type Event = Data.TaggedEnum<{
  /** The permission as read by the sheet's read `check`. */
  Read: { readonly permission: Permission; readonly check: number };
  /** The reader's answer to the system's ask. */
  Answered: { readonly permission: Permission };
  /** The app became active, or stopped being it (background, inactive). */
  Active: { readonly active: boolean };
  /** Another route covers the sheet (its screen blurred), or it is shown again (focused). */
  Covered: { readonly covered: boolean };
  /** The player sounds (loading, playing, buffering), or it does not. */
  Sounding: { readonly sounding: boolean };
  /** The ear's start `attempt` resolved. */
  Started: { readonly attempt: number };
  /** The ear's start `attempt` was refused. */
  Refused: { readonly attempt: number };
  /** The ear ended listening on its own. */
  Ended: { readonly reason: ListenEnd };
  /** `Tap to listen again`. */
  Tapped: {};
  Closed: {};
}>;
export const Event = Data.taggedEnum<Event>();

/** The work a step asks of the sheet, in order. */
export type Work = Data.TaggedEnum<{
  ReadPermission: { readonly check: number };
  AskPermission: {};
  PausePlayer: {};
  Start: { readonly attempt: number };
  Stop: { readonly reason: StopReason };
}>;
export const Work = Data.taggedEnum<Work>();

export interface Session {
  readonly phase: Phase;
  readonly active: boolean;
  /** Another route covers the sheet. */
  readonly covered: boolean;
  readonly sounding: boolean;
  /** Whether the system has asked for the microphone in this opening: it asks once. */
  readonly asked: boolean;
  /** The latest start's number; a resolution of an older one is late. */
  readonly attempt: number;
  /** The latest permission read's number; the answer to an older one is stale. */
  readonly check: number;
}

export interface Step {
  readonly session: Session;
  readonly work: ReadonlyArray<Work>;
}

/**
 * Whether the screen's words may go to VoiceOver: only while it is open, in
 * the foreground and not covered by another route, so a stop into `Away` under
 * a pushed hymn says nothing over that hymn.
 */
export const voiced = (session: Session): boolean =>
  session.active && !session.covered && !Phase.$is('Closed')(session.phase);

/** Whether the ear holds, or is taking, the microphone in `phase`. */
export const holdsMicrophone = (phase: Phase): boolean =>
  Phase.$is('Starting')(phase) || Phase.$is('Listening')(phase);

/** The sheet as it opens: it reads the permission first. */
export const opened = (active: boolean, sounding: boolean): Step => ({
  session: {
    phase: Phase.Checking(),
    active,
    covered: false,
    sounding,
    asked: false,
    attempt: 0,
    check: 1,
  },
  work: [Work.ReadPermission({ check: 1 })],
});

const stay = (session: Session): Step => ({ session, work: [] });

/** Granted: listen now, after pausing a sounding player once, or on the app's or the screen's return. */
const listen = (session: Session): Step => {
  if (!session.active || session.covered) return stay({ ...session, phase: Phase.Away() });
  if (session.sounding)
    return { session: { ...session, phase: Phase.Pausing() }, work: [Work.PausePlayer()] };
  const attempt = session.attempt + 1;
  return {
    session: { ...session, phase: Phase.Starting(), attempt },
    work: [Work.Start({ attempt })],
  };
};

/** Ends what holds the microphone, into `phase`. */
const stopInto = (session: Session, phase: Phase, reason: StopReason): Step => {
  if (!holdsMicrophone(session.phase)) return stay({ ...session, phase });
  return { session: { ...session, phase }, work: [Work.Stop({ reason })] };
};

/** Gives back a start that resolved when nothing waits on it. */
const giveBack = (session: Session): Step => ({ session, work: [Work.Stop({ reason: 'late' })] });

/** Asks for the microphone, once in an opening; asked before, it is as denied. */
const ask = (session: Session): Step => {
  if (session.asked) return stay({ ...session, phase: Phase.Denied() });
  return {
    session: { ...session, phase: Phase.Asking(), asked: true },
    work: [Work.AskPermission()],
  };
};

/** What a permission read or answer leads to. */
const permitted = (session: Session, permission: Permission): Step =>
  Match.value(permission).pipe(
    Match.when('granted', () => listen(session)),
    Match.when('undetermined', () => ask(session)),
    Match.when('denied', () => stay({ ...session, phase: Phase.Denied() })),
    Match.exhaustive,
  );

/** Reads the permission again, as on opening. */
const recheck = (session: Session): Step => {
  const check = session.check + 1;
  return {
    session: { ...session, phase: Phase.Checking(), check },
    work: [Work.ReadPermission({ check })],
  };
};

/** The app left the foreground, or came back to it. */
const activeStep = (session: Session, active: boolean): Step => {
  const { phase } = session;
  const next = { ...session, active };
  if (!active) {
    if (Phase.$is('Pausing')(phase) || holdsMicrophone(phase))
      return stopInto(next, Phase.Away(), 'away');
    return stay(next);
  }
  // Back in the foreground under a covering route: the read waits for the screen's return.
  if (session.covered) return stay(next);
  // Back in the foreground: the permission may have changed in Settings meanwhile, even under a read in flight.
  const back = !session.active && Phase.$is('Checking')(phase);
  if (back || Phase.$is('Away')(phase) || Phase.$is('Denied')(phase)) return recheck(next);
  return stay(next);
};

/** Another route covered the sheet, or it is shown again. */
const coveredStep = (session: Session, covered: boolean): Step => {
  const { phase } = session;
  const next = { ...session, covered };
  if (covered) {
    if (Phase.$is('Pausing')(phase) || holdsMicrophone(phase))
      return stopInto(next, Phase.Away(), 'covered');
    return stay(next);
  }
  // Shown again: the permission is read again, as on the app's return (it may have changed in Settings).
  const waiting = Phase.$is('Away')(phase) || Phase.$is('Denied')(phase);
  if (session.covered && session.active && waiting) return recheck(next);
  return stay(next);
};

/** The player began to sound, or fell quiet. */
const soundingStep = (session: Session, sounding: boolean): Step => {
  const next = { ...session, sounding };
  if (sounding && holdsMicrophone(session.phase))
    return stopInto(next, Phase.Ended({ reason: 'player' }), 'player');
  if (!sounding && Phase.$is('Pausing')(session.phase)) return listen(next);
  return stay(next);
};

/** The ear's start `attempt` resolved. */
const startedStep = (session: Session, attempt: number): Step => {
  if (attempt === session.attempt && Phase.$is('Starting')(session.phase))
    return stay({ ...session, phase: Phase.Listening() });
  // An older start resolved: the ear is idempotent, so a newer start holds it now; else give it back.
  if (holdsMicrophone(session.phase)) return stay(session);
  return giveBack(session);
};

/** The sheet's next state and its work for `event`. */
export const step = (session: Session, event: Event): Step => {
  const { phase } = session;
  if (Phase.$is('Closed')(phase)) {
    // A start that resolves after the close is given back at once.
    if (Event.$is('Started')(event)) return giveBack(session);
    return stay(session);
  }
  return Event.$match(event, {
    Read: ({ permission, check }) => {
      if (check !== session.check || !Phase.$is('Checking')(phase)) return stay(session);
      return permitted(session, permission);
    },
    Answered: ({ permission }) => {
      if (!Phase.$is('Asking')(phase)) return stay(session);
      return permitted(session, permission);
    },
    Active: ({ active }) => activeStep(session, active),
    Covered: ({ covered }) => coveredStep(session, covered),
    Sounding: ({ sounding }) => soundingStep(session, sounding),
    Started: ({ attempt }) => startedStep(session, attempt),
    Refused: ({ attempt }) => {
      if (attempt !== session.attempt || !Phase.$is('Starting')(phase)) return stay(session);
      return stay({ ...session, phase: Phase.Ended({ reason: 'failure' }) });
    },
    Ended: ({ reason }) => {
      if (reason === 'stopped' || !holdsMicrophone(phase)) return stay(session);
      return stopInto(session, Phase.Ended({ reason }), reason);
    },
    Tapped: () => {
      if (!Phase.$is('Ended')(phase)) return stay(session);
      return recheck(session);
    },
    Closed: () => stopInto(session, Phase.Closed(), 'closed'),
  });
};

// The display.

/** Each string's name as the sheet shows it. */
export const STRING_NAMES: Readonly<Record<StringId, string>> = {
  E2: 'Low E',
  A2: 'A',
  D3: 'D',
  G3: 'G',
  B3: 'B',
  E4: 'High E',
};

/** The strings in the reference's layout: D A E down the left, G B E down the right. */
export const LEFT: ReadonlyArray<StringId> = ['D3', 'A2', 'E2'];
export const RIGHT: ReadonlyArray<StringId> = ['G3', 'B3', 'E4'];

/** How far the needle swings, in cents either side. */
export const NEEDLE_CENTS = 50;

/** The needle's place in cents: the reading's distance from its string, held to ±50; centre while nothing is heard. */
export const needleOf = (heard: Option.Option<Reading>): number =>
  Option.match(heard, {
    onNone: () => 0,
    onSome: ({ stringCents }) => Math.max(-NEEDLE_CENTS, Math.min(NEEDLE_CENTS, stringCents)),
  });

/** The reading's words: `Low E string, 12 cents flat`, `A string, in tune`, or `Listening`. */
export const labelOf = (heard: Option.Option<Reading>): string =>
  Option.match(heard, {
    onNone: () => 'Listening',
    onSome: ({ string, stringCents, inTune }) => {
      const name = `${STRING_NAMES[string]} string`;
      if (inTune) return `${name}, in tune`;
      return `${name}, ${centsOff(stringCents)}`;
    },
  });

/**
 * The hint under the gauge, from the target (none is Auto) and the frame's reading:
 * what to pluck while nothing is heard, else which way to turn the peg.
 */
export const hintOf = (target: Option.Option<StringId>, heard: Option.Option<Reading>): string =>
  Option.match(heard, {
    onNone: () =>
      Option.match(target, {
        onNone: () => 'Pluck any string',
        onSome: (string) => `Pluck the ${STRING_NAMES[string]} string`,
      }),
    onSome: ({ stringCents, inTune }) => {
      if (inTune) return 'In tune';
      if (stringCents < 0) return 'Tighten';
      return 'Loosen';
    },
  });

/** `12 cents flat`, `1 cent sharp`. */
const centsOff = (stringCents: number): string => {
  const cents = Math.round(Math.abs(stringCents));
  const side = Match.value(stringCents < 0).pipe(
    Match.when(true, () => 'flat'),
    Match.orElse(() => 'sharp'),
  );
  if (cents === 1) return `1 cent ${side}`;
  return `${cents} cents ${side}`;
};

/** A string lights `tuned` after this many frames in a row in tune on it. */
export const TUNED_FRAMES = 8;

export interface Latch {
  /** The string the current run of in-tune frames is on, and its length. */
  readonly run: Option.Option<{ readonly string: StringId; readonly frames: number }>;
  /** The strings lit `tuned`: they stay lit until the sheet closes. */
  readonly tuned: ReadonlySet<StringId>;
}

export const unlatched: Latch = { run: Option.none(), tuned: new Set() };

/** The latch after one frame's reading (none when nothing was heard). */
export const latch = (before: Latch, heard: Option.Option<Reading>): Latch => {
  const inTune = Option.filter(heard, (reading) => reading.inTune);
  if (Option.isNone(inTune)) return { ...before, run: Option.none() };
  const { string } = inTune.value;
  const frames = Option.match(
    Option.filter(before.run, (run) => run.string === string),
    { onNone: () => 1, onSome: (run) => run.frames + 1 },
  );
  if (frames < TUNED_FRAMES || before.tuned.has(string))
    return { ...before, run: Option.some({ string, frames }) };
  return { run: Option.some({ string, frames }), tuned: new Set([...before.tuned, string]) };
};

/** A string's own words: `A string` or `A string, tuned`. */
export const stringLabel = (string: StringId, tuned: boolean): string => {
  if (tuned) return `${STRING_NAMES[string]} string, tuned`;
  return `${STRING_NAMES[string]} string`;
};

// The dev feed.

/** The feed's sample rate. */
export const FEED_RATE = 44_100;

/** The frame length the ear sends, and the feed with it. */
export const FRAME = 2048;

export interface Feed {
  readonly string: StringId;
  readonly cents: number;
}

const FEED = /^(E2|A2|D3|G3|B3|E4):([+-]?\d+(?:\.\d+)?)$/;

/** `E2:-12` as a feed: a string's id and cents off it (within ±100), or none. */
export const feedOf = (param: string): Option.Option<Feed> =>
  Option.fromNullishOr(FEED.exec(param)).pipe(
    Option.flatMap(([, id, cents]) =>
      Option.all({
        string: Arr.findFirst(STRINGS, (each) => each.id === id).pipe(
          Option.map((each) => each.id),
        ),
        cents: Option.some(Number(cents)).pipe(Option.filter((off) => Math.abs(off) <= 100)),
      }),
    ),
  );

/** The partials a fed frame sounds, with their amplitudes: a plain plucked tone that does not fade. */
const PARTIALS: ReadonlyArray<readonly [harmonic: number, amplitude: number]> = [
  [1, 0.3],
  [2, 0.15],
  [3, 0.08],
  [4, 0.04],
];

/** The `index`th frame of `feed` at `FEED_RATE`: continuous across frames, as the ear's are. */
export const feedFrame = (feed: Feed, index: number, into: Float32Array): Float32Array => {
  const base = Arr.findFirst(STRINGS, (string) => string.id === feed.string).pipe(
    Option.match({ onNone: () => 0, onSome: (string) => string.hz }),
  );
  const hz = base * 2 ** (feed.cents / 1200);
  const start = index * into.length;
  for (let k = 0; k < into.length; k += 1) {
    const t = (start + k) / FEED_RATE;
    let sample = 0;
    for (const [harmonic, amplitude] of PARTIALS)
      sample += amplitude * Math.sin(2 * Math.PI * hz * harmonic * t);
    into[k] = sample;
  }
  return into;
};
