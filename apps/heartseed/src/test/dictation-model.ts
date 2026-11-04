/* oxlint-disable effect/noTernary, effect/noNullish -- the model writes the spec's rules out as plain branches, apart from the service's Option and Match code, so the two cannot share a mistake; the view it builds holds the contract's nulls. */

/**
 * A model of the Dictation service written from the hsdictate spec's rules
 * ("The recital's rules"), not from `src/dictation.ts` or its reducer: the
 * property test runs the same steps against both and compares the view
 * (the matcher's view included), the source calls and the endings after
 * each. The matcher is hsmatch's, taken as given; the model feeds it the
 * snapshots the spec's runs-to-words rule makes, and checks each against
 * the matcher's acceptance rule written out here apart from the matcher.
 * Words are found by matching non-blank runs, not by splitting, so the
 * model shares no word code with the service.
 */

import {
  createMatcher,
  matcherView,
  updateMatcher,
  type MatcherState,
  type MatcherView,
} from '../matcher';

export type ModelEngine = 'analyzer' | 'dictation' | 'recognizer';
export type ModelEnding =
  | 'finished'
  | 'cancelled'
  | 'denied'
  | 'unavailable'
  | 'interrupted'
  | 'failed';
export type ModelCue = 'none' | 'initials' | 'full';

export interface ModelView {
  status: 'idle' | 'listening' | 'finishing';
  engine: ModelEngine | null;
  verse: string | null;
  matcher: MatcherView | null;
  ended: ModelEnding | null;
}

export interface ModelRun {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface ModelWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface ModelEvent {
  readonly session: number;
  readonly kind: 'start' | 'result' | 'end' | 'fail';
  readonly final: boolean;
  readonly runs: readonly ModelRun[];
  readonly reason: string;
}

export type ModelCall =
  | {
      readonly type: 'listen';
      readonly session: number;
      readonly engine: ModelEngine;
      readonly locale: string;
      readonly hints: readonly string[];
    }
  | { readonly type: 'finish' }
  | { readonly type: 'cancel' };

export const ENGINES: readonly ModelEngine[] = ['analyzer', 'dictation', 'recognizer'];
export const GRACE_MS = 1500;
const LANGUAGE = 'en-US';
const MOST_HINTS = 100;

const LETTER = /[\p{L}\p{N}]/u;

/** The non-blank runs of `text` that hold a letter or number, in order. */
export const spokenRuns = (text: string): string[] =>
  Array.from(text.matchAll(/\S+/gu), (match) => match[0]).filter((run) => LETTER.test(run));

/** A word's key: its lowercase letters and numbers alone. */
const keyOf = (word: string): string => {
  let key = '';
  for (const char of word.toLowerCase()) if (LETTER.test(char)) key += char;
  return key;
};

/** The spec's hints: the verse's distinct word keys, first seen first, at most 100. */
export const modelHints = (verse: string): string[] => {
  const keys: string[] = [];
  for (const word of spokenRuns(verse)) {
    const key = keyOf(word);
    if (keys.length < MOST_HINTS && !keys.includes(key)) keys.push(key);
  }
  return keys;
};

/** The spec's runs-to-words rule: a run's tokens share its time evenly, never before the floor, 0, or the word before. */
export const modelWords = (runs: readonly ModelRun[], floor: number): ModelWord[] => {
  const words: ModelWord[] = [];
  let low = floor;
  for (const run of runs) {
    const tokens = spokenRuns(run.text);
    if (tokens.length === 0) continue;
    const s0 = Number.isFinite(run.start) ? run.start : low;
    const e0 = Number.isFinite(run.end) ? run.end : s0;
    const s = Math.max(s0, low, 0);
    const e = Math.max(e0, s);
    const k = tokens.length;
    for (let i = 0; i < k; i++) {
      words.push({
        text: tokens[i] ?? '',
        start: s + ((e - s) * i) / k,
        end: s + ((e - s) * (i + 1)) / k,
      });
    }
    low = words[words.length - 1]?.start ?? low;
  }
  return words;
};

/** The matcher's acceptance rule for a snapshot, written apart: the finals extend `prior` exactly, and every word is spoken text with finite, ordered times at or after 0. */
export const snapshotAccepted = (
  prior: readonly ModelWord[],
  final: readonly ModelWord[],
  tentative: readonly ModelWord[],
): boolean => {
  if (final.length < prior.length) return false;
  for (let i = 0; i < prior.length; i++) {
    const a = prior[i];
    const b = final[i];
    if (a === undefined || b === undefined) return false;
    if (a.text !== b.text || a.start !== b.start || a.end !== b.end) return false;
  }
  let last = 0;
  for (const word of [...final, ...tentative]) {
    if (spokenRuns(word.text).length !== 1 || spokenRuns(word.text)[0] !== word.text) return false;
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) return false;
    if (word.start < 0 || word.end < word.start || word.start < last) return false;
    last = word.start;
  }
  return true;
};

export class DictationModel {
  view: ModelView = { status: 'idle', engine: null, verse: null, matcher: null, ended: null };
  calls: ModelCall[] = [];
  endings: ModelView[] = [];
  /** The session the current listen carries, and the last id given. */
  session = 0;
  lastId = 0;
  heard = false;
  state: MatcherState | null = null;
  final: ModelWord[] = [];
  tentative: ModelWord[] = [];
  revision = -1;
  clock = 0;
  /** The grace of the current finish: the session it is for and when it ends. */
  grace: { session: number; at: number } | null = null;
  /** Every snapshot fed to the matcher was one it accepts. */
  accepted = true;

  get active(): boolean {
    return this.view.status === 'listening' || this.view.status === 'finishing';
  }

  private show(patch: Partial<ModelView>) {
    this.view = {
      ...this.view,
      ...patch,
      matcher: this.state === null ? null : matcherView(this.state),
    };
  }

  private close(ending: ModelEnding) {
    if (ending === 'finished' && this.state !== null)
      this.state = updateMatcher(this.state, { type: 'finish' });
    this.show({ status: 'idle', ended: ending });
    this.grace = null;
    this.endings.push(this.view);
  }

  private listen(engine: ModelEngine) {
    this.lastId += 1;
    this.session = this.lastId;
    this.calls.push({
      type: 'listen',
      session: this.session,
      engine,
      locale: LANGUAGE,
      hints: modelHints(this.view.verse ?? ''),
    });
  }

  start(verse: string, cue: ModelCue) {
    if (spokenRuns(verse).length === 0) return;
    this.heard = false;
    this.final = [];
    this.tentative = [];
    this.revision = -1;
    this.grace = null;
    this.state = createMatcher(verse, cue);
    this.show({ status: 'listening', engine: 'analyzer', verse, ended: null });
    this.listen('analyzer');
  }

  finish() {
    if (this.view.status !== 'listening') return;
    this.view = { ...this.view, status: 'finishing' };
    this.grace = { session: this.session, at: this.clock + GRACE_MS };
    this.calls.push({ type: 'finish' });
  }

  cancel() {
    if (!this.active) return;
    this.close('cancelled');
    this.calls.push({ type: 'cancel' });
  }

  peek(index: number) {
    if (this.state === null) return;
    this.state = updateMatcher(this.state, { type: 'peek', index });
    this.show({});
  }

  /** A failure of the current session: fall back on `unavailable` before anything was heard while listening, else end. */
  private failed(reason: string) {
    const at = ENGINES.indexOf(this.view.engine ?? 'recognizer');
    const next = ENGINES[at + 1];
    if (
      this.view.status === 'listening' &&
      reason === 'unavailable' &&
      !this.heard &&
      next !== undefined
    ) {
      this.view = { ...this.view, engine: next };
      this.listen(next);
      return;
    }
    if (reason === 'denied') this.close('denied');
    else if (reason === 'interrupted') this.close('interrupted');
    else if (reason === 'unavailable' && !this.heard) this.close('unavailable');
    else this.close('failed');
  }

  /** The source refused the listen of `session`. */
  refused(session: number) {
    if (this.active && session === this.session) this.failed('unavailable');
  }

  event(event: ModelEvent) {
    if (!this.active || event.session !== this.session) return;
    if (event.kind === 'start') this.heard = true;
    else if (event.kind === 'end') this.close('finished');
    else if (event.kind === 'fail') this.failed(event.reason);
    else this.result(event);
  }

  private result(event: ModelEvent) {
    this.heard = true;
    const prior = this.final;
    const floor = prior.length === 0 ? 0 : (prior[prior.length - 1]?.start ?? 0);
    const words = modelWords(event.runs, floor);
    this.final = event.final ? [...prior, ...words] : prior;
    this.tentative = event.final ? [] : words;
    this.revision += 1;
    if (!snapshotAccepted(prior, this.final, this.tentative)) this.accepted = false;
    if (this.state !== null) {
      this.state = updateMatcher(this.state, {
        type: 'recognition',
        revision: this.revision,
        finalWords: this.final,
        tentativeWords: this.tentative,
      });
    }
    this.show({});
  }

  /** Effect's clock moves on by `ms`: a grace that runs out while its session still finishes ends it and cancels the source. */
  elapse(ms: number) {
    this.clock += ms;
    const grace = this.grace;
    if (grace === null || this.clock < grace.at) return;
    this.grace = null;
    if (this.view.status !== 'finishing' || grace.session !== this.session) return;
    this.close('finished');
    this.calls.push({ type: 'cancel' });
  }

  /** The service's scope closes: an active recital is cancelled at the source, and the next service starts afresh. */
  restart() {
    if (this.active) this.calls.push({ type: 'cancel' });
    this.view = { status: 'idle', engine: null, verse: null, matcher: null, ended: null };
    this.session = 0;
    this.lastId = 0;
    this.heard = false;
    this.state = null;
    this.final = [];
    this.tentative = [];
    this.revision = -1;
    this.grace = null;
  }
}
