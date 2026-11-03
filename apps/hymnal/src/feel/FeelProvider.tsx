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
  readonly on?: Atom.Atom<boolean>;
  readonly clock?: () => number;
}) {
  const registry = use(RegistryContext);
  const [tell] = useState(() =>
    feelOver({ haptics, sound: voice.port, on: () => registry.get(on), now: clock }),
  );
  useEffect(() => registry.mount(on), [registry, on]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      Effect.runFork(voice.load);
    });
    return () => cancelAnimationFrame(frame);
  }, [voice]);
  return <CueProvider value={tell}>{children}</CueProvider>;
}
