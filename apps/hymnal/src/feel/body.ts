/**
 * Each cue's body: the haptic it is felt by and the sound it is heard by.
 * The haptics carry Apple's names (One's `Haptics`); the sounds are the
 * voice's (`voice.ts`). Only a dial's detent is heard: the key dial sounds
 * each key at its own pitch class, and the capo and text-size dials thock.
 * Every other cue is felt only.
 */

import { Option, Predicate } from 'effect';

import type { Cue } from './cue';

export type Haptic =
  | { readonly _tag: 'selection' }
  | { readonly _tag: 'impact'; readonly style: 'light' | 'medium' | 'soft' | 'rigid' }
  | { readonly _tag: 'notification'; readonly type: 'success' };

/** The voice's sounds by name (`voice.ts`, `RECIPES`). */
export type SoundName = `key-${number}` | 'thock';

export interface Body {
  readonly haptic: Haptic;
  /** The sound it is heard by: none for every cue but a dial's detent. */
  readonly sound: Option.Option<SoundName>;
}

const selection: Haptic = { _tag: 'selection' };
const impact = (style: 'light' | 'medium' | 'soft' | 'rigid'): Haptic => ({
  _tag: 'impact',
  style,
});
const light = impact('light');

/** A body felt only. */
const felt = (haptic: Haptic): Body => ({ haptic, sound: Option.none() });

const mod = (n: number, by: number) => ((n % by) + by) % by;

/** The body cue `cue` is given. */
export const bodyOf = (cue: Cue): Body => {
  switch (cue._tag) {
    case 'detent':
      if (cue.dial === 'key')
        return { haptic: selection, sound: Option.some<SoundName>(`key-${mod(cue.at, 12)}`) };
      return { haptic: selection, sound: Option.some('thock') };
    case 'section':
      return felt(light);
    case 'wall':
      return felt(impact('rigid'));
    case 'reset':
      return felt(impact('medium'));
    case 'chords-on':
    case 'play':
    case 'switch-on':
    case 'chords-off':
    case 'pause':
    case 'switch-off':
      return felt(light);
    case 'favourite-on':
      return felt({ _tag: 'notification', type: 'success' });
    case 'favourite-off':
      return felt(light);
    case 'press':
    case 'choose':
    case 'tab':
      return felt(selection);
    case 'sheet-open':
      return felt(light);
    case 'seek-grab':
    case 'seek-tick':
      return felt(selection);
    case 'seek-release':
      return felt(impact('soft'));
  }
};

/** Whether a cue is a tick: its haptic keeps the floor (`FLOOR`) from the last tick's. */
export const isTick: (cue: Cue) => boolean = Predicate.or(
  Predicate.isTagged('detent'),
  Predicate.isTagged('seek-tick'),
);

/** The least time between two ticks' haptics, in milliseconds, so a fast fling is still felt as a ratchet. */
export const FLOOR = 30;
