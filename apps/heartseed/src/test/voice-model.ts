/* oxlint-disable effect/noTernary, effect/noNullish -- the model writes the spec's rules out as plain branches, apart from the service's Option and Match code, so the two cannot share a mistake; the view it builds holds the contract's nulls. */

/**
 * A model of the Voice service written from the hsvoice spec's rules
 * ("VoiceView and its rules"), not from `src/voice.ts`: the property test
 * runs the same steps against both and compares the view, the source calls
 * and the stored choice after each. The words are counted from the
 * spans found by walking the verse one UTF-16 unit at a time, held to the
 * matcher's own `sourceWords` count, so the model shares no word code with
 * the service.
 */

import { sourceWords } from '../matcher/words';

export type ModelChoice = 'off' | 'her' | 'him';

export interface ModelView {
  choice: ModelChoice;
  enabled: boolean;
  status: 'idle' | 'reading' | 'paused';
  verse: string | null;
  words: number;
  lit: number;
  current: { first: number; last: number } | null;
  ended: 'finished' | 'stopped' | 'off' | 'interrupted' | 'failed' | null;
}

export type ModelCall =
  | {
      readonly type: 'speak';
      readonly utterance: number;
      readonly text: string;
      readonly voice: string;
    }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'stop' };

export interface ModelVoice {
  readonly id: string;
  readonly language: string;
  readonly name: string;
  readonly quality: number;
  readonly novelty: boolean;
  readonly personal: boolean;
}

/** The old two-state switch's key, read when the choice's key holds no choice, never written. */
export const OLD_KEY = 'heartseed/voice/enabled';

/** The choice's key, the only one a choose writes. */
export const KEY = 'heartseed/voice/choice';

/** The spec's read rule (hsspeaker D2): the choice key's text when it is exactly `off`, `her` or `him`; else Off only for the old key's text `false`, and Her otherwise. A key the store fails to read is `undefined` here. */
export const choiceOf = (
  choiceText: string | undefined,
  oldText: string | undefined,
): ModelChoice => {
  if (choiceText === 'off') return 'off';
  if (choiceText === 'her') return 'her';
  if (choiceText === 'him') return 'him';
  if (oldText === 'false') return 'off';
  return 'her';
};

const SPACE = /\s/u;

/** Each word's UTF-16 span, found by walking the verse unit by unit; its count is checked against `sourceWords`. */
export const spansOf = (verse: string): Array<{ start: number; end: number }> => {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let i = 0; i <= verse.length; i++) {
    const blank = i === verse.length || SPACE.test(verse.charAt(i));
    if (!blank && start < 0) start = i;
    if (blank && start >= 0) {
      runs.push({ start, end: i });
      start = -1;
    }
  }
  return runs.filter(({ start: s, end }) => /[\p{L}\p{N}]/u.test(verse.slice(s, end)));
};

/** Whether the walk finds as many words as the matcher's `sourceWords`, the spec's definition of a word. */
export const agreesWithMatcher = (verse: string): boolean =>
  spansOf(verse).length === sourceWords(verse).length;

/** The spec's voice rule: English (`en` or `en-…`), no novelty, no personal; best quality, then en-US, then the lowest id. */
export const pickVoice = (voices: ReadonlyArray<ModelVoice>): ModelVoice | undefined => {
  const ranked = voices
    .filter(
      (v) => (v.language === 'en' || v.language.startsWith('en-')) && !v.novelty && !v.personal,
    )
    .toSorted((a, b) => {
      if (a.quality !== b.quality) return b.quality - a.quality;
      const us = Number(b.language === 'en-US') - Number(a.language === 'en-US');
      if (us !== 0) return us;
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
  return ranked[0];
};

export class VoiceModel {
  view: ModelView;
  utterance = 0;
  readonly calls: ModelCall[] = [];

  constructor(
    readonly store: Map<string, string>,
    readonly voices: ReadonlyArray<ModelVoice>,
  ) {
    this.view = VoiceModel.fresh(choiceOf(store.get(KEY), store.get(OLD_KEY)));
  }

  static fresh(choice: ModelChoice): ModelView {
    return {
      choice,
      enabled: choice !== 'off',
      status: 'idle',
      verse: null,
      words: 0,
      lit: 0,
      current: null,
      ended: null,
    };
  }

  get active(): boolean {
    return this.view.status !== 'idle';
  }

  private finish(ended: NonNullable<ModelView['ended']>) {
    this.view = {
      ...this.view,
      status: 'idle',
      current: null,
      ended,
      lit: ended === 'finished' ? this.view.words : this.view.lit,
    };
  }

  /** A read; `fails` says the source's speak fails, which ends the reading at once. */
  read(verse: string, fails: boolean) {
    const words = spansOf(verse).length;
    if (!this.view.enabled || words === 0) return;
    this.utterance += 1;
    this.view = {
      ...this.view,
      status: 'reading',
      verse,
      words,
      lit: 0,
      current: null,
      ended: null,
    };
    this.calls.push({
      type: 'speak',
      utterance: this.utterance,
      text: verse,
      voice: pickVoice(this.voices)?.id ?? '',
    });
    if (fails) this.finish('failed');
  }

  pause() {
    if (this.view.status === 'reading') {
      this.view = { ...this.view, status: 'paused' };
      this.calls.push({ type: 'pause' });
    }
  }

  resume() {
    if (this.view.status === 'paused') {
      this.view = { ...this.view, status: 'reading' };
      this.calls.push({ type: 'resume' });
    }
  }

  stop() {
    if (this.active) {
      this.finish('stopped');
      this.calls.push({ type: 'stop' });
    }
  }

  /** A choose: stored under the choice's key; Off ends a reading under way and stops it, Her and Him leave it going. */
  choose(choice: ModelChoice) {
    this.store.set(KEY, choice);
    const wasActive = this.active;
    this.view = { ...this.view, choice, enabled: choice !== 'off' };
    if (choice === 'off' && wasActive) {
      this.finish('off');
      this.calls.push({ type: 'stop' });
    }
  }

  restart() {
    if (this.active) this.calls.push({ type: 'stop' });
    this.utterance = 0;
    this.view = VoiceModel.fresh(choiceOf(this.store.get(KEY), this.store.get(OLD_KEY)));
  }

  event(utterance: number, kind: string, location: number, length: number) {
    if (!this.active || utterance !== this.utterance) return;
    if (kind === 'finish') return this.finish('finished');
    if (kind === 'cancel' || kind === 'interrupt') return this.finish('interrupted');
    if (kind !== 'range') return;
    const verse = this.view.verse ?? '';
    const valid =
      Number.isInteger(location) &&
      Number.isInteger(length) &&
      location >= 0 &&
      length >= 1 &&
      location + length <= verse.length;
    if (!valid) return;
    const touched: number[] = [];
    spansOf(verse).forEach((span, index) => {
      const overlaps = span.start < location + length && location < span.end;
      if (overlaps) touched.push(index);
    });
    if (touched.length === 0) return;
    const first = touched[0] ?? 0;
    const last = touched[touched.length - 1] ?? 0;
    if (last + 1 < this.view.lit) return;
    this.view = { ...this.view, lit: last + 1, current: { first, last } };
  }
}
