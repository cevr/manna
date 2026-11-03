import { Option, Predicate } from 'effect';

import type { Cue } from './cue';

export type Haptic =
  | { readonly _tag: 'selection' }
  | { readonly _tag: 'impact'; readonly style: 'light' | 'medium' | 'soft' | 'rigid' }
  | { readonly _tag: 'notification'; readonly type: 'success' };

export type SoundName = `key-${number}` | 'thock';

export interface Body {
  readonly haptic: Haptic;
  readonly sound: Option.Option<SoundName>;
}

const selection: Haptic = { _tag: 'selection' };
const impact = (style: 'light' | 'medium' | 'soft' | 'rigid'): Haptic => ({
  _tag: 'impact',
  style,
});
const light = impact('light');

const felt = (haptic: Haptic): Body => ({ haptic, sound: Option.none() });

const mod = (n: number, by: number) => ((n % by) + by) % by;

const FELT: Record<Exclude<Cue['_tag'], 'detent' | 'beat'>, Haptic> = {
  section: light,
  wall: impact('rigid'),
  reset: impact('medium'),
  'chords-on': light,
  play: light,
  'switch-on': light,
  'chords-off': light,
  pause: light,
  'switch-off': light,
  'favourite-on': { _tag: 'notification', type: 'success' },
  'favourite-off': light,
  press: selection,
  choose: selection,
  tab: selection,
  'zoom-out': impact('soft'),
  'zoom-in': light,
  'sheet-open': light,
  'seek-grab': selection,
  'seek-tick': selection,
  'seek-release': impact('soft'),
  'rail-tick': selection,
};

const beatHaptic = (accent: boolean): Haptic => {
  if (accent) return impact('medium');
  return light;
};

export const bodyOf = (cue: Cue): Body => {
  if (cue._tag === 'beat') return { haptic: beatHaptic(cue.accent), sound: Option.some('thock') };
  if (cue._tag !== 'detent') return felt(FELT[cue._tag]);
  if (cue.dial === 'key')
    return { haptic: selection, sound: Option.some<SoundName>(`key-${mod(cue.at, 12)}`) };
  return { haptic: selection, sound: Option.some('thock') };
};

export const isTick: (cue: Cue) => boolean = Predicate.or(
  Predicate.isTagged('detent'),
  Predicate.or(Predicate.isTagged('seek-tick'), Predicate.isTagged('rail-tick')),
);

export const FLOOR = 30;
