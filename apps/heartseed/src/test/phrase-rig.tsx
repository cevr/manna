/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop, effect/noTryCatch -- the phrases' rendered walk: it mounts the root route in happy-dom's document through React's promise-based `act`, handing each turn over until the frame it waits on lands, at most 3 s; the disk, the clock and the zone are plain values the steps change (the zone in `process.env.TZ`, put back in a `finally`), and the model reads its undefined and null as none. */

/**
 * Today over days with long verses learned as phrases (hsphrase H4-H6, H8,
 * H10), walked through the root route over the app's own layer, for the
 * parts `src/phrase/walk-*.test.tsx`. A generated device lies in one of
 * five zones (Lord Howe and Chatham among them), holds one to three
 * passages from a pool of long-only, mixed and over-the-promise ranges
 * (none or one when its layer teaches Fear, every third device), and
 * starts with the promise planted and each other verse's history sown in
 * one of these: none, some phrases, every phrase ripe (three clean recalls
 * days apart), or joined (ripe phrases and the verse's own recalls). It
 * then lives four days, launched each morning after 04:00 local at an hour
 * up to 22:00, tending up to six items a day, and on half its days
 * launched again one to three hours later to tend up to two more (no new
 * piece on a day one was said, a phrase's included).
 *
 * Each item: `Listen` on a new piece in eight of ten, where the voice must be
 * asked for exactly the piece's text and each word the walk then names by
 * its UTF-16 span within that text lights alone, in order, before the
 * reading finishes; `Say it`, with a Minutes tap while it listens in a
 * quarter (a making that keeps the item held); the recital heard with a
 * word skipped in three of ten; the summary reading `<heard> of <n> words`
 * over the piece's n; a grade in half; the record under the item's own
 * reference with its word count and the grade; then `Next`.
 *
 * The oracle, apart from the app's code: Today's reference, counts line,
 * action, `Listen` and the words under the cue are `run-model.ts`'s run
 * over `session-model.ts`'s plan of the pieces (`passages-model.ts`'s or
 * `promise-model.ts`'s, phrased and expanded by `phrase-model.ts`), each
 * cue `joinCueRule`'s, held after every step; the disk keeps every start
 * key but the minutes after a tap, and gains only each recital's record.
 */

import { RegistryProvider } from '@effect/atom-react';
import { Context, Effect, Layer, Logger, MutableRef, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { DictationSource, type DictationEvent } from '../dictation';
import { CHAIN } from '../dictation/attempt';
import { recite } from '../dictation/script';
import { Chime } from '../garden';
import { sourceWords } from '../matcher/words';
import { COLLECTIONS, TAUGHT } from '../promises';
import { Haptics, type Recall } from '../sayit';
import { MINUTES, type Minutes } from '../session';
import { MINUTES_KEY } from '../session/service';
import { Voice, VoiceSource, type VoiceEvent, type VoiceView } from '../voice';
import { clockOf } from './clock';
import { below, keyOf, pickOf, PREFIX, random } from './garden-model';
import {
  KEY,
  piecesRule,
  readRule,
  storedText,
  type ModelTextPiece,
  type Span,
} from './passages-model';
import { CORPUS } from './passages-rig';
import {
  expandRule,
  joinCueRule,
  phraseOfRule,
  pieceRule,
  wordsOf,
  withPhrasesRule,
} from './phrase-model';
import { piecesModel } from './promise-model';
import { actionModel, madeModel, NO_RUN, nextModel, shownModel, startedModel } from './run-model';
import { countsModel, DAY, HOUR, MINUTE, planModel } from './session-model';
import { listenModel } from './wake-model';
import { wallAt } from './wake-walk';
import { hostZone, offsetIn, restore, travel } from './zone';

const PROMISE = passage.reference;
const words = (text: string) => sourceWords(text).length;
const OWN: ModelTextPiece = {
  reference: PROMISE,
  text: passage.text,
  words: words(passage.text),
  group: PROMISE,
};
const FEAR_TITLE = COLLECTIONS.find((collection) => collection.id === 'protection')?.title;

const ZONES = [
  'UTC',
  'America/Los_Angeles',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'Pacific/Chatham',
] as const;

/** The passages a device holds from: John 3:16 alone, long-only, mixed, and one over the promise. */
const POOL: readonly [Span, ...Span[]] = [
  { book: 43, chapter: 3, first: 16, last: 16 },
  { book: 19, chapter: 91, first: 1, last: 2 },
  { book: 6, chapter: 1, first: 8, last: 9 },
  { book: 43, chapter: 15, first: 1, last: 3 },
  { book: 23, chapter: 41, first: 9, last: 10 },
  { book: 20, chapter: 3, first: 5, last: 6 },
  { book: 45, chapter: 8, first: 28, last: 28 },
];

const HISTORIES = ['none', 'phrases', 'ripe', 'ripe', 'joined'] as const;
const GRADES = ['Again', 'Hard', 'Good', 'Easy'] as const;

export type Coverage = Record<string, number>;

const bump = (cover: Coverage, kind: string) => {
  cover[kind] = (cover[kind] ?? 0) + 1;
};

/** A short digest of a text, so a failure names lengths and sums, never the words. */
const digest = (value: string) => {
  let sum = 0;
  for (let at = 0; at < value.length; at++) sum = (sum * 31 + value.charCodeAt(at)) >>> 0;
  return `${value.length}:${sum.toString(16)}`;
};

/** What the walk compares a held result's words as: its marks are the recital's, which the summary and the record judge. */
const RESULT = 'result';

const collapsed = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Text as a reader sees it: whitespace collapsed. */
const textOf = (node: Element | null | undefined) => collapsed(node?.textContent ?? '');

const nameOf = (node: Element) => node.getAttribute('aria-label') ?? textOf(node);

/** How the next recital is heard at its finish: the words of `text` but those `skip` names. */
interface Hearing {
  text: string;
  skip: readonly number[];
}

/** A recognizer that opens each listen and, at its finish, sends the recital `hearing` names, then its end. */
const recognizerOf = (hearing: Hearing) => {
  const listener = MutableRef.make<Option.Option<(event: DictationEvent) => void>>(Option.none());
  const open = MutableRef.make<Option.Option<number>>(Option.none());
  const emit = (event: DictationEvent) => {
    Option.map(MutableRef.get(listener), (send) => send(event));
  };
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
          MutableRef.set(open, Option.some(session));
          emit(event(session, 'start'));
        }),
      finish: Effect.sync(() => {
        const session = MutableRef.get(open);
        MutableRef.set(open, Option.none());
        if (Option.isNone(session)) return;
        for (const step of recite(hearing.text, { skip: hearing.skip, every: 5, pace: 1 }))
          emit({ ...event(session.value, 'result'), final: step.final, runs: step.runs });
        emit(event(session.value, 'end'));
      }),
      cancel: Effect.sync(() => MutableRef.set(open, Option.none())),
      subscribe: (next) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => MutableRef.set(listener, Option.some(next))),
            () => Effect.sync(() => MutableRef.set(listener, Option.none())),
          ),
        ),
    }),
  );
};

/** A voice source with one eligible voice that keeps each speak (its utterance and text) and sends the events the walk names. */
const speakingVoice = () => {
  const listener = MutableRef.make<Option.Option<(event: VoiceEvent) => void>>(Option.none());
  const spoken: { readonly utterance: number; readonly text: string }[] = [];
  const layer = Layer.succeed(
    VoiceSource,
    VoiceSource.of({
      voices: Effect.succeed([
        {
          id: 'test',
          language: 'en-US',
          name: 'Test',
          quality: 2,
          novelty: false,
          personal: false,
        },
      ]),
      speak: (utterance, text) => Effect.sync(() => void spoken.push({ utterance, text })),
      pause: Effect.void,
      resume: Effect.void,
      stop: Effect.void,
      subscribe: (next) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => MutableRef.set(listener, Option.some(next))),
            () => Effect.sync(() => MutableRef.set(listener, Option.none())),
          ),
        ),
    }),
  );
  const send = async (event: VoiceEvent) => {
    await act(async () => {
      Option.map(MutableRef.get(listener), (each) => each(event));
    });
  };
  return { layer, spoken, send };
};

const failure = (method: string, key: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method}`, method, key });

/** The device's disk, which outlives every launch, and how many writes it has taken. */
interface Disk {
  readonly map: Map<string, string>;
  writes: number;
}

const storeOf = (disk: Disk) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => disk.map.get(key)),
      set: (key, value) =>
        Effect.sync(() => {
          disk.map.set(key, value);
          disk.writes += 1;
        }),
      remove: (key) => Effect.fail(failure('remove', key)),
      clear: Effect.fail(failure('clear', '')),
      size: Effect.sync(() => disk.map.size),
      keys: Effect.sync(() => [...disk.map.keys()]),
    }),
  );

/** The recalls by reference a disk holds. */
const plantsOf = (disk: ReadonlyMap<string, string>) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of disk)
    if (key.startsWith(PREFIX)) {
      const recall: Recall = JSON.parse(value);
      plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
    }
  return plants;
};

/** The words under Today's cue as the walk compares them: the whole text's digest, the empty slots' count, or the letters' digest; a held result's marks as `RESULT`. */
type SeenVerse =
  | { readonly cue: 'full'; readonly text: string }
  | { readonly cue: 'none'; readonly n: number }
  | { readonly cue: 'initials'; readonly n: number; readonly letters: string }
  | typeof RESULT
  | null;

/** The words Today shows under its cue in `host`. */
const verseIn = (host: Element): SeenVerse => {
  const whole = host.querySelector('[data-testid="passage"]');
  if (whole !== null) return { cue: 'full', text: digest(textOf(whole)) };
  const nodes = [...host.querySelectorAll('[data-testid^="word-"]')];
  if (nodes.length === 0) return null;
  if (nodes.every((node) => node.getAttribute('aria-hidden') === 'true'))
    return { cue: 'none', n: nodes.length };
  return {
    cue: 'initials',
    n: nodes.length,
    letters: digest(nodes.map((node) => node.getAttribute('aria-label') ?? '').join('|')),
  };
};

/** A mounted root over `disk` at `time.now`, the layer teaching `taught` (the part left out when empty). */
const mount = async (
  disk: Disk,
  time: { now: number },
  taught: readonly string[],
  hearing: Hearing,
) => {
  const voice = speakingVoice();
  const service = MutableRef.make<Option.Option<Voice['Service']>>(Option.none());
  const parts = {
    source: recognizerOf(hearing),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: storeOf(disk),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voice.layer,
  };
  const layer = (
    taught.length === 0 ? appLayer(parts) : appLayer({ ...parts, promises: taught })
  ).pipe(
    Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))),
    Layer.tap((services) =>
      Effect.sync(() => MutableRef.set(service, Option.some(Context.get(services, Voice)))),
    ),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root opening="today" />
      </RegistryProvider>,
    ),
  );
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const named = (label: string, role: string) =>
    [...host.querySelectorAll(`[role="${role}"]`)].find((node) => nameOf(node) === label);
  const tap = async (label: string, role = 'button') => {
    const node = named(label, role);
    if (node === undefined) return false;
    await act(async () => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    return true;
  };
  /** Today as the walk compares it: the reference, counts line, action, Listen, and the words under the cue as a digest. */
  const today = () => {
    const references = [...host.querySelectorAll('[data-testid="reference"]')].map(textOf);
    const verse = verseIn(host);
    const buttons = [...host.querySelectorAll('[role="button"]')].map(nameOf);
    return {
      references,
      counts: [...host.querySelectorAll('[data-testid="session"]')].map(textOf),
      action: buttons.filter((name) => ['Say it', 'Listening', 'Next'].includes(name)),
      listen: buttons.includes('Listen'),
      verse,
    };
  };
  const leave = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  return {
    host,
    until,
    tap,
    today,
    leave,
    voice,
    /** The voice service's view now. */
    view: (): VoiceView => Effect.runSync(Option.getOrThrow(MutableRef.get(service)).view),
    summary: () => textOf(host.querySelector('[data-testid="summary"]')),
  };
};

type Mounted = Awaited<ReturnType<typeof mount>>;

/** The words under `cue` of `text` as Today shows them, digested as `today()` reads them. */
const verseWant = (text: string, cue: 'full' | 'initials' | 'none') => {
  const found = wordsOf(text);
  if (cue === 'full') return { cue, text: digest(collapsed(text)) };
  if (cue === 'none') return { cue, n: found.length };
  const letters = found.map((word) => String.fromCodePoint(text.codePointAt(word.wordyStart) ?? 0));
  return { cue, n: found.length, letters: digest(letters.join('|')) };
};

/** A walk's reads kept: the plants read at the store's last write count, and the pieces of the passages, which the walk never changes. */
interface WalkCache {
  plants: { writes: number; plants: Map<string, Recall[]> } | null;
  pieces: ModelTextPiece[] | null;
}

/** One generated device's four days. */
class PhraseWalk {
  readonly store: Disk = { map: new Map(), writes: 0 };
  readonly disk = this.store.map;
  readonly cache: WalkCache = { plants: null, pieces: null };
  readonly time = { now: 0 };
  readonly hearing: Hearing = { text: '', skip: [] };
  readonly trail: string[] = [];
  readonly expected = new Set<string>();
  readonly start: ReadonlyMap<string, string>;
  readonly zone: string;
  readonly taught: readonly string[];
  readonly spans: Span[] = [];
  minutes: Minutes = 5;
  minutesTapped = false;
  run = NO_RUN;
  app: Mounted | null = null;
  failure: string | null = null;
  /** Whether the day's new piece was said today, and whether it was a phrase; null before it is. */
  sownFresh: boolean | null = null;

  constructor(
    readonly next: () => number,
    readonly cover: Coverage,
    teaches: boolean,
  ) {
    this.zone = pickOf(next, ZONES);
    this.taught = teaches ? TAUGHT : [];
    const count = teaches ? below(next, 2) : 1 + below(next, 3);
    for (let n = 0; n < count; n++) {
      const span = pickOf(next, POOL);
      if (!this.spans.includes(span)) this.spans.push(span);
    }
    this.disk.set(KEY, storedText(this.spans));
    const day = Date.UTC(2026, below(next, 12), 1 + below(next, 28));
    this.time.now = wallAt(this.zone, day, 0, 6) + below(next, 15 * 60) * MINUTE;
    this.sow(OWN.reference, this.time.now - (1 + below(next, 6)) * DAY, 3);
    for (const piece of this.pieces().slice(1)) this.sowHistory(piece);
    this.start = new Map(this.disk);
  }

  sow(reference: string, startedAt: number, grade: Recall['grade']) {
    const recall: Recall = {
      reference,
      startedAt,
      offset: offsetIn(this.zone, startedAt),
      grade,
      suggested: 3,
      words: 9,
      missed: 0,
      peeked: 0,
      extra: 0,
    };
    this.disk.set(keyOf(recall), JSON.stringify(recall));
    this.store.writes += 1;
  }

  /** Three clean recalls days apart, the last at least a day back: a seed, a blade, then an ear or past it. */
  ripe(reference: string) {
    const back = 12 + below(this.next, 40);
    for (const days of [back, back - 4, back - 9])
      this.sow(reference, this.time.now - days * DAY, 3);
  }

  /** Sows `piece`'s history, one of `HISTORIES`: the phrases' for a phrased verse, its own for a whole one. */
  sowHistory(piece: ModelTextPiece) {
    const history = pickOf(this.next, HISTORIES);
    const phrases = piece.phrases ?? [];
    bump(this.cover, `gen:${phrases.length > 0 ? 'phrased' : 'whole'}-${history}`);
    if (history === 'none') return;
    if (phrases.length === 0) {
      this.sow(piece.reference, this.time.now - (1 + below(this.next, 20)) * DAY, 3);
      return;
    }
    if (history === 'phrases') {
      const upTo = 1 + below(this.next, phrases.length - 1);
      for (const phrase of phrases.slice(0, upTo))
        this.sow(phrase.reference, this.time.now - (1 + below(this.next, 9)) * DAY, 3);
      return;
    }
    for (const phrase of phrases) this.ripe(phrase.reference);
    if (history === 'joined')
      this.sow(piece.reference, this.time.now - (1 + below(this.next, 5)) * DAY, 3);
  }

  plants() {
    const kept = this.cache.plants;
    if (kept !== null && kept.writes === this.store.writes) return kept.plants;
    const plants = plantsOf(this.disk);
    this.cache.plants = { writes: this.store.writes, plants };
    return plants;
  }

  recallsNow = (reference: string) => this.plants().get(reference)?.length ?? 0;

  /** The pieces the model makes over the disk's passages: hskjv's, or hspromise's with Fear taught, each phrased by H3. */
  pieces(): ModelTextPiece[] {
    if (this.cache.pieces !== null) return this.cache.pieces;
    const held = readRule(CORPUS, this.disk.get(KEY), 0);
    this.cache.pieces =
      this.taught.length > 0
        ? piecesModel(CORPUS, [OWN], held, this.taught, words, withPhrasesRule)
        : piecesRule(CORPUS, [OWN], held, words, withPhrasesRule);
    return this.cache.pieces;
  }

  planNow() {
    const plants = this.plants();
    return planModel({
      plants,
      pieces: expandRule(this.pieces(), plants),
      at: this.time.now,
      offset: offsetIn(this.zone, this.time.now),
      minutes: this.minutes,
    }).items;
  }

  get mounted() {
    return this.app as Mounted;
  }

  fail(what: string): false {
    if (this.failure === null) this.failure = `${what} after ${this.trail.slice(-8).join(' > ')}`;
    return false;
  }

  want() {
    const shown = shownModel(this.run, this.recallsNow);
    const action = actionModel(this.run, this.recallsNow);
    const piece = shown === null ? undefined : pieceRule(this.pieces(), shown.reference);
    return {
      references: shown === null ? [] : [shown.reference],
      counts: this.run.plan === null ? [] : [countsModel(this.run.plan, this.recallsNow)],
      action: action === null ? [] : [action],
      listen: listenModel(this.run, this.recallsNow, {
        unread: false,
        voiceOn: true,
        reading: false,
        underWay: false,
      }),
      verse:
        shown === null || piece === undefined
          ? null
          : action === 'Next'
            ? RESULT
            : verseWant(piece.text, joinCueRule(this.plants(), shown.reference)),
    };
  }

  /** Today as read, its words left out where the model shows a recital's result (its marks, not a cue). */
  seen() {
    const today = this.mounted.today();
    return this.want().verse === RESULT ? { ...today, verse: RESULT } : today;
  }

  /** The disk rule: every start key kept but the minutes after a tap, and no key added but the records expected. */
  diskFaults() {
    const out: string[] = [];
    for (const [key, value] of this.start)
      if (this.disk.get(key) !== value && !(key === MINUTES_KEY && this.minutesTapped))
        out.push(`changed ${key}`);
    for (const key of this.disk.keys()) {
      if (this.start.has(key) || this.expected.has(key)) continue;
      if (key === MINUTES_KEY && this.minutesTapped) continue;
      out.push(`added ${key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key}`);
    }
    for (const key of this.expected) if (!this.disk.has(key)) out.push(`no record ${key}`);
    return out;
  }

  async settle(step: string) {
    if (this.failure !== null) return false;
    this.trail.push(step);
    const goal = JSON.stringify(this.want());
    if (!(await this.mounted.until(() => JSON.stringify(this.seen()) === goal))) {
      this.fail(
        `${step}: Today ${JSON.stringify(this.seen()).slice(0, 300)} where the model has ${goal.slice(0, 300)}`,
      );
      return false;
    }
    const disk = this.diskFaults();
    if (disk.length > 0) this.fail(`${step}: ${disk.join(', ')}`);
    return this.failure === null;
  }

  async launch(day: string) {
    if (this.app !== null) await this.app.leave();
    this.app = await mount(this.store, this.time, this.taught, this.hearing);
    await this.mounted.until(
      () => this.mounted.host.querySelector('[data-testid="session"]') !== null,
    );
    this.run = madeModel(NO_RUN, this.planNow(), false);
    return this.settle(`day ${day} at ${new Date(this.time.now).toISOString()}`);
  }

  /** H8: Listen reads the piece's own text, and each word named by its UTF-16 span within it lights alone, in order. */
  async listen(piece: ModelTextPiece, phrase: boolean) {
    const app = this.mounted;
    const before = app.voice.spoken.length;
    if (!(await app.tap('Listen'))) return this.fail(`no Listen on ${piece.reference}`);
    await app.until(() => app.voice.spoken.length > before);
    const said = app.voice.spoken.at(-1);
    if (said === undefined || said.text !== piece.text)
      return this.fail(
        `Listen read ${said?.text.length ?? 'nothing'} chars for ${piece.reference} of ${piece.text.length}`,
      );
    const found = wordsOf(piece.text);
    for (const [index, word] of found.entries()) {
      await app.voice.send({
        utterance: said.utterance,
        kind: 'range',
        location: word.start,
        length: word.end - word.start,
      });
      const view = app.view();
      if (
        view.verse !== piece.text ||
        view.words !== found.length ||
        view.lit !== index + 1 ||
        view.current?.first !== index ||
        view.current?.last !== index
      )
        return this.fail(
          `Listen on ${piece.reference}: word ${index + 1} of ${found.length} lit as ${JSON.stringify({ words: view.words, lit: view.lit, current: view.current })}`,
        );
    }
    await app.voice.send({ utterance: said.utterance, kind: 'finish', location: 0, length: 0 });
    bump(this.cover, phrase ? 'listen:phrase' : 'listen:verse');
    return this.settle(`listened ${piece.reference}`);
  }

  /** One item: Listen maybe, Say it (a making while it listens in a quarter), the summary, a grade maybe, the record, Next. */
  async tend() {
    const shown = shownModel(this.run, this.recallsNow);
    if (shown === null) return false;
    const pieces = this.pieces();
    const piece = pieceRule(pieces, shown.reference);
    if (piece === undefined) {
      this.fail(`an item of no piece: ${shown.reference}`);
      return false;
    }
    const phrase = phraseOfRule(shown.reference) !== undefined;
    this.tally(shown, piece, phrase);
    const roll = below(this.next, 10);
    if (shown.fresh && roll < 8) {
      await this.listen(piece, phrase);
      if (this.failure !== null) return false;
    }
    const app = this.mounted;
    const n = words(piece.text);
    const skip = below(this.next, 10) < 3 ? [below(this.next, n)] : [];
    this.hearing.text = piece.text;
    this.hearing.skip = skip;
    this.time.now += 30_000;
    const key = keyOf({ reference: shown.reference, startedAt: this.time.now });
    this.run = startedModel(this.run, this.recallsNow);
    this.expected.add(key);
    if (!(await app.tap('Say it'))) return this.fail(`no Say it on ${shown.reference}`);
    if (!(await app.until(() => app.today().action.includes('Listening'))))
      return this.fail(`${shown.reference} never listened`);
    if (below(this.next, 4) === 0) await this.makeWhileListening(phrase);
    await app.tap('Listening');
    if (!(await app.until(() => app.summary() !== '' && app.today().action.includes('Next'))))
      return this.fail(`${shown.reference}: no result`);
    const summary = app.summary();
    if (!summary.startsWith(`${n - skip.length} of ${n} words`))
      return this.fail(
        `${shown.reference}: the summary reads ${summary.replace(/[^\d ofwrds]/g, '')} over ${n} words, ${skip.length} unheard`,
      );
    let grade: number | null = null;
    if (below(this.next, 2) === 0) {
      const name = pickOf(this.next, GRADES);
      grade = GRADES.indexOf(name) + 1;
      await app.tap(name, 'radio');
    }
    const kept = await app.until(() => {
      const raw = this.disk.get(key);
      return raw !== undefined && (grade === null || (JSON.parse(raw) as Recall).grade === grade);
    });
    if (!kept) return this.fail(`${shown.reference}: no record under its own reference`);
    const record = JSON.parse(this.disk.get(key) as string) as Recall;
    if (record.reference !== shown.reference || record.words !== n)
      return this.fail(
        `${shown.reference}: the record holds ${record.words} words of ${record.reference}, not ${n}`,
      );
    bump(this.cover, phrase ? 'record:phrase' : 'record:verse');
    if (shown.fresh) this.sownFresh = phrase;
    if (!(await this.settle(`said ${shown.reference}`))) return false;
    await app.tap('Next');
    this.run = nextModel(this.run);
    if (phrase) bump(this.cover, 'next:after-phrase');
    return this.settle(`next after ${shown.reference}`);
  }

  /** A Minutes tap while the held item's recital listens: the plan made again, the item still held and shown. */
  async makeWhileListening(phrase: boolean) {
    const choice = pickOf(
      this.next,
      MINUTES.filter((each) => each !== this.minutes) as unknown as [Minutes, ...Minutes[]],
    );
    await this.mounted.tap(`${choice} min`, 'radio');
    this.minutes = choice;
    this.minutesTapped = true;
    this.run = madeModel(this.run, this.planNow(), true);
    await this.mounted.until(() => false, 5);
    const held = this.run.hold?.reference;
    const seen = this.mounted.today().references;
    if (held === undefined || seen.length !== 1 || seen[0] !== held)
      this.fail(`a making under way showed ${seen.join('|')} where ${held} is held`);
    bump(this.cover, phrase ? 'held:phrase-made' : 'held:verse-made');
  }

  tally(
    shown: { readonly fresh: boolean; readonly reference: string },
    piece: ModelTextPiece,
    phrase: boolean,
  ) {
    const plants = this.plants();
    const fear = piece.group === FEAR_TITLE;
    if (phrase) {
      bump(this.cover, shown.fresh ? 'today:phrase-new' : 'today:phrase-review');
      if (fear) bump(this.cover, 'today:fear-phrase');
      return;
    }
    if ((piece.phrases ?? []).length === 0) return;
    if (fear) bump(this.cover, 'today:fear-join');
    if (!shown.fresh) return bump(this.cover, 'today:joined-review');
    bump(this.cover, 'today:join');
    if (joinCueRule(plants, piece.reference) === 'initials')
      bump(this.cover, 'today:join-under-letters');
  }

  /** A launch named `day`, then up to `items` items tended. */
  async session(day: string, items: number) {
    if (!(await this.launch(day))) return;
    for (let k = 0; k < items && this.failure === null; k++) if (!(await this.tend())) return;
  }

  /** Day `day`: the morning's session, then in half a session one to three hours later. */
  async day(day: number) {
    this.sownFresh = null;
    await this.session(`${day}`, 5);
    if (this.failure !== null || below(this.next, 2) === 0) return;
    this.time.now += (1 + below(this.next, 3)) * HOUR;
    if (this.sownFresh !== null)
      bump(this.cover, this.sownFresh ? 'day:later-after-new-phrase' : 'day:later-after-new');
    await this.session(`${day}, later`, 2);
  }

  async live(days: number) {
    for (let day = 0; day < days && this.failure === null; day++) {
      if (day > 0) {
        this.time.now =
          wallAt(this.zone, this.time.now, -1, 4) + (30 + below(this.next, 17 * 60)) * MINUTE;
        bump(this.cover, 'day:next');
      }
      await this.day(day);
    }
    if (this.app !== null) await this.app.leave();
  }
}

/** `seed` mixed, so neighbouring devices start the generator far apart. */
const mixed = (seed: number) => {
  let s = (seed + 0x2545f491) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return (s ^ (s >>> 16)) >>> 0;
};

/** Walks the generated devices `devices` names, each teaching Fear when its number is 2 past a multiple of 3, `days` days each; answers the first failure (none when all held) and the coverage. */
export const walkPhrases = async (devices: readonly number[], days = 4) => {
  const cover: Coverage = {};
  const before = hostZone();
  try {
    for (const n of devices) {
      const walk = new PhraseWalk(random(mixed(n)), cover, n % 3 === 2);
      travel(walk.zone);
      bump(cover, `zone:${walk.zone}`);
      if (walk.taught.length > 0) bump(cover, 'device:fear');
      await walk.live(days);
      if (walk.failure !== null) return { failure: `device ${n}: ${walk.failure}`, cover };
    }
  } finally {
    restore(before);
  }
  return { failure: null, cover };
};
