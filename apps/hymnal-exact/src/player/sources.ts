/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noTryCatch -- Exact's data module cannot import effect (docs/exact.md): it answers a Promise, asks a failed recording's address with the host's `fetch` (its `exactTimeout` outside the DOM's RequestInit), and a rejected fetch is the network's answer, not a defect. */

/**
 * The player's one data source, as `app.ts` registers it: `playerStep(kind,
 * id, serial, value, text)` runs one input of `step` and answers the view.
 * The state lives here, one per launch of the data module; what outlives a
 * launch is the stanza choice, which the view hands back as text for a
 * `persist` state and a `restore` reads in again, and Sound, which the
 * contract tells as `sound` at launch and at each switch. Nothing reads the
 * clock: every input is the call's arguments, a device event names its load
 * and the seek it follows, and the silent clock's `tick` the ms it ran.
 *
 * A failed load is told why by asking the recording's address once: no
 * answer is no connection, a 404 or 403 no recording, anything else a
 * recording that would not play.
 */

import { timelineOf } from '@manna/hymnal-app/follow/timeline';
import type { Section } from '@manna/hymnal-app/player/stanzas';
import { audioKey, soundingOffset } from '@manna/hymnal-app/remote';

import { moveOf } from '../chords/move.ts';
import type { AppModule, Offline, RecordingFiles } from '../offline/sources.ts';
import type { Book } from '../hymns/book.ts';
import { scoreOf } from './score.ts';
import { type Input, type State, type Track, type Why, deviceOf, initial, step } from './step.ts';
import { barOf } from './bar/view.ts';
import { type PlayerView, decodeChoices, decodeTempos, viewOf } from './view.ts';

/** The bucket the recordings are served from. */
export const BUCKET = 'https://hymns.cvr.im';

/**
 * Where the player takes the recordings from: the bucket, or a loopback
 * fixture a development build names (`HYMNAL_RECORDINGS`, README). Any other
 * origin is refused for the bucket's.
 */
export const originOf = (setting: string | undefined): string => {
  if (setting !== undefined && /^http:\/\/127\.0\.0\.1:\d{2,5}$/u.test(setting)) return setting;
  return BUCKET;
};

/**
 * Whether a recording set holds hymn `number`: the first set holds every
 * hymn of the book (`@manna/hymnal/recordings`, which `rules.test.ts` holds
 * this to for each of the 695).
 */
export const recorded = (number: number): boolean =>
  Number.isInteger(number) && number >= 1 && number <= 695;

/** Hymn `number`'s recording's address from `origin`, as the current app's `audioUrl`; empty with none. */
export const recordingAt = (origin: string, number: number, offset = 0): string =>
  recorded(number) ? `${origin}/${audioKey(number, offset)}` : '';

/**
 * Each hymn's heard key from the chords' state, as the current `heardMove`
 * hears it: with chords on, the sounding offset of the hymn's own move's
 * transpose (`moves`, `src/chords/move.ts`); with chords off, every hymn as
 * printed. The capo never reaches the recording.
 */
export const offsetsOf = (chordsOn: boolean, moves: ReadonlyArray<string>) =>
  Object.fromEntries(
    (chordsOn ? moves : []).flatMap((entry) => {
      const number = Number(entry.split(':')[0]);
      const offset = soundingOffset(moveOf(moves, number).transpose);
      return Number.isInteger(number) && offset !== 0 ? [[`${number}`, offset] as const] : [];
    }),
  );

/** Exact's kept values, which the player does not read. */
interface KeptValues {
  readonly get: (name: string) => string | null;
}

/** What a failed load's address answers, as the player says it. */
const whyOf = async (url: string): Promise<Why> => {
  try {
    const answer = await fetch(url, { method: 'HEAD', exactTimeout: 10000 } as RequestInit);
    if (answer.status === 404 || answer.status === 403) return 'missing';
    return 'decode';
  } catch {
    return 'network';
  }
};

const KINDS = new Set([
  'pause',
  'resume',
  'stop',
  'retry',
  'dragStart',
  'dragEnd',
  'chooseAll',
  'tempoReset',
]);

/** The sheet's own asks, by kind. */
const SHEET = ['stanza', 'place', 'tempo', 'tap', 'intro'] as const;
type SheetKind = (typeof SHEET)[number];
const isSheet = (kind: string): kind is SheetKind => SHEET.some((each) => each === kind);

/** The sheet's stanza chip and place, tempo and `Start` asks: a stanza, a dial's stop, a tap's time in ms, the Intro on (1) or off. */
const sheet = (kind: SheetKind, value: number): Input => {
  if (kind === 'stanza') return { _tag: 'chooseStanza', stanza: value };
  if (kind === 'place') return { _tag: 'stanzaPlace', stanza: value };
  if (kind === 'tempo') return { _tag: 'tempo', at: value };
  if (kind === 'tap') return { _tag: 'tap', at: value };
  return { _tag: 'start', intro: value > 0 };
};

/** A way on the bar or the lock screen: back for a negative value, else on. */
const wayOf = (value: number): 1 | -1 => (value < 0 ? -1 : 1);

/**
 * What the view is answered: the view, the recordings' origin, and whether
 * it is a loopback fixture's (`fixture`), which every test that plays holds
 * before it presses Play, whatever port the run's fixture is on.
 */
type Sent = PlayerView & { readonly origin: string; readonly fixture: boolean };

/**
 * Whether `input` asks a save of what it plays, as the current
 * `savingOn` queues one at each play the reader's player makes: a Play of
 * another hymn or of one ended (Sound on or off), and a key turn that loads
 * the new key's recording.
 */
const savesOn = (before: State, input: Input, command: string): boolean => {
  if (input._tag === 'keys') return command === 'load';
  if (input._tag !== 'play') return false;
  const { held } = before;
  return held === undefined || held.track.number !== input.track.number || held.phase === 'ended';
};

/** The player's sources over `book`, its hymns timed by `timing`, the recordings at `origin`, saved by `saved`. */
export const playerSources = (
  book: Book,
  timing: ReadonlyArray<readonly [number, string]>,
  origin: string,
  saved?: Offline,
) => {
  const byNumber = new Map(book.hymns.map((hymn) => [hymn.number, hymn]));
  const timed = new Map(timing);
  const titleOf = (number: number) => byNumber.get(number)?.title ?? '';
  const trackOf = (number: number): Track | undefined => {
    const hymn = byNumber.get(number);
    if (hymn === undefined) return undefined;
    const decoded = timelineOf(timed.get(number) ?? '');
    const timeline = decoded._tag === 'Some' ? decoded.value : undefined;
    return {
      number,
      title: hymn.title,
      url: recordingAt(origin, number),
      keyed: (offset) => recordingAt(origin, number, offset),
      local: (offset) => saved?.localOf({ number, offset }) ?? '',
      score: scoreOf(hymn.sections as ReadonlyArray<Section>, timeline, hymn),
    };
  };
  let state: State = initial;
  const fixture = origin !== BUCKET;
  const apply = (input: Input | undefined): Sent => {
    if (input === undefined) return { ...viewOf(state, undefined, titleOf), origin, fixture };
    const before = state;
    const next = step(state, input);
    state = next.state;
    const { held } = state;
    if (held !== undefined && savesOn(before, input, next.command?._tag ?? ''))
      saved?.enqueue({ number: held.track.number, offset: held.offset });
    return { ...viewOf(state, next.command, titleOf), origin, fixture };
  };
  const play = (number: number) => {
    const track = trackOf(number);
    return track === undefined ? undefined : ({ _tag: 'play', track } as const);
  };
  const reader = (kind: string, value: number): Input | undefined => {
    if (KINDS.has(kind)) return { _tag: kind } as Input;
    if (kind === 'play') return play(value);
    if (isSheet(kind)) return sheet(kind, value);
    if (kind === 'dragTo' || kind === 'seekTo' || kind === 'remoteSeek')
      return { _tag: kind, seconds: value };
    if (kind === 'nudge' || kind === 'remoteSkip') return { _tag: kind, way: wayOf(value) };
    if (kind === 'open') return { _tag: 'openSheet' };
    if (kind === 'close') return { _tag: 'closeSheet' };
    if (kind === 'title') return { _tag: 'titlePressed' };
    if (kind === 'bar') return pressed(barOf(state, titleOf).toggle, barOf(state, titleOf).number);
    if (kind === 'page') {
      const { held } = state;
      if (held?.track.number !== value) return play(value);
      if (held.phase === 'paused' || held.phase === 'ended') return { _tag: 'resume' };
      return pressed(barOf(state, titleOf).toggle, value);
    }
    return undefined;
  };
  const pressed = (toggle: string, number: number): Input | undefined => {
    if (toggle === 'pause') return { _tag: 'pause' };
    if (toggle === 'retry') return { _tag: 'retry' };
    if (toggle === 'play') return play(number);
    return undefined;
  };
  const device = (kind: string, id: number, serial: number, value: number): Input | undefined => {
    if (kind === 'loaded') return { _tag: 'loaded', id, duration: value };
    if (kind === 'time' || kind === 'due') return { _tag: kind, id, serial, seconds: value };
    if (kind === 'seeked' || kind === 'settle') return { _tag: kind, id, serial };
    if (
      kind === 'waiting' ||
      kind === 'waited' ||
      kind === 'played' ||
      kind === 'playing' ||
      kind === 'paused'
    )
      return { _tag: kind, id };
    if (kind === 'ended') return { _tag: 'ended', id };
    if (kind === 'tick') return { _tag: 'tick', id, ms: value };
    if (kind === 'sound') return { _tag: 'sound', on: value > 0 };
    return undefined;
  };
  const playerStep = async (
    [kind, id, serial, value, text]: readonly [string, number, number, number, string],
    _store?: KeptValues,
    storage?: RecordingFiles,
    native?: AppModule | null,
  ): Promise<Sent> => {
    saved?.start(storage, native);
    if (kind === 'online') return apply({ _tag: 'online', on: value > 0 });
    if (kind === 'screen') return apply({ _tag: 'screen', stack: text.split(' ').filter(Boolean) });
    if (kind === 'restore')
      return apply({ _tag: 'restore', choices: decodeChoices(text), tempos: decodeTempos(text) });
    if (kind === 'keys')
      return apply({
        _tag: 'keys',
        offsets: offsetsOf(value > 0, text.split(' ').filter(Boolean)),
      });
    if (kind === 'failed') {
      const device = deviceOf(state);
      const url = device?.load === id ? device.url : '';
      if (url === '') return apply(undefined);
      const { held } = state;
      if (held !== undefined && held.local !== '' && url === held.local) {
        saved?.verify({ number: held.track.number, offset: held.heard });
        return apply({ _tag: 'failed', id, why: 'decode' });
      }
      const why = await whyOf(url);
      return apply({ _tag: 'failed', id, why });
    }
    return apply(reader(kind, value) ?? device(kind, id, serial, value));
  };
  return { playerStep };
};
