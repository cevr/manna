/**
 * The hymn player: one recording at a time, from `audioUrl` (`src/remote.ts`).
 *
 * The player's state is an atom; the reader acts on it by writing commands
 * to `send`. The device's playback is a service (`Playback`): One's `Audio`
 * on a phone and on the web (`playback.live.ts`), or one a test hands in.
 * One's playback tells no events of its own, so while the device says it
 * loads or plays, or has not answered an ask, the player reads its status
 * every `every`. What the page shows comes from what the reads prove
 * (`proof.ts`): Playing at a read that closes a sound pair; Loading, or
 * Buffering once the load has sounded, after 2 s of proved silence; Retry
 * beside Buffering after 15 s of it online; Failed after 15 s of it once
 * told offline 15 s before.
 *
 * Every Play and Pause goes one way, whatever made it: the page's button
 * (or a key on it), Retry, the lock screen, Control Center and the web's
 * Media Session (`remote`) are commands. The page shows the reader's ask at
 * once, asks the device, and reads its status beside the ask, not after it.
 *
 * Each command runs in place of the one before it: starting a hymn while
 * another loads or plays stops following the old one, and the device swaps
 * the recording (One's `Audio.play` replaces the one playing).
 *
 * A Pause before the first sound (Stopped), and a load given up (Failed),
 * let the recording go. iOS keeps a pause before the first sound; Android
 * and the web cannot (MediaPlayer starts once prepared whatever was asked,
 * and the web rejects the waiting `play()` and says `failed`). One rule
 * serves all three: Stopped, and a Play from the reader's place.
 */

import type { Scope } from 'effect';
import {
  Array as Arr,
  Brand,
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Match,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { audioUrl, soundingOffset } from '~/remote';
import { type Move, still } from '~/hymns/chords';

import type { Beat } from './countin';
import * as Proof from './proof';
import { ALL } from './stanzas';
import { DEFAULT_TEMPO, rateOf } from './tempo';
import { initialTarget, type SeekTarget, type SeekTargets, targetAt } from '../follow/seek-targets';
import {
  bundledTargets,
  type HoldCommand,
  HoldState,
  type HoldToken,
  sameTargets,
  type TargetsFor,
} from './word-seek';

type HoldEvent = Data.TaggedEnum<{
  AcquireHold: { readonly token: HoldToken };
  FinishHold: { readonly token: HoldToken };
  RevokeHold: {};
}>;
const HoldEvent = Data.taggedEnum<HoldEvent>();
const holdAction = Predicate.or(HoldEvent.$is('AcquireHold'), HoldEvent.$is('FinishHold'));

interface HoldSnapshot {
  readonly start: number;
  readonly key: number;
  readonly tempo: number;
  readonly intro: Option.Option<boolean>;
  readonly sound: Option.Option<boolean>;
  readonly recording: Option.Option<RecordingSelection>;
}

interface HoldTransaction {
  readonly token: HoldToken;
  readonly targets: SeekTargets;
  readonly snapshot: HoldSnapshot;
  target: SeekTarget;
  origin: Option.Option<number>;
  ending: Option.Option<'Release' | 'Cancel'>;
  resuming: boolean;
}

interface HoldAccess {
  get<A>(atom: Atom.Atom<A>): A;
  set<R, W>(atom: Atom.Writable<R, W>, value: W): void;
}

/** A hymn the player plays: its number names its recording. */
export interface Track {
  readonly number: number;
  readonly title: string;
}

/**
 * Where the player is. A position and a length are in seconds; the length
 * is none until the recording says it.
 */
export type Player = Data.TaggedEnum<{
  Idle: {};
  Loading: { readonly track: Track };
  Playing: { readonly track: Track; readonly at: number; readonly length: Option.Option<number> };
  /**
   * Playing, but the device waits on the network mid-recording (a stall, or
   * a seek past what it holds); `retry` once it has waited long enough that
   * the page offers Retry beside Pause.
   */
  Buffering: {
    readonly track: Track;
    readonly at: number;
    readonly length: Option.Option<number>;
    readonly retry: boolean;
  };
  Paused: { readonly track: Track; readonly at: number; readonly length: Option.Option<number> };
  Ended: { readonly track: Track; readonly length: Option.Option<number> };
  /**
   * The reader paused before the first sound: the device holds nothing, and
   * Play starts it again from the reader's place `at`, if it has one.
   */
  Stopped: { readonly track: Track; readonly at: Option.Option<number> };
  /**
   * The recording could not play; `offline` when the device has no
   * connection. Retry plays it again from the reader's place `at`, if any.
   */
  Failed: {
    readonly track: Track;
    readonly offline: boolean;
    readonly at: Option.Option<number>;
  };
}>;
export const Player = Data.taggedEnum<Player>();

/** What the reader asks of the player. */
export type Command = Data.TaggedEnum<{
  /** Play this hymn from its start, in place of any other. */
  Start: { readonly track: Track };
  Pause: {};
  Resume: {};
  /** Move to `seconds` into the hymn as it plays: the chosen stanzas' sung time (`sound.ts`). */
  Seek: { readonly seconds: number };
  /** Show the device's playback again: the lock screen moved it to a place it did not say. */
  Follow: {};
}>;
export const Command = Data.taggedEnum<Command>();

/** Internal subscription message. The reader and remote command vocabulary stays unchanged. */
type KeyChange = Data.TaggedEnum<{ Key: { readonly number: number; readonly offset: number } }>;
const KeyChange = Data.taggedEnum<KeyChange>();

/**
 * What the reader last asked of the recording: to hear it (Start, Resume, the
 * lock screen's play) or not (Pause, the lock screen's pause). A device that
 * says `loading` mid-recording is read by it: waiting to play, or paused.
 */
export type Intent = 'play' | 'pause';

/** The device's playback as One's `Audio` reports it. */
export interface Status {
  readonly state: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'failed';
  readonly positionMs: number;
  readonly durationMs?: number;
  /** Musical place retained while the global session prepares a replacement. */
  readonly replacementMs?: number;
  readonly recording?: RecordingSelection;
  /**
   * Ms of the place for each ms of the host's clock while it plays: the held hymn's tempo,
   * Sound on or off (`sound.ts`; with Sound on the recording plays at it); 1 when not told.
   */
  readonly rate?: number;
  /**
   * While a count-in holds the place at the first sung line (`sound.ts`): the host's ms left
   * until the place runs. The place is the reader's, and the player shows Playing there.
   */
  readonly countInMs?: number;
}

/** A replacement follows musical time while the global recording loads. */
export interface PlayOptions {
  readonly continuous: boolean;
  readonly ready: boolean;
  readonly intent?: Intent;
  readonly recording?: { readonly number: number; readonly offset: number };
  /**
   * The hymn's tempo, ms of the hymn for each ms, that the play runs at: the score clock
   * (`sound.ts`) with Sound off, the device's recording with Sound on; 1 when not told.
   */
  readonly rate?: number;
  /**
   * The stanzas the play sings (`stanzas.ts`'s `Choice`, `[]` for all): the score clock
   * (`sound.ts`) runs the place over their lines alone, and skips the rest; all when not told.
   */
  readonly stanzas?: ReadonlyArray<number>;
  /**
   * The `Intro` switch at the play. With Sound on, `false` plays a start from the first sung
   * line of the chosen stanzas, past the recording's intro; from 0 when not told.
   */
  readonly intro?: boolean;
  /**
   * With Sound off, whether a start counts one bar in at the first sung line before the place
   * runs (`countin.ts`); none when not told.
   */
  readonly countIn?: boolean;
}

/** Requested and effective sounding offsets; a fallback is never silently claimed as the chosen Key. */
export interface RecordingSelection {
  readonly number: number;
  readonly requested: number;
  readonly effective: number;
}

export class PlaybackError extends Schema.TaggedError<PlaybackError>()('PlaybackError', {
  operation: Schema.String,
  message: Schema.String,
  positionMs: Schema.optionalKey(Schema.Finite),
}) {}

/**
 * A press of the lock screen, Control Center or the web's Media Session (the
 * browser's and the system's media controls, a hardware key): a play, a
 * pause, or a seek to a place, if it says one.
 */
export type Remote = Data.TaggedEnum<{
  Play: {};
  Pause: {};
  Seek: { readonly seconds: Option.Option<number> };
}>;
export const Remote = Data.taggedEnum<Remote>();

/** The command a remote press is: the one the page's own controls send. */
const commandOf: (remote: Remote) => Command = Remote.$match({
  Play: () => Command.Resume(),
  Pause: () => Command.Pause(),
  Seek: ({ seconds }) =>
    Option.match(seconds, {
      onNone: () => Command.Follow(),
      onSome: (to) => Command.Seek({ seconds: to }),
    }),
});

/** What the lock screen and Control Center show while a hymn plays. */
export interface Announcement {
  readonly title: string;
  readonly artist: string;
}

/** The device's one playback session. */
export interface PlaybackApi {
  /**
   * Play `uri` from `fromMs` in place of whatever plays now; past 0, it asks
   * the seek again while the device holds the recording, until it lands.
   */
  readonly play: (
    uri: string,
    fromMs: number,
    options?: PlayOptions,
  ) => Effect.Effect<Status, PlaybackError>;
  readonly pause: Effect.Effect<Status, PlaybackError>;
  /** Play on; from the start once the recording has ended. */
  readonly resume: Effect.Effect<Status, PlaybackError>;
  readonly seek: (positionMs: number) => Effect.Effect<Status, PlaybackError>;
  readonly status: Effect.Effect<Status, PlaybackError>;
  /** The held hymn's tempo changed: the place moves on at `rate` from where it stands. */
  readonly setRate?: (rate: number) => Effect.Effect<void>;
  /**
   * The held hymn's stanza choice changed (`[]` for all): the place keeps its place in the
   * recording, or moves on to the next chosen line's start when its line is no longer sung.
   */
  readonly setStanzas?: (stanzas: ReadonlyArray<number>) => Effect.Effect<void>;
  /** The rate the place moves at, ms of the hymn for each ms: now, then at each change. */
  readonly pace?: Stream.Stream<number>;
  /** The beat a count-in stands at, none while none counts: now, then at each change. */
  readonly beats?: Stream.Stream<Option.Option<Beat>>;
  /** Adopt a selection whose effective set already sounds, without a device load. */
  readonly selectRecording?: (selection: RecordingSelection) => Effect.Effect<void>;
  /** Let the recording go: nothing loads or plays, the lock screen shows nothing, and the status says `idle`. */
  readonly stop: Effect.Effect<void, PlaybackError>;
  /** Whether the device has a connection: now, then at each change, in order. */
  readonly connection: Stream.Stream<boolean>;
  /** Show the recording on the lock screen and in Control Center. */
  readonly announce: (announcement: Announcement) => Effect.Effect<void, PlaybackError>;
  /**
   * Each play, pause or seek pressed on the lock screen, in Control Center or
   * in the web's Media Session, told at the press: the player asks the device
   * for it (a phone's session has done it already, and the ask repeats it).
   */
  readonly remote: Stream.Stream<Remote>;
}

export class Playback extends Context.Service<Playback, PlaybackApi>()('hymnal/Playback') {}

/** The connection as the device last told it, and when it told it. */
interface Told {
  readonly online: boolean;
  readonly since: number;
}

/** The connection the player follows, from the device's `connection`. */
class Link extends Context.Service<Link, { readonly told: () => Told }>()('hymnal/Link') {}

/** Follows the device's connection for as long as the player's runtime lives. */
const linkLayer = Layer.effect(Link)(
  Effect.gen(function* () {
    const device = yield* Playback;
    let told: Told = { online: true, since: yield* Clock.currentTimeMillis };
    yield* Stream.runForEach(device.connection, (online) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        if (online !== told.online) told = { online, since: now };
      }),
    ).pipe(Effect.forkScoped({ startImmediately: true }));
    return Link.of({ told: () => told });
  }),
);

/**
 * Where the device's answers to the player's asks run: the player's runtime,
 * never the command that asked. A command runs in place of the one before
 * it, but the device has each ask once it is sent, so its answer lands the
 * act it answers whatever command comes next.
 */
class Answers extends Context.Service<Answers, Scope.Scope>()('hymnal/Answers') {}

/** The scope of the player's runtime, closed with it. */
const answersLayer = Layer.effect(Answers)(Effect.scope);

/** The hymn the player holds, if any. */
export const trackOf: (player: Player) => Option.Option<Track> = Player.$match({
  Idle: () => Option.none(),
  Loading: ({ track }) => Option.some(track),
  Playing: ({ track }) => Option.some(track),
  Buffering: ({ track }) => Option.some(track),
  Paused: ({ track }) => Option.some(track),
  Ended: ({ track }) => Option.some(track),
  Stopped: ({ track }) => Option.some(track),
  Failed: ({ track }) => Option.some(track),
});

/** Whether the device holds no recording for the player: it was let go, or it failed. */
const letGo = Predicate.or(Player.$is('Stopped'), Player.$is('Failed'));

/** The stand: silence proved this long shows Loading or Buffering. */
const stand = Duration.seconds(2);
/** The wait: silence proved this long offers Retry online, and gives the load up offline. */
const giveUpAfter = Duration.seconds(15);

const seconds = (ms: number) => ms / 1000;

/** The length a player shows, if it shows one. */
const lengthIn: (player: Player) => Option.Option<number> = Player.$match({
  Idle: () => Option.none(),
  Loading: () => Option.none(),
  Playing: ({ length }) => length,
  Buffering: ({ length }) => length,
  Paused: ({ length }) => length,
  Ended: ({ length }) => length,
  Stopped: () => Option.none(),
  Failed: () => Option.none(),
});

const lengthOf = (status: Status) =>
  Option.fromNullishOr(status.durationMs).pipe(
    Option.filter((ms) => Number.isFinite(ms) && ms > 0),
    Option.map(seconds),
  );

/** Whether the device holds the recording and may land a seek. */
const holdsRecording = (status: Status) =>
  status.state === 'loading' || status.state === 'playing' || status.state === 'paused';

/** The rate a status's place moves at: its `rate` when that is a positive number, else 1. */
const paceOf = (status: Status) => {
  const rate = status.rate ?? 1;
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return rate;
};

/** The host's ms a status's count-in has left, while it counts in at a playing place. */
const counting = (status: Status) =>
  Option.fromNullishOr(status.countInMs).pipe(
    Option.filter((ms) => status.state === 'playing' && ms > 0),
  );

/**
 * The wait between two reads, so that a place moving at `pace` moves at most `every` from one
 * to the next: the seeker and the follow see the hymn in the same steps at every tempo, and a
 * Play shows its start within `every` of the place it started from. Whole ms, rounded down.
 */
const pollAt = (every: Duration.Input, pace: number) =>
  Duration.millis(Math.max(1, Math.floor(Duration.toMillis(every) / pace)));

/** The reader's place a let-go player keeps, in seconds. */
const placeOf = (proof: Proof.Proof) => Option.map(proof.place, seconds);

/** What the player holds across the commands (see `held` in `playerOn`). */
interface Held {
  wants: Intent;
  /** A fresh Start owns its reads independently of Key and Resume handovers. */
  starts: number;
  /** Distinguishes acts even when two commands share one clock millisecond. */
  acts: number;
  proof: Proof.Proof;
  seeking: Option.Option<{ readonly to: number; asking: boolean }>;
  moving: Option.Option<Fiber.Fiber<unknown, unknown>>;
  reading: Option.Option<{
    readonly start: number;
    readonly act: number;
    readonly done: Deferred.Deferred<Proof.Read, PlaybackError>;
  }>;
  resuming: boolean;
  id: number;
  announced: number;
  offset: number;
  replacing: boolean;
  /** The rate the latest read's place moves at (its status's `rate`, 1 when not told). */
  pace: number;
  /** The host's time a count-in the latest read told ends at: the next read comes no later. */
  countEnds: Option.Option<number>;
}

const printed = Atom.make<Move>(still);
const asWritten = Atom.make(DEFAULT_TEMPO);
const everyStanza = Atom.make<ReadonlyArray<number>>(ALL);

/** Two stanza choices of one hymn the same: the same numbers in the same order. */
const sameStanzas = Arr.makeEquivalence<number>((a, b) => a === b);

/**
 * The player's atoms over the device's `playback`, reading its status every `every` while it
 * moves. `moveFor` gives a hymn's transpose and capo, `tempoFor` its tempo in percent,
 * `stanzasFor` the stanzas it sings (`[]` for all), and `intro` the `Intro` switch each play
 * carries as `PlayOptions.intro` and `countIn` (neither when not given).
 */
export const playerOn = (
  playback: Layer.Layer<Playback>,
  every: Duration.Input,
  moveFor: (number: number) => Atom.Atom<Move> = () => printed,
  tempoFor: (number: number) => Atom.Atom<number> = () => asWritten,
  stanzasFor: (number: number) => Atom.Atom<ReadonlyArray<number>> = () => everyStanza,
  intro?: Atom.Atom<boolean>,
  targetsFor: TargetsFor = bundledTargets,
  sound?: Atom.Atom<boolean>,
) => {
  const keyFor = Atom.family((number: number) =>
    Atom.map(moveFor(number), (move) => soundingOffset(move.transpose)),
  );
  /** A hymn's tempo as a rate, ms of the hymn for each ms; a tempo off the dial's stops is 1. */
  const rateFor = Atom.family((number: number) => Atom.map(tempoFor(number), rateOf));
  const runtime = Atom.runtime(
    Layer.provideMerge(Layer.mergeAll(linkLayer, answersLayer), playback),
  );
  const state = Atom.make<Player>(Player.Idle()).pipe(Atom.keepAlive);
  const recording = Atom.make<Option.Option<RecordingSelection>>(Option.none()).pipe(
    Atom.keepAlive,
  );
  /**
   * What the player holds across the commands: the reader's intent, what the
   * reads have proved, the place a seek still asks the device for (and
   * whether that ask is in flight), the ask that moves the device, the read
   * in flight, whether a Resume from Ended still reads the device before it
   * acts, and the recording's count and the count it was announced at. Each
   * write tells `work`, so what a hold waits on is published as it changes.
   */
  const tellers = new Set<() => void>();
  const told = () => tellers.forEach((tell) => tell());
  const held: Held = new Proxy<Held>(
    {
      wants: 'play',
      starts: 0,
      acts: 0,
      proof: Proof.none,
      seeking: Option.none(),
      moving: Option.none(),
      reading: Option.none(),
      resuming: false,
      id: 0,
      announced: -1,
      offset: 0,
      replacing: false,
      pace: 1,
      countEnds: Option.none(),
    },
    {
      set: (target, key, value) => {
        const done = Reflect.set(target, key, value);
        told();
        return done;
      },
    },
  );
  const holdState = Atom.make<HoldState>(HoldState.Free()).pipe(Atom.keepAlive);
  const tokenOf = Brand.nominal<HoldToken>();
  let transaction = Option.none<HoldTransaction>();
  let revokedWork = false;
  /** Whether no work of the player's own keeps a hold from taking: no hold open, no recording being replaced, no place pending, no count-in told. */
  const unbusy = () =>
    Option.isNone(transaction) &&
    !held.replacing &&
    Option.isNone(held.proof.pending) &&
    Option.isNone(held.countEnds);
  /** `unbusy` as an atom, told again at each write of `held` and of the open hold. */
  const work = Atom.make((get) => {
    const tell = () => get.setSelf(unbusy());
    tellers.add(tell);
    get.addFinalizer(() => void tellers.delete(tell));
    return unbusy();
  });
  const capture = (get: HoldAccess, number: number): HoldSnapshot => ({
    start: held.starts,
    key: get.get(keyFor(number)),
    tempo: get.get(rateFor(number)),
    intro: Option.map(Option.fromNullishOr(intro), (atom) => get.get(atom)),
    sound: Option.map(Option.fromNullishOr(sound), (atom) => get.get(atom)),
    recording: get.get(recording),
  });
  const abandonHold = () => {
    if (Option.isNone(transaction)) return;
    transaction = Option.none();
    told();
    revokedWork = true;
    held.seeking = Option.none();
    held.proof = { ...held.proof, pending: Option.none() };
  };
  const revoke = (get: HoldAccess) => {
    if (Option.isNone(transaction)) return;
    abandonHold();
    get.set(holdState, HoldState.Free());
  };
  const owns = (get: HoldAccess, hold: HoldTransaction): boolean => {
    if (!Option.contains(transaction, hold)) return false;
    const snapshot = capture(get, hold.targets.number);
    const before = hold.snapshot;
    const projection = targetsFor(hold.targets.number, get.get(stanzasFor(hold.targets.number)));
    const valid =
      snapshot.start === before.start &&
      snapshot.key === before.key &&
      snapshot.tempo === before.tempo &&
      Option.makeEquivalence<boolean>((a, b) => a === b)(snapshot.intro, before.intro) &&
      Option.makeEquivalence<boolean>((a, b) => a === b)(snapshot.sound, before.sound) &&
      Option.makeEquivalence<RecordingSelection>(
        (a, b) =>
          a.number === b.number && a.requested === b.requested && a.effective === b.effective,
      )(snapshot.recording, before.recording) &&
      Option.exists(projection, (current) => sameTargets(current, hold.targets));
    if (!valid) revoke(get);
    return valid;
  };
  const clearHold = (get: HoldAccess, hold: HoldTransaction) => {
    if (!Option.contains(transaction, hold)) return;
    transaction = Option.none();
    told();
    get.set(holdState, HoldState.Free());
  };

  const dispatch = runtime
    .fn(
      Effect.fn('Player.send')(function* (
        command: Command | KeyChange | HoldEvent,
        get: Atom.FnContext,
      ) {
        const device = yield* Playback;
        const link = yield* Link;
        const answers = yield* Answers;
        const now = Clock.currentTimeMillis;
        const show = (player: Player) => Effect.sync(() => get.set(state, player));
        const offline = () => !link.told().online;
        const failed = (track: Track) =>
          Player.Failed({ track, offline: offline(), at: placeOf(held.proof) });
        /**
         * Whether a Playing page may keep Playing at `at`: no act came since its sound pair, or
         * the sound that pair proved is less than the stand before `at`. No pair spans an act,
         * so past it the page shows Buffering, as if the stand of silence ran from that sound.
         */
        const heardWithin = (at: number) =>
          Option.exists(
            held.proof.heard,
            (it) => !it.acted || at - it.at < Duration.toMillis(stand),
          );
        /**
         * An act the page knows now, moving the device to `target` ms if it
         * names one. No pair spans it. A page that showed Playing keeps it
         * while the sound proved before the act is within the stand
         * (`heardWithin`): a seek asks for no sound, so it shows no Loading
         * (P1). It starts the wait again, so a Retry beside Buffering goes
         * until the new wait runs out.
         */
        const act = (target: Option.Option<number>) =>
          Effect.flatMap(now, (at) => {
            held.acts += 1;
            held.proof = Proof.acted(held.proof, at, target);
            const was = get.registry.get(state);
            const kept = Player.$is('Playing')(was) && heardWithin(at);
            if (kept || (!Player.$is('Playing')(was) && !Player.$is('Buffering')(was)))
              return Effect.void;
            return show(
              Player.Buffering({ track: was.track, at: was.at, length: was.length, retry: false }),
            );
          });
        /**
         * One status read per Start, run in the player's scope.
         * Commands on that hymn share an in-flight read. A new Start
         * owns a fresh read, even in the same clock millisecond: the former
         * recording's delayed status cannot describe its replacement or hold
         * the player's read slot. The score clock also observes outside its
         * command lock, so a new device Play is independent of that read.
         */
        const readDevice = Effect.suspend(() =>
          Option.match(
            Option.filter(
              held.reading,
              (reading) => reading.start === held.starts && reading.act === held.acts,
            ),
            {
              onSome: ({ done }) => Deferred.await(done),
              onNone: () =>
                Effect.gen(function* () {
                  const done = yield* Deferred.make<Proof.Read, PlaybackError>();
                  const start = held.starts;
                  held.reading = Option.some({ start, act: held.acts, done });
                  const reading = Effect.gen(function* () {
                    const asked = yield* now;
                    const raw = yield* device.status;
                    let status = raw;
                    if (held.starts === start && held.replacing)
                      status = {
                        ...raw,
                        state: 'loading',
                        positionMs:
                          raw.replacementMs ??
                          Option.getOrElse(held.proof.place, () => raw.positionMs),
                      };
                    return { asked, answered: yield* now, status };
                  }).pipe(
                    Effect.onExit(() =>
                      Effect.sync(() => {
                        if (Option.exists(held.reading, (it) => it.done === done))
                          held.reading = Option.none();
                      }),
                    ),
                    Effect.exit,
                    Effect.flatMap((exit) => Deferred.done(done, exit)),
                  );
                  yield* Effect.forkIn(reading, answers, { startImmediately: true });
                  return yield* Deferred.await(done);
                }),
            },
          ),
        );
        /**
         * A read asked since the latest act, and since any answer that said `ended` unless it says
         * `ended` too: one asked before either may show the device before it, so the device is
         * read again.
         */
        const readFresh = Effect.filterOrElse(
          readDevice,
          (read) =>
            read.asked >= held.proof.known &&
            (read.status.state === 'ended' || read.asked >= held.proof.endedAt),
          () => readDevice,
        );
        /**
         * Whether the device is still asked the place a seek or a play from a place asks: an ask
         * refused or answered off its place is asked again only while the device holds the
         * recording, so after an `ended` read only an ask in flight may still land.
         */
        const landable = () => Option.exists(held.seeking, (it) => it.asking);
        /** One read, taken into the proof and shown nowhere; a refused read changes nothing. */
        const lastLook = Effect.suspend(() => {
          const start = held.starts;
          return readFresh.pipe(
            Effect.tap((read) =>
              Effect.sync(() => {
                if (held.starts === start)
                  held.proof = Proof.readOf(held.proof, read, landable()).proof;
              }),
            ),
            Effect.option,
          );
        });
        /**
         * The device answered the ask for `to` ms, asked at `asked`: the act lands
         * when the answer's place is in its window (`Proof.answered`), and the
         * place is asked no more. An answer outside it leaves the place asked.
         */
        const answeredAt = (asked: number, to: number) => (status: Status) =>
          Effect.flatMap(now, (at) =>
            Effect.sync(() => {
              held.proof = Proof.answered(held.proof, { asked, answered: at, status }, to).proof;
              if (Option.isNone(held.proof.pending)) held.seeking = Option.none();
            }),
          );
        /** The adapter's retained clock follows newer seeks while its replacement prepares. */
        const replacementLanded = (asked: number, at: number) => (status: Status) =>
          Effect.suspend(() =>
            Option.match(held.proof.pending, {
              onNone: () => answeredAt(asked, at)(status),
              onSome: (pending) => answeredAt(pending.known, pending.target)(status),
            }),
          );
        /** The ask that moves the device cut off: a newer one moves it, or the recording is let go. */
        const cut = Effect.suspend(() => {
          const fiber = held.moving;
          held.moving = Option.none();
          return Option.match(fiber, { onNone: () => Effect.void, onSome: Fiber.interrupt });
        });
        if (revokedWork) {
          revokedWork = false;
          yield* cut;
        }
        /**
         * An ask that moves the device (a play or a seek), run in the player's scope in place of
         * the one before it: the adapter asks a play's seek again until it lands, so only the
         * latest place is asked. A command that moves nothing leaves it to its answer.
         */
        const moves = (operation: Effect.Effect<unknown>) =>
          Effect.gen(function* () {
            yield* cut;
            const fiber = yield* Effect.forkIn(operation, answers, { startImmediately: true });
            held.moving = Option.some(fiber);
          });
        /** The place a seek asks, asked of the device until an answer lands it. */
        const askSeek = (to: number) =>
          Effect.gen(function* () {
            const owner = transaction;
            if (Option.isSome(owner) && !owns(get.registry, owner.value)) return;
            const seeking = { to, asking: true };
            held.seeking = Option.some(seeking);
            const asked = yield* now;
            yield* device.seek(to).pipe(
              Effect.flatMap((status) =>
                Effect.gen(function* () {
                  if (Option.isSome(owner) && !owns(get.registry, owner.value)) return;
                  yield* answeredAt(asked, to)(status);
                  if (Option.isSome(owner) && Option.isNone(held.proof.pending))
                    yield* resumeHold(owner.value);
                }),
              ),
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.seek.refused').pipe(
                  Effect.annotateLogs({ to, message: error.message }),
                ),
              ),
              Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
            );
          });
        /** A seek the device refused or answered outside its window, asked again while it holds the recording. */
        const askAgain = (status: Status) =>
          Effect.suspend(() => {
            if (held.replacing) return Effect.void;
            return Option.match(
              Option.filter(
                held.seeking,
                (it) => !it.asking && holdsRecording(status) && Option.isSome(held.proof.pending),
              ),
              {
                onNone: () => Effect.void,
                onSome: ({ to }) => moves(askSeek(to)),
              },
            );
          });
        /** The hymn on the lock screen and in Control Center; a failure only logged. */
        const announce = (track: Track) =>
          device
            .announce({ title: track.title, artist: `Hymn ${track.number}` })
            .pipe(
              Effect.catchTag('PlaybackError', (error) =>
                Effect.logWarning('player.announce.failed').pipe(
                  Effect.annotateLogs({ message: error.message }),
                ),
              ),
            );
        /**
         * The recording on the lock screen and in Control Center, once per
         * recording: once the device holds it (it answered an ask, or it
         * plays) and the player has not let it go. Whatever command comes
         * next, an announce begun is not cut off. It runs beside the reads,
         * so its answer never holds the next read back.
         */
        const announceOnce = (track: Track, answer: Option.Option<boolean>) =>
          Effect.suspend(() => {
            const page = get.registry.get(state);
            const holds = Option.contains(answer, true) || Player.$is('Playing')(page);
            if (!holds || letGo(page) || held.announced === held.id) return Effect.void;
            held.announced = held.id;
            return Effect.forkDetach(announce(track)).pipe(Effect.asVoid);
          });
        /** The load given up: the page offers Retry, and the device lets the recording go. */
        const giveUp = (track: Track) =>
          Effect.logWarning('player.load.stalled').pipe(
            Effect.annotateLogs({ track: track.number }),
            Effect.andThen(show(failed(track))),
            Effect.andThen(cut),
            Effect.andThen(Effect.ignore(device.stop)),
          );
        /**
         * The page after `read` of `track`, as the reader wants it: Playing at
         * a read that closes a sound pair; Loading, or Buffering once this
         * load has sounded, after the stand; Retry beside it after the wait
         * online; else what it showed, at the read's place.
         */
        const seenAt = (track: Track, read: Proof.Read, seen: Proof.Seen): Player => {
          const was = get.registry.get(state);
          const sameTrack = Option.exists(trackOf(was), (it) => it.number === track.number);
          const length = Option.orElse(lengthOf(read.status), () =>
            Option.flatMap(
              Option.liftPredicate(was, () => sameTrack),
              lengthIn,
            ),
          );
          const at = seconds(
            read.status.replacementMs ??
              Option.getOrElse(
                Option.map(held.proof.pending, (it) => it.target),
                () => read.status.positionMs,
              ),
          );
          const quiet = Proof.silentFor(held.proof, read);
          /**
           * Whether a page that showed Playing still does after `it`, which proved no sound. With
           * no act since the sound pair, the stall rule alone turns it. While an act is pending,
           * a place that moves on keeps it, else the stand from the sound before the act. After
           * the landing the stall rule turns it, from the landing; but where the device showed
           * no sound before the landing (`quiet`), the first pair after it that proves none turns
           * it once the stand from the sound before the act has run.
           */
          const keptAcross = (it: Proof.Read, by: Proof.Seen) => {
            if (!Option.exists(held.proof.heard, (heard) => heard.acted)) return true;
            if (by === 'ahead') return true;
            if (Option.isSome(held.proof.pending) || it.asked < held.proof.landed)
              return heardWithin(it.asked);
            const quietBefore = Option.exists(held.proof.heard, (heard) => heard.quiet);
            const none = by === 'silence' || by === 'nothing';
            return !(quietBefore && none) || heardWithin(it.asked);
          };
          const buffering = (retry: boolean) =>
            Match.value(held.proof.sounded).pipe(
              Match.when(true, () => Player.Buffering({ track, at, length, retry })),
              Match.orElse(() => Player.Loading({ track })),
            );
          if (seen === 'sound') return Player.Playing({ track, at, length });
          if (held.wants === 'pause') return Player.Paused({ track, at, length });
          if (Option.isSome(counting(read.status)))
            return Player.Playing({ track, at: seconds(read.status.positionMs), length });
          if (quiet >= Duration.toMillis(stand))
            return buffering(quiet >= Duration.toMillis(giveUpAfter) && !offline());
          return Player.$match(was, {
            Playing: () =>
              Match.value(keptAcross(read, seen)).pipe(
                Match.when(true, () => Player.Playing({ track, at, length })),
                Match.orElse(() => buffering(false)),
              ),
            Buffering: () => buffering(false),
            Loading: () => Player.Loading({ track }),
            Idle: () => buffering(false),
            Paused: () => buffering(false),
            Ended: () => buffering(false),
            Stopped: () => buffering(false),
            Failed: () => buffering(false),
          });
        };
        /**
         * Whether the wait has run out offline: silence and the connection's loss each 15 s old
         * at once, at the read's ask, the last instant its silence is proved.
         */
        const givenUp = (read: Proof.Read) => {
          const wait = Duration.toMillis(giveUpAfter);
          const told = link.told();
          return (
            held.wants === 'play' &&
            Proof.silentFor(held.proof, read) >= wait &&
            !told.online &&
            read.asked - told.since >= wait
          );
        };
        /**
         * A `paused` the reader did not ask for is the device's own pause, and the page shows
         * Paused: the device is asked to pause once, so it holds what the page shows. Android
         * starts a recording paused before it was prepared and says `paused` over its sound
         * (One 2.8.1, HybridOneAudio.kt:199-204); a device paused already stays so.
         */
        const heldPaused = Effect.suspend(() => {
          if (Option.isSome(transaction)) return Effect.void;
          if (held.wants === 'pause') return Effect.void;
          held.wants = 'pause';
          return Effect.ignore(device.pause);
        });
        /**
         * Read the device's status once and show it; whether to read on. The
         * reads end when the device fails, ends, is idle or paused with no
         * place pending, or when the load is given up.
         */
        const readOnce = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            const read = yield* readFresh;
            const status = read.status;
            let closedHold = false;
            if (Option.isSome(transaction)) {
              const hold = transaction.value;
              if (!owns(get.registry, hold)) return false;
              if (
                status.state === 'idle' ||
                status.state === 'ended' ||
                status.state === 'failed'
              ) {
                revoke(get.registry);
                yield* cut;
                closedHold = true;
              }
            }
            held.pace = paceOf(status);
            const count = counting(status);
            held.countEnds = Option.map(count, (ms) => read.answered + ms);
            const next = Proof.readOf(held.proof, read, landable());
            held.proof = Option.match(count, {
              onNone: () => next.proof,
              onSome: () => ({ ...next.proof, quietFrom: Option.none() }),
            });
            const answer = yield* Effect.when(Deferred.await(answered), Deferred.isDone(answered));
            if (Option.contains(answer, false)) {
              yield* show(failed(track));
              return false;
            }
            if (next.seen === 'stale') return true;
            if (status.recording?.number === track.number) remember(status.recording);
            yield* askAgain(status);
            let gaveUp = false;
            const done = yield* Match.value(status.state).pipe(
              Match.when('failed', () => Effect.as(show(failed(track)), true)),
              Match.when('ended', () =>
                Effect.as(show(Player.Ended({ track, length: lengthOf(status) })), true),
              ),
              Match.when('idle', () => Effect.as(show(Player.Idle()), true)),
              Match.when('paused', () =>
                Effect.as(
                  show(
                    Player.Paused({
                      track,
                      at: seconds(status.positionMs),
                      length: Option.orElse(lengthOf(status), () =>
                        lengthIn(get.registry.get(state)),
                      ),
                    }),
                  ).pipe(Effect.andThen(heldPaused)),
                  Option.isNone(held.proof.pending),
                ),
              ),
              Match.orElse(() =>
                Effect.suspend(() => {
                  if (givenUp(read)) {
                    gaveUp = true;
                    return Effect.as(giveUp(track), true);
                  }
                  return Effect.as(show(seenAt(track, read, next.seen)), false);
                }),
              ),
            );
            yield* announceOnce(track, answer);
            return (
              !closedHold &&
              !gaveUp &&
              (!done || Option.isNone(answer) || Option.isSome(transaction))
            );
          }).pipe(
            Effect.catchTag('PlaybackError', (error) =>
              Effect.logWarning('player.status.failed').pipe(
                Effect.annotateLogs({ message: error.message }),
                Effect.andThen(
                  Effect.suspend(() => {
                    if (Option.isNone(transaction)) return Effect.void;
                    revoke(get.registry);
                    return cut;
                  }),
                ),
                Effect.andThen(show(failed(track))),
                Effect.as(false),
              ),
            ),
          );
        /**
         * Show the device's status while the ask is not `answered`, and after
         * until its playback stops moving: a read every `every` of the place's
         * time (`pollAt`), and one at once when the device answers.
         */
        const watch = (track: Track, answered: Deferred.Deferred<boolean>) =>
          Effect.gen(function* () {
            /**
             * Until the next read: `every` of the place's time, or less once the device answers;
             * no later than a count-in's end, so the run is read from where it starts.
             */
            const rest = Deferred.isDone(answered).pipe(
              Effect.flatMap((done) =>
                Match.value(done).pipe(
                  Match.when(true, () =>
                    Effect.flatMap(now, (at) => {
                      const poll = Duration.toMillis(pollAt(every, held.pace));
                      const ms = Option.match(held.countEnds, {
                        onNone: () => poll,
                        onSome: (ends) => Math.min(poll, Math.max(0, ends - at)),
                      });
                      return Effect.sleep(Duration.millis(ms));
                    }),
                  ),
                  Match.orElse(() =>
                    Deferred.await(answered).pipe(
                      Effect.asVoid,
                      Effect.timeoutOrElse({ duration: every, orElse: () => Effect.void }),
                    ),
                  ),
                ),
              ),
            );
            let more = yield* readOnce(track, answered);
            while (more) {
              yield* rest;
              more = yield* readOnce(track, answered);
            }
          });
        /**
         * Ask the device, and show its status while it answers and after. A refusal is
         * `refused`: `true` reads on, `false` shows Failed. An ask that `moving` moves the device
         * runs in place of the one before it (`moves`).
         */
        const ask = (
          track: Track,
          operation: Effect.Effect<unknown, PlaybackError>,
          refused: (error: PlaybackError) => Effect.Effect<boolean>,
          moving = false,
        ) =>
          Effect.gen(function* () {
            const answered = yield* Deferred.make<boolean>();
            const asking = operation.pipe(
              Effect.as(true),
              Effect.catchTag('PlaybackError', refused),
              Effect.flatMap((goOn) => Deferred.succeed(answered, goOn)),
            );
            yield* Match.value(moving).pipe(
              Match.when(true, () => moves(asking)),
              Match.orElse(() => Effect.forkIn(asking, answers, { startImmediately: true })),
            );
            yield* Effect.interruptible(watch(track, answered));
          });
        /** Read the device's status until its playback stops moving. */
        const follow = (track: Track) =>
          Deferred.make<boolean>().pipe(
            Effect.tap((answered) => Deferred.succeed(answered, true)),
            Effect.flatMap((answered) => watch(track, answered)),
          );
        /** A refused ask is logged, and the status shown as it is. */
        const logged = (error: PlaybackError) =>
          Effect.logWarning('player.command.failed').pipe(
            Effect.annotateLogs({ operation: error.operation, message: error.message }),
            Effect.as(true),
          );
        /**
         * The place a play asked at `asked` from `fromMs` started at, by its answer `status`: past
         * 0, `fromMs`. From 0 (a start), where the playback says the recording starts: the
         * device's 0:00, the score clock's first sung line (`sound.ts`). A start moves the load's
         * own pending act to that place, so the answer lands it.
         */
        const startedAt = (asked: number, fromMs: number, status: Status) =>
          Effect.sync(() => {
            if (fromMs > 0) return fromMs;
            const start = status.positionMs;
            held.proof = {
              ...held.proof,
              pending: Option.map(held.proof.pending, (it) => {
                if (it.known !== asked || it.target !== fromMs) return it;
                return { ...it, target: start };
              }),
            };
            return start;
          });
        /** A load: Loading at once, the device asked to play from `fromMs`, its status read while it loads. */
        const keyOf = (track: Track) => soundingOffset(get.registry.get(keyFor(track.number)));
        const remember = (selection: RecordingSelection) => {
          const was = get.registry.get(recording);
          if (
            Option.exists(
              was,
              (it) =>
                it.number === selection.number &&
                it.requested === selection.requested &&
                it.effective === selection.effective,
            )
          )
            return;
          get.registry.set(recording, Option.some(selection));
        };
        /** The `Intro` switch as it stands at the play, as `intro` and `countIn`; none without one. */
        const introAt = (): Pick<PlayOptions, 'intro' | 'countIn'> =>
          Option.match(Option.fromNullishOr(intro), {
            onNone: () => ({}),
            onSome: (atom) => {
              const on = get.registry.get(atom);
              return { intro: on, countIn: on };
            },
          });
        const playSet = (track: Track, offset: number, fromMs: number, continuous: boolean) =>
          Effect.gen(function* () {
            const id = held.id;
            const began = yield* now;
            const ours = () => held.id === id;
            held.offset = offset;
            held.replacing = offset !== 0 || continuous;
            return yield* device
              .play(audioUrl(track.number, offset), fromMs, {
                continuous,
                ready: offset !== 0 || continuous,
                intent: held.wants,
                recording: { number: track.number, offset },
                rate: get.registry.get(rateFor(track.number)),
                stanzas: get.registry.get(stanzasFor(track.number)),
                ...introAt(),
              })
              .pipe(
                Effect.tap((status) =>
                  Effect.sync(() => {
                    if (ours())
                      remember(
                        status.recording ?? {
                          number: track.number,
                          requested: offset,
                          effective: offset,
                        },
                      );
                  }),
                ),
                Effect.ensuring(
                  Effect.sync(() => {
                    if (ours()) held.replacing = false;
                  }),
                ),
                Effect.tap((status) =>
                  Effect.flatMap(now, (settled) =>
                    Effect.logInfo('player.key.settled').pipe(
                      Effect.annotateLogs({
                        hymn: track.number,
                        requested: offset,
                        started: began,
                        settled,
                        gapMs: settled - began,
                        positionMs: status.positionMs,
                      }),
                    ),
                  ),
                ),
              );
          });
        const load = (track: Track, fromMs: number) =>
          Effect.gen(function* () {
            held.wants = 'play';
            held.resuming = false;
            held.id += 1;
            const offset = keyOf(track);
            held.offset = offset;
            const asked = yield* now;
            held.proof = Proof.loaded(asked, fromMs);
            const seeking = { to: fromMs, asking: true };
            held.seeking = Option.liftPredicate(seeking, () => fromMs > 0);
            yield* show(Player.Loading({ track }));
            const id = held.id;
            const played = playSet(track, offset, fromMs, false).pipe(
              Effect.tap((status) =>
                Effect.when(
                  Effect.flatMap(startedAt(asked, fromMs, status), (to) => {
                    if (offset !== 0) return replacementLanded(asked, to)(status);
                    return answeredAt(asked, to)(status);
                  }),
                  Effect.sync(() => held.id === id),
                ),
              ),
              Effect.ensuring(Effect.sync(() => (seeking.asking = false))),
            );
            yield* ask(
              track,
              played,
              (error) =>
                Effect.logWarning('player.play.failed').pipe(
                  Effect.annotateLogs({ track: track.number, message: error.message }),
                  Effect.as(false),
                ),
              true,
            );
          });
        const current = get.registry.get(state);
        const holding = trackOf(current);
        /** Run `run` on the hymn the player holds; with none, nothing. */
        const onHeld = (run: (track: Track) => Effect.Effect<void>) =>
          Option.match(holding, { onNone: () => Effect.void, onSome: run });
        /** A Resume: from where the reader is, by what the page shows. */
        const resume = (track: Track) => {
          const fromPlace = () =>
            load(
              track,
              Option.getOrElse(held.proof.place, () => 0),
            );
          const resumed = (target: Option.Option<number>, shown: Player) =>
            Effect.gen(function* () {
              held.wants = 'play';
              yield* act(target);
              yield* show(shown);
              yield* ask(track, device.resume, logged);
            });
          if (
            keyOf(track) !== held.offset ||
            (!Player.$is('Playing')(current) &&
              Option.exists(
                get.registry.get(recording),
                (selected) =>
                  selected.number === track.number && selected.requested !== selected.effective,
              ))
          )
            return fromPlace();
          return Player.$match(current, {
            Stopped: fromPlace,
            Failed: fromPlace,
            Buffering: (it) =>
              Match.value(it.retry).pipe(
                Match.when(true, fromPlace),
                Match.orElse(() => resumed(Option.none(), current)),
              ),
            Paused: ({ at, length }) =>
              resumed(
                Option.none(),
                Match.value(held.proof.sounded).pipe(
                  Match.when(true, () => Player.Buffering({ track, at, length, retry: false })),
                  Match.orElse(() => Player.Loading({ track })),
                ),
              ),
            Ended: ({ length }) =>
              Effect.gen(function* () {
                held.resuming = true;
                const read = yield* readFresh.pipe(Effect.option);
                held.resuming = false;
                const again = Option.filter(
                  read,
                  (it) => holdsRecording(it.status) && introAt().intro !== false,
                );
                if (Option.isNone(again))
                  return yield* load(
                    track,
                    Option.getOrElse(held.proof.place, () => 0),
                  );
                held.wants = 'play';
                held.seeking = Option.none();
                yield* cut;
                held.proof = Proof.followed(
                  held.proof,
                  again.value.asked,
                  again.value.status.positionMs,
                );
                yield* show(
                  Player.Buffering({
                    track,
                    at: seconds(again.value.status.positionMs),
                    length,
                    retry: false,
                  }),
                );
                yield* ask(track, device.resume, logged);
              }),
            Idle: () => Effect.void,
            Loading: () => resumed(Option.none(), current),
            Playing: ({ at, length }) =>
              resumed(Option.none(), Player.Buffering({ track, at, length, retry: false })),
          });
        };
        /** A Pause: before the first sound the device lets the recording go (Stopped); after it, Paused. */
        const pause = (track: Track) =>
          Effect.gen(function* () {
            held.wants = 'pause';
            held.resuming = false;
            if (letGo(current)) return;
            if (Player.$is('Loading')(current)) {
              /**
               * Stopped at the place the reads proved; Ended once a look says `ended` (P8): the
               * end let the sound go, so the device is not stopped. It answers whether the
               * device is still to be stopped. Shown through the registry: a command told after
               * this Pause supersedes its context, whose own sets are dropped, and the let-go
               * still shows.
               */
              const shown = (look: Option.Option<Proof.Read>) => {
                const end = Option.filter(look, (read) => read.status.state === 'ended');
                const page = Option.match(end, {
                  onNone: () => Player.Stopped({ track, at: placeOf(held.proof) }),
                  onSome: (read) => Player.Ended({ track, length: lengthOf(read.status) }),
                });
                return Effect.sync(() => {
                  get.registry.set(state, page);
                  return Option.isNone(end);
                });
              };
              if (!(yield* shown(yield* lastLook))) return;
              const id = held.id;
              const ours = () => held.id === id;
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const opened = Option.exists(
                    held.proof.last,
                    (last) => last.status.state === 'playing' && Option.isNone(held.proof.place),
                  );
                  if (opened) {
                    const look = yield* lastLook;
                    if (!ours() || !(yield* shown(look))) return;
                  }
                  yield* cut;
                  if (!ours()) return;
                  yield* device.stop.pipe(Effect.catchTag('PlaybackError', logged), Effect.asVoid);
                }),
              );
              return;
            }
            yield* act(Option.none());
            yield* Player.$match(current, {
              Playing: ({ at, length }) => show(Player.Paused({ track, at, length })),
              Buffering: ({ at, length }) => show(Player.Paused({ track, at, length })),
              Idle: () => Effect.void,
              Loading: () => Effect.void,
              Paused: () => Effect.void,
              Ended: () => Effect.void,
              Stopped: () => Effect.void,
              Failed: () => Effect.void,
            });
            yield* ask(track, device.pause, logged);
          });
        /** A Seek: the device asked for the place, which becomes the reader's; a let-go player keeps it for its Play. */
        const seek = (track: Track, to: number) =>
          Effect.gen(function* () {
            const end = Option.getOrElse(lengthIn(current), () => Number.POSITIVE_INFINITY);
            const ms = Math.min(Math.max(0, to), end) * 1000;
            if (held.resuming && Player.$is('Ended')(current)) return yield* load(track, ms);
            yield* act(Option.some(ms));
            if (letGo(current)) {
              yield* show(
                Player.$match(current, {
                  Stopped: () => Player.Stopped({ track, at: placeOf(held.proof) }),
                  Failed: ({ offline: off }) =>
                    Player.Failed({ track, offline: off, at: placeOf(held.proof) }),
                  Idle: () => current,
                  Loading: () => current,
                  Playing: () => current,
                  Buffering: () => current,
                  Paused: () => current,
                  Ended: () => current,
                }),
              );
              return;
            }
            yield* ask(track, askSeek(ms), logged, !held.replacing);
          });
        const resumeHold = (hold: HoldTransaction) =>
          Effect.gen(function* () {
            if (!owns(get.registry, hold) || hold.resuming) return;
            hold.resuming = true;
            held.wants = 'play';
            yield* act(Option.none());
            if (!owns(get.registry, hold)) return;
            const answer = yield* device.resume.pipe(Effect.option);
            if (!owns(get.registry, hold)) return;
            clearHold(get.registry, hold);
            if (Option.isNone(answer)) return;
            const status = answer.value;
            const track = Option.getOrThrow(trackOf(get.registry.get(state)));
            yield* show(
              Player.Buffering({
                track,
                at: seconds(status.positionMs),
                length: lengthOf(status),
                retry: false,
              }),
            );
          });
        const finishHold = (hold: HoldTransaction) =>
          Effect.gen(function* () {
            if (!owns(get.registry, hold) || Option.isNone(hold.origin)) return;
            get.registry.set(
              holdState,
              HoldState.Landing({
                token: hold.token,
                target: hold.target,
                origin: hold.origin.value,
              }),
            );
            const track = Option.getOrThrow(trackOf(get.registry.get(state)));
            if (Option.contains(hold.ending, 'Cancel')) {
              yield* resumeHold(hold);
              if (Option.isNone(transaction)) yield* follow(track);
            } else {
              yield* seek(track, hold.target.ms / 1000);
            }
          });
        const acquireHold = (hold: HoldTransaction) =>
          Effect.gen(function* () {
            if (!owns(get.registry, hold) || !Player.$is('Playing')(current)) return;
            held.wants = 'pause';
            yield* cut;
            yield* act(Option.none());
            if (!owns(get.registry, hold)) return;
            yield* show(
              Player.Paused({ track: current.track, at: current.at, length: current.length }),
            );
            const status = yield* device.pause;
            if (!owns(get.registry, hold)) return;
            if (
              status.state !== 'paused' ||
              !Number.isFinite(status.positionMs) ||
              status.positionMs < 0
            ) {
              clearHold(get.registry, hold);
              return yield* follow(current.track);
            }
            hold.origin = Option.some(status.positionMs);
            held.proof = Proof.followed(held.proof, yield* now, status.positionMs);
            yield* show(
              Player.Paused({
                track: current.track,
                at: seconds(status.positionMs),
                length: lengthOf(status),
              }),
            );
            if (Option.isSome(hold.ending)) return yield* finishHold(hold);
            get.registry.set(
              holdState,
              HoldState.Held({ token: hold.token, target: hold.target, origin: status.positionMs }),
            );
            yield* follow(current.track);
          });
        if (command._tag === 'RevokeHold') return yield* cut;
        if (holdAction(command)) {
          const active = Option.filter(transaction, (hold) => hold.token === command.token);
          if (Option.isNone(active)) return;
          const hold = active.value;
          let operation: Effect.Effect<void, PlaybackError> = finishHold(hold);
          if (command._tag === 'AcquireHold') operation = acquireHold(hold);
          return yield* operation.pipe(
            Effect.catchTag('PlaybackError', (error) =>
              Effect.gen(function* () {
                if (!owns(get.registry, hold)) return;
                clearHold(get.registry, hold);
                yield* logged(error);
                yield* onHeld(follow);
              }),
            ),
          );
        }
        if (KeyChange.$is('Key')(command)) {
          const { number, offset } = command;
          return yield* onHeld((track) =>
            Effect.gen(function* () {
              if (
                track.number !== number ||
                keyOf(track) !== soundingOffset(offset) ||
                held.offset === soundingOffset(offset)
              )
                return yield* follow(track);
              const selected = get.registry.get(recording);
              if (
                !held.replacing &&
                Option.exists(
                  selected,
                  (it) => it.number === number && it.effective === soundingOffset(offset),
                )
              ) {
                const selection = {
                  number,
                  requested: soundingOffset(offset),
                  effective: soundingOffset(offset),
                };
                held.offset = selection.requested;
                yield* device.selectRecording?.(selection) ?? Effect.void;
                remember(selection);
                return yield* follow(track);
              }
              if (held.wants === 'pause' || letGo(current) || Player.$is('Ended')(current)) return;
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const before = held.id;
                  const origin = held.acts;
                  const read = yield* readFresh.pipe(
                    Effect.map((it) => it.status),
                    Effect.option,
                  );
                  if (
                    before !== held.id ||
                    keyOf(track) !== soundingOffset(offset) ||
                    held.wants === 'pause'
                  )
                    return;
                  const at = Option.getOrElse(
                    Option.flatMap(read, (it) => Option.fromNullishOr(it.replacementMs)),
                    () => Proof.replacementAt(held.proof, read),
                  );
                  held.id += 1;
                  held.seeking = Option.none();
                  const id = held.id;
                  const asked = yield* now;
                  const continuous = Player.$is('Playing')(current) && origin === held.acts;
                  yield* act(Option.some(at));
                  yield* ask(
                    track,
                    playSet(track, soundingOffset(offset), at, continuous).pipe(
                      Effect.tap((status) =>
                        Effect.when(
                          replacementLanded(asked, at)(status),
                          Effect.sync(() => held.id === id),
                        ),
                      ),
                    ),
                    (error) =>
                      Effect.logWarning('player.key.failed').pipe(
                        Effect.annotateLogs({ hymn: number, offset, operation: error.operation }),
                        Effect.as(false),
                      ),
                    true,
                  );
                }),
              );
            }),
          );
        }
        /** The hymn the command is about: the one it starts, else the one held. */
        const subject = Option.liftPredicate(command, Command.$is('Start')).pipe(
          Option.map(({ track }) => track),
          Option.orElse(() => holding),
        );
        return yield* Command.$match(command, {
          Start: ({ track }) =>
            Effect.suspend(() => {
              held.starts += 1;
              return load(track, 0);
            }),
          Pause: () =>
            Option.match(holding, {
              onNone: () => Effect.sync(() => (held.wants = 'pause')),
              onSome: pause,
            }),
          Resume: () => onHeld(resume),
          Seek: ({ seconds: to }) => onHeld((track) => seek(track, to)),
          Follow: () =>
            onHeld((track) =>
              Match.value(letGo(current)).pipe(
                Match.when(true, () => Effect.void),
                Match.orElse(() => act(Option.none()).pipe(Effect.andThen(follow(track)))),
              ),
            ),
        }).pipe(
          Effect.catchDefect((defect) =>
            Effect.logError('player.defect').pipe(
              Effect.annotateLogs({ defect: String(defect) }),
              Effect.andThen(
                Option.match(subject, {
                  onNone: () => Effect.void,
                  onSome: (track) =>
                    show(Player.Failed({ track, offline: false, at: Option.none() })),
                }),
              ),
            ),
          ),
        );
      }),
    )
    .pipe(Atom.keepAlive);

  const send = Atom.writable(
    (get) => get(dispatch),
    (get, command: Command | KeyChange) => {
      revoke(get);
      get.set(dispatch, command);
    },
  ).pipe(Atom.keepAlive);

  /** The held hymn's seek targets as it sings them now: none while no hymn is held. */
  const projected = Atom.make((get) => {
    const number = get(heldNumber);
    if (number === 0) return Option.none<SeekTargets>();
    return targetsFor(number, get(stanzasFor(number)));
  });
  /**
   * The hold a Begin offering `offered` takes now, with the player's own
   * targets and its first target, or none while the player refuses one: a
   * hold is open, the hymn does not play, the recording is being replaced,
   * a place is pending, a count-in is told or counts, or `offered` are not
   * the playing hymn's targets as it sings them. Begin keeps this rule and
   * `hold.canBegin` publishes it, so an offer of a hold is one that takes.
   */
  const opening = (get: HoldAccess, offered: SeekTargets) => {
    const current = get.get(state);
    if (
      !get.get(work) ||
      !Player.$is('Playing')(current) ||
      current.track.number !== offered.number ||
      Option.isSome(get.get(beat))
    )
      return Option.none();
    return Option.flatMap(
      Option.filter(get.get(projected), (targets) => sameTargets(targets, offered)),
      (targets) =>
        Option.map(initialTarget(offered, current.at * 1000), (target) => ({ targets, target })),
    );
  };
  const offers = new WeakMap<SeekTargets, Atom.Atom<boolean>>();
  /** Whether a Begin offering `offered` would take now (`opening`), as an atom kept for each targets value. */
  const canBegin = (offered: SeekTargets): Atom.Atom<boolean> =>
    Option.getOrElse(Option.fromUndefinedOr(offers.get(offered)), () => {
      const made = Atom.make((get) => {
        get(holdLifetime);
        return Option.isSome(opening(get, offered));
      });
      offers.set(offered, made);
      return made;
    });

  const holdSend = Atom.writable(
    (get) => get(holdLifetime),
    (get, command: HoldCommand) => {
      get.get(holdLifetime);
      if (command._tag === 'Invalidate') {
        if (Option.isNone(transaction)) return;
        revoke(get);
        get.set(dispatch, HoldEvent.RevokeHold());
        return;
      }
      if (command._tag === 'Begin') {
        const opened = opening(get, command.targets);
        if (Option.isNone(opened)) return;
        const { targets, target } = opened.value;
        const token = tokenOf(Symbol());
        transaction = Option.some({
          token,
          targets,
          snapshot: capture(get, targets.number),
          target,
          origin: Option.none(),
          ending: Option.none(),
          resuming: false,
        });
        told();
        get.set(holdState, HoldState.Acquiring({ token, target }));
        get.set(dispatch, HoldEvent.AcquireHold({ token }));
        return;
      }
      const active = Option.filter(transaction, (hold) => hold.token === command.token);
      if (Option.isNone(active) || !owns(get, active.value) || Option.isSome(active.value.ending))
        return;
      const hold = active.value;
      if (command._tag === 'Select') {
        const target = targetAt(hold.targets, command.line, command.word);
        if (Option.isNone(target)) return;
        hold.target = target.value;
        const was = get.get(holdState);
        if (was._tag !== 'Free') get.set(holdState, { ...was, target: target.value });
        return;
      }
      hold.ending = Option.some(command._tag);
      if (Option.isSome(hold.origin))
        get.set(dispatch, HoldEvent.FinishHold({ token: hold.token }));
    },
  ).pipe(Atom.keepAlive);

  const holdLifetime = Atom.make((get) => {
    const check = () => {
      if (Option.isSome(transaction) && !owns(get.registry, transaction.value))
        get.set(dispatch, HoldEvent.RevokeHold());
    };
    get.subscribe(holdState, check);
    get.subscribe(recording, check);
    const number = get(heldNumber);
    if (number !== 0) {
      get.subscribe(keyFor(number), check);
      get.subscribe(rateFor(number), check);
      get.subscribe(stanzasFor(number), check);
    }
    if (intro) get.subscribe(intro, check);
    if (sound) get.subscribe(sound, check);
    get.addFinalizer(abandonHold);
  }).pipe(Atom.keepAlive);
  const hold = {
    state: Atom.make((get) => {
      get(holdLifetime);
      return get(holdState);
    }),
    send: holdSend,
    canBegin,
  };

  /** Sends each press of the lock screen, Control Center or the Media Session while it is mounted. */
  const remote = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* Stream.runForEach(device.remote, (remote) =>
        Effect.sync(() => get.set(send, commandOf(remote))),
      );
    }),
  );

  const heldNumber = Atom.map(state, (value) =>
    Option.match(trackOf(value), {
      onNone: () => 0,
      onSome: (track) => track.number,
    }),
  );
  const chosen = Atom.make((get) => {
    const number = get(heldNumber);
    if (number === 0) return { number, offset: 0 };
    return { number, offset: soundingOffset(get(keyFor(number))) };
  });
  const keys = runtime.atom((get) =>
    get.stream(chosen).pipe(
      Stream.changesWith((a, b) => a.number === b.number && a.offset === b.offset),
      Stream.runForEach(({ number, offset }) =>
        Effect.sync(() => {
          if (number !== 0 && offset !== held.offset)
            get.set(send, KeyChange.Key({ number, offset }));
        }),
      ),
    ),
  );

  /**
   * The rate the held hymn's place moves at, ms of the hymn for each ms, as the playback tells
   * it (`pace`): the tempo, Sound on or off (with Sound on the recording plays at it). The
   * follow's clock runs at it between the player's reads, so it and the score clock keep one
   * rate.
   */
  const rate = Atom.make(1).pipe(Atom.keepAlive);
  /** The held hymn and its tempo as a rate, 1 while no hymn is held (`number` 0). */
  const heldTempo = Atom.make((get) => {
    const number = get(heldNumber);
    if (number === 0) return { number, rate: 1 };
    return { number, rate: get(rateFor(number)) };
  });
  /**
   * While mounted: each turn of the held hymn's tempo told to the playback, and the playback's
   * pace kept in `rate`. A change of held hymn tells nothing: the new hymn's play tells its own
   * rate, and a rate told before it would reach the recording still playing while the new one
   * loads.
   */
  const tempos = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      const told = get.stream(heldTempo).pipe(
        Stream.changesWith((a, b) => a.number === b.number && a.rate === b.rate),
        Stream.zipWithPrevious,
        Stream.filter(([before, now]) =>
          Option.exists(before, (held) => held.number === now.number),
        ),
        Stream.runForEach(([, now]) => device.setRate?.(now.rate) ?? Effect.void),
      );
      const paced = Stream.runForEach(device.pace ?? Stream.make(1), (to) =>
        Effect.sync(() => get.set(rate, to)),
      );
      yield* Effect.all([told, paced], { concurrency: 'unbounded', discard: true });
    }),
  );

  /** `rate` to the screens: the playback alone sets it. */
  const shownRate: Atom.Atom<number> = rate;

  /** The held hymn and its stanza choice, `[]` while no hymn is held (`number` 0). */
  const heldStanzas = Atom.make((get) => {
    const number = get(heldNumber);
    if (number === 0) return { number, stanzas: ALL };
    return { number, stanzas: get(stanzasFor(number)) };
  });
  /**
   * While mounted: each change of the held hymn's stanza choice told to the playback, as
   * `tempos` tells a turn of its tempo. A change of held hymn tells nothing: the new hymn's play
   * names its own choice (`PlayOptions.stanzas`).
   */
  const stanzas = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* get.stream(heldStanzas).pipe(
        Stream.changesWith((a, b) => a.number === b.number && sameStanzas(a.stanzas, b.stanzas)),
        Stream.zipWithPrevious,
        Stream.filter(([before, now]) =>
          Option.exists(before, (held) => held.number === now.number),
        ),
        Stream.runForEach(([, now]) => device.setStanzas?.(now.stanzas) ?? Effect.void),
      );
    }),
  );

  /** The beat a count-in stands at, none while none counts, as the playback tells it (`beats`). */
  const beat = Atom.make<Option.Option<Beat>>(Option.none()).pipe(Atom.keepAlive);
  /** While mounted: each beat the playback tells kept in `countIn`. */
  const beats = runtime.atom((get) =>
    Effect.gen(function* () {
      const device = yield* Playback;
      yield* Stream.runForEach(device.beats ?? Stream.empty, (to) =>
        Effect.sync(() => get.set(beat, to)),
      );
    }),
  );
  /** `beat` to the screens: the playback alone sets it. */
  const countIn: Atom.Atom<Option.Option<Beat>> = beat;

  return {
    hold,
    state,
    send,
    remote,
    keys,
    recording,
    tempos,
    stanzas,
    rate: shownRate,
    beats,
    countIn,
  };
};

/** A player's atoms: its state, the commands it takes and its lock-screen follower. */
export type HymnPlayer = ReturnType<typeof playerOn>;

/** How often the player reads the device's status while a recording moves. */
export const statusEvery = Duration.millis(250);
