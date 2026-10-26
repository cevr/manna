/**
 * Gives every control under it the Feel (`feel.ts`): the app's haptics and
 * its voice, while `Sounds and haptics` (`settings.feel`) is on. The Tell
 * keeps one identity for the app's life and reads the switch as each cue
 * comes, so neither a cue nor the switch redraws a page.
 *
 * The voice loads after the first screen has drawn, in one background
 * pass, so it is never on the launch path; a cue before then is felt only.
 */

import { RegistryContext } from '@effect/atom-react';
import { Effect, Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { type ReactNode, use, useEffect, useState } from 'react';

import { settings } from '~/store';

import { CueProvider } from './cue';
import { feelOver, type HapticsPort } from './feel';
import { liveHaptics } from './haptics';
import { voiceNative } from './native';
import { silentVoice, type Voice, voiceOver } from './sound';

// oxlint-disable-next-line effect/noGlobals -- the touch path's clock: a sync read for the ticks' floor and the sounds' gap, with no Effect run per cue.
const now = () => performance.now();

/** The app's voice: System Sound Services on iOS, none elsewhere. */
const liveVoice: Voice = Option.match(voiceNative, {
  onNone: () => silentVoice,
  onSome: (native) => voiceOver(native, now),
});

export function FeelProvider({
  children,
  haptics = liveHaptics,
  voice = liveVoice,
  on = settings.feel,
  clock = now,
}: {
  readonly children: ReactNode;
  readonly haptics?: HapticsPort;
  readonly voice?: Voice;
  /** The switch the Feel reads. */
  readonly on?: Atom.Atom<boolean>;
  /** The time, in milliseconds, the ticks' floor and the sounds' gap read. */
  readonly clock?: () => number;
}) {
  const registry = use(RegistryContext);
  const [tell] = useState(() =>
    feelOver({ haptics, sound: voice.port, on: () => registry.get(on), now: clock }),
  );
  // The switch stays mounted, so each cue reads it from the registry's cache.
  useEffect(() => registry.mount(on), [registry, on]);
  useEffect(() => {
    // After the first screen's frame: the pass runs between the next frames' work.
    const frame = requestAnimationFrame(() => {
      Effect.runFork(voice.load);
    });
    return () => cancelAnimationFrame(frame);
  }, [voice]);
  return <CueProvider value={tell}>{children}</CueProvider>;
}
