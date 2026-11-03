import { Array as Arr, Data, Match, Option } from 'effect';

import type { ListenEnd } from './native';
import { type Reading, STRINGS, type StringId } from './tuning';

export type Permission = 'undetermined' | 'granted' | 'denied';

export type StopReason =
  | Exclude<ListenEnd, 'stopped'>
  | 'player'
  | 'away'
  | 'covered'
  | 'closed'
  | 'late';

export type Phase = Data.TaggedEnum<{
  Checking: {};
  Asking: {};
  Denied: {};
  Pausing: {};
  Starting: {};
  Listening: {};
  Away: {};
  Ended: { readonly reason: StopReason };
  Closed: {};
}>;
export const Phase = Data.taggedEnum<Phase>();

export type Event = Data.TaggedEnum<{
  Read: { readonly permission: Permission; readonly check: number };
  Answered: { readonly permission: Permission };
  Active: { readonly active: boolean };
  Covered: { readonly covered: boolean };
  Sounding: { readonly sounding: boolean };
  Started: { readonly attempt: number };
  Refused: { readonly attempt: number };
  Ended: { readonly reason: ListenEnd };
  Tapped: {};
  Closed: {};
}>;
export const Event = Data.taggedEnum<Event>();

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
  readonly covered: boolean;
  readonly sounding: boolean;
  readonly asked: boolean;
  readonly attempt: number;
  readonly check: number;
}

export interface Step {
  readonly session: Session;
  readonly work: ReadonlyArray<Work>;
}

export const voiced = (session: Session): boolean =>
  session.active && !session.covered && !Phase.$is('Closed')(session.phase);

export const holdsMicrophone = (phase: Phase): boolean =>
  Phase.$is('Starting')(phase) || Phase.$is('Listening')(phase);

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

const stopInto = (session: Session, phase: Phase, reason: StopReason): Step => {
  if (!holdsMicrophone(session.phase)) return stay({ ...session, phase });
  return { session: { ...session, phase }, work: [Work.Stop({ reason })] };
};

const giveBack = (session: Session): Step => ({ session, work: [Work.Stop({ reason: 'late' })] });

const ask = (session: Session): Step => {
  if (session.asked) return stay({ ...session, phase: Phase.Denied() });
  return {
    session: { ...session, phase: Phase.Asking(), asked: true },
    work: [Work.AskPermission()],
  };
};

const permitted = (session: Session, permission: Permission): Step =>
  Match.value(permission).pipe(
    Match.when('granted', () => listen(session)),
    Match.when('undetermined', () => ask(session)),
    Match.when('denied', () => stay({ ...session, phase: Phase.Denied() })),
    Match.exhaustive,
  );

const recheck = (session: Session): Step => {
  const check = session.check + 1;
  return {
    session: { ...session, phase: Phase.Checking(), check },
    work: [Work.ReadPermission({ check })],
  };
};

const activeStep = (session: Session, active: boolean): Step => {
  const { phase } = session;
  const next = { ...session, active };
  if (!active) {
    if (Phase.$is('Pausing')(phase) || holdsMicrophone(phase))
      return stopInto(next, Phase.Away(), 'away');
    return stay(next);
  }
  if (session.covered) return stay(next);
  const back = !session.active && Phase.$is('Checking')(phase);
  if (back || Phase.$is('Away')(phase) || Phase.$is('Denied')(phase)) return recheck(next);
  return stay(next);
};

const coveredStep = (session: Session, covered: boolean): Step => {
  const { phase } = session;
  const next = { ...session, covered };
  if (covered) {
    if (Phase.$is('Pausing')(phase) || holdsMicrophone(phase))
      return stopInto(next, Phase.Away(), 'covered');
    return stay(next);
  }
  const waiting = Phase.$is('Away')(phase) || Phase.$is('Denied')(phase);
  if (session.covered && session.active && waiting) return recheck(next);
  return stay(next);
};

const soundingStep = (session: Session, sounding: boolean): Step => {
  const next = { ...session, sounding };
  if (sounding && holdsMicrophone(session.phase))
    return stopInto(next, Phase.Ended({ reason: 'player' }), 'player');
  if (!sounding && Phase.$is('Pausing')(session.phase)) return listen(next);
  return stay(next);
};

const startedStep = (session: Session, attempt: number): Step => {
  if (attempt === session.attempt && Phase.$is('Starting')(session.phase))
    return stay({ ...session, phase: Phase.Listening() });
  if (holdsMicrophone(session.phase)) return stay(session);
  return giveBack(session);
};

export const step = (session: Session, event: Event): Step => {
  const { phase } = session;
  if (Phase.$is('Closed')(phase)) {
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

export const STRING_NAMES: Readonly<Record<StringId, string>> = {
  E2: 'Low E',
  A2: 'A',
  D3: 'D',
  G3: 'G',
  B3: 'B',
  E4: 'High E',
};

export const LEFT: ReadonlyArray<StringId> = ['D3', 'A2', 'E2'];
export const RIGHT: ReadonlyArray<StringId> = ['G3', 'B3', 'E4'];

export const NEEDLE_CENTS = 50;

export const needleOf = (heard: Option.Option<Reading>): number =>
  Option.match(heard, {
    onNone: () => 0,
    onSome: ({ stringCents }) => Math.max(-NEEDLE_CENTS, Math.min(NEEDLE_CENTS, stringCents)),
  });

export const labelOf = (heard: Option.Option<Reading>): string =>
  Option.match(heard, {
    onNone: () => 'Listening',
    onSome: ({ string, stringCents, inTune }) => {
      const name = `${STRING_NAMES[string]} string`;
      if (inTune) return `${name}, in tune`;
      return `${name}, ${centsOff(stringCents)}`;
    },
  });

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

export const NOT_LISTENING = 'Not listening';

const byPhase = <R, A>(
  phase: Phase['_tag'],
  heard: Option.Option<R>,
  give: { readonly rest: () => A; readonly heard: (heard: R) => A; readonly ended: A },
): Option.Option<A> =>
  Match.value(phase).pipe(
    Match.whenOr('Denied', 'Closed', () => Option.none<A>()),
    Match.when('Ended', () => Option.some(give.ended)),
    Match.when('Listening', () =>
      Option.some(Option.match(heard, { onNone: give.rest, onSome: give.heard })),
    ),
    Match.orElse(() => Option.some(give.rest())),
  );

export const nameOf = (
  phase: Phase['_tag'],
  target: Option.Option<StringId>,
  heard: Option.Option<Pick<Reading, 'string'>>,
): Option.Option<string> =>
  byPhase(phase, heard, {
    rest: () =>
      Option.match(target, { onNone: () => 'Listening', onSome: (id) => STRING_NAMES[id] }),
    heard: ({ string }) => STRING_NAMES[string],
    ended: NOT_LISTENING,
  });

export const wordsOf = (
  phase: Phase['_tag'],
  heard: Option.Option<Reading>,
): Option.Option<string> =>
  byPhase(phase, heard, {
    rest: () => labelOf(Option.none()),
    heard: (one) => labelOf(Option.some(one)),
    ended: NOT_LISTENING,
  });

const centsOff = (stringCents: number): string => {
  const cents = Math.round(Math.abs(stringCents));
  const side = Match.value(stringCents < 0).pipe(
    Match.when(true, () => 'flat'),
    Match.orElse(() => 'sharp'),
  );
  if (cents === 1) return `1 cent ${side}`;
  return `${cents} cents ${side}`;
};

export const TUNED_FRAMES = 8;

export interface Latch {
  readonly run: Option.Option<{ readonly string: StringId; readonly frames: number }>;
  readonly tuned: ReadonlySet<StringId>;
}

export const unlatched: Latch = { run: Option.none(), tuned: new Set() };

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

export const stringLabel = (string: StringId, tuned: boolean): string => {
  if (tuned) return `${STRING_NAMES[string]} string, tuned`;
  return `${STRING_NAMES[string]} string`;
};

export const FEED_RATE = 44_100;

export const FRAME = 2048;

export interface Feed {
  readonly string: StringId;
  readonly cents: number;
}

const FEED = /^(E2|A2|D3|G3|B3|E4):([+-]?\d+(?:\.\d+)?)$/;

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

const PARTIALS: ReadonlyArray<readonly [harmonic: number, amplitude: number]> = [
  [1, 0.3],
  [2, 0.15],
  [3, 0.08],
  [4, 0.04],
];

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
