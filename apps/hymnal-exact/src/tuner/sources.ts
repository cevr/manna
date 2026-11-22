/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, effect/noRuntimeTypeof, effect/noUnsafeDictionaryType, effect/noUnknownParameters, eslint/no-await-in-loop -- Exact's data module cannot import effect (docs/exact.md): the current app's options are named by the shapes they take at run time, a source answers a Promise the host awaits, the app's module answers untyped JSON read field by field, a refused start is the ear's answer, not a defect, the session's work is carried one item after another, in order, as the current app carries it, and a frame's log line is the host's console. */

/**
 * The tuner's sources, as `app.ts` registers them over the microphone
 * (`mic.ts`, Exact's `@exact/media-capture`) and the app's module (the
 * `native` each call is handed, whose `tuner.` ops are
 * `modules/apple/TunerEar.swift` and `modules/web/index.js`). Every rule is
 * the current app's, imported: the session (`tuner/session`), the focus a
 * frame is heard through (`tuner/focus`), the reading (`tuner/tuning`) and
 * the screen's own (`tuner/screen`). One tuner per launch, as the key
 * button's press is.
 *
 * - `tunerEarOf()`: whether this device has the ear, so the three ways in
 *   show: the module says (`tuner.ear`), none without a module.
 * - `tunerStep(kind, word, active, sounding, feed)`: one event of the
 *   session (`open`, `close`, `active`, `covered` with `covered` or
 *   `shown` in `word`, `sounding`, `tapped`), and the work each step names
 *   carried at once, in order, as the current `Tuner.tsx` carries it: the
 *   permission read and asked through the microphone, the ear started on a
 *   track the microphone opens and stopped with it; the player's pause is
 *   the view's, counted in `pauses`. `feed` is a fed tone (`E2:-12`), heard
 *   in place of the microphone where the module feeds (under the agent).
 * - `tunerHear(serial, aim)`: what the screen draws, its phase the
 *   session's, asked again after each step (`serial`). While the session
 *   listens, each frame the ear has since the last answer is heard through
 *   the focus and read against the picked string (`aim`, `""` for Auto),
 *   and the answer is asked again when the ear says `tuner` changed; an end
 *   the ear says (`ends` counted, `ended` its reason) steps the session
 *   here. Any other phase is at rest: nothing heard, the focus afresh. A
 *   string that held in tune keeps its tick until the screen opens again.
 */

import { type Focus, hear, unfocused } from '@manna/hymnal-app/tuner/focus';
import { ACROSS, autoOf, noteOf, pickedHint, pickOf, SWING } from '@manna/hymnal-app/tuner/screen';
import {
  Event,
  FEED_RATE,
  FRAME,
  feedFrame,
  feedOf,
  hintOf,
  type Latch,
  LEFT,
  latch,
  NEEDLE_CENTS,
  nameOf,
  needleOf,
  opened,
  type Permission,
  type Phase,
  RIGHT,
  type Session,
  step,
  stringLabel,
  unlatched,
  type Work,
  wordsOf,
} from '@manna/hymnal-app/tuner/session';
import { type Reading, reading, readingOn, type StringId } from '@manna/hymnal-app/tuner/tuning';

import { samplesOf } from './frames.ts';
import { PLACES, TICK_MARKS } from './places.ts';

/** The microphone as the session asks it: its permission, a track opened (asking while undetermined), and the track closed. */
export interface Mic {
  readonly status: () => Promise<string>;
  readonly open: () => Promise<string>;
  readonly close: (track: string) => Promise<void>;
}

/** The app's module as a source is handed it. */
export interface Native {
  readonly available: boolean;
  later(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  watch(topic: string): void;
}

/** An option as it is at run time: the current app's `Option`, by the two shapes it takes. */
type Opt<A> = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: A };
/** A picked string, or Auto: the current app's own option, as its rules take it. */
type Target = Parameters<typeof hintOf>[0];
/** A frame's reading, or nothing heard. */
type Heard = Parameters<typeof hintOf>[1];
/** Why listening ended, as the session takes it from the ear. */
type ListenEnd = Parameters<typeof Event.Ended>[0]['reason'];

/** The empty option, and a value in one, in the shape the current app's rules read. */
const none = { _tag: 'None' } as never;
const some = <A>(value: A) => ({ _tag: 'Some', value }) as never;
const valueOf = <A>(option: Opt<A>, otherwise: A): A =>
  option._tag === 'Some' ? option.value : otherwise;

/** The microphone's state as the session reads it: a prompt is undetermined, and anything else not granted is denied. */
export const permissionOf = (state: string): Permission =>
  state === 'granted' ? 'granted' : state === 'prompt' ? 'undetermined' : 'denied';

/** The ear's end a module said, or `failure` for one this side does not know. */
const endOf = (word: string): ListenEnd =>
  word === 'stopped' || word === 'interruption' || word === 'route' ? word : 'failure';

/** The most frames heard in one answer: the latest, as the current app drops a frame that comes while one is in work. */
export const TAKEN = 8;

/** The tuner as it stands, one per launch. */
interface Held {
  session: Session | undefined;
  serial: number;
  pauses: number;
  run: number;
  track: string;
  rate: number;
  feed: ReturnType<typeof feedOf>;
  fed: number;
  focus: Focus;
  latch: Latch;
  heard: Heard;
  last: Target;
  ends: number;
  read: number;
  logged: number;
}

/** What the screen draws for one string's circle. */
export interface StringView {
  readonly id: string;
  readonly letter: string;
  readonly label: string;
  readonly hint: string;
  readonly picked: boolean;
  readonly lit: boolean;
  readonly tuned: boolean;
  readonly pickTo: string;
}

/** What the screen draws. */
export interface TunerView {
  readonly phase: string;
  readonly has: boolean;
  readonly name: string;
  readonly note: string;
  readonly words: string;
  readonly hint: string;
  readonly inTune: boolean;
  readonly swing: number;
  readonly auto: boolean;
  readonly autoTo: string;
  readonly left: StringView[];
  readonly right: StringView[];
  readonly lines: Array<{ readonly id: string; readonly lit: boolean }>;
}

/** What a session's step answers the view: the phase, the player's pauses asked, and the listening's number. */
export interface TunerStepped {
  readonly serial: number;
  readonly phase: string;
  readonly reason: string;
  readonly pauses: number;
  readonly run: number;
}

const aimOf = (aim: string): Target =>
  LEFT.includes(aim as StringId) || RIGHT.includes(aim as StringId) ? some(aim as StringId) : none;

/** The view of `held` in `phase`, against `aim`. */
export const viewOf = (held: Held, phase: Phase['_tag'], aim: string): TunerView => {
  const target = aimOf(aim);
  const heard = held.heard;
  const lit: Opt<StringId> =
    target._tag === 'Some' ? target : heard._tag === 'Some' ? some(heard.value.string) : none;
  const isLit = (id: StringId) => lit._tag === 'Some' && lit.value === id;
  const circle = (id: StringId): StringView => {
    const picked = target._tag === 'Some' && target.value === id;
    const tuned = held.latch.tuned.has(id);
    return {
      id,
      letter: id.slice(0, 1),
      label: stringLabel(id, tuned),
      hint: valueOf(pickedHint(picked), ''),
      picked,
      lit: isLit(id),
      tuned,
      pickTo: valueOf(pickOf(target, id), ''),
    };
  };
  const name = nameOf(phase, target, heard);
  return {
    phase,
    has: name._tag === 'Some',
    name: valueOf(name, ''),
    note: noteOf(heard),
    words: valueOf(wordsOf(phase, heard), ''),
    hint: hintOf(target, heard),
    inTune: heard._tag === 'Some' && heard.value.inTune,
    swing: (needleOf(heard) / NEEDLE_CENTS) * SWING,
    auto: target._tag === 'None',
    autoTo: valueOf(autoOf(target, held.last), ''),
    left: LEFT.map(circle),
    right: RIGHT.map(circle),
    lines: ACROSS.map((id) => ({ id, lit: isLit(id) })),
  };
};

const fresh = (): Held => ({
  session: undefined,
  serial: 0,
  pauses: 0,
  run: 0,
  track: '',
  rate: 0,
  feed: none,
  fed: 0,
  focus: unfocused,
  latch: unlatched,
  heard: none,
  last: none,
  ends: 0,
  read: 0,
  logged: 0,
});

/** How many frames between two `[tuner] frames` log lines, each with the module's own milliseconds for its answer (`ms`). */
const LOG_EVERY = 10;

export const tunerSources = (
  mic: Mic,
  say: (line: string) => void = (line) => console.log(line),
) => {
  const held = fresh();

  /** The event a call names, or none for a kind the session does not know. */
  const eventOf = (kind: string, word: string, active: boolean, sounding: boolean) => {
    switch (kind) {
      case 'close':
        return Event.Closed();
      case 'active':
        return Event.Active({ active });
      case 'covered':
        return Event.Covered({ covered: word === 'covered' });
      case 'sounding':
        return Event.Sounding({ sounding });
      case 'tapped':
        return Event.Tapped();
      default:
        return undefined;
    }
  };

  /** Carries one work item, answering the event it leads to, if any. */
  const carry = async (work: Work, native: Native | null | undefined) => {
    switch (work._tag) {
      case 'ReadPermission': {
        const state = await mic.status().catch(() => 'denied');
        return Event.Read({ permission: permissionOf(state), check: work.check });
      }
      case 'AskPermission': {
        const track = await mic.open().catch(() => '');
        if (track !== '') await mic.close(track).catch(() => undefined);
        const state = await mic.status().catch(() => 'denied');
        return Event.Answered({ permission: permissionOf(state) });
      }
      case 'PausePlayer':
        held.pauses += 1;
        return undefined;
      case 'Start': {
        try {
          if (!native?.available) throw new Error('no ear');
          const track = await mic.open();
          held.track = track;
          const got = await native.later({
            op: 'tuner.listen',
            track,
            feedRate: FEED_RATE,
            frame: FRAME,
          });
          held.rate = typeof got['rate'] === 'number' ? got['rate'] : 0;
          held.ends = typeof got['ends'] === 'number' ? got['ends'] : held.ends;
          held.fed = 0;
          held.focus = unfocused;
          held.run += 1;
          return Event.Started({ attempt: work.attempt });
        } catch {
          await stop(native);
          return Event.Refused({ attempt: work.attempt });
        }
      }
      case 'Stop':
        await stop(native);
        return undefined;
    }
  };

  const stop = async (native: Native | null | undefined) => {
    if (native?.available) await native.later({ op: 'tuner.stop' }).catch(() => undefined);
    const track = held.track;
    held.track = '';
    if (track !== '') await mic.close(track).catch(() => undefined);
  };

  /** Steps the session by `event`, carrying each work item in order and stepping by the event it leads to. */
  const drive = async (first: Work[], native: Native | null | undefined) => {
    const queue = [...first];
    while (queue.length > 0) {
      const work = queue.shift() as Work;
      const next = await carry(work, native);
      if (next === undefined || held.session === undefined) continue;
      const stepped = step(held.session, next);
      held.session = stepped.session;
      queue.push(...stepped.work);
    }
  };

  const answer = (): TunerStepped => {
    held.serial += 1;
    const phase = held.session?.phase ?? { _tag: 'Closed' as const };
    return {
      serial: held.serial,
      phase: phase._tag,
      reason: phase._tag === 'Ended' ? phase.reason : '',
      pauses: held.pauses,
      run: held.run,
    };
  };

  /** Each frame the ear has since the last answer, the latest `TAKEN`. */
  const framesOf = (got: Record<string, unknown>): Float32Array[] => {
    if (Array.isArray(got['frames']))
      return (got['frames'] as string[]).slice(-TAKEN).map((frame) => samplesOf(frame));
    if (typeof got['fed'] !== 'number' || held.feed._tag === 'None') return [];
    const feed = held.feed.value;
    const from = Math.max(held.fed, got['fed'] - TAKEN);
    const frames: Float32Array[] = [];
    for (let index = from; index < got['fed']; index += 1)
      frames.push(feedFrame(feed, index, new Float32Array(FRAME)));
    held.fed = Math.max(held.fed, got['fed']);
    return frames;
  };

  /** One frame through the focus, read against `target` or the nearest string. */
  const heardIn = (frame: Float32Array, target: Target) => {
    const { focus, hz } = hear(held.focus, frame, held.rate);
    held.focus = focus;
    const read: Reading | undefined =
      hz._tag === 'Some'
        ? target._tag === 'Some'
          ? readingOn(hz.value, target.value)
          : reading(hz.value)
        : undefined;
    const heard: Heard = read === undefined ? none : some(read);
    if (read !== undefined) held.last = some(read.string);
    held.latch = latch(held.latch, heard);
    held.heard = heard;
  };

  return {
    tunerPlaces: () => ({ ...PLACES, ticks: TICK_MARKS.map((tick) => ({ ...tick })) }),
    tunerEarOf: async (
      _args: unknown,
      _store: unknown,
      _storage: unknown,
      native?: Native | null,
    ) => {
      if (!native?.available) return { ear: false };
      const got = await native.later({ op: 'tuner.ear' });
      return { ear: got['ear'] === true };
    },
    tunerStep: async (
      [kind, word, active, sounding, feed]: readonly [string, string, boolean, boolean, string],
      _store: unknown,
      _storage: unknown,
      native?: Native | null,
    ): Promise<TunerStepped> => {
      if (kind === 'open') {
        if (held.track !== '') await stop(native);
        Object.assign(held, {
          ...fresh(),
          serial: held.serial,
          pauses: held.pauses,
          run: held.run,
          ends: held.ends,
        });
        held.feed = feedOf(feed);
        const first = opened(active, sounding);
        held.session = first.session;
        await drive([...first.work], native);
        return answer();
      }
      const event = eventOf(kind, word, active, sounding);
      if (event === undefined || held.session === undefined) return answer();
      const stepped = step(held.session, event);
      held.session = stepped.session;
      await drive([...stepped.work], native);
      return answer();
    },
    tunerHear: async (
      [_serial, aim]: readonly [number, string],
      _store: unknown,
      _storage: unknown,
      native?: Native | null,
    ): Promise<TunerView> => {
      const phaseNow = (): Phase['_tag'] => held.session?.phase._tag ?? 'Checking';
      if (phaseNow() !== 'Listening' || !native?.available) {
        held.focus = unfocused;
        held.heard = none;
        return viewOf(held, phaseNow(), aim);
      }
      native.watch('tuner');
      const run = held.run;
      const got = await native.later({ op: 'tuner.take' });
      if (phaseNow() !== 'Listening' || run !== held.run) return viewOf(held, phaseNow(), aim);
      if (
        typeof got['ends'] === 'number' &&
        got['ends'] > held.ends &&
        held.session !== undefined
      ) {
        held.ends = got['ends'];
        const ended = step(
          held.session,
          Event.Ended({ reason: endOf(String(got['ended'] ?? '')) }),
        );
        held.session = ended.session;
        held.heard = none;
        await drive([...ended.work], native);
        return viewOf(held, phaseNow(), aim);
      }
      const target = aimOf(aim);
      for (const frame of framesOf(got)) {
        heardIn(frame, target);
        held.read += 1;
      }
      if (held.read - held.logged >= LOG_EVERY) {
        held.logged = held.read;
        say(
          `[tuner] frames read=${held.read} module ms=${typeof got['ms'] === 'number' ? got['ms'] : -1}`,
        );
      }
      return viewOf(held, phaseNow(), aim);
    },
  };
};
