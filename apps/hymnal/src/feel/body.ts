/**
 * Each cue's body: the haptic it is felt by and the sound it is heard by.
 * The haptics carry Apple's names (One's `Haptics`); the sounds are the
 * voice's (`voice.ts`). The key dial rings each key at its own pitch, the
 * other dials click wood, and a topic taking the list's pin sounds its
 * place on a pentatonic scale.
 */

import type { Cue } from './cue';

export type Haptic =
  | { readonly _tag: 'selection' }
  | { readonly _tag: 'impact'; readonly style: 'light' | 'medium' | 'soft' | 'rigid' }
  | { readonly _tag: 'notification'; readonly type: 'success' };

/** The voice's sounds by name (`voice.ts`, `RECIPES`). */
export type SoundName =
  | `key-${number}`
  | `section-${number}`
  | 'wood'
  | 'thud'
  | 'switch-on'
  | 'switch-off'
  | 'press'
  | 'chime-up'
  | 'chime-down'
  | 'land'
  | 'tick';

export interface Body {
  readonly haptic: Haptic;
  readonly sound: SoundName;
}

const selection: Haptic = { _tag: 'selection' };
const impact = (style: 'light' | 'medium' | 'soft' | 'rigid'): Haptic => ({
  _tag: 'impact',
  style,
});
const light = impact('light');

const mod = (n: number, by: number) => ((n % by) + by) % by;

/** The body cue `cue` is given. */
export const bodyOf = (cue: Cue): Body => {
  switch (cue._tag) {
    case 'detent':
      if (cue.dial === 'key') return { haptic: selection, sound: `key-${mod(cue.at, 12)}` };
      return { haptic: selection, sound: 'wood' };
    case 'section':
      return { haptic: light, sound: `section-${mod(cue.place, 10)}` };
    case 'wall':
      return { haptic: impact('rigid'), sound: 'thud' };
    case 'reset':
      return { haptic: impact('medium'), sound: 'land' };
    case 'chords-on':
    case 'play':
    case 'switch-on':
      return { haptic: light, sound: 'switch-on' };
    case 'chords-off':
    case 'pause':
    case 'switch-off':
      return { haptic: light, sound: 'switch-off' };
    case 'favourite-on':
      return { haptic: { _tag: 'notification', type: 'success' }, sound: 'chime-up' };
    case 'favourite-off':
      return { haptic: light, sound: 'chime-down' };
    case 'press':
    case 'choose':
      return { haptic: selection, sound: 'press' };
    case 'sheet-open':
      return { haptic: light, sound: 'press' };
    case 'seek-grab':
      return { haptic: selection, sound: 'press' };
    case 'seek-tick':
      return { haptic: selection, sound: 'tick' };
    case 'seek-release':
      return { haptic: impact('soft'), sound: 'wood' };
  }
};

/** Whether a cue is a tick: its body keeps the floor (`FLOOR`) from the last tick's. */
export const isTick = (cue: Cue): boolean => cue._tag === 'detent' || cue._tag === 'seek-tick';

/** The least time between two ticks' bodies, in milliseconds (the prototype's rule). */
export const FLOOR = 30;
